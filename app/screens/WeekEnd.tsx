/**
 * V2 (B8), W2: animovaná karta konce měsíce (dříve týdne). Po přechodu do nového týdne se krátce ukáže shrnutí
 * (co přinesly akce, výsledky, změny čísel). Nepřekáží: je v rohu, sama zmizí, jde zavřít.
 */
import { useEffect, useState } from 'react';
import { Icon } from '../icons';
import { money } from '../format';

/** Velké částky jako peníze, malé změny jako body. */
function fmt(n: number, label: string): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  if (Math.abs(n) >= 10_000 || /Kč/.test(label)) return `${sign}${money(Math.abs(n))}`;
  return `${sign}${Math.abs(Math.round(n * 10) / 10).toLocaleString('cs-CZ')}`;
}

export interface WeekEndData {
  title: string;
  lines: string[];
  deltas: { label: string; value: number | string }[];
}

export function WeekEndCard({ data, onClose, autoMs = 9000 }: { data: WeekEndData; onClose: () => void; autoMs?: number }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(onClose, autoMs);
    return () => clearTimeout(t);
  }, [paused, autoMs, onClose]);
  return (
    <aside className="weekend-card" role="status" aria-label={data.title} onMouseEnter={() => setPaused(true)} onFocus={() => setPaused(true)} onTouchStart={() => setPaused(true)}>
      <div className="row-between">
        <strong><Icon name="tyden" size={16} /> {data.title}</strong>
        <button className="icon-btn" aria-label="Zavřít shrnutí" onClick={onClose}><Icon name="close" size={16} /></button>
      </div>
      {data.deltas.length > 0 && (
        <div className="we-deltas">
          {data.deltas.map((d, i) => {
            const n = typeof d.value === 'number' ? d.value : undefined;
            return (
              <span key={i} className={`we-delta ${n === undefined ? '' : n > 0 ? 'pos' : n < 0 ? 'neg' : 'muted'}`} style={{ animationDelay: `${0.15 + i * 0.08}s` }}>
                <span className="small muted">{d.label.replace(/\s*\(Kč\)/, '')}</span>
                <strong className="num">{n === undefined ? d.value : fmt(n, d.label)}</strong>
              </span>
            );
          })}
        </div>
      )}
      {data.lines.length > 0 && (
        <ul className="plain small we-lines">
          {data.lines.slice(0, 5).map((l, i) => <li key={i} style={{ animationDelay: `${0.3 + i * 0.08}s` }}>{l}</li>)}
        </ul>
      )}
      {!paused && <span className="we-timer" style={{ animationDuration: `${autoMs}ms` }} aria-hidden />}
    </aside>
  );
}
