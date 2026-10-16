import {
  answerEventOffer,
  conditionOf,
  formatDate,
  sectorEffect,
  sectorsOf,
  setSectors,
  stadiumCategory,
  type ActionResult,
  type GameState,
} from '../../engine';
import { Badge, Meter } from '../components';
import { money } from '../format';

const pct = (v: number) => `${v >= 1 ? '+' : '−'}${Math.abs(Math.round((v - 1) * 100))} %`;

/** Sektory stadionu: kotel a rodinný sektor. */
export function SectorsCard({ game, onResult }: { game: GameState; onResult: (r: ActionResult) => void }) {
  const club = game.clubs[game.owner.clubId];
  const s = sectorsOf(club);
  const e = sectorEffect(club);
  return (
    <section className="card">
      <h2>Sektory stadionu</h2>
      <div className="field">
        <span>Kotel</span>
        <div className="segmented">
          {(['maly', 'stredni', 'velky'] as const).map((k) => <button key={k} className={s.kotel === k ? 'active' : ''} onClick={() => onResult(setSectors(game, { kotel: k }))}>{{ maly: 'malý', stredni: 'střední', velky: 'velký' }[k]}</button>)}
        </div>
        <span className="muted small">Větší kotel: lepší domácí prostředí a vztah s kotlem, ale levnější lístky a víc výtržností.</span>
      </div>
      <div className="field">
        <span>Rodinný sektor</span>
        <div className="segmented">
          {(['zadny', 'maly', 'velky'] as const).map((k) => <button key={k} className={s.rodina === k ? 'active' : ''} onClick={() => onResult(setSectors(game, { rodina: k }))}>{{ zadny: 'žádný', maly: 'malý', velky: 'velký' }[k]}</button>)}
        </div>
        <span className="muted small">Větší rodinný sektor: víc diváků a vyšší útrata, klidnější atmosféra, levnější lístky.</span>
      </div>
      <dl className="kv">
        <dt>Domácí prostředí</dt>
        <dd>{e.homeEdge >= 0 ? '+' : '−'}{Math.abs(e.homeEdge).toLocaleString('cs-CZ')}</dd>
        <dt>Návštěva</dt>
        <dd>{pct(e.attendance)}</dd>
        <dt>Průměrná cena lístku</dt>
        <dd>{pct(e.ticketFactor)}</dd>
        <dt>Riziko výtržností</dt>
        <dd>{pct(e.incidents)}</dd>
      </dl>
    </section>
  );
}

/** Stav stadionu a licenční kategorie. */
export function ConditionCard({ game }: { game: GameState }) {
  const club = game.clubs[game.owner.clubId];
  const cond = conditionOf(club);
  const cat = stadiumCategory(club);
  return (
    <section className="card">
      <div className="row-between">
        <h2>Stav a kategorie stadionu</h2>
        <Badge tone={cat.category >= 3 ? 'good' : 'warn'}>kategorie {cat.category}</Badge>
      </div>
      <dl className="kv meters">
        <dt>Stav stadionu a zázemí</dt>
        <dd><Meter value={cond} /> {Math.round(cond)}</dd>
      </dl>
      <p className="muted small">
        Stav drží údržba (Finance › Výdaje): úsporná ho nechá chátrat, špičková ho zlepšuje. Pod 45 přicházejí poruchy, pod 25 zázemí ztratí hvězdu. Pro evropské poháry je potřeba kategorie 3, jinak klub hraje doma jinde a přijde o 15 % příjmů ligové fáze.
      </p>
      {cat.missing.length > 0 && <ul className="plain small">{cat.missing.map((m) => <li key={m}>• chybí: {m}</li>)}</ul>}
    </section>
  );
}

/** Nabídky akcí na stadionu. */
export function EventOffersCard({ game, onResult }: { game: GameState; onResult: (r: ActionResult) => void }) {
  const offers = game.eventOffers ?? [];
  const open = offers.filter((o) => !o.accepted);
  const planned = offers.filter((o) => o.accepted);
  return (
    <section className="card">
      <h2>Akce na stadionu</h2>
      <p className="muted small">Pořadatelé nabízejí konkrétní termíny. Každá akce vydělá, ale může poškodit trávník (podle druhu akce, údržby a toho, jak blízko je domácí zápas).</p>
      {open.length === 0 ? (
        <p className="muted small">Teď žádná nabídka. Nové chodí zhruba dvakrát za měsíc.</p>
      ) : (
        <ul className="cards-list">
          {open.map((o) => (
            <li key={o.id}>
              <div className="row-between">
                <strong>{o.label}</strong>
                <span className="small">{formatDate(o.date)}</span>
              </div>
              <span className="small">Příjem {money(o.income)} · riziko pro trávník {Math.round(o.damage * 100)} %{o.kind === 'reprezentace' ? ' · lepší vztah se svazem' : ''} · nabídka platí do {formatDate(o.expires)}</span>
              <span className="buttons">
                <button className="primary" onClick={() => onResult(answerEventOffer(game, o.id, true))}>Přijmout</button>
                <button onClick={() => onResult(answerEventOffer(game, o.id, false))}>Odmítnout</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {planned.length > 0 && (
        <>
          <h3>Naplánováno</h3>
          <ul className="plain small">
            {planned.map((o) => <li key={o.id} className="row-between"><span>{formatDate(o.date)} · {o.label}</span><span>{money(o.income)}</span></li>)}
          </ul>
        </>
      )}
    </section>
  );
}
