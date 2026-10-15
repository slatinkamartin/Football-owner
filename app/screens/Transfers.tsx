import { useMemo, useState } from 'react';
import {
  acceptOffer,
  approveProposal,
  askingPrice,
  budgetRemaining,
  cancelNegotiation,
  clubLabel,
  directorOf,
  formatShortDate,
  FREE,
  interest,
  marketValue,
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
      <strong>{playerName(p)}</strong>{' '}
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
  const done = n.stage === 'hotovo' || n.stage === 'neuspech';

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
          <button className="primary" onClick={() => onResult(offerFee(game, Number(fee.replace(',', '.')) * 1_000_000))}>
            Nabídnout
          </button>
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
      {n.stage === 'hrac' && <p className="muted small">K platu přibude odměna agentovi ve výši dvou měsíčních platů.</p>}
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
                <p className="small">Odhad: odstupné {money(x.estimatedFee)}, plat {money(x.estimatedWage)} měsíčně.</p>
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
                  <strong>{clubLabel(game, o.buyerId)}</strong> nabízí za <strong>{playerName(p)}</strong> {money(o.fee)}
                </span>
                <p className="muted small">
                  Tržní hodnota {money(marketValue(p, game.season))}. Platí do {formatShortDate(o.expires)}.
                </p>
                <p className="small">
                  <Badge tone={o.advice === 'prijmout' ? 'good' : 'warn'}>{o.advice === 'prijmout' ? 'Ředitel: přijmout' : 'Ředitel: odmítnout'}</Badge>{' '}
                  {o.note}
                </p>
                <div className="buttons">
                  <button className="primary" onClick={() => onResult(acceptOffer(game, o.id))}>Prodat</button>
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

function Search({ game, onResult }: { game: GameState; onResult: (r: ActionResult) => void }) {
  const [position, setPosition] = useState<Position | ''>('');
  const [minRating, setMinRating] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [freeOnly, setFreeOnly] = useState(false);
  const [interestedOnly, setInterestedOnly] = useState(true);
  const own = game.owner.clubId;
  const open = !!transferWindow(game.date);

  const results = useMemo(() => {
    const min = Number(minRating) || 0;
    const max = maxPrice ? Number(maxPrice.replace(',', '.')) * 1_000_000 : Infinity;
    return Object.values(game.players)
      .filter((p) => p.clubId !== own && (!position || p.position === position) && (!freeOnly || p.clubId === FREE))
      .map((p) => ({ p, view: scouted(game, p) }))
      .filter((x) => x.view.overall >= min && (!interestedOnly || interest(game, x.p, own).ok))
      .sort((a, b) => b.view.overall - a.view.overall)
      .slice(0, 300)
      .map((x) => ({ ...x, price: askingPrice(game, x.p) }))
      .filter((x) => x.price <= max)
      .slice(0, 40);
  }, [game, position, minRating, maxPrice, freeOnly, interestedOnly, own]);

  return (
    <section className="card">
      <h2>Hledat hráče</h2>
      <div className="filters">
        <label>
          <span>Pozice</span>
          <select id="f-pos" value={position} onChange={(e) => setPosition(e.target.value as Position | '')}>
            <option value="">všechny</option>
            {(['GK', 'DF', 'MF', 'FW'] as Position[]).map((p) => <option key={p} value={p}>{POSITION_LABEL[p]}</option>)}
          </select>
        </label>
        <label>
          <span>Hodnocení od</span>
          <input id="f-min" inputMode="numeric" value={minRating} placeholder="0" onChange={(e) => setMinRating(e.target.value)} />
        </label>
        <label>
          <span>Cena do (mil. Kč)</span>
          <input id="f-max" inputMode="decimal" value={maxPrice} placeholder="bez limitu" onChange={(e) => setMaxPrice(e.target.value)} />
        </label>
        <label className="check">
          <input id="f-free" type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} />
          <span>jen volní hráči</span>
        </label>
        <label className="check">
          <input id="f-interest" type="checkbox" checked={interestedOnly} onChange={(e) => setInterestedOnly(e.target.checked)} />
          <span>jen hráči se zájmem o náš klub</span>
        </label>
      </div>
      <p className="muted small">Hodnocení cizích hráčů jsou odhady skautů (≈). Čím lepší sportovní ředitel, tím přesnější.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Hráč</th>
              <th>Poz.</th>
              <th className="num">Věk</th>
              <th>Klub</th>
              <th className="num">Hodn.</th>
              <th className="num hide-sm">Pot.</th>
              <th className="num">Cena</th>
              <th className="num hide-sm">Plat (nárok)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {results.map(({ p, view, price }) => {
              const want = interest(game, p, own);
              return (
                <tr key={p.id}>
                  <td>{playerName(p)}</td>
                  <td className="muted" title={POSITION_LABEL[p.position]}>{POSITION_SHORT[p.position]}</td>
                  <td className="num">{playerAge(p, game.season)}</td>
                  <td>{clubLabel(game, p.clubId)}</td>
                  <td className="num"><span className="rating">≈{view.overall}</span></td>
                  <td className="num hide-sm muted">≈{view.potential}</td>
                  <td className="num">{price ? money(price) : 'zdarma'}</td>
                  <td className="num hide-sm">{money(wageDemand(game, p, own))}</td>
                  <td className="num">
                    {want.ok ? (
                      <button disabled={!open} onClick={() => onResult(startNegotiation(game, p.id))}>Jednat</button>
                    ) : (
                      <span className="muted small">nemá zájem</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!open && <p className="muted small">Jednat lze jen v přestupním okně (1. 7. – 31. 8. a 8. 1. – 14. 2.).</p>}
    </section>
  );
}

function History({ game }: { game: GameState }) {
  const own = game.owner.clubId;
  const list = game.market.history.filter((h) => h.fromId === own || h.toId === own).slice(0, 15);
  if (!list.length) return null;
  return (
    <section className="card">
      <h2>Přestupy klubu</h2>
      <table>
        <tbody>
          {list.map((h, i) => (
            <tr key={i}>
              <td className="muted">{formatShortDate(h.date)}</td>
              <td>{h.playerName}</td>
              <td className="muted">{h.toId === own ? `z ${clubLabel(game, h.fromId)}` : `do ${clubLabel(game, h.toId)}`}</td>
              <td className={`num ${h.toId === own ? 'neg' : 'pos'}`}>{h.fee ? money(h.toId === own ? -h.fee : h.fee) : 'zdarma'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
