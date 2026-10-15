import { useState } from 'react';
import { competitionOf, formatShortDate, type Fixture, type GameState } from '../../engine';
import { num } from '../format';
import { Chips, DataTable, useStoredState } from '../table';

export function Matches({ game, onOpenMatch }: { game: GameState; onOpenMatch: (id: string) => void }) {
  const ownId = game.owner.clubId;
  const comp = competitionOf(game, ownId);
  const played = comp?.fixtures.filter((f) => f.result) ?? [];
  const currentRound = played.length ? Math.max(...played.map((f) => f.round)) : 1;
  const [round, setRound] = useState(currentRound);
  const [filter, setFilter] = useStoredState('filtr:zapasy', { venue: '' as '' | 'doma' | 'venku', result: '' as '' | 'V' | 'R' | 'P' | 'N' });

  if (!comp) return <p className="muted">Klub nehraje žádnou soutěž.</p>;
  const rounds = Math.max(...comp.fixtures.map((f) => f.round));
  const own = comp.fixtures.filter((f) => f.homeId === ownId || f.awayId === ownId).sort((a, b) => a.round - b.round);
  const roundFixtures = comp.fixtures.filter((f) => f.round === round);
  const rows = own
    .map((f) => {
      const home = f.homeId === ownId;
      const r = f.result;
      const diff = r ? (home ? 1 : -1) * (r.homeGoals - r.awayGoals) : 0;
      const outcome: 'V' | 'R' | 'P' | 'N' = !r ? 'N' : diff > 0 ? 'V' : diff < 0 ? 'P' : 'R';
      return { f, home, outcome };
    })
    .filter((x) => (!filter.venue || (filter.venue === 'doma') === x.home) && (!filter.result || x.outcome === filter.result));

  const scorers = (f: Fixture, clubId: string) =>
    f.result?.scorers
      .filter((s) => s.clubId === clubId)
      .map((s) => `${game.players[s.playerId]?.lastName ?? '?'} ${s.minute}.`)
      .join(', ');

  return (
    <div className="grid two">
      <section className="card">
        <h2>Zápasy klubu</h2>
        <p className="muted small">Kliknutím na odehraný zápas otevřete náhled se sestavami a statistikami.</p>
        <div className="filters">
          <Chips
            options={[{ value: 'doma', label: 'doma' }, { value: 'venku', label: 'venku' }]}
            value={filter.venue}
            onChange={(venue) => setFilter({ ...filter, venue })}
          />
          <Chips
            options={[
              { value: 'V', label: 'výhry' },
              { value: 'R', label: 'remízy' },
              { value: 'P', label: 'prohry' },
              { value: 'N', label: 'nehráno' },
            ]}
            value={filter.result}
            onChange={(result) => setFilter({ ...filter, result })}
            allLabel="všechny výsledky"
          />
        </div>
        <DataTable
          id="zapasy-klubu"
          rows={rows}
          rowKey={(x) => x.f.id}
          initialSort={{ key: 'round', dir: 'asc' }}
          onRowClick={(x) => x.f.result && onOpenMatch(x.f.id)}
          empty="Filtrům neodpovídá žádný zápas."
          columns={[
            { key: 'round', label: 'Kolo', num: true, value: (x) => x.f.round, render: (x) => `${x.f.round}.`, className: () => 'muted' },
            { key: 'date', label: 'Datum', value: (x) => x.f.date, render: (x) => formatShortDate(x.f.date), className: () => 'muted' },
            { key: 'venue', label: 'Kde', value: (x) => (x.home ? 'doma' : 'venku') },
            { key: 'opp', label: 'Soupeř', value: (x) => game.clubs[x.home ? x.f.awayId : x.f.homeId].shortName },
            {
              key: 'score',
              label: 'Výsledek',
              num: true,
              value: (x) => (x.f.result ? (x.home ? 1 : -1) * (x.f.result.homeGoals - x.f.result.awayGoals) : -99),
              render: (x) =>
                x.f.result ? (
                  <span className={`score ${x.outcome === 'V' ? 'win' : x.outcome === 'P' ? 'loss' : 'draw'}`}>
                    {x.f.result.homeGoals}:{x.f.result.awayGoals}
                  </span>
                ) : (
                  '–'
                ),
            },
            { key: 'att', label: 'Diváci', num: true, hideSm: true, value: (x) => x.f.result?.attendance ?? 0, render: (x) => (x.f.result ? num(x.f.result.attendance) : '') },
          ]}
        />
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
              <button className="fixture-btn" disabled={!f.result} onClick={() => onOpenMatch(f.id)} aria-label={`Náhled zápasu ${game.clubs[f.homeId].shortName} – ${game.clubs[f.awayId].shortName}`}>
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
                  {f.result.detail && <> · xG {f.result.detail.home.xg.toFixed(1)}:{f.result.detail.away.xg.toFixed(1)}</>}
                </div>
              )}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
