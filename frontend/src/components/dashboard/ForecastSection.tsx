import { useEffect, useState } from 'react';
import { errorMessage } from '../../api/client';
import { getForecast } from '../../api/forecast.api';
import type { Forecast, ForecastRange } from '../../types';
import { formatDate, formatMoney } from '../../utils/format';
import ForecastChart from './ForecastChart';

const RANGES: { value: ForecastRange; label: string }[] = [
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '12m', label: '12 months' },
];

export default function ForecastSection() {
  const [range, setRange] = useState<ForecastRange>('90d');
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;
    getForecast(range)
      .then((f) => !ignore && setForecast(f))
      .catch((err) => !ignore && setError(errorMessage(err)));
    return () => {
      ignore = true;
    };
  }, [range]);

  const currencies = forecast?.totals.map((t) => t.currency) ?? [];

  return (
    <section className="card">
      <div className="section-heading">
        <h2>Forecast</h2>
        <div className="segmented" role="group" aria-label="Forecast range">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              aria-pressed={range === r.value}
              onClick={() => setRange(r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <p className="muted small section-intro">
        What you can expect to pay each month. Unlike the monthly equivalent above, a yearly plan
        shows its full price in the month it renews.
      </p>

      {error && <p className="error">{error}</p>}
      {forecast && (
        // Keep the previous chart visible (dimmed) while a new range loads
        <div className={forecast.range === range ? undefined : 'refreshing'}>
          {forecast.totals.length === 0 ? (
            <p className="muted empty-state">No charges expected in this period.</p>
          ) : (
            <>
              <p className="forecast-total">
                {formatDate(forecast.from)} – {formatDate(forecast.to)}:{' '}
                {forecast.totals.map((t, i) => (
                  <span key={t.currency}>
                    {i > 0 && ' · '}
                    <strong>{formatMoney(t.amount, t.currency)}</strong>
                  </span>
                ))}
                <span className="muted">
                  {' '}
                  in {forecast.totals.reduce((n, t) => n + t.count, 0)} expected charges
                </span>
              </p>
              {currencies.map((currency) => (
                <div key={currency} className="trend-group">
                  {currencies.length > 1 && <h3 className="bar-group-title">{currency}</h3>}
                  <ForecastChart
                    currency={currency}
                    data={forecast.months.map((m) => {
                      const total = m.totals.find((t) => t.currency === currency);
                      return {
                        month: m.month,
                        amount: total?.amount ?? '0',
                        count: total?.count ?? 0,
                      };
                    })}
                  />
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}
