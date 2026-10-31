import { eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/index.js';
import {
  emailTokens,
  notificationDeliveries,
  sessions,
  subscriptions,
} from '../../src/db/schema.js';
import { EmailSendError } from '../../src/email/sender.js';
import { runDispatcher } from '../../src/jobs/dispatcher.js';
import { runMaintenance } from '../../src/jobs/maintenance.js';
import { runScheduler } from '../../src/jobs/scheduler.js';
import { runTick } from '../../src/jobs/tick.js';
import { logger } from '../../src/lib/logger.js';
import { resetDatabase } from '../helpers/db.js';
import {
  failNextSends,
  fakeEmailSender,
  outbox,
  permanentError,
  transientError,
} from '../helpers/email.js';
import { createSubscription } from '../helpers/subscriptions.js';
import { signedInAgent } from '../helpers/users.js';

beforeEach(resetDatabase);

// A monthly charge on 2099-03-10. With the default 3-day reminder (users start in UTC), the
// reminder is due at 09:00 UTC on 2099-03-07.
const CHARGE = '2099-03-10';
const DUE = new Date('2099-03-07T09:00:00Z');
const at = (iso: string) => new Date(iso);
const minutesAfter = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000);

const tick = (now: Date) => runTick({ now, sender: fakeEmailSender });
const dispatch = (now: Date) => runDispatcher(now, fakeEmailSender, logger);
const deliveries = () => db.select().from(notificationDeliveries);
// Reminder emails carry an idempotency key; sign-up confirmation emails in the sentReminders() don't
const sentReminders = () => outbox.filter((m) => m.idempotencyKey);

async function userWithNetflix(overrides: Record<string, unknown> = {}) {
  const agent = await signedInAgent('ada@example.com');
  const sub = await createSubscription(agent, {
    startDate: '2099-01-01',
    nextBillingDate: CHARGE,
    ...overrides,
  });
  return { agent, sub };
}

describe('scheduling and sending', () => {
  it('sends one reminder when it becomes due, with the delivery id as idempotency key', async () => {
    await userWithNetflix({ cancellationUrl: 'https://netflix.com/cancel' });

    await tick(DUE);

    expect(sentReminders()).toHaveLength(1);
    const [delivery] = await deliveries();
    expect(delivery).toMatchObject({
      billingDate: CHARGE,
      daysBefore: 3,
      status: 'sent',
      attemptCount: 1,
      providerMessageId: expect.stringMatching(/^fake-/),
      scheduledFor: DUE,
    });
    expect(sentReminders()[0]).toMatchObject({
      to: 'ada@example.com',
      idempotencyKey: delivery!.id,
    });
    expect(sentReminders()[0]!.subject).toBe('Netflix renews in 3 days ($15.99)');
    expect(sentReminders()[0]!.text).toContain(
      'is expected to renew in 3 days, on Tuesday, March 10, 2099, for $15.99.',
    );
    expect(sentReminders()[0]!.text).toContain('not on your bank or the provider');
    expect(sentReminders()[0]!.text).toContain(
      'Your saved cancellation link: https://netflix.com/cancel',
    );
  });

  it('never sends twice, however many times the jobs run', async () => {
    await userWithNetflix();
    await tick(DUE);
    await tick(DUE);
    await tick(minutesAfter(DUE, 60));
    expect(sentReminders()).toHaveLength(1);
    expect(await deliveries()).toHaveLength(1);
  });

  it('does not send early', async () => {
    await userWithNetflix();
    await tick(minutesAfter(DUE, -1));
    expect(sentReminders()).toHaveLength(0);
    expect(await deliveries()).toHaveLength(0);
  });

  it('sends at 09:00 in the user’s own timezone', async () => {
    const { agent } = await userWithNetflix();
    await agent.patch('/api/account').send({ timezone: 'America/Los_Angeles' }).expect(200);

    await tick(at('2099-03-07T16:59:00Z')); // 08:59 in Los Angeles
    expect(sentReminders()).toHaveLength(0);
    await tick(at('2099-03-07T17:00:00Z')); // 09:00 in Los Angeles
    expect(sentReminders()).toHaveLength(1);
  });

  it('follows per-subscription and account settings', async () => {
    const agent = await signedInAgent('ada@example.com');
    const base = { startDate: '2099-01-01', nextBillingDate: CHARGE };
    await createSubscription(agent, {
      ...base,
      name: 'Same day',
      reminderMode: 'custom',
      reminderDaysBefore: 0,
    });
    await createSubscription(agent, { ...base, name: 'Never', reminderMode: 'off' });
    await createSubscription(agent, { ...base, name: 'Default' });

    await tick(DUE);
    expect(sentReminders().map((m) => m.subject)).toEqual(['Default renews in 3 days ($15.99)']);
    await tick(at('2099-03-10T09:00:00Z'));
    expect(sentReminders().map((m) => m.subject)).toContain('Same day renews today ($15.99)');
    expect(sentReminders()).toHaveLength(2);
  });

  it('sends nothing when reminders are turned off for the account', async () => {
    const { agent } = await userWithNetflix();
    await agent
      .patch('/api/notification-preferences')
      .send({ remindersEnabled: false })
      .expect(200);
    await tick(DUE);
    expect(sentReminders()).toHaveLength(0);
  });

  it('catches up after downtime while the charge is still ahead, but not after it', async () => {
    await userWithNetflix();
    await tick(at('2099-03-09T22:00:00Z'));
    expect(sentReminders()).toHaveLength(1);

    await resetDatabase();
    outbox.length = 0;
    await userWithNetflix();
    await tick(at('2099-03-11T00:00:00Z'));
    expect(sentReminders()).toHaveLength(0);
  });

  it('creates one row even when two schedulers run at the same moment', async () => {
    await userWithNetflix();
    await Promise.all([runScheduler(DUE), runScheduler(DUE), runScheduler(DUE)]);
    expect(await deliveries()).toHaveLength(1);
  });
});

describe('re-checking before sending', () => {
  it('skips a reminder whose subscription was cancelled after it was scheduled', async () => {
    const { agent, sub } = await userWithNetflix();
    await runScheduler(DUE);
    await agent.post(`/api/subscriptions/${sub.id}/cancel`).expect(200);

    const stats = await dispatch(DUE);
    expect(stats).toMatchObject({ claimed: 1, skipped: 1, sent: 0 });
    expect(sentReminders()).toHaveLength(0);
    expect((await deliveries())[0]).toMatchObject({
      status: 'skipped',
      lastErrorCode: 'REMINDERS_OFF',
    });
  });

  it('skips a reminder for a billing date that is no longer in the schedule', async () => {
    const { agent, sub } = await userWithNetflix();
    await runScheduler(DUE);
    await agent
      .patch(`/api/subscriptions/${sub.id}`)
      .send({ nextBillingDate: '2099-03-20' })
      .expect(200);

    await dispatch(DUE);
    expect((await deliveries())[0]).toMatchObject({
      status: 'skipped',
      lastErrorCode: 'SCHEDULE_CHANGED',
    });
  });

  it('skips a reminder whose charge date passed before it could be sent', async () => {
    await userWithNetflix();
    await runScheduler(DUE);
    await dispatch(at('2099-03-11T00:00:00Z'));
    expect((await deliveries())[0]).toMatchObject({
      status: 'skipped',
      lastErrorCode: 'CHARGE_PASSED',
    });
  });
});

describe('failures and retries', () => {
  it('retries a temporary failure later with the same idempotency key', async () => {
    await userWithNetflix();
    await runScheduler(DUE);
    failNextSends(transientError());

    expect(await dispatch(DUE)).toMatchObject({ retrying: 1 });
    const [first] = await deliveries();
    expect(first).toMatchObject({
      status: 'retrying',
      attemptCount: 1,
      lastErrorCode: 'service_unavailable',
    });
    expect(first!.nextAttemptAt.getTime()).toBeGreaterThan(DUE.getTime()); // backoff: about a minute

    expect(await dispatch(DUE)).toMatchObject({ claimed: 0 }); // not before its time
    expect(await dispatch(minutesAfter(DUE, 2))).toMatchObject({ sent: 1 });
    const [second] = await deliveries();
    expect(second).toMatchObject({ status: 'sent', attemptCount: 2, lastErrorCode: null });
    expect(sentReminders()).toHaveLength(1);
    expect(sentReminders()[0]!.idempotencyKey).toBe(first!.id);
  });

  it('does not retry a permanent failure', async () => {
    await userWithNetflix();
    await runScheduler(DUE);
    failNextSends(permanentError());

    expect(await dispatch(DUE)).toMatchObject({ failed: 1 });
    expect(await dispatch(minutesAfter(DUE, 24 * 60))).toMatchObject({ claimed: 0 });
    expect((await deliveries())[0]).toMatchObject({
      status: 'failed',
      attemptCount: 1,
      lastErrorCode: 'validation_error',
    });
  });

  it('gives up after five temporary failures', async () => {
    await userWithNetflix();
    await runScheduler(DUE);
    failNextSends(...Array.from({ length: 5 }, transientError));

    let now = DUE;
    for (let attempt = 1; attempt <= 5; attempt++) {
      await dispatch(now);
      now = minutesAfter(now, 8 * 60); // longer than any backoff
    }
    expect((await deliveries())[0]).toMatchObject({ status: 'failed', attemptCount: 5 });
    expect(await dispatch(now)).toMatchObject({ claimed: 0 });
    expect(sentReminders()).toHaveLength(0);
  });

  it('treats "key already used with different content" as already sent', async () => {
    await userWithNetflix();
    await runScheduler(DUE);
    failNextSends(new EmailSendError('invalid_idempotent_request', 'Key reused', false, true));

    expect(await dispatch(DUE)).toMatchObject({ sent: 1 });
    expect((await deliveries())[0]).toMatchObject({ status: 'sent' });
  });

  it('treats unexpected errors as temporary', async () => {
    await userWithNetflix();
    await runScheduler(DUE);
    failNextSends(new Error('boom') as EmailSendError);
    expect(await dispatch(DUE)).toMatchObject({ retrying: 1 });
    expect((await deliveries())[0]).toMatchObject({ lastErrorCode: 'unexpected_error' });
  });
});

describe('concurrency and crash recovery', () => {
  it('sends once when two dispatchers race for the same rows', async () => {
    const agent = await signedInAgent('ada@example.com');
    for (const name of ['A', 'B', 'C', 'D', 'E']) {
      await createSubscription(agent, { name, startDate: '2099-01-01', nextBillingDate: CHARGE });
    }
    await runScheduler(DUE);

    const [one, two] = await Promise.all([dispatch(DUE), dispatch(DUE)]);
    expect(one.claimed + two.claimed).toBe(5);
    expect(sentReminders()).toHaveLength(5);
    expect(new Set(sentReminders().map((m) => m.idempotencyKey)).size).toBe(5);
  });

  it('takes over a reminder stuck "sending" after its worker died, once the lease expires', async () => {
    await userWithNetflix();
    await runScheduler(DUE);
    // Simulate a worker that claimed the row and crashed before recording anything
    await db
      .update(notificationDeliveries)
      .set({ status: 'sending', attemptCount: 1, lockedUntil: minutesAfter(DUE, 5) });

    expect(await dispatch(minutesAfter(DUE, 1))).toMatchObject({ claimed: 0 }); // lease still held
    expect(await dispatch(minutesAfter(DUE, 6))).toMatchObject({ sent: 1 });
    expect((await deliveries())[0]).toMatchObject({ status: 'sent', attemptCount: 2 });
  });
});

describe('maintenance', () => {
  it('removes expired sessions and old tokens, and refreshes stale next billing dates', async () => {
    const { sub } = await userWithNetflix();
    await db.update(sessions).set({ expiresAt: sql`now() - interval '1 minute'` });
    await db.update(emailTokens).set({ usedAt: sql`now() - interval '2 days'` });
    await db
      .update(subscriptions)
      .set({ nextBillingDate: '2099-01-01' })
      .where(eq(subscriptions.id, sub.id));

    const result = await runMaintenance(new Date());
    expect(result.sessionsDeleted).toBe(1);
    expect(result.tokensDeleted).toBe(1);
    // 2099-01-01 isn't stale today (it's in the future); move "now" past it
    const later = await runMaintenance(at('2099-02-01T00:00:00Z'));
    expect(later.nextBillingDatesRefreshed).toBe(1);
    const [row] = await db.select().from(subscriptions).where(eq(subscriptions.id, sub.id));
    expect(row?.nextBillingDate).toBe(CHARGE);
  });
});
