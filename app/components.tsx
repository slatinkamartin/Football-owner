import type { ReactNode } from 'react';

/** Vodorovný ukazatel hodnoty (schopnosti, důvěra, povaha). */
export function Meter({ value, max = 100, tone }: { value: number; max?: number; tone?: 'good' | 'warn' | 'bad' | 'neutral' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const auto = pct >= 60 ? 'good' : pct >= 35 ? 'warn' : 'bad';
  return (
    <span className="meter" aria-label={`${Math.round(value)} z ${max}`}>
      <span className={`meter-fill ${tone ?? auto}`} style={{ width: `${pct}%` }} />
    </span>
  );
}

export function Notice({ message, ok }: { message: string | null; ok?: boolean }) {
  if (!message) return null;
  return <p className={ok === false ? 'warning' : 'notice'}>{message}</p>;
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

/** Hvězdičky (zázemí): plné a prázdné, čtečka přečte „3 z 5 hvězd“. */
export function Stars({ value, max = 5 }: { value: number; max?: number }) {
  const full = Math.max(0, Math.min(max, Math.round(value)));
  return (
    <span className="stars" role="img" aria-label={`${full} z ${max} hvězd`} title={`${full} z ${max} hvězd`}>
      {'★'.repeat(full)}
      <span className="stars-empty">{'☆'.repeat(max - full)}</span>
    </span>
  );
}
