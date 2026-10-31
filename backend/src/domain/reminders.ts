import { addDays, compareDates, todayIn, zonedTimeToUtc, type PlainDate } from './plainDate.js';
import { occurrencesBetween, type Schedule } from './recurrence.js';

// Reminders go out at 09:00 in the user's timezone on (billing date - days before)
export const REMINDER_LOCAL_HOUR = 9;
export const MAX_REMINDER_DAYS = 30;

export interface ReminderUser {
  remindersEnabled: boolean;
  emailVerifiedAt: Date | null;
  defaultReminderDaysBefore: number;
}

export interface ReminderSubscription {
  status: 'active' | 'cancelled';
  archivedAt: Date | null;
  reminderMode: 'default' | 'custom' | 'off';
  reminderDaysBefore: number | null;
}

// How many days before each charge to remind, or null for "no reminders"
export function effectiveDaysBefore(user: ReminderUser, sub: ReminderSubscription): number | null {
  // Unverified addresses never get reminder emails
  if (!user.remindersEnabled || !user.emailVerifiedAt) return null;
  if (sub.status !== 'active' || sub.archivedAt || sub.reminderMode === 'off') return null;
  if (sub.reminderMode === 'custom') return sub.reminderDaysBefore;
  return user.defaultReminderDaysBefore;
}

export const reminderTime = (billingDate: PlainDate, daysBefore: number, timezone: string): Date =>
  zonedTimeToUtc(addDays(billingDate, -daysBefore), REMINDER_LOCAL_HOUR, timezone);

export interface DueReminder {
  billingDate: PlainDate;
  scheduledFor: Date;
}

// Reminders that should exist by `now`: their send time has arrived and the charge hasn't
// happened yet (in the user's timezone). If the worker was down, overdue reminders still go out
// as long as the charge is still ahead; once it has passed, they never do.
// Looks at every charge in the next MAX_REMINDER_DAYS days, because a weekly plan with a
// 10-day reminder has more than one charge whose reminder can be due.
export function dueReminders(
  schedule: Schedule,
  daysBefore: number,
  timezone: string,
  now: Date,
): DueReminder[] {
  const today = todayIn(timezone, now);
  return occurrencesBetween(schedule, today, addDays(today, MAX_REMINDER_DAYS))
    .map((billingDate) => ({
      billingDate,
      scheduledFor: reminderTime(billingDate, daysBefore, timezone),
    }))
    .filter(
      (r) => r.scheduledFor.getTime() <= now.getTime() && compareDates(r.billingDate, today) >= 0,
    );
}

// Waits between attempts: 1 min, 5 min, 30 min, 2 h, 6 h. About 8.6 h in total, comfortably
// inside the email provider's 24-hour idempotency window, so every retry is deduplicated.
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000];
export const MAX_ATTEMPTS = BACKOFF_MS.length;

// Delay before the next attempt after `attempt` failures, with ±20% jitter so many failed
// reminders don't all retry at the same instant. `random` is injectable for tests.
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = BACKOFF_MS[Math.min(Math.max(attempt, 1), BACKOFF_MS.length) - 1]!;
  return Math.round(base * (0.8 + 0.4 * random()));
}
