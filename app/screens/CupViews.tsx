import { useEffect, useRef, useState } from 'react';
import {
  cupBadgeParts,
  cupBracket,
  cupHistory,
  cupPathView,
  drawPreview,
  europeView,
  formatShortDate,
  prizeView,
  type EuroLegView,
  type EuroTableRow,
  type GameState,
  type StageChance,
} from '../../engine';
import { Badge } from '../components';
import { money } from '../format';
import { ClubLink } from '../nav';

/** V3: poháry a Evropa – cesta, pavouk, ligová fáze, jaro, los, historie, štítek. */

const pct = (p: number | undefined) => (p === undefined ? '–' : p >= 0.995 ? '100 %' : p > 0 && p < 0.01 ? '<1 %' : `${Math.round(p * 100)} %`);

function ChanceBar({ p }: { p: number }) {
  return (
    <span className="cv-chance" aria-label={`šance ${pct(p)}`}>
      <span className="cv-chance-fill" style={{ width: `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%` }} />
    </span>
  );
}

function ChanceList({ items }: { items: StageChance[] }) {
  if (!items.length) return null;
  return (
    <ul className="plain cv-chances">
      {items.map((c) => (
        <li key={c.key}>
          <span>{c.label}</span>
          <ChanceBar p={c.p} />
          <span className="num small">{pct(c.p)}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------- C9: štítek ----------

/** Krátký štítek poháru a Evropy do hlavičky a na domov. */
export function CupBadge({ game, onClick }: { game: GameState; onClick?: () => void }) {
  const parts = cupBadgeParts(game);
  if (!parts.length) return null;
  const body = parts.map((p) => (
    <span key={p.kind} className={`cv-badge cv-badge-${p.tone}${p.live ? ' live' : ''}`} title={p.kind === 'pohar' ? 'Domácí pohár' : 'Evropské poháry'}>
      <span className="cv-badge-ico" aria-hidden="true">{p.kind === 'pohar' ? <CupIcon /> : <StarIcon />}</span>
      {p.text}
    </span>
  ));
  return onClick ? (
    <button className="cv-badges linkbtn" onClick={onClick} aria-label="Poháry a Evropa">
      {body}
    </button>
  ) : (
    <span className="cv-badges">{body}</span>
  );
}

function CupIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
      <path d="M4 1h8v2h2.5v1.5A3.5 3.5 0 0 1 11.6 8 4 4 0 0 1 9 10.4V12h2v2H5v-2h2v-1.6A4 4 0 0 1 4.4 8 3.5 3.5 0 0 1 1.5 4.5V3H4V1Zm0 3.5H3a2 2 0 0 0 1.2 1.8L4 4.5Zm8 0-.2 1.8A2 2 0 0 0 13 4.5h-1Z" />
    </svg>
  );
}
function StarIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
      <path d="m8 1 2 4.5 5 .5-3.8 3.3 1.2 4.9L8 11.6l-4.4 2.6 1.2-4.9L1 6l5-.5L8 1Z" />
    </svg>
  );
}

// ---------- C2, C6, C7, C10: karta postupu ----------

const STEP_LABEL = { postup: 'postup', vyrazeni: 'vyřazení', dalsi: 'příští zápas', volno: 'volný los', ceka: 'čeká', mimo: '–' } as const;

const SHORT = ['1. kolo', '2. kolo', '1/8', '1/4', '1/2', 'Finále'];

/** Cesta pohárem a Evropou: pruh kol, výsledky, příští soupeř, prémie a šance. */
export function CupProgressCard({ game, onOpenMatch, onOpen }: { game: GameState; onOpenMatch?: (id: string) => void; onOpen?: () => void }) {
  const path = cupPathView(game);
  const eu = europeView(game);
  const prizes = prizeView(game);
  if (!path?.participates && !eu) return null;
  const freshStep = path?.steps.find((s) => s.fresh);
  const freshTie = eu ? [...eu.qualifying, ...(eu.spring?.rounds ?? [])].find((t) => t.fresh) : undefined;
  return (
    <section className={`card cv-card${freshStep ? (freshStep.status === 'postup' ? ' cv-advance' : ' cv-out') : ''}`}>
      <div className="row-between">
        <h2>Poháry</h2>
        {onOpen && (
          <button className="linkbtn small" onClick={onOpen}>
            Pavouk a tabulky
          </button>
        )}
      </div>
      {path?.participates && (
        <div className="cv-block">
          <div className="row-between">
            <h3>{path.cupName}</h3>
            <Badge tone={path.champion ? 'good' : path.alive ? 'warn' : 'neutral'}>
              {path.champion ? 'vítěz!' : path.alive ? `šance na titul ${pct(path.winChance)}` : 'vyřazeni'}
            </Badge>
          </div>
          <ol className="cv-steps" aria-label="Kola poháru">
            {path.steps.map((s) => (
              <li key={s.index} className={`cv-step cv-${s.status}${s.fresh ? ' fresh' : ''}`} title={`${s.name}: ${STEP_LABEL[s.status]}`}>
                <span className="cv-dot" aria-hidden="true" />
                <span className="cv-step-name">
                  <span className="cv-long">{s.name}</span>
                  <span className="cv-short" aria-hidden="true">{SHORT[s.index] ?? s.name}</span>
                </span>
                <span className="cv-step-sub small">
                  {s.ownScore ? (
                    onOpenMatch && s.fixtureId ? (
                      <button className="linkbtn" title={`${s.home ? 'doma' : 'venku'}, ${s.score}`} onClick={() => onOpenMatch(s.fixtureId!)}>
                        {s.ownScore}
                      </button>
                    ) : (
                      s.ownScore
                    )
                  ) : s.status === 'ceka' || s.status === 'dalsi' ? (
                    pct(s.chance)
                  ) : (
                    STEP_LABEL[s.status]
                  )}
                </span>
              </li>
            ))}
          </ol>
          {freshStep && (
            <p className={`cv-flash ${freshStep.status === 'postup' ? 'good' : 'bad'}`}>
              {freshStep.status === 'postup' ? `Postup přes ${freshStep.name.toLowerCase()}! Prémie ${money(freshStep.prize)}.` : `Konec v poháru (${freshStep.name.toLowerCase()}).`}
            </p>
          )}
          {path.next && (
            <p className="small">
              <strong>Příště:</strong> {path.next.name}, {formatShortDate(path.next.date)}
              {path.next.opponentId ? (
                <>
                  {' '}
                  · {path.next.home ? 'doma' : 'venku'} s <ClubLink id={path.next.opponentId}>{game.clubs[path.next.opponentId]?.shortName}</ClubLink>
                </>
              ) : (
                ' · soupeř se teprve vylosuje'
              )}
              {path.next.chance !== undefined && <span className="muted"> · šance hrát další kolo {pct(path.steps[path.next.index + 1]?.chance ?? path.winChance)}</span>}
            </p>
          )}
          <p className="muted small">
            Vyděláno {money(path.earned)}
            {path.nextReward && <> · za další krok {money(path.nextReward.amount)} ({path.nextReward.label.toLowerCase()})</>}
            {path.potential > 0 && <> · zbývá až {money(path.potential)}</>}
          </p>
        </div>
      )}
      {eu && (
        <div className={`cv-block${freshTie ? (freshTie.status === 'postup' ? ' cv-advance' : freshTie.status === 'vyrazeni' ? ' cv-out' : '') : ''}`}>
          <div className="row-between">
            <h3>{eu.compLabel}</h3>
            <Badge tone={eu.phase === 'konec' ? (eu.league ? 'good' : 'neutral') : 'warn'}>{eu.phase === 'konec' ? eu.best : { predkola: 'předkola', liga: 'ligová fáze', jaro: 'jaro', konec: '' }[eu.phase]}</Badge>
          </div>
          {eu.phase === 'predkola' && eu.qualifying.length > 0 && (
            <p className="small">
              {(() => {
                const q = eu.qualifying[eu.qualifying.length - 1];
                return (
                  <>
                    {q.stage}: {q.opponent.name} ({q.opponent.country}){q.aggregate ? `, celkem ${q.aggregate}` : ''}. <span className="muted">{q.parachute}.</span>
                  </>
                );
              })()}
            </p>
          )}
          {eu.league && (
            <p className="small">
              {eu.league.pos}. místo z 36 · {eu.league.points} b. ({eu.league.played}/{eu.league.total} zápasů)
              {eu.league.estimate && <span className="muted"> · odhad konce {eu.league.estimate.best}.–{eu.league.estimate.worst}. místo</span>}
            </p>
          )}
          <ChanceList items={eu.chances.filter((c) => c.p > 0.005 || c.key === 'jaro').slice(0, 4)} />
          {prizes.europe && (
            <p className="muted small">
              Evropa vynesla {money(prizes.europe.earned)}
              {prizes.europe.gate > 0 && <> + vstupné {money(prizes.europe.gate)}</>}
              {prizes.europe.next?.[0] && <> · další krok: {prizes.europe.next[0].label.toLowerCase()} {money(prizes.europe.next[0].amount)}</>}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

// ---------- C1: pavouk ----------

/** Pavouk domácího poháru: sloupce kol, vaše cesta zvýrazněná, vyřazení přeškrtnutí, možní soupeři. */
export function CupBracket({ game, onOpenMatch }: { game: GameState; onOpenMatch?: (id: string) => void }) {
  const b = cupBracket(game);
  const scroller = useRef<HTMLDivElement>(null);
  const [all, setAll] = useState<Record<number, boolean>>({});
  const focus = () => {
    const el = scroller.current;
    const col = el?.querySelector<HTMLElement>(`[data-round="${b?.focus ?? 0}"]`);
    if (el && col) el.scrollTo({ left: Math.max(0, col.offsetLeft - el.offsetLeft - 8), behavior: 'smooth' });
  };
  useEffect(() => {
    const el = scroller.current;
    const col = el?.querySelector<HTMLElement>(`[data-round="${b?.focus ?? 0}"]`);
    if (el && col) el.scrollLeft = Math.max(0, col.offsetLeft - el.offsetLeft - 8);
  }, [b?.focus]);
  if (!b) return null;
  const name = (id: string) => game.clubs[id]?.shortName ?? id;
  return (
    <section className="card">
      <div className="row-between">
        <h2>Pavouk: {b.cupName}</h2>
        <button className="small" onClick={focus}>
          Zaměřit na vás
        </button>
      </div>
      <p className="muted small">Každé kolo se losuje znovu, domácí prostředí má klub z nižší soutěže. Vyřazené kluby jsou přeškrtnuté.</p>
      <div className="cv-bracket" ref={scroller}>
        {b.rounds.map((r) => {
          const limit = all[r.index] || r.matches.length <= 8 ? r.matches.length : 4;
          return (
            <div key={r.index} className="cv-col" data-round={r.index}>
              <h3>
                {r.name} <span className="muted small">{formatShortDate(r.date)}</span>
              </h3>
              {r.drawn ? (
                <ul className="plain cv-matches">
                  {r.matches.slice(0, limit).map((m) => (
                    <li key={m.id} className={`cv-match${m.own ? ' own' : ''}`}>
                      <button className="cv-match-btn" disabled={!m.score || !onOpenMatch} onClick={() => onOpenMatch?.(m.id)}>
                        <span className={m.winnerId && m.winnerId !== m.homeId ? 'out' : m.winnerId === m.homeId ? 'win' : ''}>{name(m.homeId)}</span>
                        <span className="cv-score num">{m.score ?? '–'}</span>
                        <span className={m.winnerId && m.winnerId !== m.awayId ? 'out' : m.winnerId === m.awayId ? 'win' : ''}>{name(m.awayId)}</span>
                      </button>
                    </li>
                  ))}
                  {limit < r.matches.length && (
                    <li>
                      <button className="linkbtn small" onClick={() => setAll({ ...all, [r.index]: true })}>
                        Ukázat všech {r.matches.length} zápasů
                      </button>
                    </li>
                  )}
                </ul>
              ) : (
                <div className="cv-empty">
                  <p className="muted small">Los po předchozím kole · {r.slots} {r.slots === 1 ? 'zápas' : r.slots < 5 ? 'zápasy' : 'zápasů'}</p>
                  {r.possible && r.possible.length > 0 && (
                    <p className="small">
                      Možný soupeř:{' '}
                      {r.possible.slice(0, 4).map((o, i) => (
                        <span key={o.id}>
                          {i > 0 && ', '}
                          {name(o.id)} <span className="muted">{pct(o.p)}</span>
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {b.winnerId && <p className="small"><strong>Vítěz poháru:</strong> {name(b.winnerId)}</p>}
    </section>
  );
}

// ---------- C3, C4, C5: Evropa ----------

function Legs({ legs, onOpenMatch }: { legs: EuroLegView[]; onOpenMatch?: (id: string) => void }) {
  return (
    <span className="cv-legs">
      {legs.map((l, i) => (
        <span key={l.id} className={`cv-leg${l.outcome ? ` o-${l.outcome}` : ''}`}>
          {i > 0 && ' · '}
          {l.neutral ? 'neutr.' : l.home ? 'doma' : 'venku'}{' '}
          {l.score ? (
            onOpenMatch ? (
              <button className="linkbtn" onClick={() => onOpenMatch(l.id)}>
                {l.score}
              </button>
            ) : (
              l.score
            )
          ) : (
            formatShortDate(l.date)
          )}
        </span>
      ))}
    </span>
  );
}

const ZONE_LABEL: Record<EuroTableRow['zone'], string> = { osmifinale: 'osmifinále', playoff: 'play-off', vyrazeni: 'konec' };
const CHAIN_LABEL = { postup: 'postup', vyrazeni: 'vyřazení', hraje: 'hrajete', padak: 'padák', mimo: '–' } as const;

/** Evropa: předkola s padáky, tabulka ligové fáze 36 s pásmy, karty soupeřů, jarní pavouk a šance. */
export function EuropeLeagueTable({ game, onOpenMatch }: { game: GameState; onOpenMatch?: (id: string) => void }) {
  const v = europeView(game);
  const [full, setFull] = useState(false);
  if (!v) return null;
  const lg = v.league;
  const ownPos = lg?.pos ?? 0;
  const rows = lg ? (full ? lg.table : lg.table.filter((r) => r.pos <= 3 || Math.abs(r.pos - ownPos) <= 3 || r.pos === 8 || r.pos === 9 || r.pos === 24 || r.pos === 25)) : [];
  return (
    <section className="card cv-europe">
      <div className="row-between">
        <h2>Evropa {v.season}/{String(v.season + 1).slice(2)}: {v.compLabel}</h2>
        <span className="muted small">síla kádru {v.strength.toLocaleString('cs-CZ')}</span>
      </div>

      <h3>Předkola a padáky</h3>
      <ol className="cv-chain">
        {v.chain.map((c) => (
          <li key={c.comp} className={`cv-chain-${c.state}`}>
            <strong>{c.label}</strong> <span className="small">{CHAIN_LABEL[c.state]}</span>
          </li>
        ))}
      </ol>
      {v.qualifying.map((q) => (
        <div key={q.tie} className={`cv-tie cv-tie-${q.status}${q.fresh ? ' fresh' : ''}`}>
          <div className="row-between">
            <span>
              <strong>{q.stage}</strong> · {q.opponent.name} <span className="muted small">({q.opponent.country}, síla {q.opponent.rating})</span>
            </span>
            {q.aggregate && <span className="num">celkem {q.aggregate}</span>}
          </div>
          <div className="small">
            <Legs legs={q.legs} onOpenMatch={onOpenMatch} />
          </div>
          {q.parachute && <div className="muted small">{q.parachute}</div>}
        </div>
      ))}

      {lg && (
        <>
          <h3>
            Ligová fáze: {lg.pos}. místo z 36 <span className="muted small">({lg.played}/{lg.total} zápasů, {lg.points} b., skóre {lg.gf}:{lg.ga})</span>
          </h3>
          {lg.estimate && (
            <p className="small">
              Odhad konečného umístění: nejspíš {lg.estimate.likely}. místo (rozpětí {lg.estimate.best}.–{lg.estimate.worst}.) · top 8 {pct(lg.estimate.top8)} · jaro {pct(lg.estimate.top24)}
            </p>
          )}
          <div className="table-wrap">
            <table className="cv-table">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Tým</th>
                  <th className="num">Z</th>
                  <th className="num hide-sm">V-R-P</th>
                  <th className="num">Skóre</th>
                  <th className="num">B</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.name} title={ZONE_LABEL[r.zone]} className={`zone-${r.zone}${r.own ? ' own-row' : ''}${i > 0 && rows[i - 1].pos !== r.pos - 1 ? ' gap' : ''}`}>
                    <td className="num">{r.pos}.</td>
                    <td>
                      {r.name} <span className="muted small hide-sm">{r.country}</span>
                    </td>
                    <td className="num">{r.played}</td>
                    <td className="num hide-sm">
                      {r.won}-{r.drawn}-{r.lost}
                    </td>
                    <td className="num">
                      {r.gf}:{r.ga}
                    </td>
                    <td className="num">
                      <strong>{r.points}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small cv-legend">
            <span className="cv-zone zone-osmifinale" /> 1.–8. osmifinále <span className="cv-zone zone-playoff" /> 9.–24. play-off <span className="cv-zone zone-vyrazeni" /> 25.–36. konec · výsledky ostatních týmů hra dopočítává podle síly.{' '}
            <button className="linkbtn" onClick={() => setFull(!full)}>
              {full ? 'Zkrátit tabulku' : 'Celá tabulka'}
            </button>
          </p>

          <h3>Soupeři ligové fáze</h3>
          <div className="cv-opps">
            {lg.opponents.map((o) => (
              <div key={o.id} className={`cv-opp${o.outcome ? ` o-${o.outcome}` : ''}`}>
                <div className="row-between">
                  <strong>{o.name}</strong>
                  <span className="muted small">koš {o.pot}</span>
                </div>
                <div className="muted small">
                  {o.country} · síla {o.rating} · {o.strength}
                  {o.pos ? ` · ${o.pos}. místo` : ''}
                </div>
                <div className="small">
                  {formatShortDate(o.date)} {o.home ? 'doma' : 'venku'}
                  {o.score ? (
                    <>
                      {' '}
                      ·{' '}
                      {onOpenMatch ? (
                        <button className="linkbtn" onClick={() => onOpenMatch(o.id)}>
                          {o.score}
                        </button>
                      ) : (
                        o.score
                      )}
                    </>
                  ) : (
                    <span className="muted">
                      {' '}
                      · V {pct(o.odds.win)} / R {pct(o.odds.draw)} / P {pct(o.odds.loss)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {v.spring && v.phase !== 'predkola' && !(v.phase === 'konec' && v.spring.rounds.every((r) => r.status === 'mimo')) && (
        <>
          <h3>Jaro: vyřazovací boje</h3>
          <ol className="cv-spring">
            {v.spring.rounds.map((r) => (
              <li key={r.index} className={`cv-sr cv-sr-${r.status}${r.fresh ? ' fresh' : ''}`}>
                <div className="cv-sr-name">{r.name}</div>
                {r.opponent ? (
                  <>
                    <div className="small">
                      <strong>{r.opponent.name}</strong> <span className="muted">({r.opponent.country})</span>
                    </div>
                    <div className="small">
                      <Legs legs={r.legs} onOpenMatch={onOpenMatch} />
                      {r.aggregate && <span className="num"> · celkem {r.aggregate}</span>}
                    </div>
                  </>
                ) : (
                  <div className="muted small">{r.status === 'mimo' ? '–' : `možní soupeři: ${r.possible.slice(0, 3).join(', ')}…`}</div>
                )}
                <div className="muted small">prémie {money(r.prize)}</div>
              </li>
            ))}
          </ol>
        </>
      )}

      {v.chances.length > 0 && (
        <>
          <h3>Šance na další fáze</h3>
          <ChanceList items={v.chances} />
          <p className="muted small">Odhad z několika set simulací podle síly kádru, přepočítá se po každém zápase.</p>
        </>
      )}
    </section>
  );
}

// ---------- C8: los ----------

/** Koše a možní soupeři před losem (pohár i Evropa). */
export function DrawPreview({ game }: { game: GameState }) {
  const list = drawPreview(game);
  if (!list.length) return null;
  return (
    <section className="card">
      <h2>Před losem</h2>
      {list.map((d) => (
        <div key={d.key} className="cv-draw">
          <h3>{d.title}</h3>
          <p className="muted small">{d.note}</p>
          <div className="cv-pots">
            {d.pots.map((p) => (
              <div key={p.label} className="cv-pot">
                <div className="cv-pot-label">{p.label}</div>
                <ul className="plain small">
                  {p.clubs.map((c) => (
                    <li key={c.id ?? c.name}>
                      {c.id ? <ClubLink id={c.id}>{c.name}</ClubLink> : c.name}
                      {c.p !== undefined && <span className="muted num"> {pct(c.p)}</span>}
                      {c.detail && <span className="muted"> · {c.detail}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

// ---------- C11: historie ----------

/** Pohárová historie klubu po sezónách (domácí pohár a Evropa). */
export function CupHistory({ game }: { game: GameState }) {
  const rows = cupHistory(game);
  if (!rows.length) return null;
  return (
    <section className="card">
      <h2>Pohárová historie</h2>
      <ul className="plain cv-history">
        {rows.slice(0, 12).map((r) => (
          <li key={r.season}>
            <span className="cv-h-season num">{r.label}</span>
            <span className={r.cup ? `t-${r.cup.tone}` : 'muted'}>{r.cup ? `Pohár: ${r.cup.text}` : 'Pohár: –'}</span>
            {r.europe && <span className={`t-${r.europe.tone}`}>{r.europe.text}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
