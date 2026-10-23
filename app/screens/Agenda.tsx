import { useState } from 'react';
import { AGENDA_ACTIONS, planAgendaAction, routineView, setRoutine, weekAgenda, weeklyAdvice, type ActionResult, type AgendaOption, type GameState } from '../../engine';
import { Badge } from '../components';
import { Icon } from '../icons'; // V2: SVG ikony místo emoji

/** V1 (A1): týdenní agenda majitele. V2 ji umístí na domov „Týden“. */

export function AgendaIcon({ icon }: { icon: string }) {
  return (
    <span className={`agenda-icon agenda-icon-${icon}`} aria-hidden="true">
      <Icon name={icon} size={18} />
    </span>
  );
}

function OptionRow({ game, o, onResult }: { game: GameState; o: AgendaOption; onResult: (r: ActionResult) => void }) {
  const [target, setTarget] = useState('');
  const t = o.targets?.some((x) => x.id === target) ? target : o.targets?.[0]?.id;
  return (
    <li className={`agenda-option${o.disabledReason ? ' disabled' : ''}`}>
      <div className="agenda-option-head">
        <AgendaIcon icon={o.icon} />
        <div>
          <strong>{o.title}</strong>
          <p className="muted small">{o.disabledReason ?? o.effectHint}</p>
        </div>
      </div>
      {!o.disabledReason && (
        <div className="inline-form wrap">
          {o.targets && o.targets.length > 0 && (
            <select value={t} onChange={(e) => setTarget(e.target.value)} aria-label={`Cíl: ${o.title}`}>
              {o.targets.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          )}
          <button className="primary" onClick={() => onResult(planAgendaAction(game, o.id, t))}>
            Provést
          </button>
        </div>
      )}
    </li>
  );
}

export function AgendaCard({ game, onResult, compact }: { game: GameState; onResult: (r: ActionResult) => void; compact?: boolean }) {
  const ag = weekAgenda(game);
  const [open, setOpen] = useState(!compact);
  const own = ag.used.filter((u) => !u.routine);
  const left = Math.max(0, ag.slots - own.length);
  const title = (id: string) => AGENDA_ACTIONS.find((a) => a.id === id)?.title ?? id;
  return (
    <section className="card agenda-card">
      <div className="row-between">
        <h2>Agenda týdne</h2>
        <Badge tone={left ? 'good' : 'neutral'}>{left ? `zbývá ${left} z ${ag.slots}` : 'vyčerpáno'}</Badge>
      </div>
      <ol className="agenda-slots plain">
        {Array.from({ length: ag.slots }, (_, i) => {
          const u = own[i];
          return (
            <li key={i} className={`agenda-slot${u ? ' done' : ''}`}>
              {u ? (
                <>
                  <AgendaIcon icon={u.actionId} /> <strong>{title(u.actionId)}</strong>
                  <p className="small">{u.result}</p>
                </>
              ) : (
                <span className="muted small">Volná akce {i + 1}</span>
              )}
            </li>
          );
        })}
        {ag.used.filter((u) => u.routine).map((u, i) => (
          <li key={`r${i}`} className="agenda-slot routine small muted">
            {u.result}
          </li>
        ))}
      </ol>
      {left > 0 && (
        <>
          <button className="linkbtn" onClick={() => setOpen(!open)} aria-expanded={open}>
            {open ? 'Skrýt nabídku akcí' : 'Vybrat akci'}
          </button>
          {open && (
            <ul className="plain agenda-options">
              {ag.options.map((o) => (
                <OptionRow key={o.id} game={game} o={o} onResult={onResult} />
              ))}
            </ul>
          )}
        </>
      )}
      <p className="muted small">Nevyužité akce s koncem týdne (v neděli) propadnou.</p>
    </section>
  );
}

/** V1 (A2): rádce „Co teď“ – nejvýš 3 kroky s důvodem. */
export function AdvisorCard({ game, onResult, onNavigate }: { game: GameState; onResult: (r: ActionResult) => void; onNavigate?: (tab: string) => void }) {
  const list = weeklyAdvice(game);
  if (!list.length) return null;
  return (
    <section className="card advisor-card">
      <h2>Co teď</h2>
      <ol className="plain advisor-list">
        {list.map((a) => (
          <li key={a.id}>
            <strong>{a.title}</strong>
            <p className="muted small">{a.reason}</p>
            {a.actionId ? (
              <button onClick={() => onResult(planAgendaAction(game, a.actionId!, a.target))}>Provést teď</button>
            ) : a.tab && onNavigate ? (
              <button className="linkbtn" onClick={() => onNavigate(a.tab!)}>
                Otevřít
              </button>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** V1 (A3): rutina podřízeným. */
export function RoutineCard({ game, onResult }: { game: GameState; onResult: (r: ActionResult) => void }) {
  const r = routineView(game);
  return (
    <section className="card routine-card">
      <div className="row-between">
        <h2>Rutina vedení</h2>
        <label className="small">
          <input type="checkbox" checked={r.auto} onChange={(e) => onResult(setRoutine(game, e.target.checked))} /> Automaticky vyřizovat drobnosti
        </label>
      </div>
      <ul className="plain small">
        {r.items.map((i) => (
          <li key={i.label}>
            <Badge tone={i.on ? 'good' : 'neutral'}>{i.on ? 'sami' : 'vy'}</Badge> {i.label} <span className="muted">({i.by})</span>
          </li>
        ))}
      </ul>
      {r.handledThisWeek > 0 && <p className="muted small">Tento týden vedení vyřídilo {r.handledThisWeek}× za vás.</p>}
      <p className="muted small">Pravomoci ředitelů nastavíte v Týmu → Vedení.</p>
    </section>
  );
}
