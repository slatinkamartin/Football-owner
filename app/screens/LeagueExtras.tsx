import { clubLabel, competitionOf, ratingText, rivalsOf, type GameState } from '../../engine';
import { ClubLink, PlayerLink } from '../nav';

/** Zpravodaj posledního kola soutěže majitele. */
export function RoundReportCard({ game }: { game: GameState }) {
  const report = game.roundReports?.[0];
  if (!report) return null;
  const own = game.owner.clubId;
  return (
    <section className="card">
      <h2>Zpravodaj {report.round}. kola</h2>
      <ul className="plain small">
        {report.surprise && <li><strong>Překvapení kola:</strong> {report.surprise}</li>}
        {report.topScorer && game.players[report.topScorer.playerId] && (
          <li><strong>Střelec kola:</strong> <PlayerLink id={report.topScorer.playerId}>{game.players[report.topScorer.playerId].firstName} {game.players[report.topScorer.playerId].lastName}</PlayerLink> ({report.topScorer.goals} góly)</li>
        )}
        {report.movers.length > 0 && (
          <li><strong>Posuny v tabulce:</strong> {report.movers.map((m) => `${clubLabel(game, m.clubId)} ${m.change > 0 ? `▲${m.change}` : `▼${-m.change}`}`).join(', ')}</li>
        )}
      </ul>
      <h3>Sestava kola</h3>
      <ul className="plain small team-of-round">
        {report.team.map((t) => {
          const p = game.players[t.playerId];
          if (!p) return null;
          return (
            <li key={t.playerId} className={t.clubId === own ? 'own-row' : ''}>
              <span className="rating">{ratingText(t.rating)}</span> <PlayerLink id={p.id}>{p.firstName} {p.lastName}</PlayerLink> <span className="muted">{clubLabel(game, t.clubId)}</span>
            </li>
          );
        })}
      </ul>
      <p className="muted small">Hráč v sestavě kola má lepší morálku a víc zájemců o přestup.</p>
    </section>
  );
}

const COLORS = ['var(--accent)', '#d9534f', '#3b6fc4'];

/** Vývoj pozice v tabulce: klub majitele a rivalové, se zlomovými okamžiky sezóny. */
export function StandingsPath({ game }: { game: GameState }) {
  const comp = competitionOf(game, game.owner.clubId);
  const points = [...game.timeline].sort((a, b) => a.round - b.round);
  if (!comp || points.length < 2) return null;
  const rivals = rivalsOf(game);
  const n = comp.clubIds.length;
  const rounds = Math.max(...comp.fixtures.map((f) => f.round), points[points.length - 1].round);
  const W = 960;
  const H = 200;
  const pad = { l: 28, r: 12, t: 12, b: 22 };
  const x = (r: number) => pad.l + ((r - 1) / Math.max(1, rounds - 1)) * (W - pad.l - pad.r);
  const y = (pos: number) => pad.t + ((pos - 1) / Math.max(1, n - 1)) * (H - pad.t - pad.b);
  const series = [
    { id: game.owner.clubId, label: clubLabel(game, game.owner.clubId), pts: points.map((p) => [p.round, p.position] as const) },
    ...rivals.map((r) => ({ id: r.id, label: `${clubLabel(game, r.id)} (${r.label})`, pts: points.filter((p) => p.rivals?.[r.id]).map((p) => [p.round, p.rivals![r.id]] as const) })),
  ];
  const notes = (game.timelineNotes ?? []).filter((t) => t.season === game.season);
  return (
    <section className="card wide">
      <h2>Vývoj sezóny</h2>
      <div className="chart-box">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Pozice v tabulce po kolech">
          {[1, Math.ceil(n / 2), n].map((pos) => (
            <g key={pos}>
              <line className="chart-grid" x1={pad.l} x2={W - pad.r} y1={y(pos)} y2={y(pos)} />
              <text className="chart-axis" x={pad.l - 6} y={y(pos) + 4} textAnchor="end">{pos}.</text>
            </g>
          ))}
          {notes.map((nt, i) => (
            <g key={i}>
              <line className="chart-cross" x1={x(nt.round)} x2={x(nt.round)} y1={pad.t} y2={H - pad.b} />
              <text className="chart-axis" x={x(nt.round) + 3} y={pad.t + 10 + (i % 3) * 12}>{nt.text}</text>
            </g>
          ))}
          {series.map((s, i) => (
            <polyline key={s.id} fill="none" stroke={COLORS[i]} strokeWidth={i === 0 ? 2.5 : 1.5} strokeDasharray={i === 0 ? undefined : '4 3'} points={s.pts.map(([r, p]) => `${x(r)},${y(p)}`).join(' ')} />
          ))}
          <text className="chart-axis" x={pad.l} y={H - 4}>1. kolo</text>
          <text className="chart-axis" x={W - pad.r} y={H - 4} textAnchor="end">{rounds}. kolo</text>
        </svg>
      </div>
      <div className="wf-legend small">
        {series.map((s, i) => <span key={s.id}><i style={{ background: COLORS[i] }} /> {s.label}</span>)}
      </div>
    </section>
  );
}

export function RivalsLine({ game }: { game: GameState }) {
  const rivals = rivalsOf(game);
  if (!rivals.length) return null;
  return (
    <p className="small">
      Rivalové: {rivals.map((r, i) => <span key={r.id}>{i > 0 && ', '}<ClubLink id={r.id}>{clubLabel(game, r.id)}</ClubLink> ({r.label})</span>)}. Výhry a prohry s nimi mají dvojnásobný vliv na fanoušky.
    </p>
  );
}
