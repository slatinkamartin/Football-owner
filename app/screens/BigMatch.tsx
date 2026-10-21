import { useEffect, useRef, useState } from 'react';
import {
  advanceDays,
  BIG_MATCH_LABEL,
  bigMatchCountdown,
  clubLabel,
  crowdBase,
  crowdLevel,
  euroLiveEvents,
  euroMatchTomorrow,
  finalWhistle,
  findEuroMatch,
  goalCry,
  markEuroDrawSeen,
  matchIntro,
  pendingEuroDraw,
  prepDecisions,
  prepValue,
  rivalryStory,
  setBigMatchPrep,
  type BigMatchKind,
  type BigMatchState,
  type GameState,
  type PrepKey,
} from '../../engine';
import { Badge, Meter } from '../components';

const KIND_ICON: Record<string, string> = { derby: '⚔', evropa: '★', titul: '♛', zachrana: '⚓', pohar: '🏆', baraz: '⚖' };

/** Hlasitost stadionu jako slovo. */
export function crowdWord(level: number): string {
  return level >= 88 ? 'peklo' : level >= 72 ? 'bouře' : level >= 55 ? 'hlučno' : level >= 35 ? 'šum' : 'ticho';
}

/** Ukazatel hlasitosti kotle (v přenosu i na kartě). */
export function CrowdMeter({ level, label = 'Kotel' }: { level: number; label?: string }) {
  return (
    <div className={`crowd-meter ${level >= 72 ? 'loud' : ''}`} aria-label={`${label}: ${crowdWord(level)}`}>
      <span className="crowd-label">{label}</span>
      <span className="crowd-bar"><span className="crowd-fill" style={{ width: `${level}%` }} /></span>
      <span className="crowd-word">{crowdWord(level)}</span>
    </div>
  );
}

/**
 * Odpočet velkého zápasu na Přehledu: napětí, lístky, kabina, město, výrok soupeře
 * a krátká rozhodnutí přípravy (výchozí volba platí sama, když majitel nic nezvolí).
 */
export function BigMatchCard({ game, onChange }: { game: GameState; onChange: (g: GameState) => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const c = bigMatchCountdown(game);
  if (!c) return null;
  const bm = c.bm;
  const story = bm.opponentId ? rivalryStory(game, bm.opponentId) : undefined;
  const choose = (key: PrepKey, value: string) => {
    const r = setBigMatchPrep(game, key, value);
    if (r.ok) onChange(r.state);
    setMsg(r.message);
  };
  const locked = game.date >= bm.date || !!game.owner.ousted;
  return (
    <section className={`card bigmatch-card kind-${bm.kind}`}>
      <div className="bm-head">
        <span className="bm-icon" aria-hidden>{KIND_ICON[bm.kind] ?? '★'}</span>
        <div>
          <span className="bm-kicker">{BIG_MATCH_LABEL[bm.kind as BigMatchKind] ?? 'Velký zápas'} · {bm.competition}</span>
          <h2>{c.title}</h2>
        </div>
        <span className="bm-days" aria-label={`dní do zápasu: ${c.days}`}>{c.days <= 0 ? 'dnes' : c.days}<small>{c.days <= 0 ? '' : c.days === 1 ? 'den' : c.days < 5 ? 'dny' : 'dní'}</small></span>
      </div>
      <div className="bm-hype">
        <span className="small">Napětí: <strong>{c.hypeLabel}</strong></span>
        <Meter value={c.hype} tone={c.hype >= 70 ? 'bad' : 'warn'} />
      </div>
      <dl className="kv bm-kv">
        {c.demand && (
          <>
            <dt>Lístky</dt>
            <dd>{c.demand.hours ? `vyprodáno za ${c.demand.hours} h` : `prodáno ${c.demand.pct} %`}</dd>
          </>
        )}
        {c.trip && (
          <>
            <dt>Fanoušci</dt>
            <dd>{c.trip}</dd>
          </>
        )}
        <dt>Kabina</dt>
        <dd>{c.kabina}</dd>
        <dt>Město</dt>
        <dd>{c.city}</dd>
        {c.risky && (
          <>
            <dt>Riziko</dt>
            <dd><Badge tone="warn">rizikový zápas</Badge></dd>
          </>
        )}
      </dl>
      {c.quote && (
        <blockquote className="bm-quote">
          {c.quote.text}
          <cite>{c.quote.who}</cite>
        </blockquote>
      )}
      {story && <p className="small bm-story">{story}</p>}
      {c.decisions.length > 0 && !locked && (
        <div className="bm-prep">
          <h3>Příprava <span className="muted small">(když nic nezvolíte, platí zvýrazněná volba)</span></h3>
          {c.decisions.map((d) => {
            const cur = prepValue(game, bm, d.key) ?? d.def;
            const hint = d.options.find((o) => o.id === cur)?.hint;
            return (
              <div key={d.key} className="bm-decision">
                <span className="bm-dlabel">{d.title}</span>
                <div className="segmented wrap">
                  {d.options.map((o) => (
                    <button key={o.id} className={cur === o.id ? 'active' : ''} aria-pressed={cur === o.id} onClick={() => choose(d.key, o.id)} title={o.hint}>{o.label}</button>
                  ))}
                </div>
                {hint && <span className="muted small">{hint}</span>}
              </div>
            );
          })}
        </div>
      )}
      {msg && <p className="muted small">{msg}</p>}
    </section>
  );
}

/** Stručné shrnutí přípravy pro okno zápasu. */
export function BigMatchBanner({ game, fixtureId }: { game: GameState; fixtureId: string }) {
  const bm = game.bigMatch;
  if (!bm || bm.id !== fixtureId || bm.settled) return null;
  const parts = prepDecisions(game, bm).map((d) => `${d.title.replace(': s kým strávíte zápas', '')}: ${d.options.find((o) => o.id === prepValue(game, bm, d.key))?.label ?? ''}`);
  return (
    <div className={`bm-banner kind-${bm.kind}`}>
      <strong>{KIND_ICON[bm.kind] ?? '★'} {BIG_MATCH_LABEL[bm.kind as BigMatchKind] ?? 'Velký zápas'}</strong>
      <span className="small">Napětí {bm.hype ?? 50}/100{parts.length ? ` · ${parts.join(' · ')}` : ''}</span>
    </div>
  );
}

/** Los evropských pohárů: soupeři se odkrývají postupně. */
export function EuroDrawCard({ game, onChange }: { game: GameState; onChange: (g: GameState) => void }) {
  const draw = pendingEuroDraw(game);
  const [shown, setShown] = useState(-1);
  useEffect(() => {
    if (!draw || shown < 0 || shown >= draw.opponents.length) return;
    const t = setTimeout(() => setShown(shown + 1), shown === 0 ? 900 : 700);
    return () => clearTimeout(t);
  }, [shown, draw]);
  if (!draw) return null;
  const done = shown >= draw.opponents.length;
  return (
    <section className="card euro-draw">
      <span className="bm-kicker">★ Losování</span>
      <h2>{draw.stage}</h2>
      {shown < 0 ? (
        <>
          <p className="small">Losovací osudí je připravené, kuličky se točí. Kdo to bude?</p>
          <button className="primary" onClick={() => setShown(0)}>Odkrýt soupeře ›</button>
        </>
      ) : (
        <>
          <ul className="plain draw-list">
            {draw.opponents.map((o, i) => (
              <li key={o.name} className={i < shown ? 'revealed' : i === shown ? 'spinning' : 'hidden'}>
                {i < shown ? (
                  <>
                    <strong>{o.name}</strong> <span className="muted small">{o.country} · síla {o.rating}</span>
                  </>
                ) : (
                  <span className="muted">{i === shown ? 'losuje se…' : '?'}</span>
                )}
              </li>
            ))}
          </ul>
          {done && <button onClick={() => onChange(markEuroDrawSeen(game))}>Hotovo</button>}
          {!done && <button className="linkbtn" onClick={() => setShown(draw.opponents.length)}>Odkrýt vše ›</button>}
        </>
      )}
    </section>
  );
}

/** Okno evropského zápasu v předvečer: jen výsledek, nebo přenos. */
export function EuroMatchDialog({ game, onClose, onResult, onLive }: { game: GameState; onClose: () => void; onResult: () => void; onLive: () => void }) {
  const m = euroMatchTomorrow(game);
  if (!m) return null;
  const own = clubLabel(game, game.owner.clubId);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="card dialog match-dialog" role="dialog" aria-modal="true" aria-label="Evropský zápas" onClick={(e) => e.stopPropagation()}>
        <span className="muted small">Zítra · {m.stage} · {m.neutral ? 'neutrální půda' : m.home ? 'doma' : 'venku'}</span>
        <h2>{m.home ? `${own} – ${m.opponent.name}` : `${m.opponent.name} – ${own}`}</h2>
        <BigMatchBanner game={game} fixtureId={m.id} />
        <p className="small">Soupeř: {m.opponent.name} ({m.opponent.country}), síla {m.opponent.rating}.</p>
        <p className="muted small">Evropský přenos ukazuje průběh zápasu s atmosférou stadionu; do hry se v něm nezasahuje.</p>
        <div className="match-choice">
          <button onClick={onResult}>Jen výsledek<span>Zápas se odehraje hned.</span></button>
          <button className="primary" onClick={onLive}>Sledovat zápas<span>Přenos s kotlem a znělkou.</span></button>
        </div>
        <button className="linkbtn" onClick={onClose}>Zatím zavřít</button>
      </div>
    </div>
  );
}

/**
 * Evropský přenos (zjednodušený): zápas se odehraje hned (výsledek dává engine/europe.ts),
 * přenos pak po minutách ukazuje góly, hlasitost kotle a komentář.
 */
export function EuroLive({ game, onChange, onClose, onSummary }: { game: GameState; onChange: (g: GameState) => void; onClose: () => void; onSummary: (id: string) => void }) {
  const [data] = useState(() => {
    const m = euroMatchTomorrow(game);
    if (!m) return undefined;
    const bm: BigMatchState | undefined = game.bigMatch?.id === m.id ? game.bigMatch : undefined;
    const played = advanceDays(game, 1).state;
    return { m, bm, played, intro: matchIntro(game, bm), base: crowdBase(game, bm, m.home && !m.neutral), events: euroLiveEvents(played, m.id) };
  });
  const [minute, setMinute] = useState(0);
  const feedRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [minute]);
  useEffect(() => {
    if (!data) {
      onClose();
      return;
    }
    onChange(data.played);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!data || minute >= 90) return;
    const goal = data.events.some((e) => e.minute === minute);
    const t = setTimeout(() => setMinute(minute + 1), goal ? 1100 : 70);
    return () => clearTimeout(t);
  }, [minute, data]);
  if (!data) return null;
  const { m, bm } = data;
  const visible = data.events.filter((e) => e.minute <= minute);
  const gf = visible.filter((e) => e.own).length;
  const ga = visible.length - gf;
  const own = clubLabel(game, game.owner.clubId);
  const level = crowdLevel(data.base, visible, minute);
  const end = minute >= 90;
  const res = findEuroMatch(data.played, m.id)?.match.result;
  const pens = end && res?.penalties ? ` (pen. ${res.penalties[0]}:${res.penalties[1]})` : '';
  const name = (id?: string) => (id && game.players[id] ? `${game.players[id].firstName} ${game.players[id].lastName}` : own);
  const home = m.home || m.neutral;
  return (
    <div className="overlay">
      <div className={`card dialog live-match big-live kind-evropa`} role="dialog" aria-modal="true" aria-label="Evropský přenos">
        <span className="bm-kicker center">★ {m.stage}</span>
        <div className="scoreboard">
          <span className="sb-team">{home ? own : m.opponent.name}</span>
          <span className="sb-score" key={`${gf}-${ga}`}>{home ? gf : ga}:{home ? ga : gf}</span>
          <span className="sb-team">{home ? m.opponent.name : own}</span>
        </div>
        <p className="muted small center">{end ? `Konec zápasu${pens}` : `${minute}. minuta`}</p>
        <CrowdMeter level={level} label={m.home && !m.neutral ? 'Kotel' : 'Vaši fanoušci'} />
        <ul className="plain live-feed" ref={feedRef}>
          {data.intro.map((t, i) => <li key={`i${i}`} className="intro">{t}</li>)}
          {visible.map((e, i) => (
            <li key={i} className={e.own ? 'goal own-goal' : 'goal opp-goal'}>
              <span className="tl-min">{e.minute}'</span> GÓL! {e.own ? name(e.playerId) : m.opponent.name}
              <span className="cry">{goalCry(bm, e.own, e.minute, visible.slice(0, i + 1).filter((x) => x.own).length, visible.slice(0, i + 1).filter((x) => !x.own).length)}</span>
            </li>
          ))}
          {end && <li className="final">{finalWhistle(bm ?? ({ kind: 'evropa' } as BigMatchState), gf, ga)}</li>}
        </ul>
        {end ? (
          <div className="buttons">
            <button className="primary" onClick={() => onSummary(m.id)}>Souhrn zápasu ›</button>
            <button onClick={onClose}>Zavřít</button>
          </div>
        ) : (
          <button className="linkbtn" onClick={() => setMinute(90)}>Přeskočit ›</button>
        )}
      </div>
    </div>
  );
}
