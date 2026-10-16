import { useEffect, useState } from 'react';
import {
  advanceDays,
  allFixtures,
  APPROACH_LABEL,
  choreoCost,
  clubLabel,
  coachAcceptChance,
  goalChance,
  liveFirstHalf,
  matchBonusAmount,
  matchStakes,
  nextOwnFixture,
  setHalftime,
  setMatchPlan,
  workload,
  type ActionResult,
  type GameState,
  type LiveHalf,
  type MatchEvent,
  type MatchPlan,
} from '../../engine';
import { Badge } from '../components';
import { money } from '../format';

const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);

/** Příprava na příští zápas: taktika s trenérem, rotace, prémie, akce pro fanoušky, návštěva kabiny. */
export function MatchPrep({ game, onChange, onLive, compact }: { game: GameState; onChange: (g: GameState) => void; onLive?: () => void; compact?: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  const next = nextOwnFixture(game);
  if (!next) return null;
  const stakes = matchStakes(game, next.fixture, next.cup);
  const plan: Partial<MatchPlan> = game.matchPlan?.fixtureId === next.fixture.id ? game.matchPlan : {};
  const apply = (r: ActionResult) => {
    onChange(r.state);
    setMsg(r.message);
  };
  const accept = Math.round(coachAcceptChance(game) * 100);
  const w = workload(game);
  const days = daysBetween(game.date, next.fixture.date);
  return (
    <div className="match-prep">
      {!compact && (
        <div className="row-between">
          <strong>
            {next.home ? 'Doma' : 'Venku'} s {clubLabel(game, next.opponentId)}
          </strong>
          <span className="muted small">{next.name}, za {days} {days === 1 ? 'den' : days < 5 ? 'dny' : 'dní'}</span>
        </div>
      )}
      {stakes.length > 0 && (
        <div className="buttons">
          {stakes.map((s) => <Badge key={s.key} tone="warn">{s.label}</Badge>)}
        </div>
      )}
      <div className="prep-row">
        <span>Taktika (doporučení trenérovi, přijme asi s {accept}% šancí)</span>
        <div className="segmented">
          {(['utok', 'vyvazene', 'beton'] as const).map((a) => (
            <button key={a} className={(plan.approach ?? 'vyvazene') === a ? 'active' : ''} onClick={() => apply(setMatchPlan(game, { approach: a }))}>{APPROACH_LABEL[a]}</button>
          ))}
        </div>
      </div>
      {plan.coachAccepted === false && <p className="neg small">Trenér doporučení odmítl a postaví tým po svém.</p>}
      <div className="prep-actions">
        <label className="check">
          <input type="checkbox" checked={!!plan.rotate} onChange={(e) => apply(setMatchPlan(game, { rotate: e.target.checked }))} />
          <span>Šetřit opory (rotace): slabší sestava, ale opory se zotaví{w.level === 'vysoka' ? ' — nahuštěný program, doporučeno' : ''}</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={!!plan.bonus} onChange={(e) => apply(setMatchPlan(game, { bonus: e.target.checked ? matchBonusAmount(game) : 0 }))} />
          <span>Mimořádná prémie za výhru {money(matchBonusAmount(game))} (vyšší nasazení)</span>
        </label>
        {next.home && (
          <div className="prep-row">
            <span>Akce pro fanoušky</span>
            <div className="segmented">
              <button className={!plan.fanAction ? 'active' : ''} onClick={() => apply(setMatchPlan(game, { fanAction: undefined }))}>žádná</button>
              <button className={plan.fanAction === 'levne' ? 'active' : ''} onClick={() => apply(setMatchPlan(game, { fanAction: 'levne' }))}>poloviční vstupné</button>
              <button className={plan.fanAction === 'choreo' ? 'active' : ''} onClick={() => apply(setMatchPlan(game, { fanAction: 'choreo' }))}>choreo ({money(choreoCost(game))})</button>
            </div>
          </div>
        )}
        <label className="check">
          <input type="checkbox" checked={!!plan.visit} onChange={(e) => apply(setMatchPlan(game, { visit: e.target.checked }))} />
          <span>Zajít do kabiny před zápasem {game.owner.trust.trener >= 50 ? '(trenér vám věří, povzbudí to tým)' : '(trenér vám nevěří, může to být kontraproduktivní)'}</span>
        </label>
      </div>
      {msg && <p className="muted small">{msg}</p>}
      {onLive && days <= 7 && (
        <button className="primary" onClick={onLive}>Sledovat zápas živě ›</button>
      )}
    </div>
  );
}

/** Karta na Přehledu: příští zápas a příprava, šance na cíl sezóny. */
export function MatchPrepCard({ game, onChange, onLive }: { game: GameState; onChange: (g: GameState) => void; onLive: () => void }) {
  const chance = goalChance(game);
  if (!nextOwnFixture(game)) return null;
  return (
    <section className="card">
      <div className="row-between">
        <h2>Příprava na zápas</h2>
        {chance !== undefined && <span className="small" title="Odhad z 300 simulací zbytku sezóny">šance na cíl {Math.round(chance * 100)} %</span>}
      </div>
      <MatchPrep game={game} onChange={onChange} onLive={onLive} />
    </section>
  );
}

function eventText(game: GameState, e: MatchEvent): string {
  const p = game.players[e.playerId];
  const name = p ? `${p.firstName} ${p.lastName}` : '';
  const club = clubLabel(game, e.clubId);
  if (e.type === 'gol') return `GÓL! ${name} (${club})${e.note ? `, ${e.note}` : ''}`;
  if (e.type === 'zluta') return `Žlutá karta: ${name} (${club})`;
  if (e.type === 'cervena' || e.type === 'druha-zluta') return `Červená karta: ${name} (${club})`;
  if (e.type === 'zraneni') return `Zranění: ${name} (${club})`;
  if (e.type === 'stridani') {
    const o = e.otherId ? game.players[e.otherId] : undefined;
    return `Střídání ${club}: ${o ? `${o.firstName} ${o.lastName}` : ''} za ${name}`;
  }
  return name;
}

/**
 * Živý přenos: první poločas (náhled), rozhodnutí o poločase, pak skutečný zápas a druhý poločas.
 * Když zápas není zítra, hra se k němu nejdřív posune.
 */
export function LiveMatch({ game, onChange, onClose, onSummary }: { game: GameState; onChange: (g: GameState) => void; onClose: () => void; onSummary: (fixtureId: string) => void }) {
  const [stage, setStage] = useState<'prvni' | 'pulka' | 'druhy' | 'konec'>('prvni');
  const [half, setHalf] = useState<LiveHalf | undefined>();
  const [base, setBase] = useState<GameState | undefined>();
  const [shown, setShown] = useState(0);
  const [second, setSecond] = useState<MatchEvent[]>([]);
  const [final, setFinal] = useState<[number, number] | undefined>();
  const [fixtureId, setFixtureId] = useState<string | undefined>();

  // Posun na den před zápasem a náhled prvního poločasu.
  useEffect(() => {
    const next = nextOwnFixture(game);
    if (!next) return;
    const d = daysBetween(game.date, next.fixture.date);
    const eve = d > 1 ? advanceDays(game, d - 1).state : game;
    if (eve !== game) onChange(eve);
    setBase(eve);
    setHalf(liveFirstHalf(eve));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = stage === 'prvni' || stage === 'pulka' ? half?.events ?? [] : second;
  useEffect(() => {
    if (stage !== 'prvni' && stage !== 'druhy') return;
    if (shown >= list.length) {
      const t = setTimeout(() => setStage(stage === 'prvni' ? 'pulka' : 'konec'), 600);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setShown(shown + 1), 650);
    return () => clearTimeout(t);
  }, [stage, shown, list.length]);

  if (!base || !half) return null;
  const goals = (evs: MatchEvent[], club: string) => evs.filter((e) => e.type === 'gol' && e.clubId === club).length;
  const visible = list.slice(0, shown);
  const homeScore = stage === 'prvni' ? goals(visible, half.homeId) : stage === 'pulka' ? half.homeGoals : final && stage === 'konec' ? final[0] : half.homeGoals + goals(visible, half.homeId);
  const awayScore = stage === 'prvni' ? goals(visible, half.awayId) : stage === 'pulka' ? half.awayGoals : final && stage === 'konec' ? final[1] : half.awayGoals + goals(visible, half.awayId);

  const decide = (choice: 'drzet' | 'riskovat' | 'branit') => {
    const planned = setHalftime(base, choice).state;
    const played = advanceDays(planned, 1).state;
    onChange(played);
    const f = allFixtures(played).find((x) => x.fixture.id === half.fixtureId)?.fixture;
    setFixtureId(f?.id);
    setSecond((f?.result?.detail?.events ?? []).filter((e) => e.minute > 45));
    setFinal(f?.result ? [f.result.homeGoals, f.result.awayGoals] : undefined);
    setShown(0);
    setStage('druhy');
  };

  return (
    <div className="overlay">
      <div className="card dialog live-match" role="dialog" aria-modal="true" aria-label="Živý přenos">
        <div className="scoreboard">
          <span className="sb-team">{clubLabel(base, half.homeId)}</span>
          <span className="sb-score">{homeScore}:{awayScore}</span>
          <span className="sb-team">{clubLabel(base, half.awayId)}</span>
        </div>
        <p className="muted small center">{stage === 'prvni' ? '1. poločas' : stage === 'pulka' ? 'Poločas' : stage === 'druhy' ? '2. poločas' : 'Konec zápasu'}</p>
        <ul className="plain live-feed">
          {(stage === 'druhy' || stage === 'konec' ? [...(half.events ?? []), ...visible] : visible).map((e, i) => (
            <li key={i} className={e.type === 'gol' ? 'goal' : ''}><span className="tl-min">{e.minute}'</span> {eventText(base, e)}</li>
          ))}
          {stage === 'prvni' && !visible.length && <li className="muted">Zápas začal…</li>}
        </ul>
        {stage === 'pulka' && (
          <>
            <h3>Co vzkážete trenérovi do kabiny?</h3>
            <div className="decision-options">
              <button onClick={() => decide('drzet')}>Nic neměnit<span>Tým hraje dál podle plánu.</span></button>
              <button onClick={() => decide('riskovat')}>Víc riskovat<span>Útočněji a s větším nasazením: víc šancí, ale i gólů do vlastní sítě.</span></button>
              <button onClick={() => decide('branit')}>Bránit výsledek<span>Zatáhnout se a hlídat skóre.</span></button>
            </div>
            <p className="muted small">Trenér vzkaz přijme podle toho, jak vám věří.</p>
          </>
        )}
        {stage === 'konec' && (
          <div className="buttons">
            {fixtureId && <button className="primary" onClick={() => onSummary(fixtureId)}>Souhrn zápasu ›</button>}
            <button onClick={onClose}>Zavřít</button>
          </div>
        )}
        {(stage === 'prvni' || stage === 'druhy') && (
          <button className="linkbtn" onClick={() => setShown(list.length)}>Přeskočit ›</button>
        )}
      </div>
    </div>
  );
}
