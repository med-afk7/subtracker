import type { CalendarEvent } from '../../types';
import { formatMoney } from '../../utils/format';
import { longDate } from '../../utils/calendar';

export default function DayDetails({
  date,
  events,
}: {
  date: string | null;
  events: CalendarEvent[];
}) {
  if (!date) return <p className="muted">Pick a day to see what’s due.</p>;

  return (
    <div>
      <h2 className="day-title">{longDate(date)}</h2>
      {events.length === 0 ? (
        <p className="muted">No expected charges.</p>
      ) : (
        <ul className="plain-list">
          {events.map((e) => (
            <li key={e.subscriptionId} className="change-row">
              <span className="payment-name">{e.name}</span>
              <span className="muted small">{e.category.name}</span>
              <span className="payment-amount">{formatMoney(e.amount, e.currency)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">
        {events.some((e) => e.isPast)
          ? 'Expected from your billing schedule at the price that applied then, not a confirmed payment.'
          : 'Expected from your billing schedule, not a confirmed payment.'}
      </p>
    </div>
  );
}
