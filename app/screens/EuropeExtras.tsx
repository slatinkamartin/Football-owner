import {
  EUROPE_LABEL,
  europeBestLabel,
  europeRun,
  europeStrength,
  findEuroMatch,
  formatDate,
  formatShortDate,
  lastEuroMatch,
  leaguePhaseChance,
  nextEuroMatch,
  playerStory,
  tieAggregate,
  type EuroMatch,
  type GameState,
  type Player,
} from '../../engine';
import { Badge } from '../components';
import { money, num } from '../format';
import { PlayerLink, Sheet } from '../nav';

/** W1: Evropské večery a hvězdy s příběhem (Zápasy, náhled zápasu, Přehled, karta hráče). */

const PHASE_LABEL = { predkola: 'předkola', liga: 'ligová fáze', jaro: 'jaro', konec: 'konec' } as const;

function score(m: EuroMatch, ownName: string): { home: string; away: string; text: string; tone: 'win' | 'loss' | 'draw' } {
  const r = m.result;
  const home = m.home ? ownName : m.opponent.name;
  const away = m.home ? m.opponent.name : ownName;
  if (!r) return { home, away, text: formatShortDate(m.date), tone: 'draw' };
  const text = m.home ? `${r.own}:${r.opp}` : `${r.opp}:${r.own}`;
  return { home, away, text, tone: r.own > r.opp ? 'win' : r.own < r.opp ? 'loss' : 'draw' };
}

/** Sekce v Zápasech: los, termíny a výsledky evropských zápasů klubu majitele. */
export function EuropeSection({ game, onOpenMatch }: { game: GameState; onOpenMatch: (id: string) => void }) {
  const eu = game.europe;
  const own = game.owner.clubId;
  const entry = eu?.season === game.season ? eu.entries.find((x) => x.clubId === own) : undefined;
  const run = europeRun(game);
  const history = (game.europeHistory ?? []).filter((e) => e.clubId === own && e.season < game.season);
  if (!entry && !history.length) return null;
  const ownName = game.clubs[own].shortName;
  const stages: { stage: string; matches: EuroMatch[] }[] = [];
  for (const m of [...(run?.matches ?? [])].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const key = m.stage.startsWith('Ligová fáze') ? m.stage.split(',')[0] : m.stage;
    const last = stages[stages.length - 1];
    if (last && last.stage === key) last.matches.push(m);
    else stages.push({ stage: key, matches: [m] });
  }
  return (
    <section className="card europe-row">
      <div className="row-between">
        <h2>Evropské poháry{entry ? `: ${EUROPE_LABEL[run?.comp ?? entry.entry]}` : ''}</h2>
        {run && <Badge tone={run.phase === 'konec' ? (run.leagueComp ? 'good' : 'bad') : 'warn'}>{run.phase === 'konec' ? run.best : PHASE_LABEL[run.phase]}</Badge>}
        {entry && !run && <Badge tone="neutral">{eu!.resolved ? europeBestLabel(entry) : 'rozhodne se do konce srpna'}</Badge>}
      </div>
      {entry && !run && !eu!.resolved && (
        <p className="muted small">Šance na ligovou fázi podle síly kádru asi {Math.round(leaguePhaseChance(europeStrength(game, own), entry.entry) * 100)} %.</p>
      )}
      {run && (
        <p className="muted small">
          {run.phase === 'predkola' && `Dvojzápas o ligovou fázi. O postupu rozhoduje hlavně síla kádru (průměr 14 nejlepších), posily do srpna šanci zvednou. Kdo vypadne, hraje o nižší soutěž.`}
          {run.phase === 'liga' && `Ligová fáze: ${run.points} bodů, skóre ${run.gf}:${run.ga}${run.rank ? `, odhad ${run.rank}. místo z 36` : ''}. Prvních 8 jde rovnou do osmifinále, 9.–24. místo hraje play-off o jaro.`}
          {run.phase === 'jaro' && `Jaro v Evropě! Zatím: ${run.best}.`}
          {run.phase === 'konec' && `Evropská sezóna skončila: ${run.best}.`}
          {' '}Domácí evropské večery jsou vyprodané (vstupné ×2,5), za výhru a remízu v ligové fázi platí UEFA prémie.
        </p>
      )}
      {stages.length > 0 && (
      <details className="cup-others">
      <summary className="muted small">Všechny evropské zápasy ({run?.matches.length ?? 0}) – kliknutím na zápas otevřete náhled</summary>
      {stages.map((s) => (
        <div key={s.stage} className="cup-round">
          <h3>
            {s.stage}
            {s.matches[0].tie !== undefined && s.matches.every((m) => m.result) && s.matches.length > 1 && (() => {
              const agg = tieAggregate(run!, s.matches[0].tie!);
              return <span className="muted small"> · celkem {agg.own}:{agg.opp}{agg.pens ? `, penalty ${agg.pens[0]}:${agg.pens[1]}` : ''}</span>;
            })()}
          </h3>
          <ul className="fixtures">
            {s.matches.map((m) => {
              const sc = score(m, ownName);
              return (
                <li key={m.id} className="own-row">
                  <button className="fixture-btn" disabled={!m.result} onClick={() => onOpenMatch(m.id)} aria-label={`Evropský zápas ${sc.home} – ${sc.away}`}>
                    <div className="fixture-line">
                      <span className="team home">{sc.home}</span>
                      <span className={`score-box${m.result ? ` score ${sc.tone}` : ''}`}>{sc.text}</span>
                      <span className="team">{sc.away}</span>
                    </div>
                    <div className="fixture-detail muted small">
                      {formatShortDate(m.date)} · {m.neutral ? 'neutrální půda' : m.home ? 'doma' : 'venku'} · {m.opponent.country}
                      {m.result?.gate ? ` · vyprodáno, vstupné ${money(m.result.gate)}` : ''}
                      {m.result?.prize ? ` · prémie ${money(m.result.prize)}` : ''}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      </details>
      )}
      {history.length > 0 && (
        <p className="muted small">
          Minulé ročníky: {history.slice(-5).reverse().map((e) => `${e.season}/${String(e.season + 1).slice(2)} ${europeBestLabel(e)}`).join(' · ')}
        </p>
      )}
    </section>
  );
}

/** Náhled evropského zápasu (výsledek, střelci, diváci). */
export function EuroMatchSheet({ game, id, onClose, onBack }: { game: GameState; id: string; onClose: () => void; onBack?: () => void }) {
  const found = findEuroMatch(game, id);
  if (!found) return null;
  const { run, match: m } = found;
  const club = game.clubs[run.clubId];
  const r = m.result;
  const ownSide = { name: club.shortName, colors: club.colors };
  const oppSide = { name: m.opponent.name, colors: ['#8a94a6', '#ffffff'] as [string, string] };
  const [home, away] = m.home ? [ownSide, oppSide] : [oppSide, ownSide];
  type Goal = { minute: number; own: boolean; playerId?: string };
  const goals: Goal[] = r ? [...r.scorers.map((s) => ({ minute: s.minute, own: true, playerId: s.playerId })), ...r.oppMinutes.map((minute) => ({ minute, own: false }))].sort((a, b) => a.minute - b.minute) : [];
  const agg = m.leg === 2 && m.tie !== undefined && !m.neutral ? tieAggregate(run, m.tie) : undefined;
  return (
    <Sheet label="Náhled evropského zápasu" onClose={onClose} onBack={onBack}>
      <p className="muted small">{EUROPE_LABEL[m.comp]}, {m.stage} · {formatDate(m.date, true)}</p>
      <div className="scoreboard">
        <div className="sb-team">
          <span className="crest" style={{ background: home.colors[0], borderColor: home.colors[1] }} />
          <strong>{home.name}</strong>
        </div>
        <div className="sb-score">{r ? (m.home ? `${r.own}:${r.opp}` : `${r.opp}:${r.own}`) : '–:–'}</div>
        <div className="sb-team">
          <span className="crest" style={{ background: away.colors[0], borderColor: away.colors[1] }} />
          <strong>{away.name}</strong>
        </div>
      </div>
      {agg && <p className="center muted small">Celkové skóre dvojzápasu {agg.own}:{agg.opp} pro {agg.own > agg.opp || (agg.own === agg.opp && agg.pens && agg.pens[0] > agg.pens[1]) ? club.shortName : m.opponent.name}</p>}
      {r?.penalties && <p className="center"><strong>Penalty {m.home ? `${r.penalties[0]}:${r.penalties[1]}` : `${r.penalties[1]}:${r.penalties[0]}`}</strong></p>}
      {r && (
        <p className="center muted small">
          {r.attendance ? `${num(r.attendance)} diváků` : 'Venkovní zápas'}
          {m.home && !m.neutral ? ` · ${club.stadium.name} (vyprodáno)` : m.neutral ? ' · finále na neutrální půdě' : ` · ${m.opponent.country}`}
          {r.gate ? ` · vstupné ${money(r.gate)}` : ''}
          {r.prize ? ` · prémie UEFA ${money(r.prize)}` : ''}
        </p>
      )}
      {!r && <p className="muted center">Zápas se ještě nehrál.</p>}
      {goals.length > 0 && (
        <ul className="timeline">
          {goals.map((g, i) => (
            <li key={i} className={g.own === m.home ? 'tl-home' : 'tl-away'}>
              <span className="tl-min">{g.minute}'</span>
              <span className="ev ev-goal">Gól</span>
              <span>{g.own && g.playerId && game.players[g.playerId] ? <PlayerLink id={g.playerId}>{`${game.players[g.playerId].firstName} ${game.players[g.playerId].lastName}`}</PlayerLink> : g.own ? 'hráč klubu' : m.opponent.name}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small center">U evropských zápasů hra ukládá jen výsledek a střelce.</p>
    </Sheet>
  );
}

/** Karta na Přehledu: příští evropský zápas a reprezentanti klubu. */
export function EuropeStarsCard({ game, onOpenMatch }: { game: GameState; onOpenMatch: (id: string) => void }) {
  const run = europeRun(game);
  const next = nextEuroMatch(game);
  const last = lastEuroMatch(game);
  const own = game.owner.clubId;
  const ownName = game.clubs[own].shortName;
  const squad = Object.values(game.players).filter((p) => p.clubId === own);
  const internationals = squad.filter((p) => playerStory(game, p).international).sort((a, b) => (b.intl?.caps ?? 0) - (a.intl?.caps ?? 0));
  const academy = squad.filter((p) => p.academy === own);
  const promise = game.stars?.promise;
  const showEurope = !!run && (!!next || !!last);
  if (!showEurope && !internationals.length && !academy.length && !promise) return null;
  return (
    <section className="card w1-card">
      {showEurope && (
        <>
          <h2>Evropský večer</h2>
          {next && (() => {
            const sc = score(next, ownName);
            return (
              <>
                <div className="match-big">
                  <span className={next.home ? 'own' : ''}>{sc.home}</span>
                  <span className="vs">–</span>
                  <span className={next.home ? '' : 'own'}>{sc.away}</span>
                </div>
                <p className="muted small">{formatDate(next.date, true)} · {next.stage}{next.home && !next.neutral ? ' · doma, vyprodáno' : ''}</p>
              </>
            );
          })()}
          {last && (() => {
            const sc = score(last, ownName);
            return (
              <p className="small">
                Naposledy: {sc.home} – {sc.away} <span className={`score ${sc.tone}`}>{sc.text}</span>{' '}
                <button className="linkbtn" onClick={() => onOpenMatch(last.id)}>Náhled</button>
              </p>
            );
          })()}
          {run!.phase === 'liga' && <p className="muted small">Ligová fáze: {run!.points} b., odhad {run!.rank ?? '–'}. místo z 36.</p>}
        </>
      )}
      {(internationals.length > 0 || academy.length > 0 || promise) && (
        <>
          <h2 className={showEurope ? 'w1-sub' : ''}>Hvězdy klubu</h2>
          {internationals.length > 0 && (
            <p className="small">
              Reprezentanti:{' '}
              {internationals.slice(0, 6).map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ', '}
                  <PlayerLink id={p.id}>{p.lastName}</PlayerLink>
                  <span className="muted"> ({p.intl?.caps ?? 0}{p.nationality ? `, ${p.nationality}` : ''})</span>
                </span>
              ))}
              {internationals.length > 6 && <span className="muted"> a další {internationals.length - 6}</span>}
            </p>
          )}
          {academy.length > 0 && (
            <p className="small">
              Odchovanci v kádru:{' '}
              {academy.slice(0, 6).map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ', '}
                  <PlayerLink id={p.id}>{p.lastName}</PlayerLink>
                  <span className="muted"> ({p.career.reduce((a, c) => a + c.apps, 0) + p.apps} záp.)</span>
                </span>
              ))}
            </p>
          )}
          {promise && game.players[promise.playerId] && <p className="muted small">{playerStory(game, game.players[promise.playerId]).promise}.</p>}
        </>
      )}
    </section>
  );
}

/** Na kartě hráče: reprezentace, odchovanec, milníky. */
export function PlayerStoryBlock({ game, player }: { game: GameState; player: Player }) {
  const st = playerStory(game, player);
  if (!st.caps && !st.youthCaps && !st.academy && !st.milestones.length && !st.international && !st.promise) return null;
  return (
    <div className="w1-story">
      <div className="pc-badges">
        {st.international && <Badge tone="good">reprezentant {st.nation === 'Česko' ? 'ČR' : st.nation}</Badge>}
        {st.academy && <Badge tone="neutral">odchovanec</Badge>}
      </div>
      <dl className="kv">
        <dt>Starty za A-reprezentaci (ve hře)</dt>
        <dd>{st.caps}</dd>
        {st.youthCaps > 0 && (
          <>
            <dt>Starty za U21</dt>
            <dd>{st.youthCaps}</dd>
          </>
        )}
        {st.promise && (
          <>
            <dt>Dohoda</dt>
            <dd className="wrap">{st.promise}</dd>
          </>
        )}
      </dl>
      {st.milestones.length > 0 && (
        <ul className="plain w1-milestones">
          {st.milestones.map((m, i) => (
            <li key={i}>
              <span className="muted small">{formatShortDate(m.date)} {m.date.slice(0, 4)}</span> {m.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
