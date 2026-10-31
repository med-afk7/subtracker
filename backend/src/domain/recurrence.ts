import type { BillingInterval } from './money.js';
import {
  addDays,
  addMonthsClamped,
  compareDates,
  daysBetween,
  maxDate,
  parsePlainDate,
  type PlainDate,
} from './plainDate.js';

export type { BillingInterval };

// The schedule begins at the anchor: the first billing date the user gave us (or the start date).
// Nothing is inferred before it, so no charges are invented between the start date and the
// date the user said they'd next be billed.
export interface Schedule {
  // Every occurrence is computed from the anchor, never from the previous occurrence
  anchor: PlainDate;
  interval: BillingInterval;
  count: number; // e.g. (month, 3) = quarterly
  endDate?: PlainDate | null; // no occurrences after this
}

// Occurrence k (k = 0 is the anchor).
// Months: anchor day kept and clamped, so a Jan 31 schedule bills Feb 28, then Mar 31 again.
// Years: 12-month steps, so a Feb 29 schedule bills Feb 28 in common years and Feb 29 in leap years.
export function occurrenceAt(schedule: Schedule, k: number): PlainDate {
  const { anchor, interval, count } = schedule;
  if (interval === 'week') return addDays(anchor, 7 * count * k);
  const monthsPerStep = interval === 'year' ? 12 * count : count;
  return addMonthsClamped(anchor, monthsPerStep * k);
}

// Index of the first occurrence on or after `date`. Computes a close estimate directly
// (so a 10-year-old subscription costs the same as a new one), then adjusts by a step or two.
function firstIndexOnOrAfter(schedule: Schedule, date: PlainDate): number {
  const { anchor, interval, count } = schedule;
  let k: number;
  if (interval === 'week') {
    k = Math.ceil(daysBetween(anchor, date) / (7 * count));
  } else {
    const a = parsePlainDate(anchor);
    const d = parsePlainDate(date);
    const monthsApart = (d.year - a.year) * 12 + (d.month - a.month);
    k = Math.floor(monthsApart / (interval === 'year' ? 12 * count : count)) - 1;
  }
  while (compareDates(occurrenceAt(schedule, k), date) < 0) k += 1;
  while (compareDates(occurrenceAt(schedule, k - 1), date) >= 0) k -= 1;
  return k;
}

// The first billing date on or after `date`, or null if the schedule has ended by then
export function nextOccurrenceOnOrAfter(schedule: Schedule, date: PlainDate): PlainDate | null {
  return nextOccurrences(schedule, date, 1)[0] ?? null;
}

// Up to `limit` billing dates on or after `date`, within the schedule's start and end dates
export function nextOccurrences(schedule: Schedule, date: PlainDate, limit: number): PlainDate[] {
  const from = maxDate(date, schedule.anchor);
  const result: PlainDate[] = [];
  for (let k = firstIndexOnOrAfter(schedule, from); result.length < limit; k++) {
    const occurrence = occurrenceAt(schedule, k);
    if (schedule.endDate && compareDates(occurrence, schedule.endDate) > 0) break;
    result.push(occurrence);
  }
  return result;
}

// Every billing date from `from` to `to` (both inclusive), within the anchor and end date
export function occurrencesBetween(
  schedule: Schedule,
  from: PlainDate,
  to: PlainDate,
): PlainDate[] {
  const start = maxDate(from, schedule.anchor);
  const last = schedule.endDate && schedule.endDate < to ? schedule.endDate : to;
  const result: PlainDate[] = [];
  if (compareDates(start, last) > 0) return result;

  for (let k = firstIndexOnOrAfter(schedule, start); ; k++) {
    const occurrence = occurrenceAt(schedule, k);
    if (compareDates(occurrence, last) > 0) break;
    result.push(occurrence);
  }
  return result;
}

// Plain-words frequency for exports and emails: "monthly", "quarterly", "every 2 weeks"
export function describeFrequency(interval: BillingInterval, count: number): string {
  if (count === 1) return { week: 'weekly', month: 'monthly', year: 'annually' }[interval];
  if (interval === 'month' && count === 3) return 'quarterly';
  return `every ${count} ${interval}s`;
}
