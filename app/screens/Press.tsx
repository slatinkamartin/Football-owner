import { useState } from 'react';
import { answerPressConference, formatShortDate, ownerStatements, recentHeadlines, type GameEvent, type GameState } from '../../engine';
import { PlayerLink } from '../nav';

/**
 * R3: tisková konference po zápase (2–3 otázky z fakt, ke každé 2–3 odpovědi) a přehled
 * výroků majitele s navazujícími titulky. Tiskovka se zobrazuje v situacích k rozhodnutí.
 */
export function PressConferenceCard({ game, event, onChange, onMessage }: { game: GameState; event: GameEvent; onChange: (g: GameState) => void; onMessage: (m: string) => void }) {
  const conf = game.press?.current?.eventId === event.id ? game.press.current : undefined;
  const [picked, setPicked] = useState<Record<string, string>>({});
  if (!conf) return null;
  const choice = (qid: string, def: string) => picked[qid] ?? def;
  const submit = (option: 'odpovedi' | 'mluvci') => {
    const r = answerPressConference(game, picked, option);
    onChange(r.state);
    onMessage(r.message);
  };
  return (
    <li className="decision press-conf">
      <div className="row-between">
        <strong>{conf.title}</strong>
        <span className="muted small">odpovězte do {formatShortDate(event.expires)}</span>
      </div>
      <p className="muted small">Novináři se ptají na to, co se v zápase a sezóně opravdu stalo. Vaše odpovědi si budou pamatovat.</p>
      <ol className="press-questions">
        {conf.questions.map((q) => (
          <li key={q.id} className="press-q">
            <p className="press-asker muted small">{q.asker}</p>
            <p className="press-text">
              <strong>{q.text}</strong>
            </p>
            {q.playerId && game.players[q.playerId] && (
              <p className="small">
                <PlayerLink id={q.playerId}>Karta hráče</PlayerLink>
              </p>
            )}
            <div className="choices compact press-answers" role="radiogroup" aria-label={q.text}>
              {q.answers.map((a) => {
                const sel = choice(q.id, q.defaultAnswer) === a.id;
                return (
                  <button key={a.id} role="radio" aria-checked={sel} className={`choice ${sel ? 'selected' : ''}`} onClick={() => setPicked({ ...picked, [q.id]: a.id })}>
                    <strong>
                      „{a.label}“{a.id === q.defaultAnswer && <span className="badge badge-neutral press-def">výchozí</span>}
                    </strong>
                    <span>{a.hint}</span>
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ol>
      <div className="buttons">
        <button className="primary" onClick={() => submit('odpovedi')}>
          Odpovědět
        </button>
        <button onClick={() => submit('mluvci')}>Poslat jen mluvčího (média −2)</button>
      </div>
      <p className="muted small">Když nerozhodnete, mluvčí odpoví výchozími odpověďmi.</p>
    </li>
  );
}

/** Přehled: co jste řekl médiím a co z toho bylo (navazující titulky). */
export function PressMemoryCard({ game }: { game: GameState }) {
  const said = ownerStatements(game).slice(0, 5);
  const heads = recentHeadlines(game, 4);
  const last = game.press?.history?.[0];
  if (!said.length && !heads.length && !last) return null;
  return (
    <section className="card press-memory">
      <h2>Vaše výroky a co z nich bylo</h2>
      {heads.length > 0 && (
        <>
          <h3>Navazující titulky</h3>
          <ul className="plain press-heads">
            {heads.map((h, i) => (
              <li key={i}>
                <span className="muted small">{formatShortDate(h.date)}</span> <strong>{h.title}</strong>
                <p className="muted small">{h.text}</p>
              </li>
            ))}
          </ul>
        </>
      )}
      {said.length > 0 && (
        <>
          <h3>Výroky majitele v sezóně</h3>
          <ul className="plain press-said">
            {said.map((s) => (
              <li key={s.id} className="small">
                <span className="muted">{formatShortDate(s.date)}</span> „{s.quote}“{' '}
                <span className={s.done ? 'muted' : 'badge badge-neutral'}>{s.outcome ?? (s.done ? 'vyšumělo' : 'novináři sledují')}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {last && (
        <p className="muted small">
          Poslední tiskovka ({formatShortDate(last.date)}): {last.lines.length} {last.lines.length === 1 ? 'odpověď' : 'odpovědi'}.
        </p>
      )}
    </section>
  );
}
