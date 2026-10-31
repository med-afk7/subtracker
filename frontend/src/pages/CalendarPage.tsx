import { useEffect, useMemo, useState } from 'react';
import { getCalendar } from '../api/calendar.api';
import { errorMessage } from '../api/client';
import { getSubscriptions } from '../api/subscriptions.api';
import DayDetails from '../components/calendar/DayDetails';
import MonthGrid from '../components/calendar/MonthGrid';
import { useCategories } from '../hooks/useCategories';
import type { CalendarData, CalendarEvent, Subscription } from '../types';
import {
  currentYearMonth,
  firstDayOfWeek,
  monthEnd,
  monthLabel,
  monthStart,
  shiftMonth,
} from '../utils/calendar';
import { formatMoney, todayIso } from '../utils/format';

const WEEK_START = firstDayOfWeek();

export default function CalendarPage() {
  const today = todayIso();
  const [month, setMonth] = useState(currentYearMonth);
  const [selected, setSelected] = useState<string | null>(today);
  const [filters, setFilters] = useState({ category: '', subscriptionId: '' });
  const [data, setData] = useState<CalendarData | null>(null);
  const [error, setError] = useState('');
  const categories = useCategories();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);

  // Options for the subscription filter
  useEffect(() => {
    getSubscriptions({ search: '', category: '', state: '', interval: '', sort: 'name', page: 1 })
      .then((result) => setSubscriptions(result.data))
      .catch(() => setSubscriptions([]));
  }, []);

  // Exactly the visible month, so the server's totals are this month's totals
  const from = monthStart(month);
  const to = monthEnd(month);
  useEffect(() => {
    let ignore = false;
    getCalendar(from, to, filters)
      .then((result) => {
        if (ignore) return;
        setData(result);
        setError('');
      })
      .catch((err) => !ignore && setError(errorMessage(err)));
    return () => {
      ignore = true;
    };
  }, [from, to, filters]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of data?.events ?? [])
      map.set(event.date, [...(map.get(event.date) ?? []), event]);
    return map;
  }, [data]);

  const goTo = (delta: number) => {
    setMonth((m) => shiftMonth(m, delta));
    setSelected(null);
  };
  const goToToday = () => {
    setMonth(currentYearMonth());
    setSelected(today);
  };

  return (
    <main className="page wide">
      <div className="page-header">
        <h1>Calendar</h1>
      </div>

      <section className="card">
        <div className="calendar-header">
          <div className="month-nav">
            <button
              className="button secondary"
              onClick={() => goTo(-1)}
              aria-label="Previous month"
            >
              ‹
            </button>
            <h2 className="month-title" aria-live="polite">
              {monthLabel(month)}
            </h2>
            <button className="button secondary" onClick={() => goTo(1)} aria-label="Next month">
              ›
            </button>
            <button className="button secondary" onClick={goToToday}>
              Today
            </button>
          </div>
          <div className="toolbar calendar-filters">
            <label>
              <span className="visually-hidden">Category</span>
              <select
                value={filters.category}
                onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="visually-hidden">Subscription</span>
              <select
                value={filters.subscriptionId}
                onChange={(e) => setFilters((f) => ({ ...f, subscriptionId: e.target.value }))}
              >
                <option value="">All subscriptions</option>
                {subscriptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <p className="month-total">
          {data && data.totals.length > 0 ? (
            <>
              Expected this month:{' '}
              {data.totals.map((t, i) => (
                <span key={t.currency}>
                  {i > 0 && ' · '}
                  <strong>{formatMoney(t.amount, t.currency)}</strong>
                </span>
              ))}
              <span className="muted">
                {' '}
                ({data.events.length} charge{data.events.length === 1 ? '' : 's'})
              </span>
            </>
          ) : (
            <span className="muted">No expected charges this month.</span>
          )}
        </p>

        <div className="calendar-layout">
          <MonthGrid
            month={month}
            weekStart={WEEK_START}
            eventsByDate={eventsByDate}
            today={today}
            selected={selected}
            onSelect={setSelected}
          />
          <aside className="day-details" aria-live="polite">
            <DayDetails
              date={selected}
              events={selected ? (eventsByDate.get(selected) ?? []) : []}
            />
          </aside>
        </div>
      </section>
    </main>
  );
}
