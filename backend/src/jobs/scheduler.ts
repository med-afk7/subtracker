import { and, eq, gte, isNotNull, isNull, lte, ne } from 'drizzle-orm';
import { db } from '../db/index.js';
import { notificationDeliveries, subscriptions, users } from '../db/schema.js';
import { addDays, todayIn } from '../domain/plainDate.js';
import { MAX_REMINDER_DAYS, dueReminders, effectiveDaysBefore } from '../domain/reminders.js';

// Creates a delivery row for every reminder that has become due. Safe to run any number of
// times, concurrently or not: the unique (subscription, billing date, kind) index turns a
// repeat into a no-op (ON CONFLICT DO NOTHING).
export async function runScheduler(now: Date): Promise<{ scheduled: number }> {
  // Timezones are within a day of UTC, so this window covers every user's next 30 days
  const utcToday = todayIn('UTC', now);
  const candidates = await db
    .select({ sub: subscriptions, user: users })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.userId))
    .where(
      and(
        eq(subscriptions.status, 'active'),
        isNull(subscriptions.archivedAt),
        ne(subscriptions.reminderMode, 'off'),
        eq(users.remindersEnabled, true),
        isNotNull(users.emailVerifiedAt),
        gte(subscriptions.nextBillingDate, addDays(utcToday, -1)),
        lte(subscriptions.nextBillingDate, addDays(utcToday, MAX_REMINDER_DAYS + 2)),
      ),
    );

  const rows = candidates.flatMap(({ sub, user }) => {
    const daysBefore = effectiveDaysBefore(user, sub);
    if (daysBefore === null) return [];
    const schedule = {
      anchor: sub.billingAnchorDate,
      interval: sub.billingInterval,
      count: sub.billingIntervalCount,
      endDate: sub.endDate,
    };
    return dueReminders(schedule, daysBefore, user.timezone, now).map((reminder) => ({
      subscriptionId: sub.id,
      billingDate: reminder.billingDate,
      daysBefore,
      scheduledFor: reminder.scheduledFor,
      nextAttemptAt: now,
    }));
  });
  if (rows.length === 0) return { scheduled: 0 };

  const inserted = await db
    .insert(notificationDeliveries)
    .values(rows)
    .onConflictDoNothing({
      target: [
        notificationDeliveries.subscriptionId,
        notificationDeliveries.billingDate,
        notificationDeliveries.kind,
      ],
    })
    .returning({ id: notificationDeliveries.id });

  return { scheduled: inserted.length };
}
