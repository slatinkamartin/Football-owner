import { useState } from 'react';
import { PERSONA_LABEL, formatShortDate, forumMoodLabel, forumReplyOptions, forumThreads, replyForum, type ForumThread, type GameState, type ReplyId } from '../../engine';
import { Badge, Notice } from '../components';

/**
 * R2: karta „Fórum fanoušků“ na Přehledu. 2–4 vlákna vzniklá z dat hry (nálada, počet příspěvků,
 * poslední komentáře vymyšlených fanoušků). Do každého vlákna může majitel jednou odpovědět.
 */
export function ForumCard({ game, onChange }: { game: GameState; onChange: (g: GameState) => void }) {
  const threads = forumThreads(game);
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  if (!threads.length) return null;
  const reply = (t: ForumThread, id: ReplyId) => {
    const r = replyForum(game, t.id, id);
    if (r.ok) onChange(r.state);
    setMsg({ text: r.message, ok: r.ok });
    setOpen(null);
  };
  return (
    <section className="card forum-card">
      <div className="row-between">
        <h2>Fórum fanoušků</h2>
        <span className="muted small">{(() => {
            const n = threads.filter((t) => !t.closed).length;
            return n === 1 ? '1 aktivní vlákno' : n >= 2 && n <= 4 ? `${n} aktivní vlákna` : `${n} aktivních vláken`;
          })()}</span>
      </div>
      {msg && <Notice message={msg.text} ok={msg.ok} />}
      <ul className="plain forum-threads">
        {threads.map((t) => {
          const mood = forumMoodLabel(t.mood);
          const opts = open === t.id ? forumReplyOptions(game, t.id) : [];
          const canReply = !t.closed && !t.reply;
          return (
            <li key={t.id} className={`forum-thread${t.closed ? ' closed' : ''}`}>
              <div className="forum-head">
                <strong className="forum-title">{t.title}</strong>
                <Badge tone={t.closed ? 'neutral' : mood.tone}>{t.closed ? 'uzavřeno' : `nálada: ${mood.label}`}</Badge>
              </div>
              <p className="muted small forum-meta">
                {t.posts.toLocaleString('cs-CZ')} příspěvků · aktualizováno {formatShortDate(t.updated)}
              </p>
              <ul className="plain forum-posts">
                {t.last.slice(0, 2).map((p, i) => (
                  <li key={i} className={`small${p.persona === 'majitel' ? ' forum-owner' : ''}`}>
                    <span className="muted">{p.name}</span>
                    {p.persona !== 'majitel' && <span className="persona-tag">{PERSONA_LABEL[p.persona]}</span>} {p.text}
                  </li>
                ))}
              </ul>
              {t.reply && <p className="small forum-replied">Odpověděl jste {formatShortDate(t.reply.date)}{t.reply.promise ? ' a dal jste slib, hra ho hlídá' : ''}.</p>}
              {canReply && open !== t.id && (
                <button className="linkbtn small" onClick={() => setOpen(t.id)}>
                  Odpovědět ve vlákně
                </button>
              )}
              {opts.length > 0 && (
                <div className="choices compact forum-choices">
                  {opts.map((o) => (
                    <button key={o.id} className="choice" onClick={() => reply(t, o.id)}>
                      <strong>{o.label}</strong>
                      <em className="post-preview">„{o.text}“</em>
                      <span>{o.hint}</span>
                    </button>
                  ))}
                  <button className="linkbtn small" onClick={() => setOpen(null)}>Zpět</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="muted small">Píšou vymyšlení fanoušci. Do každého vlákna můžete odpovědět jen jednou.</p>
    </section>
  );
}
