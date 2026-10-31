import type { BillingInterval, ReminderMode } from '../types';

// Display only: amounts arrive as exact decimal strings and all money math happens on the
// server, so turning one into a number just to format it can't accumulate errors
export function formatMoney(amount: string, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(amount));
}

// Parse YYYY-MM-DD as a local date (new Date('2026-01-05') would be UTC midnight)
function parseLocalDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, day);
}

export function formatDate(isoDate: string) {
  return parseLocalDate(isoDate).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Today as YYYY-MM-DD in the browser's timezone, for date input defaults
export function todayIso() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Human-friendly countdown such as "today", "tomorrow" or "in 12 days"
export function describeDaysUntil(isoDate: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round(
    (parseLocalDate(isoDate).getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

// The frequencies offered in the form; the API supports any (interval, count) pair
export const FREQUENCY_PRESETS = [
  { key: 'weekly', label: 'Weekly', interval: 'week', count: 1 },
  { key: 'biweekly', label: 'Every 2 weeks', interval: 'week', count: 2 },
  { key: 'monthly', label: 'Monthly', interval: 'month', count: 1 },
  { key: 'quarterly', label: 'Quarterly', interval: 'month', count: 3 },
  { key: 'semiannual', label: 'Every 6 months', interval: 'month', count: 6 },
  { key: 'annually', label: 'Annually', interval: 'year', count: 1 },
] as const satisfies readonly { interval: BillingInterval; count: number; [k: string]: unknown }[];

// "monthly", "every 3 months", "annually", "every 2 years"...
export function describeFrequency(interval: BillingInterval, count: number) {
  const preset = FREQUENCY_PRESETS.find((p) => p.interval === interval && p.count === count);
  if (preset && count === 1) return preset.label.toLowerCase();
  if (interval === 'month' && count === 3) return 'quarterly';
  return `every ${count} ${interval}s`;
}

// Short suffix for a price, e.g. "/ month", "/ 3 months", "/ year"
export function perPeriod(interval: BillingInterval, count: number) {
  return count === 1 ? `/ ${interval}` : `/ ${count} ${interval}s`;
}

export function describeReminder(mode: ReminderMode, daysBefore: number | null) {
  if (mode === 'off') return 'No reminder';
  if (mode === 'default') return 'Reminder: account default';
  if (daysBefore === 0) return 'Reminder on the day';
  return `Reminder ${daysBefore} day${daysBefore === 1 ? '' : 's'} before`;
}

// Common currencies first, then every other ISO code the browser knows
const COMMON_CURRENCIES = ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'JPY', 'INR', 'JOD'];
export const CURRENCIES = Array.from(
  new Set([...COMMON_CURRENCIES, ...Intl.supportedValuesOf('currency')]),
);
