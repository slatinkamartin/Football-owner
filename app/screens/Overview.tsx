import { useState } from 'react';
import {
  coachOf,
  scenarioDef,
  PRODEJNI_TARGET,
  scenarioStatus,
  tierOf,
  annualCosts,
  competitionOf,
  computeTable,
  contractExpiring,
  directorOf,
  formatDate,
  formatShortDate,
  goalLabel,
  goalTarget,
  seasonLabel,
  squadOf,
  transferWindow,
  type GameState,
  shareholderConfidence,
  budgetApproved,
  budgetDue,
  dressingRoom,
  EUROPE_LABEL,
  type BriefingTask,
  type MilestoneTab,
} from '../../engine';
import { Briefing, PulsePanel, Stories } from './Briefing';
import { SideGoalsCard } from './finance/Extras';
import { Badge, Meter } from '../components';
import { findFixture } from './MatchDetail';
import { Decisions } from './Decisions';
import { LineChart } from '../chart';
import { PlayerLink } from '../nav';
import { money } from '../format';

type Target = MilestoneTab | 'majitel';

export function Overview({
  game,
  onChange,
  onNavigate,
  onOpenMatch,
}: {
  game: GameState;
  onChange: (g: GameState) => void;
  onNavigate: (tab: Target, sub?: BriefingTask['sub']) => void;
  onOpenMatch: (id: string) => void;
  /** Živý přenos spouští dialog před zápasem (App); Přehled ho už nepoužívá. */
  onLive?: () => void;
}) {
  const [newsLimit, setNewsLimit] = useState(10);
  const club = game.clubs[game.owner.clubId];
  const comp = competitionOf(game, club.id);
  const table = comp ? computeTable(comp, game) : [];
  const position = table.findIndex((r) => r.clubId === club.id);
  const row = table[position];
  const last = comp?.fixtures
    .filter((f) => f.result && (f.homeId === club.id || f.awayId === club.id))
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const next = comp?.fixtures
    .filter((f) => !f.result && (f.homeId === club.id || f.awayId === club.id))
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0];

  return (
    <div className="grid">
      <Briefing game={game} onNavigate={onNavigate} />
      <Decisions game={game} onChange={onChange} />
      <ScenarioCard game={game} />
      <SideGoalsCard game={game} onOpen={() => onNavigate('finance')} />
      <section className="card">
        <h2>Další zápas</h2>
        {next ? (
          <>
            <div className="match-big">
              <span className={next.homeId === club.id ? 'own' : ''}>{game.clubs[next.homeId].shortName}</span>
              <span className="vs">–</span>
              <span className={next.awayId === club.id ? 'own' : ''}>{game.clubs[next.awayId].shortName}</span>
            </div>
            <p className="muted">
              {formatDate(next.date, true)} · {comp?.name}, {next.round}. kolo
            </p>
          </>
        ) : (
          <p className="muted">V této sezóně už klub nehraje.</p>
        )}
      </section>

      {last && (
        <section className="card">
          <h2>Poslední zápas</h2>
          <div className="match-big">
            <span className={last.homeId === club.id ? 'own' : ''}>{game.clubs[last.homeId].shortName}</span>
            <span>{last.result!.homeGoals}:{last.result!.awayGoals}</span>
            <span className={last.awayId === club.id ? 'own' : ''}>{game.clubs[last.awayId].shortName}</span>
          </div>
          <p className="muted">
            {formatDate(last.date, true)}
            {last.result!.detail && <> · xG {last.result!.detail.home.xg.toFixed(1)} : {last.result!.detail.away.xg.toFixed(1)}</>}
          </p>
          <button onClick={() => onOpenMatch(last.id)}>Náhled zápasu</button>
        </section>
      )}

      <section className="card">
        <h2>Tabulka</h2>
        {row && row.played === 0 ? (
          <p className="muted">Sezóna ještě nezačala. {comp?.name}, {table.length} týmů.</p>
        ) : row ? (
          <>
            <div className="stat-big">{position + 1}. místo</div>
            <p className="muted">
              {comp?.name} · {row.points} bodů z {row.played} zápasů · skóre {row.goalsFor}:{row.goalsAgainst}
            </p>
            <div className="form">
              {row.form.map((f, i) => (
                <span key={i} className={`form-${f}`}>{f}</span>
              ))}
            </div>
          </>
        ) : (
          <p className="muted">Klub nehraje žádnou soutěž.</p>
        )}
      </section>

      {game.europe?.season === game.season && game.europe.entries.some((e) => e.clubId === game.owner.clubId) && (() => {
        const e = game.europe!.entries.find((x) => x.clubId === game.owner.clubId)!;
        return (
          <section className="card">
            <h2>Evropské poháry</h2>
            <dl className="kv">
              <dt>Start</dt>
              <dd>předkola: {EUROPE_LABEL[e.entry]}</dd>
              <dt>Výsledek</dt>
              <dd>{game.europe!.resolved ? (e.result === 'predkola' ? EUROPE_LABEL.predkola : `ligová fáze: ${EUROPE_LABEL[e.result]}`) : 'rozhodne se do konce srpna'}</dd>
              <dt>{game.europe!.resolved ? 'Příjmy' : 'Odhad příjmů'}</dt>
              <dd>{money(e.revenue)}</dd>
            </dl>
          </section>
        );
      })()}

      <section className="card">
        <div className="row-between">
          <h2>Majitel</h2>
          <button className="linkbtn" onClick={() => onNavigate('majitel')}>Podrobnosti ›</button>
        </div>
        <dl className="kv">
          <dt>Zůstatek klubu</dt>
          <dd className={club.finance.balance < 0 ? 'neg' : ''}>{money(club.finance.balance)}</dd>
          <dt>Vaše osobní peníze</dt>
          <dd>{money(game.owner.wallet)}</dd>
          <dt>Váš podíl</dt>
          <dd>{Math.round(game.owner.share * 100)} %</dd>
          <dt>Pověst u médií</dt>
          <dd>{Math.round(game.owner.media)}</dd>
          {game.shareholders.length > 0 && (
            <>
              <dt>Spokojenost akcionářů</dt>
              <dd className={shareholderConfidence(game) < 35 ? 'neg' : ''}>{Math.round(shareholderConfidence(game))}</dd>
            </>
          )}
        </dl>
      </section>

      <ToDo game={game} onNavigate={onNavigate} />

      <PulsePanel game={game} />


      {game.timeline.length >= 2 && comp && (
        <section className="card wide">
          <LineChart
            title={`Pozice v tabulce v sezóně ${seasonLabel(game.season)}`}
            points={[...game.timeline].sort((a, b) => a.round - b.round).map((t) => ({ label: `${t.round}. kolo`, value: t.position }))}
            format={(v) => `${Math.round(v)}.`}
            invert
            min={1}
            max={comp.clubIds.length}
          />
        </section>
      )}

      <section className="card wide">
        <h2>Zprávy</h2>
        <ul className="news">
          {game.news.slice(0, newsLimit).map((n, i) => (
            <li key={i} className={`news-${n.kind}`}>
              <span className="news-date">{formatShortDate(n.date)}</span>
              <div>
                <strong>{n.title}</strong>
                {n.text && <p>{n.text}</p>}
                {n.playerId && game.players[n.playerId] && (
                  <PlayerLink id={n.playerId}>Karta hráče</PlayerLink>
                )}{' '}
                {n.fixtureId && findFixture(game, n.fixtureId) && (
                  <button className="linkbtn" onClick={() => onOpenMatch(n.fixtureId!)}>
                    Náhled zápasu
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        {game.news.length > newsLimit && (
          <button className="linkbtn news-more" onClick={() => setNewsLimit(newsLimit + 15)}>
            Další zprávy ({game.news.length - newsLimit}) ›
          </button>
        )}
      </section>

      {game.history.length > 0 && (
        <section className="card wide">
          <h2>Historie klubu</h2>
          <table>
            <thead>
              <tr><th>Sezóna</th><th>Soutěž</th><th className="num">Umístění</th><th className="num">Body</th></tr>
            </thead>
            <tbody>
              {[...game.history].reverse().map((h) => (
                <tr key={h.season}>
                  <td>{seasonLabel(h.season)}</td>
                  <td>{game.competitions[h.ownerClub.competitionId]?.name ?? '–'}</td>
                  <td className="num">{h.ownerClub.position}.</td>
                  <td className="num">{h.ownerClub.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <Stories game={game} onNavigate={onNavigate} />
    </div>
  );
}

function ToDo({ game, onNavigate }: { game: GameState; onNavigate: (tab: Target) => void }) {
  const own = game.owner.clubId;
  const comp = competitionOf(game, own);
  const coach = coachOf(game, own);
  const director = directorOf(game, own);
  const window = transferWindow(game.date);
  const items: { text: string; tab: Target; tone: 'good' | 'warn' | 'bad' | 'neutral' }[] = [];
  if (!budgetApproved(game) && !game.owner.ousted) items.push({ text: `Schvalte rozpočet sezóny (do ${formatDate(budgetDue(game))})`, tab: 'finance', tone: 'warn' });
  const room = dressingRoom(game);
  if (room.bonus < 0) items.push({ text: `Nálada v kabině: ${room.label}`, tab: 'kadr', tone: room.bonus <= -1 ? 'bad' : 'warn' });
  if (!coach) items.push({ text: 'Klub nemá hlavního trenéra', tab: 'vedeni', tone: 'bad' });
  if (!director) items.push({ text: 'Klub nemá sportovního ředitele', tab: 'vedeni', tone: 'warn' });
  if (game.market.offers.length) items.push({ text: `Nabídky na naše hráče: ${game.market.offers.length}`, tab: 'prestupy', tone: 'warn' });
  if (window && game.market.proposals.length) items.push({ text: `Návrhy posil od ředitele: ${game.market.proposals.length}`, tab: 'prestupy', tone: 'neutral' });
  if (game.market.negotiation && !['hotovo', 'neuspech'].includes(game.market.negotiation.stage)) {
    items.push({ text: 'Rozjednaný přestup čeká na vaši nabídku', tab: 'prestupy', tone: 'warn' });
  }
  const injured = squadOf(game, own).filter((p) => p.injuredUntil && p.injuredUntil >= game.date).length;
  const banned = squadOf(game, own).filter((p) => p.suspension > 0).length;
  if (injured) items.push({ text: `Zranění hráči: ${injured}`, tab: 'kadr', tone: injured >= 4 ? 'bad' : 'warn' });
  if (banned) items.push({ text: `Hráči se stopkou: ${banned}`, tab: 'kadr', tone: 'warn' });
  const expiring = squadOf(game, own).filter((p) => contractExpiring(game, p)).length;
  if (expiring && game.date.slice(5) >= '01-01' && game.date.slice(5) < '06-20') {
    items.push({ text: `Končící smlouvy: ${expiring}`, tab: 'kadr', tone: 'neutral' });
  }
  for (const role of ['trener', 'reditel'] as const) {
    if (game.owner.trust[role] < 30) {
      items.push({ text: `${role === 'trener' ? 'Trenér' : 'Ředitel'} ztrácí důvěru ve vedení`, tab: 'vedeni', tone: 'bad' });
    }
  }

  return (
    <section className="card">
      <h2>Vedení klubu</h2>
      <dl className="kv">
        <dt>Cíl sezóny</dt>
        <dd>{comp ? `${goalLabel(game.owner.seasonGoal, comp)}` : '–'}</dd>
        <dt>Trenér</dt>
        <dd>{coach ? `${coach.firstName} ${coach.lastName}` : 'neobsazeno'}</dd>
        <dt>Sportovní ředitel</dt>
        <dd>{director ? `${director.firstName} ${director.lastName}` : 'neobsazeno'}</dd>
        <dt>Přestupní okno</dt>
        <dd>{window ? 'otevřené' : 'zavřené'}</dd>
      </dl>
      {comp && <p className="muted small">Cíl znamená skončit do {goalTarget(game.owner.seasonGoal, comp)}. místa.</p>}
      {items.length > 0 && (
        <ul className="todo">
          {items.map((it, i) => (
            <li key={i}>
              <button className="linklike" onClick={() => onNavigate(it.tab)}>
                <Badge tone={it.tone}>{it.text}</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Scénář: cíl, kolik sezón zbývá a jak si klub vede. */
function ScenarioCard({ game }: { game: GameState }) {
  const sc = game.scenario;
  if (!sc) return null;
  const def = scenarioDef(sc.id);
  const st = scenarioStatus(game);
  const club = game.clubs[game.owner.clubId];
  const tier = tierOf(game, club.id);
  const comp = competitionOf(game, club.id);
  const seasonNo = Math.min(def.seasons, game.season - sc.startSeason + 1);
  const finished = !!sc.result;
  let goal: { label: string; value: string; pct: number; ok: boolean } | undefined;
  if (sc.id === 'zachrana') {
    const debt = game.ownerLoan?.remaining ?? 0;
    const net = club.finance.balance - debt;
    goal = { label: `Zůstatek klubu${debt ? ' po odečtení půjčky majitele' : ''} (★ od −10 % nákladů, ★★ od nuly) a 1. liga`, value: `${money(net)} · ${tier === 1 ? '1. liga ✓' : 'mimo 1. ligu ✕'}`, pct: net >= 0 ? 100 : Math.max(5, 100 - (Math.abs(net) / Math.max(1, annualCosts(club, tier) * 0.2)) * 100), ok: net >= -annualCosts(club, tier) * 0.1 && tier === 1 };
  } else if (sc.id === 'vzestup') {
    goal = { label: 'Soutěž (★ 2. liga, ★★ 1. liga, ★★★ 1. liga do 4 sezón)', value: `${comp?.name ?? '–'}${tier === 1 ? ' ✓' : ` · zbývá ${tier - 1} ${tier - 1 === 1 ? 'postup' : 'postupy'}`}`, pct: tier === 1 ? 100 : tier === 2 ? 50 : 10, ok: tier === 1 };
  } else if (sc.id === 'evropa') {
    const table = comp ? computeTable(comp, game) : [];
    const pos = table.findIndex((r) => r.clubId === club.id) + 1;
    const played = table.find((r) => r.clubId === club.id)?.played ?? 0;
    goal = { label: 'Umístění v 1. lize (cíl do 4. místa)', value: tier !== 1 ? 'mimo 1. ligu' : played ? `teď ${pos}. místo` : 'sezóna ještě nezačala', pct: tier === 1 && played ? Math.max(0, Math.min(100, ((table.length - pos + 1) / Math.max(1, table.length - 3)) * 100)) : 0, ok: tier === 1 && played > 0 && pos <= 4 };
  } else {
    const target = PRODEJNI_TARGET;
    const total = sc.progress + (finished ? 0 : club.finance.season.prestupy ?? 0);
    goal = { label: `Čistý zisk z přestupů (cíl ${money(target)})`, value: `${money(total)} (${Math.round((total / target) * 100)} %)`, pct: Math.max(0, Math.min(100, (total / target) * 100)), ok: total >= target };
  }
  return (
    <section className="card wide scenario-card">
      <div className="row-between">
        <h2>Scénář: {def.title}</h2>
        {finished ? (
          <Badge tone={sc.result!.stars ? 'good' : 'bad'}>{sc.result!.stars ? `splněno ${'★'.repeat(sc.result!.stars)}${'☆'.repeat(3 - sc.result!.stars)}` : 'nesplněno'}</Badge>
        ) : (
          <Badge tone={st?.done ? 'good' : 'neutral'}>sezóna {seasonNo} z {def.seasons}</Badge>
        )}
      </div>
      <p className="muted small">{def.description}</p>
      {finished ? (
        <p>{sc.result!.text}</p>
      ) : (
        <>
          <div className="scenario-progress">
            <span className="small">Čas</span>
            <Meter value={seasonNo - 1 + seasonProgressOf(game)} max={def.seasons} tone={seasonNo === def.seasons ? 'warn' : 'good'} />
            <span className="small muted">{def.seasons - seasonNo === 0 ? 'poslední sezóna' : `po této sezóně zbývá ${def.seasons - seasonNo}`}</span>
          </div>
          {goal && (
            <div className="scenario-progress">
              <span className="small">{goal.label}</span>
              <Meter value={goal.pct} tone={goal.ok ? 'good' : goal.pct >= 50 ? 'warn' : 'bad'} />
              <strong className={`small ${goal.ok ? 'pos' : ''}`}>{goal.value}</strong>
            </div>
          )}
          {st && <p className="muted small">{st.text} Vyhodnocuje se vždy po skončení sezóny{st.done ? ' – teď by scénář byl splněný.' : '.'}</p>}
        </>
      )}
    </section>
  );
}

function seasonProgressOf(game: GameState): number {
  const start = new Date(`${game.season}-07-01T00:00:00Z`).getTime();
  const now = new Date(`${game.date}T00:00:00Z`).getTime();
  return Math.max(0, Math.min(1, (now - start) / (365 * 86_400_000)));
}
