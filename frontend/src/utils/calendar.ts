// Calendar-grid helpers on plain YYYY-MM-DD strings (UTC date math, so no DST surprises)

export interface YearMonth {
  year: number;
  month: number; // 1-12
}

const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export const monthStart = ({ year, month }: YearMonth) => `${year}-${pad(month)}-01`;
export const monthEnd = ({ year, month }: YearMonth) => toIso(new Date(Date.UTC(year, month, 0)));

export function shiftMonth({ year, month }: YearMonth, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function currentYearMonth(): YearMonth {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

// First day of the week for the browser's locale (1 = Monday ... 7 = Sunday), Monday if unknown
export function firstDayOfWeek(): number {
  try {
    const locale = new Intl.Locale(navigator.language) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    return locale.getWeekInfo?.().firstDay ?? locale.weekInfo?.firstDay ?? 1;
  } catch {
    return 1;
  }
}

// Every date shown in the month grid: whole weeks covering the month
export function monthGrid(ym: YearMonth, weekStart: number): string[] {
  const first = new Date(Date.UTC(ym.year, ym.month - 1, 1));
  const isoWeekday = first.getUTCDay() || 7; // 1 = Monday ... 7 = Sunday
  const leading = (isoWeekday - weekStart + 7) % 7;
  const daysInMonth = new Date(Date.UTC(ym.year, ym.month, 0)).getUTCDate();
  const cells = Math.ceil((leading + daysInMonth) / 7) * 7;
  return Array.from({ length: cells }, (_, i) =>
    toIso(new Date(Date.UTC(ym.year, ym.month - 1, 1 - leading + i))),
  );
}

// Weekday names in grid order, e.g. ["Mon", "Tue", ...]
export function weekdayLabels(weekStart: number, style: 'short' | 'long' = 'short'): string[] {
  // Jan 1 2024 was a Monday
  return Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2024, 0, ((weekStart - 1 + i) % 7) + 1)).toLocaleDateString(undefined, {
      weekday: style,
      timeZone: 'UTC',
    }),
  );
}

export const monthLabel = ({ year, month }: YearMonth) =>
  new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

export const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
