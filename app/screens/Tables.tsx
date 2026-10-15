import { useState } from 'react';
import { competitionOf, computeTable, type GameState } from '../../engine';

export function Tables({ game }: { game: GameState }) {
  const ownId = game.owner.clubId;
  const comps = Object.values(game.competitions).sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name, 'cs'));
  const [compId, setCompId] = useState(competitionOf(game, ownId)?.id ?? comps[0].id);
  const comp = game.competitions[compId];
  const table = computeTable(comp, game);
  const n = table.length;

  const scorers = Object.values(game.players)
    .filter((p) => p.goals > 0 && comp.clubIds.includes(p.clubId))
    .sort((a, b) => b.goals - a.goals)
    .slice(0, 10);

  const zone = (i: number) => {
    if (i < comp.promote) return 'zone-up';
    if (i >= n - comp.relegate) return 'zone-down';
    return '';
  };

  return (
    <div className="stack">
      <div className="segmented">
        {comps.map((c) => (
          <button key={c.id} className={c.id === compId ? 'active' : ''} onClick={() => setCompId(c.id)}>
            {c.name}
          </button>
        ))}
      </div>

      <section className="card">
        <h2>{comp.fullName ?? comp.name}</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="num">#</th><th>Klub</th>
                <th className="num">Z</th><th className="num">V</th><th className="num">R</th><th className="num">P</th>
                <th className="num">Skóre</th><th className="num">Body</th><th className="hide-sm">Forma</th>
              </tr>
            </thead>
            <tbody>
              {table.map((r, i) => (
                <tr key={r.clubId} className={`${zone(i)} ${r.clubId === ownId ? 'own-row' : ''}`}>
                  <td className="num">{i + 1}.</td>
                  <td>{game.clubs[r.clubId].shortName}</td>
                  <td className="num">{r.played}</td>
                  <td className="num">{r.won}</td>
                  <td className="num">{r.drawn}</td>
                  <td className="num">{r.lost}</td>
                  <td className="num">{r.goalsFor}:{r.goalsAgainst}</td>
                  <td className="num"><strong>{r.points}</strong></td>
                  <td className="hide-sm">
                    <span className="form">{r.form.map((f, j) => <span key={j} className={`form-${f}`}>{f}</span>)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          {comp.promote > 0 && <><span className="legend zone-up" /> postup </>}
          {comp.relegate > 0 && <><span className="legend zone-down" /> sestup</>}
        </p>
      </section>

      <section className="card">
        <h2>Střelci</h2>
        {scorers.length === 0 ? (
          <p className="muted">Zatím nikdo neskóroval.</p>
        ) : (
          <table>
            <tbody>
              {scorers.map((p, i) => (
                <tr key={p.id} className={p.clubId === ownId ? 'own-row' : ''}>
                  <td className="num">{i + 1}.</td>
                  <td>{p.firstName} {p.lastName}</td>
                  <td className="muted">{game.clubs[p.clubId].shortName}</td>
                  <td className="num"><strong>{p.goals}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
