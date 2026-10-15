import { useEffect } from 'react';
import {
  formatDate,
  POSITION_SHORT,
  type Competition,
  type Fixture,
  type GameState,
  type MatchEvent,
  type MatchPlayerLine,
  type TeamMatchStats,
} from '../../engine';
import { num } from '../format';

export function findFixture(game: GameState, id: string): { fixture: Fixture; comp: Competition } | undefined {
  for (const comp of Object.values(game.competitions)) {
    const fixture = comp.fixtures.find((f) => f.id === id);
    if (fixture) return { fixture, comp };
  }
  return undefined;
}

export function MatchDetail({ game, fixtureId, onClose }: { game: GameState; fixtureId: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    // Stránka pod náhledem se neposouvá.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const found = findFixture(game, fixtureId);
  if (!found) return null;
  const { fixture: f, comp } = found;
  const r = f.result;
  const home = game.clubs[f.homeId];
  const away = game.clubs[f.awayId];
  const d = r?.detail;
  const names = new Map<string, string>();
  for (const line of [...(d?.home.lineup ?? []), ...(d?.home.bench ?? []), ...(d?.away.lineup ?? []), ...(d?.away.bench ?? [])]) {
    names.set(line.id, line.name);
  }
  const nameOf = (id?: string) => (id ? (names.get(id) ?? (game.players[id] ? `${game.players[id].firstName} ${game.players[id].lastName}` : 'neznámý hráč')) : '');

  return (
    <div className="overlay sheet-overlay" onClick={onClose}>
      <div className="card sheet" role="dialog" aria-modal="true" aria-label="Náhled zápasu" onClick={(e) => e.stopPropagation()}>
        <div className="row-between">
          <span className="muted small">
            {comp.name}, {f.round}. kolo · {formatDate(f.date, true)}
          </span>
          <button onClick={onClose}>Zavřít</button>
        </div>

        <div className="scoreboard">
          <div className="sb-team">
            <span className="crest" style={{ background: home.colors[0], borderColor: home.colors[1] }} />
            <strong>{home.shortName}</strong>
          </div>
          <div className="sb-score">{r ? `${r.homeGoals}:${r.awayGoals}` : '–:–'}</div>
          <div className="sb-team">
            <span className="crest" style={{ background: away.colors[0], borderColor: away.colors[1] }} />
            <strong>{away.shortName}</strong>
          </div>
        </div>
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
            <Stats home={d.home} away={d.away} />
            <h3>Průběh</h3>
            <Timeline events={d.events} homeId={f.homeId} nameOf={nameOf} />
            <div className="lineups">
              <Lineup title={home.shortName} team={d.home} events={d.events.filter((e) => e.clubId === f.homeId)} potm={d.potm} />
              <Lineup title={away.shortName} team={d.away} events={d.events.filter((e) => e.clubId === f.awayId)} potm={d.potm} />
            </div>
          </>
        )}
      </div>
    </div>
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

function Timeline({ events, homeId, nameOf }: { events: MatchEvent[]; homeId: string; nameOf: (id?: string) => string }) {
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
        {line.name} <span className="marks">{marks(line)}</span>
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
