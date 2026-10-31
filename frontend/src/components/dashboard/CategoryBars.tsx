import type { CategoryBreakdown } from '../../types';
import { formatMoney } from '../../utils/format';

const percent = (share: number) => `${Math.round(share * 100)}%`;

// Ranked horizontal bars, largest first, one hue: bars on a shared baseline make the parts
// easy to compare. Names and amounts are text in each row, so the list doubles as the table.
export default function CategoryBars({ breakdown }: { breakdown: CategoryBreakdown[] }) {
  return (
    <section className="card">
      <h2>By category</h2>
      <p className="muted small section-intro">Monthly equivalent of active subscriptions.</p>
      {breakdown.length === 0 && <p className="muted empty-state">No active subscriptions yet.</p>}
      {breakdown.map((group) => (
        <div key={group.currency} className="bar-group">
          {breakdown.length > 1 && (
            <h3 className="bar-group-title">
              {group.currency} · {formatMoney(group.monthlyEquivalent, group.currency)} a month
            </h3>
          )}
          <ul className="plain-list bar-list">
            {group.categories.map((c) => {
              const label = `${c.name}: ${formatMoney(c.monthlyEquivalent, group.currency)} a month, ${percent(c.share)} of ${group.currency} spending, ${c.subscriptionCount} subscription${c.subscriptionCount === 1 ? '' : 's'}`;
              return (
                <li key={c.slug} className="bar-row" title={label}>
                  <span className="bar-name">{c.name}</span>
                  <span className="bar-amount">
                    {formatMoney(c.monthlyEquivalent, group.currency)}
                  </span>
                  <span className="bar-track" role="img" aria-label={label}>
                    <span
                      className="bar-fill"
                      style={{ width: `${Math.max(c.share * 100, 1)}%` }}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
