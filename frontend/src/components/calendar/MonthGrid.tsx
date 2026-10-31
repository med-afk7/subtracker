import type { CalendarEvent } from '../../types';
import { formatMoney } from '../../utils/format';
import { longDate, monthGrid, weekdayLabels, type YearMonth } from '../../utils/calendar';

interface MonthGridProps {
  month: YearMonth;
  weekStart: number;
  eventsByDate: Map<string, CalendarEvent[]>;
  today: string;
  selected: string | null;
  onSelect: (date: string) => void;
}

const MAX_CHIPS = 2;

export default function MonthGrid({
  month,
  weekStart,
  eventsByDate,
  today,
  selected,
  onSelect,
}: MonthGridProps) {
  const prefix = `${month.year}-${String(month.month).padStart(2, '0')}-`;
  const days = monthGrid(month, weekStart);

  return (
    <div className="month-grid" role="group" aria-label="Billing calendar">
      {weekdayLabels(weekStart).map((label) => (
        <div key={label} className="weekday" aria-hidden="true">
          {label}
        </div>
      ))}
      {days.map((date) => {
        // Days from the neighbouring months are shown for shape only
        if (!date.startsWith(prefix))
          return <div key={date} className="day outside" aria-hidden="true" />;

        const events = eventsByDate.get(date) ?? [];
        const label = `${longDate(date)}: ${
          events.length === 0
            ? 'no expected charges'
            : events.map((e) => `${e.name} ${formatMoney(e.amount, e.currency)}`).join(', ')
        }`;
        const classes = [
          'day',
          date === today && 'today',
          date === selected && 'selected',
          date < today && 'past',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <button
            key={date}
            type="button"
            className={classes}
            aria-label={label}
            aria-pressed={date === selected}
            onClick={() => onSelect(date)}
          >
            <span className="day-number">{Number(date.slice(8))}</span>
            {events.slice(0, MAX_CHIPS).map((e) => (
              <span key={e.subscriptionId} className="chip">
                {e.name}
              </span>
            ))}
            {events.length > MAX_CHIPS && (
              <span className="more">+{events.length - MAX_CHIPS} more</span>
            )}
            {/* Phones: a count instead of names */}
            {events.length > 0 && (
              <span className="count" aria-hidden="true">
                {events.length}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
