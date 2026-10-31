import { formatAmount } from './money.js';
import type { PlainDate } from './plainDate.js';

// One expected charge, already priced in integer minor units
export interface ForecastPayment {
  date: PlainDate;
  subscriptionId: string;
  name: string;
  amountMinor: number;
  currency: string;
}

export interface ForecastMonth {
  month: string; // YYYY-MM
  totals: { currency: string; amount: string; count: number }[];
}

// Expected payments summed per calendar month and currency. Unlike the monthly equivalent,
// this is lumpy on purpose: a $120 annual plan adds $120 to the month it renews and nothing to
// the others. Sums are exact integers; currencies are never combined.
export function forecastByMonth(payments: ForecastPayment[], months: string[]): ForecastMonth[] {
  const sums = new Map<string, Map<string, { minor: number; count: number }>>();
  for (const month of months) sums.set(month, new Map());

  for (const payment of payments) {
    const month = sums.get(payment.date.slice(0, 7));
    if (!month) continue;
    const entry = month.get(payment.currency) ?? { minor: 0, count: 0 };
    entry.minor += payment.amountMinor;
    entry.count += 1;
    month.set(payment.currency, entry);
  }

  return months.map((month) => ({
    month,
    totals: [...sums.get(month)!].map(([currency, { minor, count }]) => ({
      currency,
      amount: formatAmount(minor, currency),
      count,
    })),
  }));
}

// Every calendar month touched by [from, to], e.g. Oct 20 - Jan 18 -> 2026-10 ... 2027-01
export function monthsBetween(from: PlainDate, to: PlainDate): string[] {
  const months: string[] = [];
  let [year, month] = from.split('-').map(Number) as [number, number];
  const last = to.slice(0, 7);
  for (;;) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    months.push(key);
    if (key >= last) break;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}
