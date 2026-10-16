import { useMemo, useState } from 'react';
import { Chips, DataTable, useStoredState } from '../table';
import { PlayerLink } from '../nav';
import {
  acceptOffer,
  isForeign,
  SECTION_LABEL,
  sectionRoomFor,
  SELL_ON_DISCOUNT,
  SELL_ON_PCT,
  approveProposal,
  askingPrice,
  budgetRemaining,
  cancelNegotiation,
  clubLabel,
  directorOf,
  formatShortDate,
  FREE,
  interest,
  keyPlayerIds,
  playerValue,
  offerFee,
  offerTerms,
  playerAge,
  playerName,
  POSITION_LABEL,
  POSITION_SHORT,
  rejectOffer,
  rejectProposal,
  scouted,
  startNegotiation,
  transferWindow,
  wageBill,
  wageBudgetMonthly,
  wageDemand,
  type ActionResult,
  type GameState,
  type Player,
  type Position,
} from '../../engine';
import { Badge, Notice } from '../components';
import { money } from '../format';

type Props = { game: GameState; onChange: (g: GameState) => void };

export function Transfers({ game, onChange }: Props) {
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const apply = (r: ActionResult) => {
    if (r.state !== game) onChange(r.state);
    setMessage({ text: r.message, ok: r.ok });
  };
  const own = game.owner.clubId;
  const club = game.clubs[own];
  const window = transferWindow(game.date);
  const wages = wageBill(game, own);
  const wageBudget = wageBudgetMonthly(club);

  return (
    <div className="stack">
      <section className="card">
        <div className="row-between">
          <h2>Přestupy</h2>
          {window ? (
            <Badge tone="good">{window === 'leto' ? 'Letní okno otevřené do 31. 8.' : 'Zimní okno otevřené do 14. 2.'}</Badge>
          ) : (
            <Badge tone="neutral">Okno zavřené, otevře se {game.date.slice(5) < '07-01' && game.date.slice(5) > '02-14' ? '1. 7.' : '8. 1.'}</Badge>
          )}
        </div>
        <dl className="kv inline">
          <dt>Zbývá na odstupné</dt>
          <dd>{money(budgetRemaining(game))}</dd>
          <dt>Utraceno v sezóně</dt>
          <dd>{money(game.market.spent)}</dd>
          <dt>Z prodejů do rozpočtu</dt>
          <dd>{money(game.market.earned)}</dd>
          <dt>Platy hráčů / rozpočet</dt>
          <dd className={wages > wageBudget ? 'neg' : ''}>{money(wages)} / {money(wageBudget)}</dd>
        </dl>
        <p className="muted small">Rozpočet na odstupné a mzdový rozpočet nastavujete ve Financích. Polovina peněz z prodejů se vrací do rozpočtu.</p>
      </section>

      <Notice message={message?.text ?? null} ok={message?.ok} />

      {game.market.negotiation && <NegotiationCard game={game} onResult={apply} onClose={() => onChange(cancelNegotiation(game))} />}

      <div className="grid two">
        <Proposals game={game} onResult={apply} onReject={(id) => onChange(rejectProposal(game, id))} />
        <Offers game={game} onResult={apply} onReject={(id) => onChange(rejectOffer(game, id))} />
      </div>

      <Search game={game} onResult={apply} />
      <History game={game} />
    </div>
  );
}

function PlayerLine({ game, p }: { game: GameState; p: Player }) {
  const view = scouted(game, p);
  return (
    <span>
      <strong><PlayerLink id={p.id}>{playerName(p)}</PlayerLink></strong>{' '}
      <span className="muted">
        {POSITION_LABEL[p.position].toLowerCase()}, {playerAge(p, game.season)} let, {clubLabel(game, p.clubId)}, hodnocení{' '}
        {view.exact ? view.overall : `≈${view.overall}`} (potenciál {view.exact ? view.potential : `≈${view.potential}`})
      </span>
    </span>
  );
}

function NegotiationCard({ game, onResult, onClose }: { game: GameState; onResult: (r: ActionResult) => void; onClose: () => void }) {
  const n = game.market.negotiation!;
  const p = game.players[n.playerId];
  const [fee, setFee] = useState(String(Math.round((n.counter ?? n.askingFee * 0.85) / 1_000_000 * 10) / 10));
  const [wage, setWage] = useState(String(n.stage === 'hrac' && n.counter ? n.counter : Math.round(n.minWage * 0.9 / 1000) * 1000));
  const [years, setYears] = useState(3);
  const [split, setSplit] = useState(false);
  const done = n.stage === 'hotovo' || n.stage === 'neuspech';
  const room = p && n.stage === 'hrac' ? sectionRoomFor(game, p, Number(wage.replace(/\s/g, '')) || 0) : undefined;

  return (
    <section className="card negotiation">
      <div className="row-between">
        <h2>Jednání</h2>
        <Badge tone={n.stage === 'hotovo' ? 'good' : n.stage === 'neuspech' ? 'bad' : 'warn'}>
          {n.stage === 'klub' ? 'Jednání s klubem' : n.stage === 'hrac' ? 'Jednání s hráčem' : n.stage === 'hotovo' ? 'Hotovo' : 'Neúspěch'}
        </Badge>
      </div>
      {p && <p><PlayerLine game={game} p={p} /></p>}
      <ol className="log">
        {n.log.map((line, i) => <li key={i}>{line}</li>)}
      </ol>
      {!done && <p className="muted small">Zbývající pokusy: {n.roundsLeft}</p>}

      {n.stage === 'klub' && (
        <div className="inline-form wrap">
          <label htmlFor="neg-fee">Odstupné</label>
          <input id="neg-fee" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
          <span>mil. Kč</span>
          <button className="primary" onClick={() => onResult(offerFee(game, Number(fee.replace(',', '.')) * 1_000_000, split))}>
            Nabídnout
          </button>
          <label className="check">
            <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
            <span>Ve splátkách (polovina hned, zbytek do roka; klub chce o 5 % víc)</span>
          </label>
        </div>
      )}
      {n.stage === 'hrac' && (
        <div className="inline-form wrap">
          <label htmlFor="neg-wage">Plat</label>
          <input id="neg-wage" inputMode="numeric" value={wage} onChange={(e) => setWage(e.target.value)} />
          <span>Kč/měs.</span>
          <select id="neg-years" value={years} onChange={(e) => setYears(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>{y} {y === 1 ? 'rok' : y < 5 ? 'roky' : 'let'}</option>)}
          </select>
          <button className="primary" onClick={() => onResult(offerTerms(game, Number(wage.replace(/\s/g, '')), years))}>
            Nabídnout smlouvu
          </button>
        </div>
      )}
      {n.stage === 'hrac' && (
        <p className="muted small">
          K platu přibude odměna agentovi ve výši dvou měsíčních platů.
          {room && (
            <>
              {' '}Hráč patří do mzdové sekce <strong>{SECTION_LABEL[room.section]}</strong>:{' '}
              <span className={room.room < 0 ? 'neg' : 'pos'}>{room.room < 0 ? `přečerpá ji o ${money(-room.room)} měsíčně` : `zbude ${money(room.room)} měsíčně`}</span>.
            </>
          )}
        </p>
      )}
      <div className="buttons">
        <button onClick={onClose}>{done ? 'Zavřít' : 'Ukončit jednání'}</button>
      </div>
    </section>
  );
}

function Proposals({ game, onResult, onReject }: { game: GameState; onResult: (r: ActionResult) => void; onReject: (id: string) => void }) {
  const director = directorOf(game, game.owner.clubId);
  const list = game.market.proposals;
  return (
    <section className="card">
      <h2>Návrhy sportovního ředitele</h2>
      {!director ? (
        <p className="muted">Klub nemá sportovního ředitele. Najměte ho ve Vedení.</p>
      ) : !transferWindow(game.date) ? (
        <p className="muted">Ředitel připraví návrhy, až se otevře přestupní okno.</p>
      ) : list.length === 0 ? (
        <p className="muted">Ředitel teď nemá v rámci rozpočtu koho doporučit. Nové návrhy přinese 1. a 15. dne v měsíci.</p>
      ) : (
        <ul className="cards-list">
          {list.map((x) => {
            const p = game.players[x.playerId];
            if (!p) return null;
            return (
              <li key={x.id}>
                <PlayerLine game={game} p={p} />
                <p className="muted small">{x.note}</p>
                <p className="small">
                  Odhad: odstupné {money(x.estimatedFee)}, plat {money(x.estimatedWage)} měsíčně
                  {(() => {
                    const r = sectionRoomFor(game, p, x.estimatedWage);
                    return <> · sekce {SECTION_LABEL[r.section]}, zbude {money(r.room)}</>;
                  })()}.
                </p>
                <div className="buttons">
                  <button className="primary" onClick={() => onResult(approveProposal(game, x.id))}>Schválit, ať to dojedná</button>
                  <button onClick={() => onReject(x.id)}>Zamítnout</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Offers({ game, onResult, onReject }: { game: GameState; onResult: (r: ActionResult) => void; onReject: (id: string) => void }) {
  const list = game.market.offers;
  return (
    <section className="card">
      <h2>Nabídky na naše hráče</h2>
      {list.length === 0 ? (
        <p className="muted">Žádné nabídky. Hráče můžete nabídnout k prodeji v Kádru, nabídky pak chodí častěji.</p>
      ) : (
        <ul className="cards-list">
          {list.map((o) => {
            const p = game.players[o.playerId];
            if (!p) return null;
            return (
              <li key={o.id}>
                <span>
                  <strong>{clubLabel(game, o.buyerId)}</strong> nabízí za <strong><PlayerLink id={p.id}>{playerName(p)}</PlayerLink></strong> {money(o.fee)}
                </span>
                <p className="muted small">
                  Tržní hodnota {money(playerValue(game, p))}. Platí do {formatShortDate(o.expires)}.
                </p>
                <p className="small">
                  <Badge tone={o.advice === 'prijmout' ? 'good' : 'warn'}>{o.advice === 'prijmout' ? 'Ředitel: přijmout' : 'Ředitel: odmítnout'}</Badge>{' '}
                  {o.note}
                </p>
                {o.instalments && <p className="small muted">Kupec platí ve splátkách: polovina hned, zbytek do roka.</p>}
                <div className="buttons">
                  <button className="primary" onClick={() => onResult(acceptOffer(game, o.id))}>Prodat</button>
                  {!isForeign(o.buyerId) && (
                    <button onClick={() => onResult(acceptOffer(game, o.id, true))} title="Méně peněz teď, podíl z příštího přestupu hráče">
                      Prodat za {money(o.fee * (1 - SELL_ON_DISCOUNT))} + {Math.round(SELL_ON_PCT * 100)} % z dalšího prodeje
                    </button>
                  )}
                  <button onClick={() => onReject(o.id)}>Odmítnout</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const SEARCH_DEFAULT = {
  position: '' as Position | '',
  competition: '',
  minRating: '',
  maxPrice: '',
  minAge: '',
  maxAge: '',
  interestedOnly: true,
};

function Search({ game, onResult }: { game: GameState; onResult: (r: ActionResult) => void }) {
  const [f, setF] = useStoredState('filtr:hledani', SEARCH_DEFAULT);
  const own = game.owner.clubId;
  const open = !!transferWindow(game.date);
  const comps = Object.values(game.competitions).sort((a, b) => a.tier - b.tier);

  const rows = useMemo(() => {
    const keys = keyPlayerIds(game);
    const compOf = new Map<string, string>();
    for (const c of comps) for (const id of c.clubIds) compOf.set(id, c.id);
    const min = Number(f.minRating) || 0;
    const max = f.maxPrice ? Number(f.maxPrice.replace(',', '.')) * 1_000_000 : Infinity;
    const minAge = Number(f.minAge) || 0;
    const maxAge = Number(f.maxAge) || 99;
    return Object.values(game.players)
      .filter((p) => p.clubId !== own && (!f.position || p.position === f.position))
      .filter((p) => !f.competition || (f.competition === 'volni' ? p.clubId === FREE : compOf.get(p.clubId) === f.competition))
      .filter((p) => {
        const age = playerAge(p, game.season);
        return age >= minAge && age <= maxAge;
      })
      .map((p) => ({ p, view: scouted(game, p), age: playerAge(p, game.season) }))
      .filter((x) => x.view.overall >= min && (!f.interestedOnly || interest(game, x.p, own).ok))
      .map((x) => ({ ...x, price: askingPrice(game, x.p, keys) }))
      .filter((x) => x.price <= max)
      .map((x) => ({ ...x, wage: wageDemand(game, x.p, own), compName: x.p.clubId === FREE ? 'volný' : (game.competitions[compOf.get(x.p.clubId) ?? '']?.name ?? '') }));
  }, [game, f, own, comps]);

  const set = (patch: Partial<typeof SEARCH_DEFAULT>) => setF({ ...f, ...patch });

  return (
    <section className="card">
      <div className="row-between">
        <h2>Hledat hráče</h2>
        <button onClick={() => setF(SEARCH_DEFAULT)}>Zrušit filtry</button>
      </div>
      <div className="filters">
        <Chips
          options={(['GK', 'DF', 'MF', 'FW'] as Position[]).map((p) => ({ value: p, label: POSITION_LABEL[p] }))}
          value={f.position}
          onChange={(position) => set({ position })}
          allLabel="všechny pozice"
        />
      </div>
      <div className="filters">
        <label>
          <span>Soutěž</span>
          <select id="f-comp" value={f.competition} onChange={(e) => set({ competition: e.target.value })}>
            <option value="">všechny</option>
            {comps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="volni">volní hráči</option>
          </select>
        </label>
        <label>
          <span>Hodnocení od</span>
          <input id="f-min" inputMode="numeric" value={f.minRating} placeholder="0" onChange={(e) => set({ minRating: e.target.value })} />
        </label>
        <label>
          <span>Věk od – do</span>
          <span className="range">
            <input id="f-age-min" inputMode="numeric" value={f.minAge} placeholder="16" onChange={(e) => set({ minAge: e.target.value })} />
            <input id="f-age-max" inputMode="numeric" value={f.maxAge} placeholder="40" onChange={(e) => set({ maxAge: e.target.value })} />
          </span>
        </label>
        <label>
          <span>Cena do (mil. Kč)</span>
          <input id="f-max" inputMode="decimal" value={f.maxPrice} placeholder="bez limitu" onChange={(e) => set({ maxPrice: e.target.value })} />
        </label>
        <label className="check">
          <input id="f-interest" type="checkbox" checked={f.interestedOnly} onChange={(e) => set({ interestedOnly: e.target.checked })} />
          <span>jen se zájmem o náš klub</span>
        </label>
      </div>
      <p className="muted small">Hodnocení cizích hráčů jsou odhady skautů (≈). Čím lepší sportovní ředitel, tím přesnější. Kliknutím na hlavičku sloupce změníte řazení.</p>
      <DataTable
        id="hledani"
        rows={rows}
        rowKey={(x) => x.p.id}
        initialSort={{ key: 'ovr', dir: 'desc' }}
        limit={50}
        empty="Filtrům neodpovídá žádný hráč."
        columns={[
          { key: 'name', label: 'Hráč', value: (x) => x.p.lastName, render: (x) => <PlayerLink id={x.p.id}>{playerName(x.p)}</PlayerLink> },
          { key: 'pos', label: 'Poz.', value: (x) => ['GK', 'DF', 'MF', 'FW'].indexOf(x.p.position), render: (x) => <span title={POSITION_LABEL[x.p.position]}>{POSITION_SHORT[x.p.position]}</span>, className: () => 'muted' },
          { key: 'age', label: 'Věk', num: true, value: (x) => x.age },
          { key: 'club', label: 'Klub', value: (x) => clubLabel(game, x.p.clubId) },
          { key: 'comp', label: 'Soutěž', hideSm: true, value: (x) => x.compName, className: () => 'muted' },
          { key: 'ovr', label: 'Hodn.', num: true, value: (x) => x.view.overall, render: (x) => <span className="rating">≈{x.view.overall}</span> },
          { key: 'pot', label: 'Pot.', num: true, hideSm: true, value: (x) => x.view.potential, render: (x) => `≈${x.view.potential}`, className: () => 'muted' },
          { key: 'price', label: 'Cena', num: true, value: (x) => x.price, render: (x) => (x.price ? money(x.price) : 'zdarma') },
          { key: 'wage', label: 'Plat (nárok)', num: true, hideSm: true, value: (x) => x.wage, render: (x) => money(x.wage) },
          {
            key: 'act',
            label: '',
            render: (x) =>
              interest(game, x.p, own).ok ? (
                <button disabled={!open} onClick={() => onResult(startNegotiation(game, x.p.id))}>Jednat</button>
              ) : (
                <span className="muted small">nemá zájem</span>
              ),
          },
        ]}
      />
      {!open && <p className="muted small">Jednat lze jen v přestupním okně (1. 7. – 31. 8. a 8. 1. – 14. 2.).</p>}
    </section>
  );
}

function History({ game }: { game: GameState }) {
  const own = game.owner.clubId;
  const [dir, setDir] = useStoredState('filtr:prestupy-historie', { v: '' as '' | 'in' | 'out' });
  const all = game.market.history.filter((h) => h.fromId === own || h.toId === own);
  if (!all.length) return null;
  const rows = all
    .map((h, i) => ({ ...h, i, incoming: h.toId === own }))
    .filter((h) => !dir.v || (dir.v === 'in' ? h.incoming : !h.incoming));
  return (
    <section className="card">
      <div className="row-between">
        <h2>Přestupy klubu</h2>
        <Chips options={[{ value: 'in', label: 'příchody' }, { value: 'out', label: 'odchody' }]} value={dir.v} onChange={(v) => setDir({ v })} />
      </div>
      <DataTable
        id="prestupy-historie"
        rows={rows}
        rowKey={(h) => String(h.i)}
        initialSort={{ key: 'date', dir: 'desc' }}
        columns={[
          { key: 'date', label: 'Datum', value: (h) => h.date, render: (h) => formatShortDate(h.date), className: () => 'muted' },
          { key: 'name', label: 'Hráč', value: (h) => h.playerName },
          { key: 'club', label: 'Odkud / kam', value: (h) => clubLabel(game, h.incoming ? h.fromId : h.toId), render: (h) => (h.incoming ? `z ${clubLabel(game, h.fromId)}` : `do ${clubLabel(game, h.toId)}`) },
          { key: 'fee', label: 'Odstupné', num: true, value: (h) => (h.incoming ? -h.fee : h.fee), render: (h) => (h.fee ? money(h.incoming ? -h.fee : h.fee) : 'zdarma'), className: (h) => (h.incoming ? 'neg' : 'pos') },
        ]}
      />
    </section>
  );
}
