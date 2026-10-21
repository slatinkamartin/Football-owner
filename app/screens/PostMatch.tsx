import { useState } from 'react';
import { BIG_MATCH_LABEL, formatShortDate, pendingPostMatch, postMatchOptions, resolvePostMatch, type GameState, type SocialPost } from '../../engine';
import { money } from '../format';

/**
 * W2: krok „Po zápase“ po velkém zápase nebo trofeji. Výchozí volby jsou předvybrané,
 * takže stačí jedno kliknutí. Bez potvrzení se po dvou dnech použijí samy.
 */
export function PostMatch({ game, onChange }: { game: GameState; onChange: (g: GameState) => void }) {
  const pending = pendingPostMatch(game);
  const [hidden, setHidden] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ id: string; step?: string; post?: string }>({ id: '' });
  const [done, setDone] = useState<{ message: string; post?: SocialPost } | null>(null);

  if (done) {
    return (
      <div className="overlay" onClick={() => setDone(null)}>
        <div className="card dialog postmatch" role="dialog" aria-modal="true" aria-label="Reakce po zápase" onClick={(e) => e.stopPropagation()}>
          <h2>Reakce fanoušků</h2>
          {done.message && <p>{done.message}</p>}
          {done.post && <PostView post={done.post} />}
          <button className="primary" autoFocus onClick={() => setDone(null)}>Pokračovat</button>
        </div>
      </div>
    );
  }
  if (!pending || hidden === pending.id) return null;
  const opts = postMatchOptions(game, pending);
  const step = picked.id === pending.id && picked.step ? picked.step : opts.defaultStep;
  const post = picked.id === pending.id && picked.post ? picked.post : opts.defaultPost;
  const tone = pending.result === 'V' ? 'win' : pending.result === 'P' ? 'loss' : 'draw';
  const kindLabel = pending.kind === 'trofej' ? 'Trofej' : BIG_MATCH_LABEL[pending.kind];
  const confirm = () => {
    const r = resolvePostMatch(game, step, post);
    if (!r.ok) return;
    const newest = r.state.social?.posts[0];
    onChange(r.state);
    setDone({ message: r.message, post: newest && newest.date === r.state.date && !game.social?.posts.some((p) => p.id === newest.id) ? newest : undefined });
  };

  return (
    <div className="overlay">
      <div className={`card dialog postmatch postmatch-${tone}`} role="dialog" aria-modal="true" aria-label="Po zápase">
        <div className="row-between">
          <span className="badge badge-neutral">{kindLabel}</span>
          <span className="muted small">rozhodněte do {formatShortDate(pending.until)}</span>
        </div>
        <h2 className="postmatch-score">{pending.kind === 'trofej' ? pending.label : pending.score}</h2>
        <div className="postmatch-papers" aria-label="Titulky novin">
          {pending.headlines.map((h) => (
            <div key={h.paper} className="paper">
              <span className="paper-name">{h.paper}</span>
              <strong>{h.title}</strong>
            </div>
          ))}
        </div>
        {pending.hero && pending.jerseys > 0 && (
          <p className="small">
            👕 Dresy hrdiny <strong>{pending.hero.name}</strong> mizí z fanshopu: <strong className="pos">+{money(pending.jerseys)}</strong>
          </p>
        )}

        <h3>{pending.result === 'P' ? 'Co uděláte po porážce' : pending.result === 'R' ? 'Po závěrečném hvizdu' : 'Jak to oslavíte'}</h3>
        <div className="choices compact">
          {opts.steps.map((o) => (
            <button key={o.id} className={`choice ${step === o.id ? 'selected' : ''}`} aria-pressed={step === o.id} onClick={() => setPicked({ id: pending.id, step: o.id, post })}>
              <strong>{o.label}</strong>
              <span>{o.hint}</span>
            </button>
          ))}
        </div>

        <h3>Příspěvek klubu na sítích</h3>
        <div className="choices compact">
          {opts.posts.map((o) => (
            <button key={o.id} className={`choice ${post === o.id ? 'selected' : ''}`} aria-pressed={post === o.id} onClick={() => setPicked({ id: pending.id, step, post: o.id })}>
              <strong>{o.label}</strong>
              <span>{o.hint}</span>
            </button>
          ))}
        </div>

        <div className="buttons">
          <button className="primary" autoFocus onClick={confirm}>Potvrdit</button>
          <button onClick={() => setHidden(pending.id)}>Později</button>
        </div>
        <p className="muted small">Když nepotvrdíte, za dva dny platí předvybrané volby.</p>
      </div>
    </div>
  );
}

/** Příspěvek na sítích s reakcemi vymyšlených fanoušků. */
export function PostView({ post, compact }: { post: SocialPost; compact?: boolean }) {
  return (
    <div className={`social-post social-${post.mood}`}>
      <div className="row-between">
        <strong className="small">{post.author}</strong>
        <span className="muted small">{formatShortDate(post.date)} · ♥ {post.likes.toLocaleString('cs-CZ')}</span>
      </div>
      <p>{post.text}</p>
      <ul className="plain social-comments">
        {post.comments.slice(0, compact ? 2 : 3).map((c, i) => (
          <li key={i} className="small">
            <span className="muted">{c.name}</span> {c.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
