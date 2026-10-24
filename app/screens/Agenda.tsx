import { useState } from 'react';
import { formatShortDate, monthAdvice, monthPriorities, PRIORITIES, priorityTitle, routineView, setMonthPriorities, setRoutine, type ActionResult, type GameState, type PriorityId } from '../../engine';
import { Badge } from '../components';
import { Icon } from '../icons'; // V2: SVG ikony místo emoji

/** v0.29 (W2): měsíční priority majitele (místo týdenní agendy V1) na domově „Týden“. */

export function AgendaIcon({ icon }: { icon: string }) {
  return (
    <span className={`agenda-icon agenda-icon-${icon}`} aria-hidden="true">
      <Icon name={icon} size={18} />
    </span>
  );
}

const iconOf = (id: string) => PRIORITIES.find((p) => p.id === id)?.icon ?? 'projekt';

function PriorityPicker({ game, onResult, onDone }: { game: GameState; onResult: (r: ActionResult) => void; onDone: () => void }) {
  const mp = monthPriorities(game);
  const adv = monthAdvice(game);
  const [sel, setSel] = useState<PriorityId[]>(mp.priorities);
  const [keep, setKeep] = useState(mp.keep);
  const recommended = new Map(adv.priorities.map((p) => [p.id, p.reason]));
  const toggle = (id: PriorityId) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : sel.length >= mp.max ? sel : [...sel, id]);
  const changed = mp.by === 'vedeni' || sel.length !== mp.priorities.length || sel.some((x) => !mp.priorities.includes(x));
  const canSave = sel.length >= mp.min && sel.length <= mp.max && (changed || keep !== mp.keep);
  return (
    <div className="prio-picker">
      <p className="muted small">Vyberte {mp.min}–{mp.max} oblasti. Konkrétní kroky pak každý týden udělá vedení samo.</p>
      <ul className="plain prio-options">
        {PRIORITIES.map((p) => {
          const on = sel.includes(p.id);
          const rec = recommended.get(p.id);
          return (
            <li key={p.id}>
              <button className={`prio-option${on ? ' on' : ''}${rec ? ' rec' : ''}`} aria-pressed={on} disabled={!on && sel.length >= mp.max} onClick={() => toggle(p.id)}>
                <AgendaIcon icon={p.icon} />
                <span>
                  <strong>{p.title}</strong>
                  {rec && <Badge tone="good">doporučeno</Badge>}
                  <span className="small muted prio-detail">{rec ?? p.detail}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <label className="small prio-keep">
        <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Ponechat i na další měsíce
      </label>
      <p className={`small ${mp.changeCost === 'tyden' ? 'neg' : 'muted'}`}>{mp.changeNote}</p>
      <div className="buttons">
        <button
          className="primary"
          disabled={!canSave}
          onClick={() => {
            const r = setMonthPriorities(game, sel, { keep });
            onResult(r);
            if (r.ok) onDone();
          }}
        >
          {mp.by === 'vedeni' ? 'Potvrdit priority' : mp.changeCost === 'tyden' ? 'Změnit (spálí týden)' : 'Uložit změnu'}
        </button>
        {mp.by === 'majitel' && <button className="linkbtn" onClick={onDone}>Zrušit</button>}
      </div>
    </div>
  );
}

export function PrioritiesCard({ game, onResult, compact }: { game: GameState; onResult: (r: ActionResult) => void; compact?: boolean }) {
  const mp = monthPriorities(game);
  const early = Number(game.date.slice(8, 10)) <= 7;
  const [open, setOpen] = useState(!compact && mp.by === 'vedeni' && early);
  const [all, setAll] = useState(false);
  const log = [...mp.log].reverse();
  if (game.owner.ousted || game.gameOver) return null;
  return (
    <section className="card agenda-card prio-card" aria-label="Priority měsíce">
      <div className="row-between">
        <h2>Priority: {mp.label}</h2>
        <Badge tone={mp.by === 'majitel' ? 'good' : 'warn'}>{mp.by === 'majitel' ? 'vybrali jste' : 'návrh vedení'}</Badge>
      </div>
      {!open && (
        <>
          <ul className="plain prio-current">
            {mp.priorities.map((id) => (
              <li key={id} className="prio-chip">
                <AgendaIcon icon={iconOf(id)} /> <strong>{priorityTitle(id)}</strong>
                <span className="muted small num">{mp.counts[id] ?? 0}×</span>
              </li>
            ))}
          </ul>
          {mp.by === 'vedeni' && <p className="small">Vedení zatím jede podle vlastního návrhu s polovičním účinkem. Potvrďte nebo upravte priority – pak mají plný účinek.</p>}
          {mp.burnUntil && <p className="small neg">Vedení přestavuje plán po změně priorit: do {formatShortDate(mp.burnUntil)} se na prioritách nepracuje.</p>}
          <button className={mp.by === 'vedeni' ? 'primary' : 'linkbtn'} onClick={() => setOpen(true)} aria-expanded={false}>
            {mp.by === 'vedeni' ? 'Vybrat priority' : 'Změnit priority'}
          </button>
        </>
      )}
      {open && <PriorityPicker game={game} onResult={onResult} onDone={() => setOpen(false)} />}
      {log.length > 0 && (
        <>
          <h3 className="small">Co vedení tento měsíc udělalo</h3>
          <ul className="plain small prio-log">
            {(all ? log : log.slice(0, 3)).map((u, i) => (
              <li key={i} className={u.routine ? 'muted' : ''}>
                <span className="muted">{u.date ? formatShortDate(u.date) : ''}</span> {u.result}
              </li>
            ))}
          </ul>
          {log.length > 3 && (
            <button className="linkbtn small" onClick={() => setAll(!all)} aria-expanded={all}>
              {all ? 'Méně' : `Všech ${log.length} kroků`}
            </button>
          )}
        </>
      )}
      {!log.length && !open && <p className="muted small">První kroky udělá vedení v nejbližších dnech (každá priorita jednou týdně).</p>}
    </section>
  );
}

/** @deprecated V1 název: karta agendy je teď karta priorit měsíce. */
export const AgendaCard = PrioritiesCard;

/** Rádce „Co teď“: doporučené priority měsíce z dat a nejvýš 2 další kroky. */
export function AdvisorCard({ game, onResult, onNavigate }: { game: GameState; onResult: (r: ActionResult) => void; onNavigate?: (tab: string) => void }) {
  const adv = monthAdvice(game);
  const mp = monthPriorities(game);
  if (!adv.priorities.length && !adv.other.length) return null;
  return (
    <section className="card advisor-card">
      <h2>Co teď</h2>
      {adv.priorities.length > 0 && (
        <>
          <h3 className="small">Doporučené priority na {mp.label}</h3>
          <ol className="plain advisor-list">
            {adv.priorities.map((p) => (
              <li key={p.id}>
                <AgendaIcon icon={iconOf(p.id)} /> <strong>{p.title}</strong>
                {mp.priorities.includes(p.id) && mp.by === 'majitel' && <> <Badge tone="good">máte</Badge></>}
                <p className="muted small">{p.reason}</p>
              </li>
            ))}
          </ol>
          {adv.differs && (
            <button onClick={() => onResult(setMonthPriorities(game, adv.priorities.map((p) => p.id)))}>
              {mp.by === 'vedeni' ? 'Nastavit doporučené priority' : mp.changeCost === 'tyden' ? 'Nastavit doporučené (spálí týden)' : 'Nastavit doporučené priority'}
            </button>
          )}
        </>
      )}
      {adv.other.length > 0 && (
        <ol className="plain advisor-list advisor-other">
          {adv.other.map((a) => (
            <li key={a.id}>
              <strong>{a.title}</strong>
              <p className="muted small">{a.reason}</p>
              {a.tab && onNavigate && (
                <button className="linkbtn" onClick={() => onNavigate(a.tab!)}>
                  Otevřít
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
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
      {r.handledThisWeek > 0 && <p className="muted small">Tento měsíc vedení vyřídilo {r.handledThisWeek}× za vás.</p>}
      <p className="muted small">Pravomoci ředitelů nastavíte v Týmu → Vedení.</p>
    </section>
  );
}
