import type { UpcomingPayment } from '../../types';
import { describeDaysUntil, formatDate, formatMoney } from '../../utils/format';

export default function UpcomingPayments({
  payments,
  windowDays,
}: {
  payments: UpcomingPayment[];
  windowDays: number;
}) {
  return (
    <section className="card">
      <h2>Next {windowDays} days</h2>
      <p className="muted small section-intro">
        Expected charges from your billing dates, not confirmed payments.
      </p>
      {payments.length === 0 ? (
        <p className="muted empty-state">Nothing due in the next {windowDays} days.</p>
      ) : (
        <ul className="plain-list">
          {payments.map((p) => (
            <li key={`${p.subscriptionId}-${p.date}`} className="payment-row">
              <span className="payment-date">
                {formatDate(p.date)}
                <span className="muted small"> · {describeDaysUntil(p.date)}</span>
              </span>
              <span className="payment-name">{p.name}</span>
              <span className="payment-amount">{formatMoney(p.amount, p.currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
