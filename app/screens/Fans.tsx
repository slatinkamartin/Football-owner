import { useState, type ReactNode } from 'react';
import {
  awayTripOption,
  celebrate,
  celebrationCost,
  commitmentDecide,
  councilDecide,
  councilView,
  fansOf,
  fansSummary,
  formatShortDate,
  setAwayTrip,
  type ActionResult,
  type GameState,
} from '../../engine';
import { Meter, Notice } from '../components';
import { money } from '../format';

/**
 * W3: karta „Fanoušci“ na Přehledu. Nálada, kotel a město v jednom řádku, pod tím jen to, co je
 * zrovna aktuální: oslava, výjezd, závazek z ankety, nápad rady a běžící anketa. Každá volba má
 * výchozí možnost, která se použije sama.
 */
export function FansCard({ game, onChange }: { game: GameState; onChange: (g: GameState) => void }) {
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [all, setAll] = useState(false);
  const f = fansOf(game);
  const sum = fansSummary(game);
  const council = councilView(game);
  const trip = awayTripOption(game);
  const poll = f.poll;
  const run = (r: ActionResult) => {
    if (r.ok) onChange(r.state);
    setMsg({ text: r.message, ok: r.ok });
  };
  const cost = (v: number) => (v ? money(v) : 'zdarma');
  const busy = !!(f.celebration || trip || f.commitment || council || poll);
  // Aktuální rozhodnutí (výchozí volby platí samy). Víc než dvě najednou se sbalí, ať karta zůstane krátká.
  const blocks: ReactNode[] = [];
  if (f.celebration)
    blocks.push(
      <Block key="oslava" title={`Oslava: ${f.celebration.reason}`} note={`${f.celebration.label}. Bez volby do ${formatShortDate(f.celebration.deadline)} bude skromná.`}>
        <Choice title="Velká na náměstí" impact={`${cost(celebrationCost(game, 'velka'))} · nálada, město, média ++`} onClick={() => run(celebrate(game, 'velka'))} />
        <Choice title="Skromná u stadionu" impact={`${cost(celebrationCost(game, 'skromna'))} · nálada +3, město +3`} recommended onClick={() => run(celebrate(game, 'skromna'))} />
        <Choice title="Žádná" impact="zdarma · nálada −3, média −2" onClick={() => run(celebrate(game, 'zadna'))} />
      </Block>,
    );
  if (trip)
    blocks.push(
      <Block key="vyjezd" title={`Výjezd: ${trip.match.label}`} note={`${formatShortDate(trip.match.date)} · platí se v den zápasu.`}>
        {trip.options.map((o) => (
          <Choice key={o.id} title={o.label} impact={`${cost(o.cost)} · ${o.fans.toLocaleString('cs-CZ')} fanoušků · ${o.hint}`} selected={trip.chosen === o.id} onClick={() => run(setAwayTrip(game, o.id))} />
        ))}
      </Block>,
    );
  if (f.commitment)
    blocks.push(
      <Block key="zavazek" title={`Anketa rozhodla: ${f.commitment.label}`} note={`Výsledek je závazek. Bez volby do ${formatShortDate(f.commitment.due)} ho klub splní.`}>
        <Choice title={f.commitment.respectLabel} impact={`${cost(f.commitment.cost)} · fanoušci +, ${f.commitment.kind === 'dres' ? 'fanshop navíc' : f.commitment.kind === 'hymna' ? 'kotel +3' : 'město +1'}`} recommended onClick={() => run(commitmentDecide(game, 'splnit'))} />
        <Choice title={f.commitment.breakLabel} impact={`${f.commitment.breakGain ? `+${money(f.commitment.breakGain)}` : 'zdarma'} · nálada −${f.commitment.kind === 'moment' ? 3 : 5}, kotel −`} onClick={() => run(commitmentDecide(game, 'porusit'))} />
      </Block>,
    );
  if (council)
    blocks.push(
      <Block key="rada" title={`Fanouškovská rada: ${council.title}`} note={`${council.text} Bez volby do ${formatShortDate(council.deadline)} se ${council.canPostpone ? 'odloží' : 'odmítne'}.`}>
        <Choice title="Přijmout" impact={`${council.cost ? money(council.cost) : 'bez jednorázového nákladu'} · ${council.accept}`} onClick={() => run(councilDecide(game, 'prijmout'))} />
        <Choice title="Odmítnout" impact={council.reject} onClick={() => run(councilDecide(game, 'odmitnout'))} />
        {council.canPostpone && <Choice title="Odložit" impact="vrátí se za měsíc" recommended onClick={() => run(councilDecide(game, 'odlozit'))} />}
      </Block>,
    );
  const shown = all ? blocks : blocks.slice(0, 2);
  const hidden = all ? [] : blocks.slice(2);

  return (
    <section className="card fans-card">
      <h2>Fanoušci</h2>
      <div className="fans-meters">
        <Gauge label="Nálada" value={sum.mood} />
        <Gauge label="Kotel" value={sum.ultras} />
        <Gauge label="Město" value={sum.city} />
      </div>
      {f.perks?.length ? <p className="small muted fans-perks">Platí: {f.perks.map((p) => p.label).join(' · ')}</p> : null}
      {msg && <Notice message={msg.text} ok={msg.ok} />}

      {shown}
      {hidden.length > 0 && (
        <button className="linkbtn" onClick={() => setAll(true)}>
          Další rozhodnutí ({hidden.length}) – jinak platí výchozí volba
        </button>
      )}

      {poll && (
        <div className="fans-block">
          <div className="row-between">
            <strong>Anketa: {poll.question}</strong>
            <span className="small muted">{poll.winner ? 'uzavřeno' : `průběžně · výsledky ${formatShortDate(poll.closes)}`}</span>
          </div>
          <ul className="plain fans-poll">
            {[...poll.options]
              .sort((a, b) => b.share - a.share)
              .map((o) => (
                <li key={o.id} className={poll.winner === o.id ? 'won' : ''}>
                  <span className="fans-poll-label">{o.label}</span>
                  <span className="fans-poll-bar">
                    <span style={{ width: `${o.share}%` }} />
                  </span>
                  <span className="small muted fans-poll-pct">{o.share} %</span>
                </li>
              ))}
          </ul>
          {poll.kind === 'hrac' && <p className="small muted">Vítěz je hráč měsíce. Slib fanouškům: dva měsíce ho neprodáte.</p>}
        </div>
      )}

      {!busy && <p className="small muted">{f.log?.[0]?.text ?? 'Fanouškovská rada přichází s nápady začátkem měsíce, hráče měsíce volí fanoušci v anketě.'}</p>}
      {busy && !msg && f.log?.[0] && <p className="small muted">Naposledy: {f.log[0].text}</p>}
    </section>
  );
}

function Gauge({ label, value }: { label: string; value: number }) {
  return (
    <div className="fans-gauge">
      <span className="small muted">{label}</span>
      <Meter value={value} />
      <strong className="small">{value}</strong>
    </div>
  );
}

function Block({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <div className="fans-block">
      <strong>{title}</strong>
      <div className="choices compact fans-choices">{children}</div>
      <p className="small muted">{note}</p>
    </div>
  );
}

function Choice({ title, impact, selected, recommended, onClick }: { title: string; impact: string; selected?: boolean; recommended?: boolean; onClick: () => void }) {
  return (
    <button className={`choice${selected ? ' selected' : ''}`} onClick={onClick}>
      <strong>
        {title}
        {recommended && <span className="badge badge-good rec-badge fans-rec">výchozí</span>}
      </strong>
      <span>{impact}</span>
    </button>
  );
}
