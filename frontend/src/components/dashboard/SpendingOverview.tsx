import type { CurrencyTotal } from '../../types';
import { formatMoney } from '../../utils/format';

// The headline: monthly-equivalent spend in the main currency, plus two supporting tiles.
// Other currencies are listed, never converted (there's no exchange-rate source).
export default function SpendingOverview({
  activeCount,
  totals,
}: {
  activeCount: number;
  totals: CurrencyTotal[];
}) {
  const [main, ...others] = totals;

  return (
    <section className="card overview">
      <div className="hero">
        <span className="tile-label">Monthly equivalent</span>
        <span className="hero-figure">
          {main ? formatMoney(main.monthlyEquivalent, main.currency) : '—'}
        </span>
        {others.map((t) => (
          <span key={t.currency} className="muted">
            + {formatMoney(t.monthlyEquivalent, t.currency)} a month in {t.currency}
          </span>
        ))}
        <span className="muted small">
          What your active subscriptions cost per month, on average.
        </span>
      </div>

      <div className="tiles">
        <div className="tile">
          <span className="tile-label">Active subscriptions</span>
          <span className="tile-value">{activeCount}</span>
        </div>
        <div className="tile">
          <span className="tile-label">Per year</span>
          {totals.length === 0 && <span className="tile-value">—</span>}
          {totals.map((t) => (
            <span key={t.currency} className="tile-value">
              {formatMoney(t.annualized, t.currency)}
            </span>
          ))}
          <span className="muted small">Estimate from current prices</span>
        </div>
      </div>
    </section>
  );
}
