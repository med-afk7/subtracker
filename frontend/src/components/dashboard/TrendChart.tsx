import { useState, type KeyboardEvent, type PointerEvent } from 'react';
import { formatMoney } from '../../utils/format';

export interface TrendDatum {
  month: string; // YYYY-MM
  amount: string; // decimal string
}

const WIDTH = 600;
const HEIGHT = 200;
const PAD = { top: 12, right: 16, bottom: 28, left: 64 };
const plotWidth = WIDTH - PAD.left - PAD.right;
const plotHeight = HEIGHT - PAD.top - PAD.bottom;

// A clean axis top at or above the largest value (e.g. 120 for 110, not 200), whose half is
// also a clean number for the middle gridline
function niceMax(value: number) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return (
    ([1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((step) => step * magnitude >= value) ?? 10) *
    magnitude
  );
}

const monthLabel = (month: string, style: 'short' | 'long' = 'short') =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined, {
    month: style,
    ...(style === 'long' ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });

// One currency's monthly-equivalent cost over time: a 2px line over a faint area, hairline
// gridlines, and a crosshair that snaps to the nearest month. Hover and keyboard focus show
// the same readout; the table toggle shows every value without hovering.
export default function TrendChart({ currency, data }: { currency: string; data: TrendDatum[] }) {
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  // Numbers for geometry only; every displayed value comes from the exact decimal strings
  const values = data.map((d) => Number(d.amount));
  const top = niceMax(Math.max(...values));
  const x = (i: number) =>
    PAD.left + (data.length === 1 ? plotWidth / 2 : (i / (data.length - 1)) * plotWidth);
  const y = (v: number) => PAD.top + plotHeight - (v / top) * plotHeight;
  const line = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ');
  const area = `${line} L${x(values.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const ticks = [0, top / 2, top];
  const labelEvery = data.length > 8 ? 2 : 1;
  const formatTick = (v: number) =>
    new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(v);

  const nearest = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const svgX = ((event.clientX - box.left) / box.width) * plotWidth;
    return Math.round((svgX / plotWidth) * (data.length - 1));
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight') setActive((i) => Math.min((i ?? -1) + 1, data.length - 1));
    if (event.key === 'ArrowLeft') setActive((i) => Math.max((i ?? data.length) - 1, 0));
  };
  const current = active === null ? null : data[active];
  const latest = data[data.length - 1]!;

  return (
    <div className="trend">
      <div
        className="trend-plot"
        tabIndex={0}
        role="img"
        aria-label={`Monthly equivalent in ${currency}, ${monthLabel(data[0]!.month, 'long')} to ${monthLabel(latest.month, 'long')}: from ${formatMoney(data[0]!.amount, currency)} to ${formatMoney(latest.amount, currency)}. Use the arrow keys to read each month.`}
        onKeyDown={onKey}
        onFocus={() => setActive((i) => i ?? data.length - 1)}
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
          {data.map((d, i) =>
            i % labelEvery === 0 || i === data.length - 1 ? (
              <text
                key={d.month}
                className="trend-tick"
                x={x(i)}
                y={HEIGHT - 8}
                textAnchor="middle"
              >
                {monthLabel(d.month)}
              </text>
            ) : null,
          )}
          <path className="trend-area" d={area} />
          <path className="trend-line" d={line} />
          {active !== null && (
            <line
              className="trend-crosshair"
              x1={x(active)}
              x2={x(active)}
              y1={PAD.top}
              y2={y(0)}
            />
          )}
          <circle
            className="trend-dot"
            cx={x(active ?? values.length - 1)}
            cy={y(values[active ?? values.length - 1]!)}
            r={4.5}
          />
          {/* Full-height hit area: the reader aims at a month, never at the 2px line */}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={plotWidth}
            height={plotHeight}
            fill="transparent"
            onPointerMove={(e) => setActive(nearest(e))}
            onPointerLeave={() => setActive(null)}
          />
        </svg>
        {current && active !== null && (
          <div className="trend-tooltip" style={{ left: `${(x(active) / WIDTH) * 100}%` }}>
            <strong>{formatMoney(current.amount, currency)}</strong>
            <span>{monthLabel(current.month, 'long')}</span>
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
              <th scope="col">Monthly equivalent</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.month}>
                <td>{monthLabel(d.month, 'long')}</td>
                <td>{formatMoney(d.amount, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
