/**
 * V2 (B6): postavy jako kontakty. Nad V1 characters(): portrét z iniciál s kroužkem nálady,
 * vztah, potřeba, poslední rozhovor; detail s historií rozhovorů a tématy schůzky.
 * „Domluvit schůzku“: jedna osobní schůzka týdně zdarma (engine personalMeeting), řeší ji App (onMeet).
 */
import { useState } from 'react';
import { formatShortDate, type ActionResult, type GameState } from '../../engine';
import { characterTopics, characters, type Character } from '../../engine/characters';
import { Notice } from '../components';
import { PlayerLink } from '../nav';
import { Avatar } from '../ui';

const relWord = (r: number) => (r >= 50 ? 'výborný' : r >= 15 ? 'dobrý' : r > -15 ? 'neutrální' : r > -50 ? 'napjatý' : 'špatný');
const relTone = (r: number) => (r >= 15 ? 'good' : r > -15 ? 'neutral' : r > -50 ? 'warn' : 'bad');

function RelationBar({ value }: { value: number }) {
  const v = Math.max(-100, Math.min(100, value));
  const left = v < 0 ? 50 + v / 2 : 50;
  const width = Math.abs(v) / 2;
  return (
    <span className="rel-bar" role="img" aria-label={`Vztah ${Math.round(v)} (od −100 do 100)`}>
      <span className="rel-mid" />
      <span className={`rel-fill ${v >= 0 ? 'pos' : 'neg'}`} style={{ left: `${left}%`, width: `${width}%` }} />
    </span>
  );
}

export function Contacts({ game, onMeet, meetLabel = 'Domluvit schůzku', meetNote, meetDisabled }: { game: GameState; onMeet: (id: string, topic: string) => ActionResult; meetLabel?: string; meetNote?: string; meetDisabled?: boolean }) {
  const list = characters(game);
  const [openId, setOpenId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const open = list.find((c) => c.id === openId);
  return (
    <div className="stack">
      <Notice message={msg?.text ?? null} ok={msg?.ok} />
      <div className="contacts-grid">
        {list.map((c) => (
          <ContactCard key={c.id} c={c} open={openId === c.id} onToggle={() => setOpenId(openId === c.id ? null : c.id)} />
        ))}
      </div>
      {open && (
        <ContactDetail
          game={game}
          c={open}
          meetLabel={meetLabel}
          meetNote={meetNote}
          meetDisabled={meetDisabled}
          onClose={() => setOpenId(null)}
          onMeet={(topic) => {
            const r = onMeet(open.id, topic);
            setMsg({ text: r.message, ok: r.ok });
          }}
        />
      )}
      {!list.length && <p className="muted">Zatím žádné kontakty.</p>}
    </div>
  );
}

function ContactCard({ c, open, onToggle }: { c: Character; open: boolean; onToggle: () => void }) {
  return (
    <button className={`card contact-card${open ? ' open' : ''}`} aria-expanded={open} onClick={onToggle}>
      <Avatar name={c.name} mood={c.mood} />
      <span className="contact-main">
        <strong>{c.name}</strong>
        <span className="muted small">{c.roleLabel}</span>
        <span className="contact-rel small">
          <RelationBar value={c.relation} /> <span className={`badge badge-${relTone(c.relation)}`}>{relWord(c.relation)}</span>
        </span>
        {c.need && <span className="small contact-need">Potřebuje: {c.need}</span>}
        {c.lastTalk && <span className="muted small contact-last">{formatShortDate(c.lastTalk.date)}: {c.lastTalk.text}</span>}
      </span>
    </button>
  );
}

function ContactDetail({ game, c, onMeet, onClose, meetLabel, meetNote, meetDisabled }: { game: GameState; c: Character; onMeet: (topic: string) => void; onClose: () => void; meetLabel: string; meetNote?: string; meetDisabled?: boolean }) {
  const topics = characterTopics(game, c.id);
  return (
    <section className="card contact-detail" aria-label={`Kontakt: ${c.name}`}>
      <div className="row-between">
        <div className="contact-head">
          <Avatar name={c.name} mood={c.mood} size={56} />
          <div>
            <h2>{c.name}</h2>
            <p className="muted small">{c.roleLabel} · nálada <span className="num">{Math.round(c.mood)}</span> · vztah <span className="num">{Math.round(c.relation)}</span>
              {c.playerId && game.players[c.playerId] && <> · <PlayerLink id={c.playerId}>karta hráče</PlayerLink></>}
            </p>
          </div>
        </div>
        <button onClick={onClose}>Zavřít</button>
      </div>
      {c.need && <p className="notice">Potřebuje: {c.need}</p>}
      <h3>{meetLabel}</h3>
      {meetNote && <p className="muted small">{meetNote}</p>}
      <div className="decision-options">
        {topics.map((t) => (
          <button key={t.id} disabled={!!t.disabledReason || meetDisabled} title={t.disabledReason ?? (meetDisabled ? meetNote : undefined)} onClick={() => onMeet(t.id)}>
            <strong>{t.label}</strong>
            <span>{t.disabledReason ?? t.hint}</span>
          </button>
        ))}
      </div>
      <h3>Historie rozhovorů</h3>
      {c.history.length ? (
        <ul className="plain small contact-history">
          {[...c.history].reverse().map((h, i) => (
            <li key={i}><span className="muted">{formatShortDate(h.date)}</span> {h.text}</li>
          ))}
        </ul>
      ) : (
        <p className="muted small">Zatím jste spolu nemluvili.</p>
      )}
    </section>
  );
}
