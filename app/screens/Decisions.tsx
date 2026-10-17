import { useState } from 'react';
import { formatShortDate, resolveEvent, type GameState } from '../../engine';
import { Notice } from '../components';
import { PlayerLink } from '../nav';

/** Situace, na které čeká odpověď majitele. */
export function Decisions({ game, onChange }: { game: GameState; onChange: (g: GameState) => void }) {
  const [message, setMessage] = useState<string | null>(null);
  if (!game.events.length) {
    return message ? <Notice message={message} /> : null;
  }
  return (
    <section className="card wide decisions">
      <h2>Čeká na vaše rozhodnutí</h2>
      <Notice message={message} />
      <ul className="plain">
        {game.events.map((e) => (
          <li key={e.id} className="decision">
            <div className="row-between">
              <strong>{e.title}</strong>
              <span className="muted small">rozhodněte do {formatShortDate(e.expires)}</span>
            </div>
            <p className="muted">{e.text}</p>
            {e.playerId && game.players[e.playerId] && (
              <p className="small">
                <PlayerLink id={e.playerId}>Karta hráče</PlayerLink>
              </p>
            )}
            <div className="decision-options">
              {e.options.map((o) => (
                <button
                  key={o.id}
                  className={o.id === e.defaultOption ? 'primary-outline recommended' : ''}
                  onClick={() => {
                    const r = resolveEvent(game, e.id, o.id);
                    onChange(r.state);
                    setMessage(r.message);
                  }}
                >
                  {o.id === e.defaultOption && <span className="badge badge-good rec-badge">doporučeno</span>}
                  <strong>{o.label}</strong>
                  <span>{o.hint}</span>
                </button>
              ))}
            </div>
            <p className="muted small">Když nerozhodnete, platí „{e.options.find((o) => o.id === e.defaultOption)?.label}“.</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
