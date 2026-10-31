// Calendar dates as "YYYY-MM-DD" strings. A billing date is a day on a calendar, not a moment in
// time, so this module never turns them into JS Date objects (new Date('2026-01-31') is UTC
// midnight, which is still Jan 30 in the Americas). Arithmetic goes through day numbers.

export type PlainDate = string;

const PLAIN_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface DateParts {
  year: number;
  month: number; // 1-12
  day: number;
}

export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this one (UTC, so no DST effects)
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function parsePlainDate(value: string): DateParts {
  const match = PLAIN_DATE.exec(value);
  if (!match) throw new Error(`Not a YYYY-MM-DD date: ${value}`);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`Not a real calendar date: ${value}`);
  }
  return { year, month, day };
}

export function isPlainDate(value: string): boolean {
  try {
    parsePlainDate(value);
    return true;
  } catch {
    return false;
  }
}

export function formatPlainDate({ year, month, day }: DateParts): PlainDate {
  const pad = (n: number, width: number) => String(n).padStart(width, '0');
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

// Days since 1970-01-01, for day arithmetic and differences
const MS_PER_DAY = 86_400_000;
const toDayNumber = (date: PlainDate) => {
  const { year, month, day } = parsePlainDate(date);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
};
const fromDayNumber = (dayNumber: number): PlainDate => {
  const d = new Date(dayNumber * MS_PER_DAY);
  return formatPlainDate({
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  });
};

export const addDays = (date: PlainDate, days: number): PlainDate =>
  fromDayNumber(toDayNumber(date) + days);

export const daysBetween = (from: PlainDate, to: PlainDate): number =>
  toDayNumber(to) - toDayNumber(from);

// Keeps the day of the month where possible and clamps it to shorter months:
// Jan 31 + 1 month = Feb 28 (Feb 29 in leap years); Jan 31 + 2 months = Mar 31.
export function addMonthsClamped(date: PlainDate, months: number): PlainDate {
  const { year, month, day } = parsePlainDate(date);
  const monthIndex = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(monthIndex / 12);
  const targetMonth = monthIndex - targetYear * 12 + 1;
  return formatPlainDate({
    year: targetYear,
    month: targetMonth,
    day: Math.min(day, daysInMonth(targetYear, targetMonth)),
  });
}

// "YYYY-MM-DD" strings compare correctly as plain strings
export const compareDates = (a: PlainDate, b: PlainDate) => (a < b ? -1 : a > b ? 1 : 0);
export const maxDate = (a: PlainDate, b: PlainDate) => (a >= b ? a : b);

// The calendar date it currently is in an IANA timezone, e.g. still Oct 31 in Los Angeles
// when it's already Nov 1 in UTC
export function todayIn(timezone: string, now: Date = new Date()): PlainDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return formatPlainDate({ year: get('year'), month: get('month'), day: get('day') });
}

// The UTC offset (in minutes) a timezone has at a given instant, e.g. -420 for Los Angeles in summer
function offsetMinutes(timezone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asIfUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((asIfUtc - instant.getTime()) / 60_000);
}

// The instant when the wall clock in `timezone` shows `date` at `hour`:00, e.g. 09:00 in
// Los Angeles on 2026-11-03 = 17:00 UTC. The offset is read at the target time itself, so
// daylight-saving changes between now and then are handled. Like Temporal's "compatible" mode,
// a wall time that occurs twice (clocks fall back) resolves to the earlier instant, and one that
// doesn't exist (skipped by a spring-forward) moves forward past the gap.
export function zonedTimeToUtc(date: PlainDate, hour: number, timezone: string): Date {
  const { year, month, day } = parsePlainDate(date);
  const wallAsUtc = Date.UTC(year, month - 1, day, hour);

  // Two candidates, using the offset before and after any transition near that time
  const first = wallAsUtc - offsetMinutes(timezone, new Date(wallAsUtc)) * 60_000;
  const second = wallAsUtc - offsetMinutes(timezone, new Date(first)) * 60_000;
  const showsWallTime = (instant: number) =>
    instant + offsetMinutes(timezone, new Date(instant)) * 60_000 === wallAsUtc;

  const valid = [first, second].filter(showsWallTime);
  return new Date(valid.length > 0 ? Math.min(...valid) : Math.max(first, second));
}
