import type { ReactNode } from 'react';
import {
  allFixtures,
  formatDate,
  POSITION_SHORT,
  type Club,
  type Fixture,
  type GameState,
  type MatchEvent,
  type MatchPlayerLine,
  type Position,
  type TeamMatchStats,
} from '../../engine';
import { num } from '../format';
import { ClubLink, PlayerLink, Sheet } from '../nav';

export function findFixture(game: GameState, id: string): { fixture: Fixture; name: string; roundLabel: string } | undefined {
  const x = allFixtures(game).find((a) => a.fixture.id === id);
  if (!x) return undefined;
  const roundLabel = x.cup ? (x.cup.rounds[x.fixture.round - 1]?.name ?? '') + (x.cup.kind === 'baraz' ? `, ${x.fixture.round}. zápas` : '') : `${x.fixture.round}. kolo`;
  return { fixture: x.fixture, name: x.name, roundLabel };
}

export function MatchDetail({ game, fixtureId, onClose, onBack }: { game: GameState; fixtureId: string; onClose: () => void; onBack?: () => void }) {
  const found = findFixture(game, fixtureId);
  if (!found) return null;
  const { fixture: f, name: compName, roundLabel } = found;
  const r = f.result;
  const home = game.clubs[f.homeId];
  const away = game.clubs[f.awayId];
  const d = r?.detail;
  const names = new Map<string, string>();
  for (const line of [...(d?.home.lineup ?? []), ...(d?.home.bench ?? []), ...(d?.away.lineup ?? []), ...(d?.away.bench ?? [])]) {
    names.set(line.id, line.name);
  }
  const plainName = (id?: string) => (id ? (names.get(id) ?? (game.players[id] ? `${game.players[id].firstName} ${game.players[id].lastName}` : 'neznámý hráč')) : '');
  // Hráč, který ve hře ještě je, má odkaz na svou kartu.
  const nameOf = (id?: string): ReactNode => (id && game.players[id] ? <PlayerLink id={id}>{plainName(id)}</PlayerLink> : plainName(id));

  return (
    <Sheet label="Náhled zápasu" onClose={onClose} onBack={onBack}>
        <p className="muted small">
          {compName}, {roundLabel} · {formatDate(f.date, true)}
        </p>

        <div className="scoreboard">
          <div className="sb-team">
            <span className="crest" style={{ background: home.colors[0], borderColor: home.colors[1] }} />
            <strong><ClubLink id={home.id}>{home.shortName}</ClubLink></strong>
          </div>
          <div className="sb-score">{r ? `${r.homeGoals}:${r.awayGoals}` : '–:–'}</div>
          <div className="sb-team">
            <span className="crest" style={{ background: away.colors[0], borderColor: away.colors[1] }} />
            <strong><ClubLink id={away.id}>{away.shortName}</ClubLink></strong>
          </div>
        </div>
        {r?.penalties && <p className="center"><strong>Penalty {r.penalties[0]}:{r.penalties[1]}</strong></p>}
        {r && (
          <p className="center muted small">
            {d && <>xG {d.home.xg.toFixed(2)} : {d.away.xg.toFixed(2)} · </>}
            {num(r.attendance)} diváků · {home.stadium.name}
            {d?.potm && <> · Hráč zápasu: <strong>{nameOf(d.potm)}</strong></>}
          </p>
        )}

        {!r && <p className="muted center">Zápas se ještě nehrál.</p>}

        {r && !d && (
          <>
            <ul className="timeline">
              {r.scorers.map((s, i) => (
                <li key={i} className={s.clubId === f.homeId ? 'tl-home' : 'tl-away'}>
                  <span className="tl-min">{s.minute}'</span>
                  <span className="ev ev-goal">Gól</span>
                  <span>{nameOf(s.playerId)}</span>
                </li>
              ))}
            </ul>
            <p className="muted small center">Sestavy a statistiky se ukládají jen pro soutěž vašeho klubu.</p>
          </>
        )}

        {d && (
          <>
            <Pitch home={d.home} away={d.away} homeClub={home} awayClub={away} events={d.events} potm={d.potm} />
            <Stats home={d.home} away={d.away} />
            <h3>Průběh</h3>
            <Timeline events={d.events} homeId={f.homeId} nameOf={nameOf} />
            <div className="lineups">
              <Lineup title={home.shortName} team={d.home} events={d.events.filter((e) => e.clubId === f.homeId)} potm={d.potm} />
              <Lineup title={away.shortName} team={d.away} events={d.events.filter((e) => e.clubId === f.awayId)} potm={d.potm} />
            </div>
          </>
        )}
    </Sheet>
  );
}

const ROWS: Position[] = ['GK', 'DF', 'MF', 'FW'];
/** Výška řad na polovině hřiště (od vlastní branky). */
const ROW_Y: Record<Position, number> = { GK: 8, DF: 26, MF: 45, FW: 63 };

/** Rozestavení obou týmů na hřišti: domácí dole, hosté nahoře. */
function Pitch({ home, away, homeClub, awayClub, events, potm }: {
  home: TeamMatchStats; away: TeamMatchStats; homeClub: Club; awayClub: Club; events: MatchEvent[]; potm?: string;
}) {
  const H = 152;
  const goals = new Map<string, number>();
  for (const e of events) if (e.type === 'gol' && e.playerId) goals.set(e.playerId, (goals.get(e.playerId) ?? 0) + 1);
  const subbed = new Set(events.filter((e) => e.type === 'stridani').map((e) => e.playerId));
  const sentOff = new Set(events.filter((e) => e.type === 'cervena' || e.type === 'druha-zluta').map((e) => e.playerId));
  const team = (t: TeamMatchStats, club: Club, bottom: boolean) =>
    ROWS.flatMap((pos) => {
      const row = t.lineup.filter((l) => l.position === pos);
      return row.map((l, i) => {
        const x = ((i + 1) / (row.length + 1)) * 100;
        const y = bottom ? H - ROW_Y[pos] : ROW_Y[pos];
        const surname = l.name.split(' ').slice(-1)[0];
        const g = goals.get(l.id) ?? 0;
        return (
          <g key={l.id} transform={`translate(${x} ${y})`}>
            <title>{`${l.name}${l.rating !== undefined ? `, známka ${l.rating.toFixed(1)}` : ''}`}</title>
            <circle r="3.6" fill={club.colors[0]} stroke={club.colors[1] ?? '#fff'} strokeWidth="0.9" />
            {l.id === potm && <circle r="5" fill="none" stroke="#f5c518" strokeWidth="0.8" />}
            <text y="7.4" className="pt-name">{surname}</text>
            {l.rating !== undefined && <text y="11" className={`pt-rating ${ratingTone(l.rating)}`}>{l.rating.toFixed(1)}</text>}
            {g > 0 && <text x="4.6" y="-2.6" className="pt-mark">{g > 1 ? `${g}×⚽` : '⚽'}</text>}
            {subbed.has(l.id) && <text x="-4.6" y="-2.6" className="pt-mark pt-sub">↓</text>}
            {sentOff.has(l.id) && <rect x="3.6" y="-1" width="1.8" height="2.6" fill="#d33" />}
          </g>
        );
      });
    });
  return (
    <section className="pitch-wrap" aria-label="Rozestavení">
      <div className="pitch-head">
        <span><span className="crest" style={{ background: awayClub.colors[0], borderColor: awayClub.colors[1] }} /> {awayClub.shortName} <span className="muted">{away.formation}</span></span>
      </div>
      <svg className="pitch" viewBox={`0 0 100 ${H}`} role="img" aria-label={`Rozestavení: ${homeClub.shortName} ${home.formation}, ${awayClub.shortName} ${away.formation}`}>
        <rect x="0" y="0" width="100" height={H} className="pt-grass" />
        <g className="pt-lines">
          <rect x="3" y="2" width="94" height={H - 4} />
          <line x1="3" y1={H / 2} x2="97" y2={H / 2} />
          <circle cx="50" cy={H / 2} r="9" />
          <rect x="25" y="2" width="50" height="15" />
          <rect x="25" y={H - 17} width="50" height="15" />
          <rect x="39" y="2" width="22" height="5" />
          <rect x="39" y={H - 7} width="22" height="5" />
        </g>
        {team(away, awayClub, false)}
        {team(home, homeClub, true)}
      </svg>
      <div className="pitch-head">
        <span><span className="crest" style={{ background: homeClub.colors[0], borderColor: homeClub.colors[1] }} /> {homeClub.shortName} <span className="muted">{home.formation}</span></span>
      </div>
    </section>
  );
}

function Stats({ home, away }: { home: TeamMatchStats; away: TeamMatchStats }) {
  const rows: [string, number, number, (v: number) => string][] = [
    ['Držení míče', home.possession, away.possession, (v) => `${v} %`],
    ['Očekávané góly (xG)', home.xg, away.xg, (v) => v.toFixed(2)],
    ['Střely', home.shots, away.shots, String],
    ['Střely na branku', home.onTarget, away.onTarget, String],
    ['Zákroky brankáře', home.saves, away.saves, String],
    ['Rohy', home.corners, away.corners, String],
    ['Fauly', home.fouls, away.fouls, String],
    ['Ofsajdy', home.offsides, away.offsides, String],
    ['Žluté karty', home.yellows, away.yellows, String],
    ['Červené karty', home.reds, away.reds, String],
  ];
  return (
    <div className="match-stats">
      {rows.map(([label, h, a, fmt]) => {
        const total = h + a;
        const share = total > 0 ? (h / total) * 100 : 50;
        return (
          <div key={label} className="ms-row">
            <span className={`ms-val ${h > a ? 'lead' : ''}`}>{fmt(h)}</span>
            <div className="ms-mid">
              <span className="ms-label">{label}</span>
              <span className="ms-bar">
                <span className="ms-home" style={{ width: `${share}%` }} />
              </span>
            </div>
            <span className={`ms-val right ${a > h ? 'lead' : ''}`}>{fmt(a)}</span>
          </div>
        );
      })}
    </div>
  );
}

const EVENT_LABEL: Record<MatchEvent['type'], string> = {
  gol: 'Gól',
  zluta: 'ŽK',
  cervena: 'ČK',
  'druha-zluta': '2. ŽK',
  stridani: 'Střídání',
  zraneni: 'Zranění',
};

function Timeline({ events, homeId, nameOf }: { events: MatchEvent[]; homeId: string; nameOf: (id?: string) => ReactNode }) {
  if (!events.length) return <p className="muted">Bez událostí.</p>;
  return (
    <ul className="timeline">
      {events.map((e, i) => (
        <li key={i} className={e.clubId === homeId ? 'tl-home' : 'tl-away'}>
          <span className="tl-min">{e.minute}'</span>
          <EventMark type={e.type} />
          <span className="tl-text">
            {e.type === 'gol' && (
              <>
                <strong>{nameOf(e.playerId)}</strong>
                {e.otherId && <span className="muted"> (asistence {nameOf(e.otherId)})</span>}
                {e.note && <span className="muted"> {e.note}</span>}
              </>
            )}
            {e.type === 'stridani' && (
              <>
                <span className="sub-in">{nameOf(e.otherId)}</span> za <span className="sub-out">{nameOf(e.playerId)}</span>
                {e.note && <span className="muted"> ({e.note})</span>}
              </>
            )}
            {(e.type === 'zluta' || e.type === 'cervena' || e.type === 'druha-zluta') && nameOf(e.playerId)}
            {e.type === 'zraneni' && (
              <>
                {nameOf(e.playerId)} <span className="muted">({e.note})</span>
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

function EventMark({ type }: { type: MatchEvent['type'] }) {
  if (type === 'zluta') return <span className="ev card-y" title="Žlutá karta" aria-label="Žlutá karta" />;
  if (type === 'cervena') return <span className="ev card-r" title="Červená karta" aria-label="Červená karta" />;
  if (type === 'druha-zluta') return <span className="ev card-yr" title="Druhá žlutá" aria-label="Druhá žlutá karta" />;
  return <span className={`ev ev-${type}`}>{EVENT_LABEL[type]}</span>;
}

function ratingTone(r?: number): string {
  if (r === undefined) return '';
  if (r >= 7.5) return 'r-good';
  if (r < 6) return 'r-bad';
  return '';
}

function Lineup({ title, team, events, potm }: { title: string; team: TeamMatchStats; events: MatchEvent[]; potm?: string }) {
  const marks = (line: MatchPlayerLine) => {
    const mine = events.filter((e) => e.playerId === line.id || e.otherId === line.id);
    return mine.map((e, i) => {
      if (e.type === 'gol' && e.playerId === line.id) return <span key={i} className="mini goal" title={`Gól ${e.minute}'`}>G</span>;
      if (e.type === 'gol' && e.otherId === line.id) return <span key={i} className="mini assist" title={`Asistence ${e.minute}'`}>A</span>;
      if (e.type === 'zluta') return <span key={i} className="mini card-y" title={`Žlutá ${e.minute}'`} />;
      if (e.type === 'cervena' || e.type === 'druha-zluta') return <span key={i} className="mini card-r" title={`Červená ${e.minute}'`} />;
      if (e.type === 'stridani' && e.playerId === line.id) return <span key={i} className="mini out" title={`Střídán ${e.minute}'`}>↓{e.minute}'</span>;
      if (e.type === 'stridani' && e.otherId === line.id) return <span key={i} className="mini in" title={`Přišel ${e.minute}'`}>↑{e.minute}'</span>;
      if (e.type === 'zraneni') return <span key={i} className="mini injury" title="Zranění">+</span>;
      return null;
    });
  };
  const row = (line: MatchPlayerLine) => (
    <tr key={line.id} className={line.id === potm ? 'potm' : ''}>
      <td className="muted">{POSITION_SHORT[line.position]}</td>
      <td className="wrap">
        <PlayerLink id={line.id}>{line.name}</PlayerLink> <span className="marks">{marks(line)}</span>
      </td>
      <td className="num">{line.rating !== undefined ? <span className={`rating ${ratingTone(line.rating)}`}>{line.rating.toFixed(1)}</span> : <span className="muted">–</span>}</td>
    </tr>
  );
  const used = team.bench.filter((b) => b.minutes > 0);
  const unused = team.bench.filter((b) => b.minutes === 0);
  return (
    <div className="lineup">
      <h3>
        {title} <span className="muted">{team.formation}</span>
      </h3>
      <table>
        <tbody>{team.lineup.map(row)}</tbody>
      </table>
      {used.length > 0 && (
        <>
          <p className="muted small lineup-sub">Střídající</p>
          <table>
            <tbody>{used.map(row)}</tbody>
          </table>
        </>
      )}
      {unused.length > 0 && <p className="muted small">Nenastoupili: {unused.map((u) => u.name).join(', ')}</p>}
    </div>
  );
}
