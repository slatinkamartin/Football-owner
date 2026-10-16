import { useState } from 'react';
import { formatShortDate, seasonLabel, seasonPhases, type GameState } from '../engine';

const MONTHS = ['čvc', 'srp', 'zář', 'říj', 'lis', 'pro', 'led', 'úno', 'bře', 'dub', 'kvě', 'čvn'];

/**
 * Kalendář sezóny v horní liště: přestupní okna (horní proužek), části ligy, pohárová kola a dnešek.
 * Kliknutím se rozbalí seznam termínů.
 */
export function CalendarStrip({ game }: { game: GameState }) {
  const [open, setOpen] = useState(false);
  const { start, end, phases, markers } = seasonPhases(game);
  const t0 = new Date(`${start}T00:00:00Z`).getTime();
  const span = new Date(`${end}T00:00:00Z`).getTime() - t0;
  const pos = (d: string) => Math.max(0, Math.min(100, ((new Date(`${d}T00:00:00Z`).getTime() - t0) / span) * 100));
  const seg = (p: { start: string; end: string }) => ({ left: `${pos(p.start)}%`, width: `${Math.max(0.6, pos(p.end) - pos(p.start))}%` });
  const today = pos(game.date);
  const windows = phases.filter((p) => p.kind === 'okno');
  const league = phases.filter((p) => p.kind !== 'okno');

  return (
    <div className="cal-strip">
      <button
        className="cs-bar"
        aria-expanded={open}
        aria-label={`Kalendář sezóny ${seasonLabel(game.season)}, dnes ${formatShortDate(game.date)}. ${open ? 'Skrýt' : 'Zobrazit'} termíny.`}
        onClick={() => setOpen(!open)}
      >
        <span className="cs-track">
          {windows.map((p) => (
            <span key={p.label} className="cs-window" style={seg(p)} title={`${p.label}: ${formatShortDate(p.start)} – ${formatShortDate(p.end)}`} />
          ))}
          {league.map((p) => (
            <span key={p.label} className={`cs-seg sc-${p.kind}`} style={seg(p)} title={`${p.label}: ${formatShortDate(p.start)} – ${formatShortDate(p.end)}`} />
          ))}
          {markers.map((m) => (
            <span key={m.date} className="cs-marker" style={{ left: `${pos(m.date)}%` }} title={`${m.label} (${formatShortDate(m.date)})`} />
          ))}
          <span className="cs-today" style={{ left: `${today}%` }} />
        </span>
        <span className="cs-months" aria-hidden="true">
          {MONTHS.map((m, i) => (
            <span key={m} style={{ left: `${(i / 12) * 100}%` }}>{m}</span>
          ))}
        </span>
      </button>
      {open && (
        <ul className="sc-list">
          {phases
            .filter((p) => p.kind !== 'priprava')
            .sort((a, b) => (a.start < b.start ? -1 : 1))
            .map((p) => (
              <li key={p.label} className={p.end < game.date ? 'past' : p.start <= game.date ? 'now' : ''}>
                <span className={`sc-dot sc-${p.kind}`} aria-hidden="true" />
                {p.label}: {formatShortDate(p.start)} – {formatShortDate(p.end)}
              </li>
            ))}
          {markers.length > 0 && (
            <li>
              <span className="sc-dot cs-cup" aria-hidden="true" />
              Pohár: {markers.map((m) => formatShortDate(m.date)).join(', ')}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
