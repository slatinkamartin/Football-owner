import {
  AGENT_STYLE_LABEL,
  agentsOf,
  askingPrice,
  clubLabel,
  deadlineDay,
  foreignMarket,
  foreignPrice,
  foreignView,
  playerAge,
  playerName,
  POSITION_LABEL,
  scouted,
  startNegotiation,
  toggleWatch,
  transferWindow,
  watchReport,
  budgetRemaining,
  type ActionResult,
  type GameState,
} from '../../engine';
import { Badge, Meter } from '../components';
import { money } from '../format';
import { PlayerLink } from '../nav';

/** Deadline day: odpočet a hráči k mání se slevou. */
export function DeadlineCard({ game, onResult }: { game: GameState; onResult: (r: ActionResult) => void }) {
  const d = deadlineDay(game);
  if (!d) return null;
  const deals = (game.deadlineDeals ?? []).map((id) => game.players[id]).filter((p) => p && p.clubId !== game.owner.clubId);
  return (
    <section className="card deadline">
      <div className="row-between">
        <h2>Deadline day</h2>
        <Badge tone="bad">{d.daysLeft === 0 ? 'poslední den okna' : `zbývají ${d.daysLeft + 1} dny`}</Badge>
      </div>
      <p className="muted small">Nabídky na vaše hráče platí jen do zítřka, soupeři nakupují každý den a kluby pouštějí hráče se slevou 15 %. Hra teď jde po dnech.</p>
      {deals.length > 0 && (
        <ul className="plain">
          {deals.map((p) => (
            <li key={p.id} className="row-between">
              <span><PlayerLink id={p.id}>{playerName(p)}</PlayerLink> <span className="muted small">{POSITION_LABEL[p.position].toLowerCase()}, {playerAge(p, game.season)} let, {clubLabel(game, p.clubId)}, ≈{scouted(game, p).overall}</span></span>
              <span className="buttons end">
                <span className="small">{money(askingPrice(game, p))}</span>
                <button className="primary" onClick={() => onResult(startNegotiation(game, p.id))}>Jednat</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Domino po prodeji opory: ředitel navrhuje náhradu. */
export function DominoCard({ game, onResult }: { game: GameState; onResult: (r: ActionResult) => void }) {
  const d = game.domino;
  if (!d || !transferWindow(game.date)) return null;
  const own = game.owner.clubId;
  const budget = budgetRemaining(game);
  const domestic = Object.values(game.players)
    .filter((p) => p.position === d.position && p.clubId !== own && game.clubs[p.clubId])
    .map((p) => ({ p, view: scouted(game, p), fee: askingPrice(game, p) }))
    .filter((x) => x.view.overall >= d.soldOverall - 4 && x.fee <= budget)
    .sort((a, b) => b.view.overall - a.view.overall)
    .slice(0, 4);
  const abroad = foreignMarket(game).targets.filter((t) => t.player.position === d.position && foreignView(game, t).est >= d.soldOverall - 4 && foreignPrice(game, t).total <= budget).slice(0, 2);
  return (
    <section className="card highlight">
      <h2>Náhrada za {d.soldName}</h2>
      <p className="muted small">Ředitel hledá {POSITION_LABEL[d.position].toLowerCase()}a v rámci peněz z prodeje. Když do konce okna žádná náhrada nepřijde, fanoušci budou zklamaní a klesne šance na cíl sezóny.</p>
      {domestic.length + abroad.length === 0 ? (
        <p className="muted">V rozpočtu teď není nikdo srovnatelný. Zvažte navýšení rozpočtu na přestupy nebo zahraniční skauting.</p>
      ) : (
        <ul className="plain">
          {domestic.map(({ p, view, fee }) => (
            <li key={p.id} className="row-between">
              <span><PlayerLink id={p.id}>{playerName(p)}</PlayerLink> <span className="muted small">{clubLabel(game, p.clubId)}, ≈{view.overall}, {playerAge(p, game.season)} let</span></span>
              <span className="buttons end"><span className="small">{money(fee)}</span><button onClick={() => onResult(startNegotiation(game, p.id))}>Jednat</button></span>
            </li>
          ))}
          {abroad.map((t) => (
            <li key={t.id} className="row-between">
              <span>{playerName(t.player)} <span className="muted small">{t.player.nationality}, odhad {foreignView(game, t).lo}–{foreignView(game, t).hi}</span></span>
              <span className="small">{money(foreignPrice(game, t).total)} · Zahraniční trh níže</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Sledovaní hráči soupeřů a co o nich hlásí ředitel. */
export function WatchlistCard({ game, onResult }: { game: GameState; onResult: (r: ActionResult) => void }) {
  const list = watchReport(game);
  return (
    <section className="card">
      <h2>Sledovaní hráči</h2>
      {list.length === 0 ? (
        <p className="muted small">Hráče přidáte hvězdičkou v Tabulkách (statistiky hráčů) nebo na kartě hráče. Ředitel pak hlásí, když je výhodná chvíle (končí smlouva, nespokojenost, klub v krizi, tip od agenta).</p>
      ) : (
        <ul className="plain">
          {list.map(({ player: p, notes, hot }) => (
            <li key={p.id} className="watch-row">
              <span>
                <PlayerLink id={p.id}>{playerName(p)}</PlayerLink> <span className="muted small">{clubLabel(game, p.clubId)}, ≈{scouted(game, p).overall}, {money(askingPrice(game, p))}</span>
                {hot && <> <Badge tone="good">výhodná chvíle</Badge></>}
                {notes.length > 0 && <div className="muted small">{notes.join(' · ')}</div>}
              </span>
              <span className="buttons end">
                <button disabled={!transferWindow(game.date)} onClick={() => onResult(startNegotiation(game, p.id))}>Jednat</button>
                <button className="linkbtn" onClick={() => onResult(toggleWatch(game, p.id))}>Přestat sledovat</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Agenti a vztah s nimi. */
export function AgentsCard({ game }: { game: GameState }) {
  return (
    <section className="card">
      <h2>Agenti</h2>
      <ul className="plain small">
        {agentsOf(game).map((a) => (
          <li key={a.id} className="row-between">
            <span><strong>{a.name}</strong> <span className="muted">{AGENT_STYLE_LABEL[a.style].label}: {AGENT_STYLE_LABEL[a.style].hint}</span></span>
            <span className="meter-cell"><Meter value={a.relation} /> {Math.round(a.relation)}</span>
          </li>
        ))}
      </ul>
      <p className="muted small">Dobrý vztah: nižší odměny a platy, tipy na hráče. Zlepšuje ho dokončený obchod a prodej klienta za férovou cenu, zhoršuje neúspěšné jednání.</p>
    </section>
  );
}
