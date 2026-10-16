import { useState } from 'react';
import type { Benchmark, BudgetLine, BudgetPlan } from '../../../engine';
import { money } from '../../format';

const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#6250d6'];

/**
 * Vodopád sezóny: příjmy, provozní výdaje, provozní výsledek, přestupy a daň, financování a výsledná změna peněz.
 * Plovoucí sloupce ukazují, jak se z příjmů dojde ke změně peněz na účtu.
 */
export function Waterfall({ plan }: { plan: BudgetPlan }) {
  const [hover, setHover] = useState<number | null>(null);
  const sum = (f: (l: BudgetLine) => boolean) => plan.lines.filter(f).reduce((a, l) => a + l.amount, 0);
  const income = sum((l) => l.group === 'provoz' && l.amount > 0);
  const costs = sum((l) => l.group === 'provoz' && l.amount < 0);
  const capital = sum((l) => l.group === 'kapital');
  const financing = sum((l) => l.group === 'financovani');
  const steps: { label: string; value: number; total?: boolean }[] = [
    { label: 'Příjmy', value: income },
    { label: 'Provozní výdaje', value: costs },
    { label: 'Provozní výsledek', value: income + costs, total: true },
    { label: 'Přestupy, investice, daň', value: capital },
    { label: 'Úvěry a vklady', value: financing },
    { label: 'Změna peněz', value: income + costs + capital + financing, total: true },
  ];
  let run = 0;
  const bars = steps.map((s) => {
    const from = s.total ? 0 : run;
    const to = s.total ? s.value : run + s.value;
    if (!s.total) run = to;
    return { ...s, lo: Math.min(from, to), hi: Math.max(from, to) };
  });
  const lo = Math.min(0, ...bars.map((b) => b.lo));
  const hi = Math.max(0, ...bars.map((b) => b.hi));
  const W = 560;
  const H = 260;
  const pad = { top: 22, bottom: 40, left: 8, right: 8 };
  const slot = (W - pad.left - pad.right) / bars.length;
  const y = (v: number) => pad.top + ((hi - v) / Math.max(1, hi - lo)) * (H - pad.top - pad.bottom);
  return (
    <figure className="chart waterfall">
      <figcaption className="chart-title">Jak se z příjmů stane změna peněz (výhled sezóny)</figcaption>
      <div className="chart-box">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Vodopád sezóny" onPointerLeave={() => setHover(null)}>
          <line className="chart-grid" x1={pad.left} x2={W - pad.right} y1={y(0)} y2={y(0)} />
          {bars.map((b, i) => {
            const x = pad.left + i * slot + slot * 0.18;
            const w = slot * 0.64;
            const cls = b.total ? (b.value < 0 ? 'wf-total neg' : 'wf-total pos') : b.value < 0 ? 'wf-bar neg' : 'wf-bar pos';
            return (
              <g key={b.label} onPointerEnter={() => setHover(i)}>
                <rect x={pad.left + i * slot} y={pad.top - 20} width={slot} height={H} fill="transparent" />
                <rect className={cls} x={x} y={y(b.hi)} width={w} height={Math.max(2, y(b.lo) - y(b.hi))} rx={4} />
                {i < bars.length - 1 && !bars[i + 1].total && (
                  <line className="wf-link" x1={x + w} x2={x + slot} y1={y(b.total ? b.value : b.value < 0 ? b.lo : b.hi)} y2={y(b.total ? b.value : b.value < 0 ? b.lo : b.hi)} />
                )}
                <text className={`wf-value ${b.value < 0 ? 'neg' : ''}`} x={x + w / 2} y={y(b.hi) - 6} textAnchor="middle">{short(b.value)}</text>
                <text className="chart-axis" x={x + w / 2} y={H - 22} textAnchor="middle">{b.label.split(' ')[0]}</text>
                <text className="chart-axis" x={x + w / 2} y={H - 9} textAnchor="middle">{b.label.split(' ').slice(1).join(' ')}</text>
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <div className="chart-tip" style={{ left: `${((pad.left + (hover + 0.5) * slot) / W) * 100}%`, transform: `translateX(${hover > 2 ? '-105%' : '5%'})` }} role="status">
            <strong>{money(bars[hover].value)}</strong>
            <span>{bars[hover].label}</span>
          </div>
        )}
      </div>
    </figure>
  );
}

function short(v: number): string {
  const m = v / 1_000_000;
  return `${m > 0 ? '+' : m < 0 ? '−' : ''}${Math.abs(m).toLocaleString('cs-CZ', { maximumFractionDigits: Math.abs(m) < 10 ? 1 : 0 })} mil.`;
}

/** Složení příjmů a výdajů: dva skládané pruhy po řádcích rozpočtu, největší položky zvlášť, zbytek „ostatní“. */
export function Composition({ plan }: { plan: BudgetPlan }) {
  const group = (sign: 1 | -1) => {
    const lines = plan.lines.filter((l) => l.group === 'provoz' && l.amount * sign > 0).map((l) => ({ label: l.label, value: Math.abs(l.amount) })).sort((a, b) => b.value - a.value);
    const top = lines.slice(0, 5);
    const rest = lines.slice(5).reduce((a, l) => a + l.value, 0);
    if (rest > 0) top.push({ label: 'Ostatní', value: rest });
    const total = top.reduce((a, l) => a + l.value, 0);
    return { parts: top, total };
  };
  return (
    <div className="composition">
      {([1, -1] as const).map((sign) => {
        const g = group(sign);
        return (
          <div key={sign} className="comp-block">
            <div className="row-between">
              <strong>{sign > 0 ? 'Příjmy' : 'Provozní výdaje'}</strong>
              <span className={`num ${sign > 0 ? 'pos' : 'neg'}`}>{money(sign * g.total)}</span>
            </div>
            <div className="comp-bar" role="img" aria-label={`Složení: ${g.parts.map((p) => `${p.label} ${Math.round((p.value / Math.max(1, g.total)) * 100)} %`).join(', ')}`}>
              {g.parts.map((p, i) => (
                <span key={p.label} style={{ width: `${(p.value / Math.max(1, g.total)) * 100}%`, background: SERIES[i] }} title={`${p.label}: ${money(p.value)}`} />
              ))}
            </div>
            <ul className="plain comp-legend">
              {g.parts.map((p, i) => (
                <li key={p.label}>
                  <i style={{ background: SERIES[i] }} />
                  <span className="comp-label">{p.label}</span>
                  <span className="num">{Math.round((p.value / Math.max(1, g.total)) * 100)} %</span>
                  <span className="num muted">{money(p.value)}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** Srovnání s ligou: kde je klub mezi soupeři (pruh od nuly po maximum, značka průměru). */
export function LeagueRanks({ items }: { items: { label: string; b: Benchmark; hint?: string }[] }) {
  return (
    <ul className="plain league-ranks">
      {items.map(({ label, b, hint }) => (
        <li key={label}>
          <div className="row-between">
            <span>{label}</span>
            <strong>{b.rank}. z {b.clubs}</strong>
          </div>
          <span className="rank-bar" title={`Vy ${money(b.own)}, průměr ${money(b.avg)}, nejvíc ${money(b.max)}`}>
            <span className="rank-fill" style={{ width: `${Math.max(2, Math.min(100, (Math.max(0, b.own) / Math.max(1, b.max)) * 100))}%` }} />
            <i style={{ left: `${Math.min(100, (Math.max(0, b.avg) / Math.max(1, b.max)) * 100)}%` }} />
          </span>
          <span className="small muted">vy {money(b.own)} · průměr {money(b.avg)} · nejvíc {money(b.max)}{hint ? ` · ${hint}` : ''}</span>
        </li>
      ))}
    </ul>
  );
}
