import { useEffect, useRef, useState } from 'react';
import {
  contractExpiring,
  playerValue,
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
import { Chips, DataTable, useStoredState } from '../table';
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
  const value = squad.reduce((s, p) => s + playerValue(game, p), 0);
  const expiring = squad.filter((p) => contractExpiring(game, p)).length;
  const selected = open ? squad.find((p) => p.id === open) : undefined;
  const [filter, setFilter] = useStoredState('filtr:kadr', { position: '' as Position | '', expiring: false, listed: false, text: '' });
  const rows = squad.filter(
    (p) =>
      (!filter.position || p.position === filter.position) &&
      (!filter.expiring || contractExpiring(game, p)) &&
      (!filter.listed || game.market.listed.includes(p.id)) &&
      (!filter.text || playerName(p).toLowerCase().includes(filter.text.toLowerCase())),
  );
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
        <div className="filters">
          <Chips
            options={ORDER.map((pos) => ({ value: pos, label: POSITION_LABEL[pos] }))}
            value={filter.position}
            onChange={(position) => setFilter({ ...filter, position })}
            allLabel="všechny pozice"
          />
          <label className="check">
            <input id="sq-expiring" type="checkbox" checked={filter.expiring} onChange={(e) => setFilter({ ...filter, expiring: e.target.checked })} />
            <span>končí smlouva</span>
          </label>
          <label className="check">
            <input id="sq-listed" type="checkbox" checked={filter.listed} onChange={(e) => setFilter({ ...filter, listed: e.target.checked })} />
            <span>na prodej</span>
          </label>
          <label>
            <span>Hledat jméno</span>
            <input id="sq-name" value={filter.text} placeholder="příjmení" onChange={(e) => setFilter({ ...filter, text: e.target.value })} />
          </label>
        </div>
        <DataTable
          id="kadr"
          rows={rows}
          rowKey={(p) => p.id}
          initialSort={{ key: 'pos', dir: 'asc' }}
          onRowClick={(p) => setOpen(open === p.id ? null : p.id)}
          rowClassName={(p) => (open === p.id ? 'open-row' : '')}
          empty="Filtrům neodpovídá žádný hráč."
          columns={[
            {
              key: 'name',
              label: 'Hráč',
              value: (p) => p.lastName,
              render: (p) => (
                <>
                  {playerName(p)} {game.market.listed.includes(p.id) && <Badge tone="warn">na prodej</Badge>}
                </>
              ),
            },
            { key: 'pos', label: 'Poz.', value: (p) => ORDER.indexOf(p.position) * 100 + (100 - p.overall), render: (p) => <span title={POSITION_LABEL[p.position]}>{POSITION_SHORT[p.position]}</span>, className: () => 'muted' },
            { key: 'age', label: 'Věk', num: true, value: (p) => playerAge(p, game.season) },
            { key: 'ovr', label: 'Hodn.', num: true, value: (p) => p.overall, render: (p) => <span className="rating">{p.overall}</span> },
            { key: 'pot', label: 'Pot.', num: true, value: (p) => p.potential, className: () => 'muted' },
            { key: 'wage', label: 'Plat/měs.', num: true, hideSm: true, value: (p) => p.wage, render: (p) => money(p.wage) },
            { key: 'contract', label: 'Smlouva', num: true, value: (p) => p.contractUntil, className: (p) => (contractExpiring(game, p) ? 'neg' : '') },
            { key: 'apps', label: 'Záp.', num: true, hideSm: true, value: (p) => p.apps },
            { key: 'goals', label: 'Góly', num: true, hideSm: true, value: (p) => p.goals },
            { key: 'value', label: 'Hodnota', num: true, value: (p) => playerValue(game, p), render: (p) => money(playerValue(game, p)) },
          ]}
        />
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
