import { useEffect, useId, useRef, useState } from 'react';

export interface ChartPoint {
  /** Popisek na ose X (datum, kolo). */
  label: string;
  value: number;
}

/**
 * Čárový graf jedné řady: tenká čára, zvýrazněný poslední bod s hodnotou, nevýrazná mřížka,
 * svislá čára s popiskem při najetí (i klávesnicí) a tabulka hodnot pro čtečky a kontrolu.
 */
export function LineChart({
  title,
  points,
  format,
  invert = false,
  min,
  max,
  height = 170,
  forecastFrom,
  baseline,
}: {
  title: string;
  points: ChartPoint[];
  format: (v: number) => string;
  /** Menší je lepší (pozice v tabulce): osa Y obráceně, 1 nahoře. */
  invert?: boolean;
  min?: number;
  max?: number;
  height?: number;
  /** Od tohoto bodu dál je řada odhad (kreslí se čárkovaně). */
  forecastFrom?: number;
  /** Vodorovná referenční čára (například nula nebo hranice kontokorentu). */
  baseline?: { value: number; label: string };
}) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(600);
  const id = useId();
  // Graf se kreslí v pixelech skutečné šířky, aby popisky zůstaly čitelné i na telefonu.
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setMeasured(Math.max(240, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (points.length < 2) {
    void measured;
    return (
      <figure className="chart">
        <figcaption className="chart-title">{title}</figcaption>
        <p className="muted small">Graf se ukáže, až bude víc údajů.</p>
      </figure>
    );
  }

  const width = measured;
  const pad = { top: 14, right: 56, bottom: 22, left: 44 };
  const values = [...points.map((p) => p.value), ...(baseline ? [baseline.value] : [])];
  let lo = min ?? Math.min(...values);
  let hi = max ?? Math.max(...values);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const span = hi - lo;
  if (min === undefined) lo -= span * 0.08;
  if (max === undefined) hi += span * 0.08;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const x = (i: number) => pad.left + (i / (points.length - 1)) * innerW;
  const y = (v: number) => {
    const t = (v - lo) / (hi - lo);
    return pad.top + (invert ? t : 1 - t) * innerH;
  };
  // Popisky osy bez opakování (u celých čísel a malého rozsahu by se jinak duplikovaly).
  const seen = new Set<string>();
  const ticks = [0, 1, 2, 3]
    .map((k) => lo + ((hi - lo) * k) / 3)
    .filter((t) => {
      const label = format(t);
      if (seen.has(label)) return false;
      seen.add(label);
      return true;
    });
  const split = forecastFrom !== undefined && forecastFrom > 0 && forecastFrom < points.length ? forecastFrom : points.length;
  const line = (from: number, to: number) => points.slice(from, to).map((p, k) => `${k ? 'L' : 'M'}${x(from + k).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const path = line(0, split);
  const future = split < points.length ? line(split - 1, points.length) : '';
  const isForecast = (i: number) => i >= split;
  const last = points.length - 1;
  const xLabels = [...new Set([0, Math.floor(last / 2), last])];
  const active = hover ?? null;

  const pick = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const sx = ((clientX - rect.left) / rect.width) * width;
    const i = Math.round(((sx - pad.left) / innerW) * last);
    setHover(Math.max(0, Math.min(last, i)));
  };

  return (
    <figure className="chart">
      <figcaption className="chart-title" id={`${id}-t`}>{title}</figcaption>
      <div className="chart-box" ref={boxRef}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-labelledby={`${id}-t`}
          tabIndex={0}
          onPointerMove={(e) => pick(e.clientX)}
          onPointerDown={(e) => pick(e.clientX)}
          onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHover(null); }}
          onFocus={() => setHover(last)}
          onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setHover(Math.max(0, (hover ?? last) - 1));
            if (e.key === 'ArrowRight') setHover(Math.min(last, (hover ?? last) + 1));
          }}
        >
          {ticks.map((t, i) => (
            <g key={i}>
              <line className="chart-grid" x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} />
              <text className="chart-axis" x={pad.left - 6} y={y(t) + 4} textAnchor="end">
                {format(t)}
              </text>
            </g>
          ))}
          {xLabels.map((i) => (
            <text key={i} className="chart-axis" x={x(i)} y={height - 4} textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'}>
              {points[i].label}
            </text>
          ))}
          {baseline && (
            <g>
              <line className="chart-baseline" x1={pad.left} x2={width - pad.right} y1={y(baseline.value)} y2={y(baseline.value)} />
              <text className="chart-axis" x={width - pad.right + 4} y={y(baseline.value) + 4}>{baseline.label}</text>
            </g>
          )}
          {split < points.length && <line className="chart-today" x1={x(split - 1)} x2={x(split - 1)} y1={pad.top} y2={pad.top + innerH} />}
          <path className="chart-line" d={path} />
          {future && <path className="chart-line forecast" d={future} />}
          <circle className="chart-dot" cx={x(last)} cy={y(points[last].value)} r={4} />
          {active === null && (
            <text className="chart-endlabel" x={x(last) + 8} y={y(points[last].value) + 4}>
              {format(points[last].value)}
            </text>
          )}
          {active !== null && (
            <g>
              <line className="chart-cross" x1={x(active)} x2={x(active)} y1={pad.top} y2={pad.top + innerH} />
              <circle className="chart-dot" cx={x(active)} cy={y(points[active].value)} r={4} />
            </g>
          )}
        </svg>
        {active !== null && (
          <div
            className="chart-tip"
            style={{ left: `${(x(active) / width) * 100}%`, transform: `translateX(${active > last / 2 ? '-105%' : '5%'})` }}
            role="status"
          >
            <strong>{format(points[active].value)}</strong>
            <span>{points[active].label}{isForecast(active) ? ' · výhled' : ''}</span>
          </div>
        )}
      </div>
      <details className="chart-table">
        <summary>Tabulka hodnot</summary>
        <table>
          <tbody>
            {points.map((p, i) => (
              <tr key={i}>
                <td className="muted">{p.label}{isForecast(i) ? ' (výhled)' : ''}</td>
                <td className="num">{format(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
