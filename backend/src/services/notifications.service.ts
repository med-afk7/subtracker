import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { notificationDeliveries, subscriptions, users } from '../db/schema.js';
import { formatAmount } from '../domain/money.js';

export interface NotificationPreferences {
  remindersEnabled: boolean;
  defaultReminderDaysBefore: number;
}

export async function getPreferences(userId: string): Promise<NotificationPreferences> {
  const [row] = await db
    .select({
      remindersEnabled: users.remindersEnabled,
      defaultReminderDaysBefore: users.defaultReminderDaysBefore,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!row) throw new Error(`User ${userId} not found`);
  return row;
}

export async function updatePreferences(userId: string, changes: Partial<NotificationPreferences>) {
  if (Object.keys(changes).length > 0) {
    await db.update(users).set(changes).where(eq(users.id, userId));
  }
  return getPreferences(userId);
}

// The user's reminder history, newest first. Ownership comes through the subscription join.
export async function listDeliveries(userId: string, page: number, limit: number) {
  const where = eq(subscriptions.userId, userId);
  const [rows, [totals]] = await Promise.all([
    db
      .select({ delivery: notificationDeliveries, sub: subscriptions })
      .from(notificationDeliveries)
      .innerJoin(subscriptions, eq(subscriptions.id, notificationDeliveries.subscriptionId))
      .where(where)
      .orderBy(desc(notificationDeliveries.scheduledFor), desc(notificationDeliveries.id))
      .limit(limit)
      .offset((page - 1) * limit),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(notificationDeliveries)
      .innerJoin(subscriptions, eq(subscriptions.id, notificationDeliveries.subscriptionId))
      .where(where),
  ]);

  const total = totals?.total ?? 0;
  return {
    data: rows.map(({ delivery, sub }) => ({
      id: delivery.id,
      subscriptionId: sub.id,
      subscriptionName: sub.name,
      amount: formatAmount(sub.amountMinor, sub.currency),
      currency: sub.currency,
      billingDate: delivery.billingDate,
      daysBefore: delivery.daysBefore,
      scheduledFor: delivery.scheduledFor.toISOString(),
      status: delivery.status,
      attemptCount: delivery.attemptCount,
      sentAt: delivery.sentAt?.toISOString() ?? null,
      // A short machine-readable reason (e.g. REMINDERS_OFF, validation_error), never raw details
      lastErrorCode: delivery.lastErrorCode,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
