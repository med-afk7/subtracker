import type { PriceChange } from '../../types';
import { formatDate, formatMoney } from '../../utils/format';

function formatDifference(difference: string, currency: string) {
  const sign = difference.startsWith('-') ? '−' : '+';
  return `${sign}${formatMoney(difference.slice(1), currency)}`;
}

export default function PriceChanges({ changes }: { changes: PriceChange[] }) {
  if (changes.length === 0) return null;

  return (
    <section className="card">
      <h2>Recent price changes</h2>
      <ul className="plain-list">
        {changes.map((c) => (
          <li key={`${c.subscriptionId}-${c.effectiveDate}`} className="change-row">
            <span className="payment-name">{c.name}</span>
            <span className="muted">
              {formatMoney(c.previousAmount, c.currency)} → {formatMoney(c.newAmount, c.currency)}
              {c.difference && (
                <strong className="price-diff">
                  {' '}
                  {formatDifference(c.difference, c.currency)}
                </strong>
              )}
            </span>
            <span className="muted small">from {formatDate(c.effectiveDate)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
