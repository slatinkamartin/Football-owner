import { challengeProgress, challengeRewardText, type GameState } from '../../engine';
import { Badge, Meter } from '../components';

/** Karta na Přehledu: tři osobní výzvy sezóny a jejich průběh. */
export function ChallengesCard({ game }: { game: GameState }) {
  const ch = game.challenges;
  if (!ch || ch.season !== game.season || !ch.list.length) return null;
  const done = ch.list.filter((c) => c.status === 'splneno').length;
  const last = ch.history?.[0];
  return (
    <section className="card challenges-card">
      <div className="row-between">
        <h2>Výzvy sezóny</h2>
        <span className="small muted">splněno {done} z {ch.list.length}</span>
      </div>
      <ul className="plain side-goals">
        {ch.list.map((c) => {
          const p = challengeProgress(game, c);
          return (
            <li key={c.kind}>
              <div className="row-between">
                <span>{c.hard && <span title="Těžší výzva">💪 </span>}{c.label}</span>
                {c.status ? <Badge tone={c.status === 'splneno' ? 'good' : 'bad'}>{c.status === 'splneno' ? 'splněno' : 'nevyšlo'}</Badge> : null}
              </div>
              <div className="row-between small">
                <Meter value={Math.min(1, Math.max(0, c.status === 'splneno' ? 1 : p.ratio)) * 100} tone={c.status === 'nesplneno' ? 'bad' : undefined} />
                <span className="muted">{p.text}</span>
              </div>
              <div className="small muted">Odměna: {challengeRewardText(c)}</div>
            </li>
          );
        })}
      </ul>
      <p className="muted small">Vaše osobní výzvy (nezávislé na cílech vedení a sponzorů). Co se rozhodne dřív, vyhodnotí se hned, zbytek na konci sezóny.{last ? ` Loni: ${last.done} z ${last.total}.` : ''}</p>
    </section>
  );
}
