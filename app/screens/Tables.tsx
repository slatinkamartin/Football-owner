import { useState } from 'react';
import { competitionOf, computeTable, playerAge, playerName, POSITION_LABEL, POSITION_SHORT, type GameState, type Position } from '../../engine';
import { Chips, DataTable, useStoredState } from '../table';

export function Tables({ game }: { game: GameState }) {
  const ownId = game.owner.clubId;
  const comps = Object.values(game.competitions).sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name, 'cs'));
  const [compId, setCompId] = useState(competitionOf(game, ownId)?.id ?? comps[0].id);
  const comp = game.competitions[compId];
  const table = computeTable(comp, game).map((r, i) => ({ ...r, rank: i + 1 }));
  const n = table.length;
  const [filter, setFilter] = useStoredState('filtr:statistiky', { club: '', position: '' as Position | '' });

  const zone = (rank: number) => {
    if (rank <= comp.promote) return 'zone-up';
    if (rank > n - comp.relegate) return 'zone-down';
    return '';
  };

  const clubFilter = comp.clubIds.includes(filter.club) ? filter.club : '';
  const players = Object.values(game.players).filter(
    (p) =>
      comp.clubIds.includes(p.clubId) &&
      p.apps > 0 &&
      (!clubFilter || p.clubId === clubFilter) &&
      (!filter.position || p.position === filter.position),
  );

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
        <DataTable
          id="tabulka-souteze"
          rows={table}
          rowKey={(r) => r.clubId}
          initialSort={{ key: 'rank', dir: 'asc' }}
          rowClassName={(r) => `${zone(r.rank)} ${r.clubId === ownId ? 'own-row' : ''}`}
          columns={[
            { key: 'rank', label: '#', num: true, value: (r) => r.rank, render: (r) => `${r.rank}.` },
            { key: 'club', label: 'Klub', value: (r) => game.clubs[r.clubId].shortName },
            { key: 'played', label: 'Z', num: true, value: (r) => r.played },
            { key: 'won', label: 'V', num: true, value: (r) => r.won },
            { key: 'drawn', label: 'R', num: true, value: (r) => r.drawn },
            { key: 'lost', label: 'P', num: true, value: (r) => r.lost },
            { key: 'gf', label: 'Skóre', num: true, value: (r) => r.goalsFor - r.goalsAgainst, render: (r) => `${r.goalsFor}:${r.goalsAgainst}` },
            { key: 'pts', label: 'Body', num: true, value: (r) => r.points, render: (r) => <strong>{r.points}</strong> },
            {
              key: 'form',
              label: 'Forma',
              hideSm: true,
              render: (r) => <span className="form">{r.form.map((f, j) => <span key={j} className={`form-${f}`}>{f}</span>)}</span>,
            },
          ]}
        />
        <p className="muted small">
          {comp.promote > 0 && <><span className="legend zone-up" /> postup </>}
          {comp.relegate > 0 && <><span className="legend zone-down" /> sestup</>}
        </p>
      </section>

      <section className="card">
        <h2>Statistiky hráčů</h2>
        <div className="filters">
          <label>
            <span>Klub</span>
            <select id="st-club" value={clubFilter} onChange={(e) => setFilter({ ...filter, club: e.target.value })}>
              <option value="">všechny</option>
              {[...comp.clubIds]
                .sort((a, b) => game.clubs[a].shortName.localeCompare(game.clubs[b].shortName, 'cs'))
                .map((id) => <option key={id} value={id}>{game.clubs[id].shortName}</option>)}
            </select>
          </label>
          <Chips
            options={(['GK', 'DF', 'MF', 'FW'] as Position[]).map((p) => ({ value: p, label: POSITION_LABEL[p] }))}
            value={filter.position}
            onChange={(position) => setFilter({ ...filter, position })}
            allLabel="všechny pozice"
          />
        </div>
        <DataTable
          id="statistiky-hracu"
          rows={players}
          rowKey={(p) => p.id}
          initialSort={{ key: 'goals', dir: 'desc' }}
          rowClassName={(p) => (p.clubId === ownId ? 'own-row' : '')}
          limit={30}
          empty="Zatím nikdo nenastoupil."
          columns={[
            { key: 'name', label: 'Hráč', value: (p) => p.lastName, render: (p) => playerName(p) },
            { key: 'club', label: 'Klub', value: (p) => game.clubs[p.clubId].shortName, className: () => 'muted' },
            { key: 'pos', label: 'Poz.', value: (p) => ['GK', 'DF', 'MF', 'FW'].indexOf(p.position), render: (p) => POSITION_SHORT[p.position], className: () => 'muted' },
            { key: 'age', label: 'Věk', num: true, hideSm: true, value: (p) => playerAge(p, game.season) },
            { key: 'apps', label: 'Zápasy', num: true, value: (p) => p.apps },
            { key: 'goals', label: 'Góly', num: true, value: (p) => p.goals, render: (p) => <strong>{p.goals}</strong> },
            { key: 'gpm', label: 'Góly/záp.', num: true, hideSm: true, value: (p) => (p.apps ? p.goals / p.apps : 0), render: (p) => (p.apps ? (p.goals / p.apps).toFixed(2) : '–') },
          ]}
        />
      </section>
    </div>
  );
}
