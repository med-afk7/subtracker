import { and, asc, eq, inArray, lte, or, sql } from 'drizzle-orm';
import type { Logger } from 'pino';
import { db } from '../db/index.js';
import {
  notificationDeliveries,
  subscriptions,
  users,
  type NotificationDeliveryRow,
} from '../db/schema.js';
import { formatAmount } from '../domain/money.js';
import { todayIn } from '../domain/plainDate.js';
import { occurrencesBetween } from '../domain/recurrence.js';
import { MAX_ATTEMPTS, backoffMs, effectiveDaysBefore } from '../domain/reminders.js';
import { EmailSendError, type EmailSender } from '../email/sender.js';
import { upcomingChargeMessage } from '../email/templates.js';

const BATCH_SIZE = 20;
const MAX_BATCHES_PER_RUN = 10;
// A claimed row belongs to its worker for this long. If the worker dies, another can take over.
const LEASE_MS = 5 * 60_000;

export interface DispatchStats {
  claimed: number;
  sent: number;
  retrying: number;
  failed: number;
  skipped: number;
}

// Claims a batch atomically. FOR UPDATE SKIP LOCKED makes concurrent workers take different
// rows instead of waiting for (or double-processing) each other's. Rows stuck in "sending"
// past their lease (a crashed worker) become claimable again.
async function claimBatch(now: Date): Promise<NotificationDeliveryRow[]> {
  const claimable = db
    .select({ id: notificationDeliveries.id })
    .from(notificationDeliveries)
    .where(
      or(
        and(
          inArray(notificationDeliveries.status, ['pending', 'retrying']),
          lte(notificationDeliveries.nextAttemptAt, now),
        ),
        and(
          eq(notificationDeliveries.status, 'sending'),
          lte(notificationDeliveries.lockedUntil, now),
        ),
      ),
    )
    .orderBy(asc(notificationDeliveries.nextAttemptAt))
    .limit(BATCH_SIZE)
    .for('update', { skipLocked: true });

  return db
    .update(notificationDeliveries)
    .set({
      status: 'sending',
      lockedUntil: new Date(now.getTime() + LEASE_MS),
      attemptCount: sql`${notificationDeliveries.attemptCount} + 1`,
    })
    .where(inArray(notificationDeliveries.id, claimable))
    .returning();
}

// Records an outcome only if this worker still owns the attempt. The attempt count acts as a
// fencing token: a worker that stalled past its lease (and was replaced) can't overwrite the
// newer attempt's result.
async function finish(
  delivery: NotificationDeliveryRow,
  changes: Partial<NotificationDeliveryRow>,
) {
  await db
    .update(notificationDeliveries)
    .set({ lockedUntil: null, ...changes })
    .where(
      and(
        eq(notificationDeliveries.id, delivery.id),
        eq(notificationDeliveries.status, 'sending'),
        eq(notificationDeliveries.attemptCount, delivery.attemptCount),
      ),
    );
}

type Outcome = 'sent' | 'retrying' | 'failed' | 'skipped';

async function processDelivery(
  delivery: NotificationDeliveryRow,
  now: Date,
  sender: EmailSender,
  log: Logger,
): Promise<Outcome> {
  const [context] = await db
    .select({ sub: subscriptions, user: users })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.userId))
    .where(eq(subscriptions.id, delivery.subscriptionId));

  // Re-check right before sending: things may have changed since the row was created
  const skip = async (code: string) => {
    await finish(delivery, { status: 'skipped', lastErrorCode: code, lastErrorMessage: null });
    log.info({ deliveryId: delivery.id, reason: code }, 'Reminder skipped');
    return 'skipped' as const;
  };
  if (!context) return skip('SUBSCRIPTION_DELETED');
  const { sub, user } = context;
  if (effectiveDaysBefore(user, sub) === null) return skip('REMINDERS_OFF');
  if (delivery.billingDate < todayIn(user.timezone, now)) return skip('CHARGE_PASSED');
  const schedule = {
    anchor: sub.billingAnchorDate,
    interval: sub.billingInterval,
    count: sub.billingIntervalCount,
    endDate: sub.endDate,
  };
  if (occurrencesBetween(schedule, delivery.billingDate, delivery.billingDate).length === 0) {
    return skip('SCHEDULE_CHANGED');
  }

  const message = upcomingChargeMessage({
    to: user.email,
    subscriptionName: sub.name,
    amount: formatAmount(sub.amountMinor, sub.currency),
    currency: sub.currency,
    billingDate: delivery.billingDate,
    daysBefore: delivery.daysBefore,
    cancellationUrl: sub.cancellationUrl,
  });

  try {
    // The delivery id as idempotency key: a retry after a crash can't send a second email
    const { providerMessageId } = await sender.send(message, { idempotencyKey: delivery.id });
    await finish(delivery, {
      status: 'sent',
      sentAt: now,
      providerMessageId,
      lastErrorCode: null,
      lastErrorMessage: null,
    });
    log.info({ deliveryId: delivery.id, attempt: delivery.attemptCount }, 'Reminder sent');
    return 'sent';
  } catch (err) {
    const error =
      err instanceof EmailSendError
        ? err
        : // Unexpected (e.g. a bug): treat as temporary so it's retried, but log it loudly
          new EmailSendError('unexpected_error', (err as Error).message, true);
    const failure = { lastErrorCode: error.code, lastErrorMessage: error.message.slice(0, 500) };

    if (error.alreadyAccepted) {
      await finish(delivery, { status: 'sent', sentAt: now, ...failure });
      log.warn({ deliveryId: delivery.id }, 'Reminder already accepted by the provider earlier');
      return 'sent';
    }
    if (error.transient && delivery.attemptCount < MAX_ATTEMPTS) {
      const nextAttemptAt = new Date(now.getTime() + backoffMs(delivery.attemptCount));
      await finish(delivery, { status: 'retrying', nextAttemptAt, ...failure });
      log.warn(
        {
          deliveryId: delivery.id,
          attempt: delivery.attemptCount,
          code: error.code,
          nextAttemptAt,
        },
        'Reminder send failed; will retry',
      );
      return 'retrying';
    }
    await finish(delivery, { status: 'failed', ...failure });
    log.error(
      { deliveryId: delivery.id, attempt: delivery.attemptCount, code: error.code },
      'Reminder send failed permanently',
    );
    return 'failed';
  }
}

export async function runDispatcher(
  now: Date,
  sender: EmailSender,
  log: Logger,
): Promise<DispatchStats> {
  const stats: DispatchStats = { claimed: 0, sent: 0, retrying: 0, failed: 0, skipped: 0 };
  for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
    const claimed = await claimBatch(now);
    stats.claimed += claimed.length;
    for (const delivery of claimed) {
      stats[await processDelivery(delivery, now, sender, log)] += 1;
    }
    if (claimed.length < BATCH_SIZE) break;
  }
  return stats;
}
