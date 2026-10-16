import { useState } from 'react';
import {
  activeRegions,
  buyLoanee,
  clubLabel,
  foreignBlocked,
  foreignMarket,
  foreignPrice,
  foreignView,
  networkAnnual,
  nonEuCount,
  NON_EU_LIMIT,
  partnerRegion,
  playerAge,
  playerName,
  POSITION_SHORT,
  REGION_ORDER,
  REGIONS,
  releasePlayer,
  setNetwork,
  signForeign,
  squadOf,
  transferWindow,
  updatePolicy,
  watchTarget,
  WATCH_LIMIT,
  type ActionResult,
  type GameState,
} from '../../engine';
import { Badge } from '../components';
import { money } from '../format';
import { PlayerLink } from '../nav';
import { Chips, useStoredState } from '../table';

type Props = { game: GameState; onChange: (g: GameState) => void; onResult: (r: ActionResult) => void };

/** Zahraniční trh: skautské sítě v regionech, vyhlédnutí hráči, hostování a opce. */
export function ForeignMarket({ game, onChange, onResult }: Props) {
  const [region, setRegion] = useStoredState<string>('filtr:zahranici', '');
  const [pending, setPending] = useState<string | null>(null);
  const market = foreignMarket(game);
  const active = activeRegions(game);
  const partner = partnerRegion(game);
  const club = game.clubs[game.owner.clubId];
  const watching = market.targets.filter((t) => t.watching).length;
  const targets = market.targets.filter((t) => !region || t.region === region).sort((a, b) => foreignView(game, b).est - foreignView(game, a).est);
  const loanees = squadOf(game, club.id).filter((p) => p.loan);
  const open = !!transferWindow(game.date);
  const yearly = market.networks.reduce((a, r) => a + networkAnnual(game, r), 0);

  return (
    <section className="card">
      <div className="row-between">
        <h2>Zahraniční trh</h2>
        <span className="buttons">
          <Badge tone={nonEuCount(game) >= NON_EU_LIMIT ? 'bad' : 'neutral'}>Mimo EU v kádru: {nonEuCount(game)} / {NON_EU_LIMIT}</Badge>
          <Badge>Sledovaní: {watching} / {WATCH_LIMIT}</Badge>
        </span>
      </div>
      <p className="muted small">
        Skautská síť v regionu stojí roční poplatek (řádek Zahraniční skauting ve Výdajích) a skauti v ní vyhledají pět hráčů; trh se obnoví 1. 7. a 1. 12. Hodnocení je odhad s rozpětím: zúží ho sledování (každý týden), skautské oddělení, schopný ředitel, analytika a partnerský klub. Cizinec se první měsíce zabydluje a hraje pod svou úroveň. Hráči mimo EU potřebují pracovní povolení.
      </p>

      <div className="region-grid">
        {REGION_ORDER.map((r) => {
          const on = active.includes(r);
          const free = partner === r;
          return (
            <div key={r} className={`region ${on ? 'on' : ''}`}>
              <div className="row-between">
                <strong>{REGIONS[r].label}</strong>
                {on && <Badge tone="good">{free ? 'partner' : 'aktivní'}</Badge>}
              </div>
              <p className="muted small">{REGIONS[r].note}</p>
              <div className="row-between">
                <span className="small">{free ? 'zdarma (partnerský klub)' : `${money(networkAnnual(game, r))} ročně`}</span>
                {!free && (
                  <button className={on ? '' : 'primary'} onClick={() => onResult(setNetwork(game, r, !on))}>
                    {on ? 'Zrušit síť' : 'Otevřít síť'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {yearly > 0 && <p className="muted small">Skautské sítě celkem {money(yearly)} ročně.</p>}

      <label className="check">
        <input type="checkbox" checked={club.policy.directorMarket === 'zahranici'} onChange={(e) => onChange(updatePolicy(game, { directorMarket: e.target.checked ? 'zahranici' : 'doma' }))} />
        <span>Sportovní ředitel smí sám kupovat i v regionech se skautskou sítí (podle odhadu skautů, tedy s rizikem; jedna posila nejvýš za 60 % zbývajícího rozpočtu)</span>
      </label>

      {active.length > 0 && (
        <>
          <div className="filters">
            <Chips options={active.map((r) => ({ value: r, label: REGIONS[r].label }))} value={region} onChange={(v) => setRegion(v)} allLabel="všechny regiony" />
          </div>
          {targets.length === 0 ? (
            <p className="muted small">Skauti tu teď nikoho nevyhlédli.</p>
          ) : (
            <div className="table-wrap">
              <table className="foreign-table">
                <thead>
                  <tr>
                    <th>Hráč</th>
                    <th>Poz.</th>
                    <th className="num">Věk</th>
                    <th className="num">Hodnocení</th>
                    <th className="num hide-sm">Potenciál</th>
                    <th className="num">Cena</th>
                    <th className="num hide-sm">Plat</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {targets.map((t) => {
                    const view = foreignView(game, t);
                    const price = foreignPrice(game, t);
                    const blocked = foreignBlocked(game, t, price);
                    const p = t.player;
                    return (
                      <tr key={t.id}>
                        <td className="wrap">
                          <strong>{playerName(p)}</strong>
                          <div className="muted small">
                            {p.nationality}, {clubLabel(game, t.clubId)} {p.nonEu && <Badge tone="warn">mimo EU</Badge>}
                          </div>
                        </td>
                        <td>{POSITION_SHORT[p.position]}</td>
                        <td className="num">{playerAge(p, game.season)}</td>
                        <td className="num" title={`odhad ${view.est}`}>{view.lo === view.hi ? view.lo : `${view.lo}–${view.hi}`}</td>
                        <td className="num hide-sm">{view.potLo === view.potHi ? view.potLo : `${view.potLo}–${view.potHi}`}</td>
                        <td className="num">
                          {t.loan ? (
                            <span>hostování {money(t.loan.fee)}<div className="muted small">opce {money(t.loan.buyOption)}</div></span>
                          ) : (
                            money(price.fee)
                          )}
                        </td>
                        <td className="num hide-sm">{money(price.wage)}</td>
                        <td className="num">
                          {pending === t.id ? (
                            <span className="confirm-box">
                              <span className="small">
                                Celkem {money(price.total)}: {t.loan ? 'hostování' : 'odstupné'} {money(price.fee)}, agent {money(price.agent)}{price.permit ? `, povolení ${money(price.permit)}` : ''}. Plat {money(price.wage)} měsíčně.
                              </span>
                              {blocked ? <span className="neg small">{blocked}</span> : null}
                              <span className="buttons end">
                                <button className="primary" disabled={!!blocked} onClick={() => { setPending(null); onResult(signForeign(game, t.id)); }}>
                                  {t.loan ? 'Vzít na hostování' : 'Koupit'}
                                </button>
                                <button onClick={() => setPending(null)}>Zpět</button>
                              </span>
                            </span>
                          ) : (
                            <span className="buttons end">
                              <button onClick={() => onResult(watchTarget(game, t.id, !t.watching))} title="Sledování zpřesní odhad každý týden">
                                {t.watching ? `Sleduje se (${t.watched ?? 0} t.)` : 'Sledovat'}
                              </button>
                              <button className="primary" disabled={!open} title={open ? '' : 'Podepsat lze jen v přestupním okně'} onClick={() => setPending(t.id)}>
                                {t.loan ? 'Hostovat' : 'Koupit'}
                              </button>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {loanees.length > 0 && (
        <>
          <h3>Hráči na hostování</h3>
          <ul className="plain">
            {loanees.map((p) => (
              <li key={p.id} className="row-between">
                <span>
                  <PlayerLink id={p.id}>{playerName(p)}</PlayerLink> <span className="muted small">z {clubLabel(game, p.loan!.fromId)}, vrátí se 30. 6.</span>
                </span>
                <span className="buttons end">
                  <button className="primary" onClick={() => onResult(buyLoanee(game, p.id))}>Využít opci {money(p.loan!.buyOption)}</button>
                  <button onClick={() => onResult(releasePlayer(game, p.id))}>Ukončit hostování</button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

