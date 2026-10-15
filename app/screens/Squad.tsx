import { useEffect, useRef, useState } from 'react';
import {
  contractExpiring,
  marketValue,
  playerAge,
  playerName,
  POSITION_LABEL,
  POSITION_SHORT,
  releaseCost,
  releasePlayer,
  renewalDemand,
  renewContract,
  squadOf,
  teamStrength,
  toggleListed,
  type ActionResult,
  type GameState,
  type Player,
  type Position,
} from '../../engine';
import { Badge, Notice } from '../components';
import { money } from '../format';

const ORDER: Position[] = ['GK', 'DF', 'MF', 'FW'];

type Props = { game: GameState; onChange: (g: GameState) => void };

export function Squad({ game, onChange }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const apply = (r: ActionResult) => {
    if (r.state !== game) onChange(r.state);
    setMessage({ text: r.message, ok: r.ok });
    if (r.ok) setOpen(null);
  };

  const squad = squadOf(game, game.owner.clubId).sort(
    (a, b) => ORDER.indexOf(a.position) - ORDER.indexOf(b.position) || b.overall - a.overall,
  );
  const wages = squad.reduce((s, p) => s + p.wage, 0);
  const value = squad.reduce((s, p) => s + marketValue(p, game.season), 0);
  const expiring = squad.filter((p) => contractExpiring(game, p)).length;
  const selected = open ? squad.find((p) => p.id === open) : undefined;
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (open) panel.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [open]);

  return (
    <div className="stack">
      <section className="card">
        <h2>Kádr</h2>
        <p className="muted">
          Sestavu určuje trenér. Kliknutím na hráče můžete prodloužit smlouvu, nabídnout ho k prodeji nebo ho uvolnit.
        </p>
        <dl className="kv inline">
          <dt>Hráčů</dt><dd>{squad.length}</dd>
          <dt>Síla základní sestavy</dt><dd>{teamStrength(squad).toFixed(1)}</dd>
          <dt>Platy měsíčně</dt><dd>{money(wages)}</dd>
          <dt>Hodnota kádru</dt><dd>{money(value)}</dd>
        </dl>
        {expiring > 0 && (
          <p className="warning">
            {expiring} hráčům končí smlouva 30. 6. {game.season + 1}. Sportovní ředitel prodlouží jen důležité hráče, ostatní odejdou zadarmo.
          </p>
        )}
      </section>

      <Notice message={message?.text ?? null} ok={message?.ok} />

      {selected && (
        <section className="card" ref={panel}>
          <div className="row-between">
            <h2>
              {playerName(selected)}{' '}
              <span className="muted">· {POSITION_LABEL[selected.position].toLowerCase()}, {playerAge(selected, game.season)} let</span>
            </h2>
            <button onClick={() => setOpen(null)}>Zavřít</button>
          </div>
          <PlayerActions key={selected.id} game={game} p={selected} onResult={apply} onToggle={() => onChange(toggleListed(game, selected.id))} />
        </section>
      )}

      <section className="card">
        <div className="table-wrap">
          <table className="clickable">
            <thead>
              <tr>
                <th>Hráč</th><th>Poz.</th><th className="num">Věk</th>
                <th className="num">Hodn.</th><th className="num">Pot.</th>
                <th className="num hide-sm">Plat/měs.</th><th className="num">Smlouva</th>
                <th className="num hide-sm">Záp.</th><th className="num hide-sm">Góly</th><th className="num hide-sm">Hodnota</th>
              </tr>
            </thead>
            <tbody>
              {squad.map((p) => (
                  <tr key={p.id} className={open === p.id ? 'open-row' : ''} onClick={() => setOpen(open === p.id ? null : p.id)}>
                    <td>
                      {playerName(p)}{' '}
                      {game.market.listed.includes(p.id) && <Badge tone="warn">na prodej</Badge>}
                    </td>
                    <td className="muted" title={POSITION_LABEL[p.position]}>{POSITION_SHORT[p.position]}</td>
                    <td className="num">{playerAge(p, game.season)}</td>
                    <td className="num"><span className="rating">{p.overall}</span></td>
                    <td className="num muted">{p.potential}</td>
                    <td className="num hide-sm">{money(p.wage)}</td>
                    <td className={`num ${contractExpiring(game, p) ? 'neg' : ''}`}>{p.contractUntil}</td>
                    <td className="num hide-sm">{p.apps}</td>
                    <td className="num hide-sm">{p.goals}</td>
                    <td className="num hide-sm">{money(marketValue(p, game.season))}</td>
                  </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function PlayerActions({
  game,
  p,
  onResult,
  onToggle,
}: {
  game: GameState;
  p: Player;
  onResult: (r: ActionResult) => void;
  onToggle: () => void;
}) {
  const demand = renewalDemand(game, p);
  const [wage, setWage] = useState(String(demand));
  const [years, setYears] = useState(3);
  const [confirmRelease, setConfirmRelease] = useState(false);
  const listed = game.market.listed.includes(p.id);

  return (
    <div className="player-actions">
      <div>
        <h3>Prodloužit smlouvu</h3>
        <p className="muted small">Hráč si řekl o {money(demand)} měsíčně. Teď bere {money(p.wage)}.</p>
        <div className="inline-form wrap">
          <input id={`renew-${p.id}`} inputMode="numeric" value={wage} onChange={(e) => setWage(e.target.value)} />
          <span>Kč/měs.</span>
          <select value={years} onChange={(e) => setYears(Number(e.target.value))}>
            {[1, 2, 3, 4].map((y) => <option key={y} value={y}>do {game.season + y}</option>)}
          </select>
          <button className="primary" onClick={() => onResult(renewContract(game, p.id, Number(wage.replace(/\s/g, '')), years))}>
            Nabídnout
          </button>
        </div>
      </div>
      <div>
        <h3>Prodej a odchod</h3>
        <div className="buttons">
          <button onClick={onToggle}>{listed ? 'Stáhnout z prodeje' : 'Nabídnout k prodeji'}</button>
          {confirmRelease ? (
            <>
              <button className="danger" onClick={() => onResult(releasePlayer(game, p.id))}>
                Uvolnit za {money(releaseCost(game, p))}
              </button>
              <button onClick={() => setConfirmRelease(false)}>Zpět</button>
            </>
          ) : (
            <button className="danger" onClick={() => setConfirmRelease(true)}>Uvolnit ze smlouvy</button>
          )}
        </div>
        <p className="muted small">Uvolnění stojí polovinu platu do konce smlouvy (nejvýš za 12 měsíců).</p>
      </div>
    </div>
  );
}
