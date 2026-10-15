import { formatShortDate, seasonLabel, seasonPhases, type GameState, type PhaseKind } from '../engine';

const MONTHS = ['čvc', 'srp', 'zář', 'říj', 'lis', 'pro', 'led', 'úno', 'bře', 'dub', 'kvě', 'čvn'];

const LANES: { label: string; kinds: PhaseKind[] }[] = [
  { label: 'Přestupy', kinds: ['okno'] },
  { label: 'Liga', kinds: ['priprava', 'podzim', 'pauza', 'jaro', 'nadstavba', 'baraz'] },
];

/** Časová osa sezóny: přestupní okna, části ligy, nadstavba, baráž, pohárová kola a dnešek. */
export function SeasonCalendar({ game }: { game: GameState }) {
  const { start, end, phases, markers } = seasonPhases(game);
  const t0 = new Date(`${start}T00:00:00Z`).getTime();
  const span = new Date(`${end}T00:00:00Z`).getTime() - t0;
  const pos = (d: string) => Math.max(0, Math.min(100, ((new Date(`${d}T00:00:00Z`).getTime() - t0) / span) * 100));
  const today = pos(game.date);

  return (
    <section className="card wide season-cal" aria-label="Kalendář sezóny">
      <div className="row-between">
        <h2>Kalendář sezóny {seasonLabel(game.season)}</h2>
        <span className="muted small">Dnes {formatShortDate(game.date)}</span>
      </div>
      <div className="sc-grid">
        <div className="sc-months" aria-hidden="true">
          <span className="sc-lane-label" />
          <div className="sc-track">
            {MONTHS.map((m, i) => (
              <span key={m} style={{ left: `${(i / 12) * 100}%` }}>{m}</span>
            ))}
          </div>
        </div>
        {LANES.map((lane) => (
          <div key={lane.label} className="sc-row">
            <span className="sc-lane-label">{lane.label}</span>
            <div className="sc-track">
              {phases
                .filter((p) => lane.kinds.includes(p.kind))
                .map((p) => {
                  const left = pos(p.start);
                  const width = Math.max(0.8, pos(p.end) - left);
                  const active = p.start <= game.date && game.date <= p.end;
                  return (
                    <span
                      key={p.label}
                      className={`sc-seg sc-${p.kind} ${active ? 'sc-active' : ''}`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={`${p.label}: ${formatShortDate(p.start)} – ${formatShortDate(p.end)}`}
                    >
                      {width > 9 && <span className="sc-text">{p.label.replace('Liga: ', '')}</span>}
                    </span>
                  );
                })}
              <span className="sc-today" style={{ left: `${today}%` }} aria-hidden="true" />
            </div>
          </div>
        ))}
        {markers.length > 0 && (
          <div className="sc-row">
            <span className="sc-lane-label">Pohár</span>
            <div className="sc-track">
              {markers.map((m) => (
                <span key={m.date} className="sc-marker" style={{ left: `${pos(m.date)}%` }} title={`${m.label} (${formatShortDate(m.date)})`} />
              ))}
              <span className="sc-today" style={{ left: `${today}%` }} aria-hidden="true" />
            </div>
          </div>
        )}
      </div>
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
      </ul>
    </section>
  );
}
