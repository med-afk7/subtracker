import { useState, type KeyboardEvent } from 'react';
import { formatMoney } from '../../utils/format';

export interface ForecastDatum {
  month: string; // YYYY-MM
  amount: string; // decimal string, "0.00" for an empty month
  count: number;
}

const WIDTH = 600;
const HEIGHT = 200;
const PAD = { top: 12, right: 8, bottom: 28, left: 64 };
const plotWidth = WIDTH - PAD.left - PAD.right;
const plotHeight = HEIGHT - PAD.top - PAD.bottom;
// In SVG units; the chart scales up to ~1.45x on wide screens, so 16 stays under ~24px on screen
const MAX_BAR = 16;

function niceMax(value: number) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return (
    ([1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => s * magnitude >= value) ?? 10) * magnitude
  );
}

const monthLabel = (month: string, style: 'short' | 'long' = 'short') =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined, {
    month: style,
    ...(style === 'long' ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });

// A column per month: thin bars (<= 24px) with a 4px rounded top and a square base, one hue.
// Each column's full-height slot is its hover target; keyboard arrows step through months.
export default function ForecastChart({
  currency,
  data,
}: {
  currency: string;
  data: ForecastDatum[];
}) {
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const values = data.map((d) => Number(d.amount)); // geometry only
  const top = niceMax(Math.max(...values));
  const slot = plotWidth / data.length;
  const barWidth = Math.min(MAX_BAR, slot * 0.6);
  const y = (v: number) => PAD.top + plotHeight - (v / top) * plotHeight;
  const ticks = [0, top / 2, top];
  const labelEvery = data.length > 8 ? 2 : 1;
  const formatTick = (v: number) =>
    new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(v);

  // A rounded top (radius 4) and a square base, drawn as one path
  const barPath = (x: number, value: number) => {
    const h = y(0) - y(value);
    if (h <= 0) return '';
    const r = Math.min(4, h, barWidth / 2);
    const top = y(value);
    return `M${x},${y(0)} V${top + r} Q${x},${top} ${x + r},${top} H${x + barWidth - r} Q${x + barWidth},${top} ${x + barWidth},${top + r} V${y(0)} Z`;
  };

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight') setActive((i) => Math.min((i ?? -1) + 1, data.length - 1));
    if (event.key === 'ArrowLeft') setActive((i) => Math.max((i ?? data.length) - 1, 0));
  };
  const current = active === null ? null : data[active];

  return (
    <div className="trend">
      <div
        className="trend-plot"
        tabIndex={0}
        role="img"
        aria-label={`Expected payments per month in ${currency}. Use the arrow keys to read each month.`}
        onKeyDown={onKey}
        onFocus={() => setActive((i) => i ?? 0)}
        onBlur={() => setActive(null)}
      >
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
          {ticks.map((t) => (
            <g key={t}>
              <line
                className="trend-grid"
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={y(t)}
                y2={y(t)}
              />
              <text
                className="trend-tick"
                x={PAD.left - 8}
                y={y(t)}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {formatTick(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = PAD.left + slot * i + (slot - barWidth) / 2;
            return (
              <g key={d.month}>
                <path
                  className={`forecast-bar${active === i ? ' active' : ''}`}
                  d={barPath(x, values[i]!)}
                />
                {(i % labelEvery === 0 || i === data.length - 1) && (
                  <text
                    className="trend-tick"
                    x={x + barWidth / 2}
                    y={HEIGHT - 8}
                    textAnchor="middle"
                  >
                    {monthLabel(d.month)}
                  </text>
                )}
                {/* The whole column slot is the hit target, not just the painted bar */}
                <rect
                  x={PAD.left + slot * i}
                  y={PAD.top}
                  width={slot}
                  height={plotHeight}
                  fill="transparent"
                  onPointerEnter={() => setActive(i)}
                  onPointerLeave={() => setActive(null)}
                />
              </g>
            );
          })}
        </svg>
        {current && active !== null && (
          <div
            className="trend-tooltip"
            style={{ left: `${((PAD.left + slot * (active + 0.5)) / WIDTH) * 100}%` }}
          >
            <strong>{formatMoney(current.amount, currency)}</strong>
            <span>
              {monthLabel(current.month, 'long')} · {current.count} charge
              {current.count === 1 ? '' : 's'}
            </span>
          </div>
        )}
      </div>

      <button
        className="link-button"
        type="button"
        onClick={() => setShowTable((v) => !v)}
        aria-expanded={showTable}
      >
        {showTable ? 'Hide table' : 'Show as table'}
      </button>
      {showTable && (
        <table className="trend-table">
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Charges</th>
              <th scope="col">Expected</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.month}>
                <td>{monthLabel(d.month, 'long')}</td>
                <td>{d.count}</td>
                <td>{formatMoney(d.amount, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
