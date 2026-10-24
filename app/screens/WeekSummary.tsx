import type { MonthSummary as WeekSummary } from '../../engine';
import { money } from '../format';

/** V1 (A10): karta konce týdne. V2 ji zobrazí (animace) po přechodu do nového týdne. */
export function WeekSummaryCard({ summary, onClose }: { summary: WeekSummary; onClose?: () => void }) {
  return (
    <section className="card week-summary" aria-label={summary.title}>
      <div className="row-between">
        <h2>{summary.title}</h2>
        {onClose && (
          <button className="linkbtn" onClick={onClose} aria-label="Zavřít shrnutí týdne">
            Zavřít
          </button>
        )}
      </div>
      {summary.deltas.length > 0 && (
        <ul className="plain week-deltas">
          {summary.deltas.map((d) => (
            <li key={d.label} className={d.value > 0 ? 'pos' : 'neg'}>
              <span>{d.label}</span>{' '}
              <strong className="num">
                {d.value > 0 ? '▲ +' : '▼ '}
                {d.label.includes('Kč') ? money(d.value) : d.value}
              </strong>
            </li>
          ))}
        </ul>
      )}
      <ul className="week-lines small">
        {summary.lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </section>
  );
}
