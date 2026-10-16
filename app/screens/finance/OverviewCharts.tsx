import { useState } from 'react';
import type { Benchmark, BudgetLine, BudgetPlan } from '../../../engine';
import { money } from '../../format';

const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#6250d6'];

/**
 * Vodopád sezóny vodorovně: každý řádek je jeden krok od příjmů ke změně peněz na účtu.
 * Zelená přidává, červená ubírá, tmavé řádky jsou mezisoučty. Svislá čára je nula.
 */
export function Waterfall({ plan }: { plan: BudgetPlan }) {
  const [hover, setHover] = useState<number | null>(null);
  const sum = (f: (l: BudgetLine) => boolean) => plan.lines.filter(f).reduce((a, l) => a + l.amount, 0);
  const income = sum((l) => l.group === 'provoz' && l.amount > 0);
  const wages = sum((l) => l.key === 'platy' || l.key === 'rezerva');
  const otherCosts = sum((l) => l.group === 'provoz' && l.amount < 0 && l.key !== 'platy' && l.key !== 'rezerva');
  const transfers = sum((l) => l.key === 'prestupy');
  const capital = sum((l) => l.group === 'kapital' && l.key !== 'prestupy');
  const financing = sum((l) => l.group === 'financovani');
  const steps: { label: string; value: number; kind: 'step' | 'sub' | 'total'; hint: string }[] = [
    { label: 'Příjmy', value: income, kind: 'step', hint: 'vstupné, TV, sponzoři, catering, fanshop, akce, pohár, Evropa' },
    { label: 'Platy hráčů a prémie', value: wages, kind: 'step', hint: 'smlouvy, prémie a rezerva ve mzdovém stropu' },
    { label: 'Ostatní provozní výdaje', value: otherCosts, kind: 'step', hint: 'vedení, oddělení, provoz, údržba, soustředění, bezpečnost, komunita' },
    { label: 'Provozní výsledek', value: income + wages + otherCosts, kind: 'sub', hint: 'co klub vydělá nebo prodělá samotným provozem' },
    { label: 'Přestupy', value: transfers, kind: 'step', hint: 'nákupy, prodeje a splátky' },
    { label: 'Investice a daň', value: capital, kind: 'step', hint: 'stavby a daň z příjmů' },
    { label: 'Úvěry a vklady', value: financing, kind: 'step', hint: 'čerpání a splátky úvěrů, půjčky a vklady majitele' },
    { label: 'Změna peněz na účtu', value: income + wages + otherCosts + transfers + capital + financing, kind: 'total', hint: 'o kolik bude na konci sezóny víc nebo méně peněz' },
  ];
  let run = 0;
  const rows = steps.map((st) => {
    const from = st.kind === 'step' ? run : 0;
    const to = st.kind === 'step' ? run + st.value : st.value;
    if (st.kind === 'step') run = to;
    return { ...st, from, to, lo: Math.min(from, to), hi: Math.max(from, to) };
  }).filter((r) => r.kind !== 'step' || r.value !== 0 || r.label === 'Příjmy');
  const lo = Math.min(0, ...rows.map((r) => r.lo));
  const hi = Math.max(0, ...rows.map((r) => r.hi));
  const pos = (v: number) => ((v - lo) / Math.max(1, hi - lo)) * 100;
  return (
    <figure className="chart waterfall">
      <figcaption className="chart-title">Od příjmů ke změně peněz (výhled sezóny)</figcaption>
      <div className="wf-legend small muted">
        <span><i className="pos" /> přidává</span>
        <span><i className="neg" /> ubírá</span>
        <span><i className="sub" /> mezisoučet</span>
      </div>
      <ul className="plain wf-rows" onPointerLeave={() => setHover(null)}>
        {rows.map((r, i) => (
          <li key={r.label} className={`wf-row ${r.kind}`} onPointerEnter={() => setHover(i)} title={`${r.label}: ${money(r.value)} (${r.hint})`}>
            <span className="wf-label">{r.label}</span>
            <span className="wf-track">
              <i className="wf-zero" style={{ left: `${pos(0)}%` }} />
              <span
                className={`wf-fill ${r.kind === 'step' ? (r.value < 0 ? 'neg' : 'pos') : r.value < 0 ? 'sub neg' : 'sub pos'}`}
                style={{ left: `${pos(r.lo)}%`, width: `${Math.max(0.6, pos(r.hi) - pos(r.lo))}%` }}
              />
            </span>
            <span className={`wf-amount num ${r.value < 0 ? 'neg' : r.value > 0 ? 'pos' : ''}`}>{r.kind === 'step' && r.value > 0 ? '+' : ''}{money(r.value)}</span>
          </li>
        ))}
      </ul>
      <p className="small muted wf-hint">{hover !== null ? `${rows[hover].label}: ${rows[hover].hint}.` : 'Najeďte na řádek pro vysvětlení.'}</p>
    </figure>
  );
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
