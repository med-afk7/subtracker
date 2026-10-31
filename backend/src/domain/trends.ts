import { totalsByCurrency, type BillingInterval, type CurrencyTotal } from './money.js';
import {
  addMonthsClamped,
  daysInMonth,
  formatPlainDate,
  parsePlainDate,
  type PlainDate,
} from './plainDate.js';
import { priceOn, type PricePoint } from './priceHistory.js';

// What the app knows about a subscription's past: when it started, ended or was cancelled, and
// what it cost when. Interval changes and earlier cancel/reactivate cycles aren't recorded, so
// the current interval is used throughout (a documented limitation).
export interface TrendSubscription {
  startDate: PlainDate;
  endDate: PlainDate | null;
  cancelledOn: PlainDate | null; // the user's local date of cancellation
  interval: BillingInterval;
  count: number;
  prices: PricePoint[];
}

export interface TrendPoint {
  month: string; // YYYY-MM
  date: PlainDate; // the day the snapshot is taken (month end, or today for this month)
  totals: CurrencyTotal[];
}

const isActiveOn = (sub: TrendSubscription, date: PlainDate) =>
  sub.startDate <= date &&
  (!sub.endDate || sub.endDate >= date) &&
  (!sub.cancelledOn || sub.cancelledOn > date);

// The last day of each month from `firstMonth` up to the month containing `today`, where the
// current month's snapshot is taken today rather than at a future month end
export function monthlySnapshotDates(firstMonth: PlainDate, today: PlainDate): PlainDate[] {
  const dates: PlainDate[] = [];
  for (
    let month = firstMonth.slice(0, 7) + '-01';
    month <= today;
    month = addMonthsClamped(month, 1)
  ) {
    const { year, month: m } = parsePlainDate(month);
    const monthEnd = formatPlainDate({ year, month: m, day: daysInMonth(year, m) });
    dates.push(monthEnd < today ? monthEnd : today);
  }
  return dates;
}

// Recorded monthly-equivalent cost at each date, per currency: the subscriptions active that
// day, each at the price in effect that day. An estimate of what the user was committed to,
// not a record of payments.
export function spendingTrend(subs: TrendSubscription[], dates: PlainDate[]): TrendPoint[] {
  return dates.map((date) => {
    const costs = subs.flatMap((sub) => {
      if (!isActiveOn(sub, date)) return [];
      const price = priceOn(sub.prices, date);
      return price
        ? [
            {
              amountMinor: price.amountMinor,
              currency: price.currency,
              interval: sub.interval,
              count: sub.count,
            },
          ]
        : [];
    });
    return { month: date.slice(0, 7), date, totals: totalsByCurrency(costs) };
  });
}
