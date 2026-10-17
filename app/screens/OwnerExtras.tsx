import { useState } from 'react';
import {
  BUSINESS_LABEL,
  businessOf,
  cityOf,
  cityPermit,
  DIFFICULTY,
  formatDate,
  invest,
  legacyFactor,
  legacyScore,
  lobbyMayor,
  setOwnSponsor,
  STANCE_LABEL,
  ultrasOf,
  withdraw,
  businessIncome,
  type ActionResult,
  type GameState,
} from '../../engine';
import { Badge, Meter } from '../components';
import { money } from '../format';

/** Byznys majitele: příjmy z firem, investice, sponzoring vlastní firmou. */
export function BusinessCard({ game, onResult }: { game: GameState; onResult: (r: ActionResult) => void }) {
  const b = businessOf(game);
  const [amount, setAmount] = useState('10');
  const income = businessIncome(game, DIFFICULTY[game.owner.difficulty].monthlyIncome);
  const value = Math.max(0, Number(amount.replace(',', '.')) || 0) * 1_000_000;
  const sponsorStep = Math.max(1_000_000, Math.round(DIFFICULTY[game.owner.difficulty].monthlyIncome * 2 / 1_000_000) * 1_000_000);
  return (
    <section className="card">
      <div className="row-between">
        <h2>Vaše podnikání</h2>
        <Badge tone={b.mood === 'boom' ? 'good' : b.mood === 'krize' ? 'bad' : 'neutral'}>{BUSINESS_LABEL[b.mood]}</Badge>
      </div>
      <dl className="kv">
        <dt>Příjem z firem měsíčně</dt>
        <dd>{money(income)}</dd>
        <dt>Bezpečné investice (asi 3 % ročně)</dt>
        <dd>{money(b.safe)}</dd>
        <dt>Rizikové investice (v průměru 8 %, kolísá)</dt>
        <dd>{money(b.risky)}</dd>
      </dl>
      <div className="inline-form wrap">
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Částka v milionech" />
        <span>mil. Kč</span>
        <button onClick={() => onResult(invest(game, 'safe', value))}>Investovat bezpečně</button>
        <button onClick={() => onResult(invest(game, 'risky', value))}>Investovat rizikově</button>
        {b.safe > 0 && <button className="linkbtn" onClick={() => onResult(withdraw(game, 'safe'))}>Vybrat bezpečné</button>}
        {b.risky > 0 && <button className="linkbtn" onClick={() => onResult(withdraw(game, 'risky'))}>Vybrat rizikové</button>}
      </div>
      <h3>Sponzoring klubu vlastní firmou</h3>
      <p className="muted small">Rychlé peníze pro klub z příjmů vašich firem. {game.shareholders.length > 0 ? 'Spolumajitelé a svaz to berou jako střet zájmů (šedá zóna, spokojenost investorů klesne).' : 'Svaz to bere jako střet zájmů (šedá zóna).'}</p>
      <div className="buttons">
        {[0, sponsorStep, sponsorStep * 2, sponsorStep * 4].map((v) => (
          <button key={v} className={b.ownSponsor === v ? 'primary' : ''} onClick={() => onResult(setOwnSponsor(game, v))}>{v ? `${money(v)} ročně` : 'nesponzorovat'}</button>
        ))}
      </div>
    </section>
  );
}

/** Město: primátor, postoj, vztah a volby. */
export function CityCard({ game, onResult }: { game: GameState; onResult: (r: ActionResult) => void }) {
  const c = cityOf(game);
  const permit = cityPermit(game);
  return (
    <section className="card">
      <h2>Město</h2>
      <dl className="kv meters">
        <dt>Primátor</dt>
        <dd>{c.mayor}</dd>
        <dt>Postoj vedení města</dt>
        <dd>{STANCE_LABEL[c.stance]}</dd>
        <dt>Vztah s klubem</dt>
        <dd><Meter value={c.relation} /> {Math.round(c.relation)}</dd>
        <dt>Příští volby</dt>
        <dd>{formatDate(c.nextElection)}</dd>
      </dl>
      <p className="muted small">Město rozhoduje o povolení velkých staveb (stadion, komerční areál), o příspěvku na ně a o šanci na dotace. Vztah zlepšuje komunitní rozpočet, kazí ho skandály. Volby mohou přivést vedení, které klubu fandí, nebo ne.</p>
      {permit && <p className="neg small">{permit}</p>}
      <button onClick={() => onResult(lobbyMayor(game))}>Pozvat primátora na zápas do VIP</button>
    </section>
  );
}

/** Kotel a fanklub. */
export function UltrasCard({ game }: { game: GameState }) {
  const u = ultrasOf(game);
  const boycott = !!u.boycottUntil && u.boycottUntil >= game.date;
  return (
    <section className="card">
      <div className="row-between">
        <h2>Kotel a fanklub</h2>
        {boycott ? <Badge tone="bad">bojkot do {formatDate(u.boycottUntil!)}</Badge> : u.relation >= 70 ? <Badge tone="good">nadšený</Badge> : u.relation < 30 ? <Badge tone="bad">naštvaný</Badge> : <Badge>v klidu</Badge>}
      </div>
      <dl className="kv meters">
        <dt>Vztah s majitelem</dt>
        <dd><Meter value={u.relation} /> {Math.round(u.relation)}</dd>
      </dl>
      <p className="muted small">Kotel sleduje ceny vstupenek, výsledky, prodeje oblíbených opor a přísnost ochranky. Nadšený kotel zvedá domácí prostředí a návštěvu, naštvaný zlobí (víc výtržností a pokut), při bojkotu přijde méně lidí. Když je zle, požádá o schůzku.</p>
    </section>
  );
}

/** Síň slávy a odkaz éry majitele. */
export function HallOfFame({ game }: { game: GameState }) {
  const list = [...(game.trophies ?? [])].reverse();
  return (
    <section className="card">
      <div className="row-between">
        <h2>Síň slávy</h2>
        <span className="small">odkaz éry: <strong>{legacyScore(game)}</strong> bodů</span>
      </div>
      {list.length === 0 ? (
        <p className="muted small">Zatím prázdná. Tituly, poháry, postupy, Evropa, nový stadion, rekordní prodeje a odchovanci v sestavě se sem zapíšou.</p>
      ) : (
        <ul className="plain small">
          {list.map((t, i) => (
            <li key={i} className="row-between"><span>🏆 {t.text}</span><span className="muted">+{t.points}</span></li>
          ))}
        </ul>
      )}
      <p className="muted small">Odkaz přitahuje sponzory (teď +{Math.round((legacyFactor(game) - 1) * 100)} % k nabídkám).</p>
    </section>
  );
}
