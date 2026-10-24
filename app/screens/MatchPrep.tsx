import { useEffect, useRef, useState } from 'react';
import {
  advanceDays,
  clubLabel,
  coachAcceptChance,
  coachAdviceOf,
  COACH_ADVICE,
  goalChance,
  BIG_MATCH_LABEL,
  crowdBase,
  crowdLevel,
  finalWhistle,
  goalCry,
  lateMoment,
  liveDecisionMinute,
  matchIntro,
  recordLiveChoice,
  scheduledMoments,
  setCoachAdvice,
  setLateChoice,
  type BigMatchKind,
  type CoachAdvice,
  type LiveMoment,
  matchStakes,
  nextOwnFixture,
  opponentScout,
  setHalftime,
  type GameState,
  type MatchEvent,
  type Fixture,
  liveClubName,
  liveFixture,
  livePlayerName,
  nextLiveTarget,
} from '../../engine';
import { Badge } from '../components';
import { useNav } from '../nav';
import { BigMatchBanner, CrowdMeter } from './BigMatch';

const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);

/**
 * W3: jediná rada trenérovi před klíčovým zápasem (domácím i evropským). Výchozí: nechat na trenérovi.
 * Rotaci, prémie a akce pro fanoušky řeší vedení samo; u velkého zápasu je pojetí na kartě odpočtu.
 */
export function CoachAdviceChoice({ game, fixtureId, onChange }: { game: GameState; fixtureId: string; onChange: (g: GameState) => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const cur = coachAdviceOf(game, fixtureId);
  const accept = Math.round(coachAcceptChance(game) * 100);
  const pick = (a: CoachAdvice) => {
    const r = setCoachAdvice(game, a, fixtureId);
    if (r.ok) onChange(r.state);
    setMsg(r.message);
  };
  const hint = COACH_ADVICE.find((o) => o.id === cur)?.hint;
  return (
    <div className="coach-advice">
      <div className="segmented wrap" role="group" aria-label="Rada trenérovi">
        {COACH_ADVICE.map((o) => (
          <button key={o.id} className={cur === o.id ? 'active' : ''} aria-pressed={cur === o.id} title={o.hint} onClick={() => pick(o.id)}>{o.label}</button>
        ))}
      </div>
      {hint && <span className="muted small">{hint}{cur !== 'trener' ? ` Trenér radu přijme asi s ${accept}% šancí.` : ''}</span>}
      {msg && <p className="muted small">{msg}</p>}
    </div>
  );
}

const FORM_TONE = { V: 'good', R: 'neutral', P: 'bad' } as const;

/**
 * Zápasový milník: otevře se tlačítkem „Zápas ›“ v předvečer KLÍČOVÉHO zápasu (W3; běžné zápasy odehraje
 * posun sám, pokud majitel v nastavení nechce zastavovat před každým). Ukáže soupeře, jednu radu trenérovi
 * a nechá vybrat, jestli chce jen výsledek, nebo přenos.
 */
export function MatchDialog({ game, onChange, onClose, onResult, onLive }: { game: GameState; onChange: (g: GameState) => void; onClose: () => void; onResult: () => void; onLive: () => void }) {
  const nav = useNav();
  const next = nextOwnFixture(game);
  if (!next) return null;
  const scout = opponentScout(game, next.opponentId);
  const chance = goalChance(game);
  const ownName = clubLabel(game, game.owner.clubId);
  const oppName = clubLabel(game, next.opponentId);
  const home = next.home ? ownName : oppName;
  const away = next.home ? oppName : ownName;
  const edge = scout.ownStrength - scout.strength;
  const big = game.bigMatch?.id === next.fixture.id && !game.bigMatch.settled;
  const stakes = matchStakes(game, next.fixture, next.cup);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="card dialog match-dialog" role="dialog" aria-modal="true" aria-label="Zápas" onClick={(e) => e.stopPropagation()}>
        <span className="muted small">Zítra · {next.name} · {next.home ? 'doma' : 'venku'}</span>
        <h2>{home} – {away}</h2>
        <BigMatchBanner game={game} fixtureId={next.fixture.id} />

        <h3>Soupeř</h3>
        <div className="scout-grid">
          <div className="pc-big">
            <span className="muted small">Tabulka</span>
            <strong>{scout.position && scout.form.length ? `${scout.position}. místo, ${scout.points} b.` : 'sezóna začíná'}</strong>
            {scout.ownPosition && scout.form.length > 0 && <span className="muted small">vy: {scout.ownPosition}. místo</span>}
          </div>
          <div className="pc-big">
            <span className="muted small">Síla sestavy</span>
            <strong>{scout.strength} <span className="muted small">vs. vaše {scout.ownStrength}</span></strong>
            <span className={`small ${edge >= 3 ? 'pos' : edge <= -3 ? 'neg' : 'muted'}`}>{edge >= 3 ? 'jste favorit' : edge <= -3 ? 'soupeř je favorit' : 'vyrovnaný zápas'}</span>
          </div>
          <div className="pc-big">
            <span className="muted small">Forma (posledních 5)</span>
            <span className="form-row">{scout.form.length ? scout.form.map((f, i) => <Badge key={i} tone={FORM_TONE[f]}>{f}</Badge>) : <span className="muted small">zatím bez zápasů</span>}</span>
          </div>
        </div>
        <ul className="plain small">
          {scout.scorers.length > 0 && (
            <li>
              Nejlepší střelci:{' '}
              {scout.scorers.map((s, i) => (
                <span key={s.id}>{i > 0 && ', '}<button className="linkbtn" onClick={() => nav.open({ type: 'player', id: s.id })}>{s.name}</button> ({s.goals})</span>
              ))}
            </li>
          )}
          <li>Zranění u soupeře: {scout.injured || 'nikdo'}</li>
          {scout.meetings.length > 0 && <li>Vzájemné zápasy: {scout.meetings.map((m) => m.text).join(' · ')}</li>}
          {chance !== undefined && <li className="muted">Šance na splnění cíle sezóny: {Math.round(chance * 100)} %</li>}
        </ul>

        {stakes.length > 0 && (
          <div className="buttons">
            {stakes.map((x) => <Badge key={x.key} tone="warn">{x.label}</Badge>)}
          </div>
        )}
        {!game.owner.ousted && (
          <>
            <h3>Rada trenérovi</h3>
            <CoachAdviceChoice game={game} fixtureId={next.fixture.id} onChange={onChange} />
          </>
        )}

        <div className="match-choice">
          <button onClick={onResult}>Jen výsledek<span>Zápas se odehraje hned, uvidíte souhrn.</span></button>
          <button className="primary" onClick={onLive}>Sledovat zápas<span>{big ? 'Přenos s kotlem a jedním vzkazem trenérovi (o poločase, nebo v 75. minutě).' : 'Přenos s jedním vzkazem trenérovi (o poločase, nebo v 75. minutě).'}</span></button>
        </div>
        <button className="linkbtn" onClick={onClose}>Zatím zavřít</button>
      </div>
    </div>
  );
}

function eventText(game: GameState, e: MatchEvent, f?: Fixture): string {
  // V4: jména i u evropského soupeře (hráči nejsou ve hře, jsou jen v sestavě zápasu).
  const name = livePlayerName(game, f, e.playerId);
  const club = liveClubName(game, e.clubId);
  if (e.type === 'gol') return `GÓL! ${name} (${club})${e.note ? `, ${e.note}` : ''}`;
  if (e.type === 'zluta') return `Žlutá karta: ${name} (${club})`;
  if (e.type === 'cervena' || e.type === 'druha-zluta') return `Červená karta: ${name} (${club})`;
  if (e.type === 'zraneni') return `Zranění: ${name} (${club})`;
  if (e.type === 'penalta-mimo') return `Penalta neproměněna: ${name} (${club})${e.note ? `, ${e.note}` : ''}`;
  if (e.type === 'stridani') {
    return `Střídání ${club}: ${livePlayerName(game, f, e.otherId)} za ${name}`;
  }
  return name;
}

type LiveStop = { key: string; minute: number; kind: 'pulka' } | { key: string; minute: number; kind: 'moment'; moment: LiveMoment };

/**
 * Živý přenos. Zápas se přehraje na kopii hry; v jediném bodě zlomu (W3: poločas, když klub nevede,
 * jinak 75. minuta) se volba zapíše a zbytek zápasu se přehraje znovu.
 * Do bodu zlomu je zápas stejný (stejná náhoda), volba platí od další minuty, takže rozhodnutí je poctivé.
 * Když zápas není zítra, hra se k němu nejdřív posune.
 */
export function LiveMatch({ game, onChange, onClose, onSummary, euro }: { game: GameState; onChange: (g: GameState) => void; onClose: () => void; onSummary: (fixtureId: string) => void; /** V4: přenos evropského zápasu klubu majitele. */ euro?: boolean }) {
  const [eve, setEve] = useState<GameState | undefined>();
  const [work, setWork] = useState<GameState | undefined>();
  const [sim, setSim] = useState<GameState | undefined>();
  const [fixtureId, setFixtureId] = useState<string | undefined>();
  const [minute, setMinute] = useState(0);
  const [pause, setPause] = useState<LiveStop | undefined>();
  const [done, setDone] = useState<string[]>([]);
  const [notes, setNotes] = useState<{ minute: number; text: string; cls?: string }[]>([]);
  const [finished, setFinished] = useState(false);
  const feedRef = useRef<HTMLUListElement>(null);

  // Posun na den před zápasem a přehrání zápasu na kopii.
  useEffect(() => {
    const next = nextLiveTarget(game, euro); // V4: domácí i evropský zápas
    if (!next) {
      onClose();
      return;
    }
    const d = daysBetween(game.date, next.date);
    const e = d > 1 ? advanceDays(game, d - 1).state : game;
    if (e !== game) onChange(e);
    const played = advanceDays(e, 1).state;
    const f = liveFixture(played, next.id);
    if (!f?.result) {
      onClose();
      return;
    }
    setEve(e);
    setWork(e);
    setSim(played);
    setFixtureId(f.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const own = game.owner.clubId;
  const fixture = sim && fixtureId ? liveFixture(sim, fixtureId) : undefined;
  const events = fixture?.result?.detail?.events ?? [];
  const bm = eve?.bigMatch?.id === fixtureId && !eve?.bigMatch?.settled ? work?.bigMatch : undefined;
  const moments = eve && bm ? scheduledMoments(eve, bm) : [];
  const ownHome = fixture?.homeId === own;
  const goalsBy = (club: string, upTo: number) => events.filter((e) => e.type === 'gol' && e.clubId === club && e.minute <= upTo).length;

  // W3: v přenosu nejvýš jeden zásah. Když klub o poločase nevede, rozhoduje se o poločase; jinak v 75. minutě.
  // Pyro a sporný verdikt se odehrají samy s výchozí volbou (jen zpráva v komentáři, bez zastavení).
  const stops: LiveStop[] = [];
  if (fixture) {
    const opp = ownHome ? fixture.awayId : fixture.homeId;
    if (liveDecisionMinute(goalsBy(own, 45), goalsBy(opp, 45)) === 45) stops.push({ key: 'zasah', minute: 45, kind: 'pulka' });
    else stops.push({ key: 'zasah', minute: 75, kind: 'moment', moment: lateMoment(goalsBy(own, 75), goalsBy(opp, 75)) });
  }
  const stopAt = (m: number) => stops.find((s) => s.minute === m && !done.includes(s.key));
  const autoMoment = (m: number) => moments.find((x) => x.minute === m);

  // Hodiny přenosu: po minutách, u gólu delší pauza, v bodě zlomu zastaví.
  useEffect(() => {
    if (!sim || pause || finished) return;
    const stop = stopAt(minute);
    if (stop) {
      setPause(stop);
      if (stop.kind === 'moment') setNotes((n) => [...n, { minute, text: `${stop.moment.title}: ${stop.moment.text}`, cls: 'moment' }]);
      return;
    }
    const auto = autoMoment(minute);
    if (auto && !notes.some((n) => n.minute === minute && n.cls === 'moment')) {
      const def = auto.options.find((o) => o.id === auto.def)?.label ?? '';
      setNotes((n) => [...n, { minute, text: `${auto.title}: ${auto.text} ${def ? `Lavička a pořadatelé: ${def.toLowerCase()}.` : ''}`, cls: 'moment' }]);
    }
    if (minute >= 90) {
      setFinished(true);
      onChange(sim);
      return;
    }
    const goal = events.some((e) => e.minute === minute && e.type === 'gol');
    const t = setTimeout(() => setMinute(minute + 1), goal ? 1100 : minute === 0 ? 900 : 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim, minute, pause, finished]);

  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [minute, notes.length, pause]);

  if (!eve || !work || !sim || !fixture) return null;

  const decide = (stop: LiveStop, choice: string, label: string) => {
    const late = (g: GameState) => (bm ? recordLiveChoice(g, 'vabank', stop.minute, choice) : setLateChoice(g, choice as 'vabank' | 'branit' | 'nechat', fixtureId!));
    const next = stop.kind === 'pulka' ? setHalftime(work, choice as 'drzet' | 'riskovat' | 'branit', fixtureId).state : late(work);
    setWork(next);
    setSim(advanceDays(next, 1).state);
    setDone((d) => [...d, stop.key]);
    setNotes((n) => [...n, { minute: stop.minute, text: stop.kind === 'pulka' ? `Vzkaz do kabiny: ${label}.` : `Rozhodli jste: ${label}.`, cls: 'decision' }]);
    setPause(undefined);
  };
  const skip = () => {
    // Zbytek zápasu s výchozími volbami.
    setDone(stops.map((s) => s.key));
    setPause(undefined);
    setMinute(90);
  };

  const visible = events.filter((e) => e.minute <= minute);
  // Skóre po i-tém zobrazeném gólu (pro komentář): góly v pořadí událostí.
  const ownGoalsBy = (_m: number, idx: number, mine: boolean) => visible.slice(0, idx + 1).filter((e) => e.type === 'gol' && (e.clubId === own) === mine).length;
  const homeScore = goalsBy(fixture.homeId, minute);
  const awayScore = goalsBy(fixture.awayId, minute);
  const gf = ownHome ? homeScore : awayScore;
  const ga = ownHome ? awayScore : homeScore;
  const intro = bm ? matchIntro(work, bm) : [];
  const pyro = moments.find((m) => m.kind === 'pyro');
  const level = crowdLevel(
    crowdBase(eve, bm, ownHome),
    visible.filter((e) => e.type === 'gol').map((e) => ({ minute: e.minute, own: e.clubId === own })),
    minute,
    pyro && ownHome ? [{ minute: pyro.minute, delta: 14 }] : [],
  );
  const feed = [
    ...visible.map((e, i) => ({ minute: e.minute, order: 1, key: `e${i}`, node: (
      <li key={`e${i}`} className={e.type === 'gol' ? `goal ${e.clubId === own ? 'own-goal' : 'opp-goal'}` : ''}>
        <span className="tl-min">{e.minute}'</span> {eventText(eve, e, fixture)}
        {e.type === 'gol' && bm && <span className="cry">{goalCry(bm, e.clubId === own, e.minute, ownGoalsBy(e.minute, i, true), ownGoalsBy(e.minute, i, false))}</span>}
      </li>
    ) })),
    ...notes.map((n, i) => ({ minute: n.minute, order: 2, key: `n${i}`, node: <li key={`n${i}`} className={n.cls}><span className="tl-min">{n.minute}'</span> {n.text}</li> })),
  ].sort((a, b) => a.minute - b.minute || a.order - b.order);
  const pens = fixture.result?.penalties; // V4: rozstřel po dvojzápasu
  const phase = finished ? `Konec zápasu${pens ? ` (penalty ${pens[0]}:${pens[1]})` : ''}` : pause?.kind === 'pulka' ? 'Poločas' : minute === 0 ? 'Nástup týmů' : `${minute}. minuta`;

  return (
    <div className="overlay">
      <div className={`card dialog live-match ${bm ? `big-live kind-${bm.kind}` : ''}`} role="dialog" aria-modal="true" aria-label="Živý přenos">
        {bm && <span className="bm-kicker center">{BIG_MATCH_LABEL[bm.kind as BigMatchKind] ?? 'Velký zápas'} · {bm.competition}</span>}
        <div className="scoreboard">
          <span className="sb-team">{liveClubName(eve, fixture.homeId)}</span>
          <span className="sb-score" key={`${homeScore}-${awayScore}`}>{homeScore}:{awayScore}</span>
          <span className="sb-team">{liveClubName(eve, fixture.awayId)}</span>
        </div>
        <p className="muted small center">{phase}</p>
        <CrowdMeter level={level} label={ownHome ? 'Kotel' : 'Vaši fanoušci'} />
        <ul className="plain live-feed" ref={feedRef}>
          {intro.map((t, i) => <li key={`i${i}`} className="intro">{t}</li>)}
          {!intro.length && <li className="muted">Zápas začal…</li>}
          {feed.map((x) => x.node)}
          {finished && bm && <li className="final">{finalWhistle(bm, gf, ga)}</li>}
        </ul>
        {pause?.kind === 'pulka' && (
          <>
            <h3>Co vzkážete trenérovi do kabiny?</h3>
            <div className="decision-options">
              <button onClick={() => decide(pause, 'drzet', 'nic neměnit')}>Nic neměnit<span>Tým hraje dál podle plánu.</span></button>
              <button onClick={() => decide(pause, 'riskovat', 'víc riskovat')}>Víc riskovat<span>Útočněji a s větším nasazením: víc šancí, ale i gólů do vlastní sítě.</span></button>
              <button onClick={() => decide(pause, 'branit', 'bránit výsledek')}>Bránit výsledek<span>Zatáhnout se a hlídat skóre.</span></button>
            </div>
            <p className="muted small">Trenér vzkaz přijme podle toho, jak vám věří.</p>
          </>
        )}
        {pause?.kind === 'moment' && (
          <div className="live-moment">
            <h3>{pause.moment.title}</h3>
            <div className="decision-options">
              {pause.moment.options.map((o) => (
                <button key={o.id} className={o.id === pause.moment.def ? 'default' : ''} onClick={() => decide(pause, o.id, o.label.toLowerCase())}>{o.label}<span>{o.hint}</span></button>
              ))}
            </div>
          </div>
        )}
        {finished && (
          <div className="buttons">
            <button className="primary" onClick={() => onSummary(fixture.id)}>Souhrn zápasu ›</button>
            <button onClick={onClose}>Zavřít</button>
          </div>
        )}
        {!finished && !pause && <button className="linkbtn" onClick={skip}>Přeskočit na konec ›</button>}
      </div>
    </div>
  );
}
