import { useState } from 'react';
import { competitionOf, formatShortDate, type Fixture, type GameState } from '../../engine';
import { num } from '../format';

export function Matches({ game }: { game: GameState }) {
  const ownId = game.owner.clubId;
  const comp = competitionOf(game, ownId);
  const played = comp?.fixtures.filter((f) => f.result) ?? [];
  const currentRound = played.length ? Math.max(...played.map((f) => f.round)) : 1;
  const [round, setRound] = useState(currentRound);

  if (!comp) return <p className="muted">Klub nehraje žádnou soutěž.</p>;
  const rounds = Math.max(...comp.fixtures.map((f) => f.round));
  const own = comp.fixtures.filter((f) => f.homeId === ownId || f.awayId === ownId).sort((a, b) => a.round - b.round);
  const roundFixtures = comp.fixtures.filter((f) => f.round === round);

  const scorers = (f: Fixture, clubId: string) =>
    f.result?.scorers
      .filter((s) => s.clubId === clubId)
      .map((s) => `${game.players[s.playerId]?.lastName ?? '?'} ${s.minute}.`)
      .join(', ');

  return (
    <div className="grid two">
      <section className="card">
        <h2>Zápasy klubu</h2>
        <table>
          <tbody>
            {own.map((f) => {
              const home = f.homeId === ownId;
              const r = f.result;
              const outcome = r ? Math.sign((home ? 1 : -1) * (r.homeGoals - r.awayGoals)) : null;
              return (
                <tr key={f.id}>
                  <td className="muted">{f.round}.</td>
                  <td className="muted">{formatShortDate(f.date)}</td>
                  <td>{home ? 'doma' : 'venku'}</td>
                  <td>{game.clubs[home ? f.awayId : f.homeId].shortName}</td>
                  <td className="num">
                    {r ? (
                      <span className={`score ${outcome === 1 ? 'win' : outcome === -1 ? 'loss' : 'draw'}`}>
                        {r.homeGoals}:{r.awayGoals}
                      </span>
                    ) : (
                      '–'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card">
        <div className="row-between">
          <h2>{round}. kolo</h2>
          <div className="pager">
            <button disabled={round <= 1} onClick={() => setRound(round - 1)}>‹</button>
            <button disabled={round >= rounds} onClick={() => setRound(round + 1)}>›</button>
          </div>
        </div>
        <ul className="fixtures">
          {roundFixtures.map((f) => (
            <li key={f.id} className={f.homeId === ownId || f.awayId === ownId ? 'own-row' : ''}>
              <div className="fixture-line">
                <span className="team home">{game.clubs[f.homeId].shortName}</span>
                <span className="score-box">{f.result ? `${f.result.homeGoals}:${f.result.awayGoals}` : formatShortDate(f.date)}</span>
                <span className="team">{game.clubs[f.awayId].shortName}</span>
              </div>
              {f.result && (
                <div className="fixture-detail muted small">
                  {[scorers(f, f.homeId), scorers(f, f.awayId)].filter(Boolean).join(' · ')}
                  {f.result.scorers.length > 0 && ' · '}
                  {num(f.result.attendance)} diváků
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
