import { useState } from 'react';
import {
  bigMonthly,
  bigProjectOptions,
  bigRemaining,
  commercialIncomeMonthly,
  formatDate,
  hasProgram,
  partnerRegion,
  previewVote,
  PROGRAM_ORDER,
  programAnnual,
  programOneOff,
  PROGRAMS,
  REGION_ORDER,
  REGIONS,
  startBigProject,
  startProgram,
  stopProgram,
  type ActionResult,
  type BigProjectKind,
  type GameState,
  type ScoutRegion,
} from '../../engine';
import { Badge, Meter } from '../components';
import { money } from '../format';
import { VoteInfo } from '../VoteInfo';

type Props = { game: GameState; onResult: (r: ActionResult) => void };

const years = (v: number) => `${v.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} ${v < 5 ? 'roku' : 'let'}`;

/** Velké víceleté stavby a programy klubu. */
export function Investments({ game, onResult }: Props) {
  const [pending, setPending] = useState<BigProjectKind | null>(null);
  const [partner, setPartner] = useState<ScoutRegion>('afrika');
  const running = game.bigProjects ?? [];
  const income = commercialIncomeMonthly(game);
  const daysBetween = (a: string, b: string) => new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime();

  return (
    <>
      {running.length > 0 && (
        <section className="card">
          <h2>Velké stavby v běhu</h2>
          <ul className="plain projects">
            {running.map((p) => (
              <li key={p.id}>
                <div className="row-between">
                  <strong>{p.label}{p.overrun && <> <Badge tone="warn">prodražená</Badge></>}</strong>
                  <span className="muted small">hotovo {formatDate(p.end)}</span>
                </div>
                <Meter value={Math.max(0, Math.min(100, (daysBetween(p.start, game.date) / daysBetween(p.start, p.end)) * 100))} tone="good" />
                <span className="muted small">
                  Cena {money(p.cost)}, město přispívá {money(p.grant)}. Zaplaceno {money(p.paid)}, zbývá {money(bigRemaining(p))}, splátka asi {money(bigMonthly(game, p))} měsíčně. Na zbytek lze čerpat investiční úvěr (Finance › Financování).
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>Velké investice</h2>
        <p className="muted small">
          Stavba se platí měsíčně po dobu stavby (řádek Investice v rozpočtu), město a kraj přispějí podle vztahu ke komunitě. Rozestavěná stavba je majetek v rozvaze a odepisuje se až po dokončení. Hrozí překročení rozpočtu a zpoždění. Na splátky lze čerpat investiční úvěr (4,5 %, 10 let).
          {income > 0 && ` Komerční areál teď vydělává ${money(income)} měsíčně.`}
        </p>
        <div className="invest-grid">
          {bigProjectOptions(game).map((o) => (
            <div key={o.kind} className="invest">
              <div className="row-between">
                <strong>{o.label}</strong>
                <span className="muted small">{Math.round(o.weeks / 4.345)} měs.</span>
              </div>
              <p className="muted small">{o.description}</p>
              <ul className="plain small">
                {o.effects.map((e) => <li key={e}>• {e}</li>)}
              </ul>
              <dl className="kv">
                <dt>Cena</dt>
                <dd>{money(o.cost)}</dd>
                <dt>Příspěvek města</dt>
                <dd>{o.grant ? money(o.grant) : 'žádný'}</dd>
                <dt>Splátka během stavby</dt>
                <dd>{money(o.monthly)} / měs.</dd>
                <dt>Návratnost</dt>
                <dd>{o.payback ? `asi ${years(o.payback)}` : 'sportovní investice'}</dd>
              </dl>
              {o.blocked ? (
                <p className="muted small">{o.blocked}</p>
              ) : pending === o.kind ? (
                <span className="buttons">
                  <VoteInfo vote={previewVote(game, 'stavba', o.cost)} />
                  <button className="primary" onClick={() => { setPending(null); onResult(startBigProject(game, o.kind)); }}>Zahájit stavbu</button>
                  <button onClick={() => setPending(null)}>Zpět</button>
                </span>
              ) : (
                <button onClick={() => setPending(o.kind)}>Postavit</button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Programy klubu</h2>
        <p className="muted small">Roční náklad se platí měsíčně (řádek Programy klubu ve Výdajích). Program lze kdykoli ukončit.</p>
        <ul className="cards-list">
          {PROGRAM_ORDER.map((k) => {
            const on = hasProgram(game, k);
            const oneOff = programOneOff(game, k);
            return (
              <li key={k}>
                <div className="row-between">
                  <strong>{PROGRAMS[k].label}{on && <> <Badge tone="good">běží</Badge></>}</strong>
                  <span className="small">{money(programAnnual(game, k))} ročně{oneOff ? `, vstup ${money(oneOff)}` : ''}</span>
                </div>
                <p className="muted small">
                  {PROGRAMS[k].description}
                  {k === 'partner' && on && partnerRegion(game) && ` Partner: ${REGIONS[partnerRegion(game)!].label}.`}
                </p>
                <span className="buttons">
                  {k === 'partner' && !on && (
                    <select value={partner} onChange={(e) => setPartner(e.target.value as ScoutRegion)} aria-label="Region partnerského klubu">
                      {REGION_ORDER.filter((r) => r !== 'velke').map((r) => <option key={r} value={r}>{REGIONS[r].label}</option>)}
                    </select>
                  )}
                  {on ? (
                    <button onClick={() => onResult(stopProgram(game, k))}>Ukončit</button>
                  ) : (
                    <button className="primary" onClick={() => onResult(startProgram(game, k, k === 'partner' ? partner : undefined))}>Spustit</button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
