import { forecastByMonth, monthsBetween } from '../domain/forecast.js';
import { formatAmount } from '../domain/money.js';
import { addDays, addMonthsClamped, todayIn } from '../domain/plainDate.js';
import { listExpectedCharges } from './calendar.service.js';
import type { RequestContext } from './subscriptions.service.js';

export type ForecastRange = '30d' | '90d' | '12m';

// Expected payments from today through the end of the range, grouped by calendar month.
// The first and last months are partial: only charges inside the range count.
export async function getForecast(ctx: RequestContext, range: ForecastRange) {
  const from = todayIn(ctx.timezone);
  const to =
    range === '30d'
      ? addDays(from, 29)
      : range === '90d'
        ? addDays(from, 89)
        : addDays(addMonthsClamped(from, 12), -1);

  const charges = await listExpectedCharges(ctx, { from, to });
  const payments = charges.map((c) => ({
    date: c.date,
    subscriptionId: c.sub.id,
    name: c.sub.name,
    amountMinor: c.amountMinor,
    currency: c.currency,
  }));

  const totals = new Map<string, { minor: number; count: number }>();
  for (const p of payments) {
    const entry = totals.get(p.currency) ?? { minor: 0, count: 0 };
    entry.minor += p.amountMinor;
    entry.count += 1;
    totals.set(p.currency, entry);
  }

  return {
    range,
    from,
    to,
    // Whole-range totals per currency (expected charges, not confirmed payments)
    totals: [...totals]
      .map(([currency, { minor, count }]) => ({
        currency,
        amount: formatAmount(minor, currency),
        count,
      }))
      .sort((a, b) => b.count - a.count),
    months: forecastByMonth(payments, monthsBetween(from, to)),
  };
}
