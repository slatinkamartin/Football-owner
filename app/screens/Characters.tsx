import { useState } from 'react';
import { characterTopics, characters, formatShortDate, planAgendaAction, weekAgenda, type ActionResult, type Character, type GameState } from '../../engine';
import { Badge, Meter } from '../components';

/** V1 (A4): postavy kolem klubu (V2 z nich dělá kontakty B6). */

export function CharacterDetail({ game, c, onResult }: { game: GameState; c: Character; onResult: (r: ActionResult) => void }) {
  const topics = characterTopics(game, c.id);
  const opt = weekAgenda(game).options.find((o) => o.id === 'postava');
  return (
    <div className="character-detail">
      {c.need && <p className="small">Potřebuje: {c.need}</p>}
      <ul className="plain">
        {topics.map((t) => (
          <li key={t.id} className="row-between small">
            <span>
              <strong>{t.label}</strong> <span className="muted">{t.disabledReason ?? t.hint}</span>
            </span>
            <button disabled={!!t.disabledReason || !!opt?.disabledReason} title={opt?.disabledReason} onClick={() => onResult(planAgendaAction(game, 'postava', `${c.id}|${t.id}`))}>
              Domluvit schůzku
            </button>
          </li>
        ))}
      </ul>
      {opt?.disabledReason && <p className="muted small">{opt.disabledReason}</p>}
      {c.history.length > 0 && (
        <>
          <h4>Paměť rozhovorů</h4>
          <ul className="plain small">
            {[...c.history].reverse().map((h, i) => (
              <li key={i}>
                <span className="muted">{formatShortDate(h.date)}</span> {h.text}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function CharactersCard({ game, onResult }: { game: GameState; onResult: (r: ActionResult) => void }) {
  const list = characters(game);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="card characters-card">
      <h2>Postavy kolem klubu</h2>
      <ul className="plain character-list">
        {list.map((c) => (
          <li key={c.id} className="character-row">
            <button className="linkbtn row-between" onClick={() => setOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id}>
              <span>
                <strong>{c.name}</strong> <span className="muted small">{c.roleLabel}</span>
              </span>
              <Badge tone={c.relation >= 30 ? 'good' : c.relation <= -30 ? 'bad' : 'neutral'}>vztah {c.relation > 0 ? '+' : ''}{c.relation}</Badge>
            </button>
            <div className="small muted">
              Nálada <Meter value={c.mood} /> {c.lastTalk && <>· naposledy {formatShortDate(c.lastTalk.date)}</>}
            </div>
            {open === c.id && <CharacterDetail game={game} c={c} onResult={onResult} />}
          </li>
        ))}
      </ul>
    </section>
  );
}
