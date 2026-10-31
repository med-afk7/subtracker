import type { SpendingTrends as Trends } from '../../types';
import TrendChart, { type TrendDatum } from './TrendChart';

// One chart per currency (never two y-axes, never converted). Shown once there are at least
// two months of recorded history; until then the dashboard says so instead of guessing.
export default function SpendingTrends({ trends }: { trends: Trends }) {
  const byCurrency = new Map<string, TrendDatum[]>();
  for (const point of trends.points) {
    for (const total of point.totals) {
      byCurrency.set(total.currency, [
        ...(byCurrency.get(total.currency) ?? []),
        { month: point.month, amount: total.monthlyEquivalent },
      ]);
    }
  }
  const series = [...byCurrency].filter(([, data]) => data.length >= 2);

  return (
    <section className="card">
      <h2>Monthly cost over time</h2>
      <p className="muted small section-intro">
        Rebuilt from your start dates, cancellations and price history, not from actual payments.
      </p>
      {series.length === 0 ? (
        <p className="muted empty-state">
          A trend appears once there are at least two months of history.
        </p>
      ) : (
        series.map(([currency, data]) => (
          <div key={currency} className="trend-group">
            {series.length > 1 && <h3 className="bar-group-title">{currency}</h3>}
            <TrendChart currency={currency} data={data} />
          </div>
        ))
      )}
    </section>
  );
}
