import { useState } from 'react';
import { activeProjects, formatShortDate, ownerLevel, pickProjects, projectOffers, type ActionResult, type GameState } from '../../engine';
import { Badge, Meter } from '../components';

/** V1 (A6): strategické projekty. */
export function ProjectsCard({ game, onResult }: { game: GameState; onResult: (r: ActionResult) => void }) {
  const offers = projectOffers(game);
  const active = activeProjects(game, true);
  const [pick, setPick] = useState<string[]>([]);
  const toggle = (id: string) => setPick(pick.includes(id) ? pick.filter((x) => x !== id) : pick.length < 3 ? [...pick, id] : pick);
  return (
    <section className="card projects-card">
      <h2>Strategické projekty</h2>
      {offers.length > 0 && (
        <>
          <p className="muted small">Vedení nabízí projekty na sezónu. Vyberte 1–3; kroky splníte výsledky i prioritami měsíce.</p>
          <ul className="plain project-offers">
            {offers.map((o) => (
              <li key={o.id}>
                <label>
                  <input type="checkbox" checked={pick.includes(o.id)} onChange={() => toggle(o.id)} /> <strong>{o.title}</strong>{' '}
                  <span className="muted small">
                    {o.detail} {o.seasons > 1 ? `(${o.seasons} sezóny)` : ''}
                  </span>
                </label>
                <ul className="small">
                  {o.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
                <p className="small">Odměna: {o.reward}</p>
              </li>
            ))}
          </ul>
          <button className="primary" disabled={!pick.length} onClick={() => { onResult(pickProjects(game, pick)); setPick([]); }}>
            Vybrat projekty ({pick.length})
          </button>
        </>
      )}
      {active.map((p) => (
        <div key={p.id} className="project">
          <div className="row-between">
            <strong>{p.title}</strong>
            <Badge tone={p.status === 'splneno' ? 'good' : p.status === 'neuspech' ? 'bad' : 'neutral'}>{p.status === 'splneno' ? 'splněno' : p.status === 'neuspech' ? 'nesplněno' : `do ${formatShortDate(p.deadline)} ${p.deadline.slice(0, 4)}`}</Badge>
          </div>
          <Meter value={p.progress * 100} />
          <ul className="plain small">
            {p.steps.map((s) => (
              <li key={s.text}>
                {s.done ? '✔' : '○'} {s.text}
              </li>
            ))}
          </ul>
          <p className="muted small">Odměna: {p.reward}</p>
        </div>
      ))}
      {!offers.length && !active.length && <p className="muted small">Žádný projekt neběží. Nová nabídka přijde na začátku sezóny.</p>}
    </section>
  );
}

/** V1 (A9): úroveň pověsti majitele a co odemkne další úroveň. */
export function OwnerLevelCard({ game }: { game: GameState }) {
  const l = ownerLevel(game);
  return (
    <section className="card owner-level-card">
      <div className="row-between">
        <h2>Pověst majitele</h2>
        <Badge tone="good">
          {l.level}. úroveň · {l.title}
        </Badge>
      </div>
      {l.next !== undefined ? (
        <>
          <Meter value={l.xp} max={l.next} tone="good" />
          <p className="muted small num">
            {l.xp} / {l.next} XP (vaše priority měsíce, schůzky, projekty, úspěchy v síni slávy)
          </p>
        </>
      ) : (
        <p className="muted small">Nejvyšší úroveň.</p>
      )}
      {l.unlocked.length > 0 && (
        <>
          <h3>Odemčeno</h3>
          <ul className="small">{l.unlocked.map((u) => <li key={u}>{u}</li>)}</ul>
        </>
      )}
      {l.nextUnlocks.length > 0 && (
        <>
          <h3>Další úroveň odemkne</h3>
          <ul className="small muted">{l.nextUnlocks.map((u) => <li key={u}>{u}</li>)}</ul>
        </>
      )}
    </section>
  );
}
