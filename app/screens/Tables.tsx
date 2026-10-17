import { useState } from 'react';
import { seasonOutlook, isRival, ratingText, averageRating, competitionOf, finalStandings, playerAge, playerName, POSITION_LABEL, POSITION_SHORT, type GameState, type Position } from '../../engine';
import { Chips, DataTable, useStoredState } from '../table';
import { ClubLink, PlayerLink, useNav } from '../nav';
import { RivalsLine, RoundReportCard, StandingsPath } from './LeagueExtras';

export function Tables({ game }: { game: GameState }) {
  const ownId = game.owner.clubId;
  const nav = useNav();
  const comps = Object.values(game.competitions).sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name, 'cs'));
  const [compId, setCompId] = useState(competitionOf(game, ownId)?.id ?? comps[0].id);
  const comp = game.competitions[compId];
  const outlook = new Map(seasonOutlook(game, comp).map((o) => [o.clubId, o]));
  const table = finalStandings(comp, game).map((r, i) => ({ ...r, rank: i + 1, o: outlook.get(r.clubId) }));
  const pct = (v?: number) => (v === undefined ? '–' : v >= 0.995 ? 'jistě' : v < 0.005 ? '–' : `${Math.round(v * 100)} %`);
  const n = table.length;
  const [filter, setFilter] = useStoredState('filtr:statistiky', { club: '', position: '' as Position | '' });

  // Při nadstavbě: hranice skupin v tabulce.
  const groupStart = new Set<number>();
  let acc = 0;
  for (const g of comp.groups ?? []) {
    if (acc > 0) groupStart.add(acc + 1);
    acc += g.clubIds.length;
  }

  const lowerPlayoff = Object.values(game.competitions).find((c) => c.playoff?.vs === comp.id)?.playoff;
  const zone = (rank: number) => {
    if (rank <= comp.promote) return 'zone-up';
    if (rank > n - comp.relegate) return 'zone-down';
    if (comp.playoff?.upper.includes(rank) || lowerPlayoff?.lower.includes(rank)) return 'zone-playoff';
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
        {comp.groups ? (
          <p className="muted small">Nadstavba: {comp.groups.map((g, i) => `${g.name} (${i === 0 ? 1 : comp.groups!.slice(0, i).reduce((a, x) => a + x.clubIds.length, 0) + 1}.–${comp.groups!.slice(0, i + 1).reduce((a, x) => a + x.clubIds.length, 0)}. místo)`).join(', ')}. Body ze základní části se počítají.</p>
        ) : comp.format === 'nadstavba' ? (
          <p className="muted small">Po 30 kolech se soutěž rozdělí na skupinu o titul (1.–6.), o umístění (7.–10.) a o záchranu (11.–16.).</p>
        ) : null}
        <DataTable
          id="tabulka-souteze"
          rows={table}
          rowKey={(r) => r.clubId}
          initialSort={{ key: 'rank', dir: 'asc' }}
          rowClassName={(r) => `${zone(r.rank)} ${r.clubId === ownId ? 'own-row' : ''} ${groupStart.has(r.rank) ? 'group-start' : ''}`}
          columns={[
            { key: 'rank', label: '#', num: true, value: (r) => r.rank, render: (r) => `${r.rank}.` },
            { key: 'club', label: 'Klub', value: (r) => game.clubs[r.clubId].shortName, render: (r) => <><ClubLink id={r.clubId}>{game.clubs[r.clubId].shortName}</ClubLink>{isRival(game, r.clubId) && <span className="rival-tag" title={isRival(game, r.clubId)!.label}> ⚔</span>}</> },
            { key: 'played', label: 'Z', num: true, value: (r) => r.played },
            { key: 'won', label: 'V', num: true, value: (r) => r.won },
            { key: 'drawn', label: 'R', num: true, value: (r) => r.drawn },
            { key: 'lost', label: 'P', num: true, value: (r) => r.lost },
            { key: 'gf', label: 'Skóre', num: true, value: (r) => r.goalsFor - r.goalsAgainst, render: (r) => `${r.goalsFor}:${r.goalsAgainst}` },
            { key: 'pts', label: 'Body', num: true, value: (r) => r.points, render: (r) => <strong>{r.points}</strong> },
            { key: 'top', label: comp.tier === 1 ? 'Titul' : 'Postup', num: true, hideSm: true, value: (r) => (comp.tier === 1 ? r.o?.title : r.o?.promote) ?? 0, render: (r) => pct(comp.tier === 1 ? r.o?.title : r.o?.promote) },
            ...(comp.tier === 1 ? [{ key: 'eu', label: 'Evropa', num: true, hideSm: true, value: (r: (typeof table)[number]) => r.o?.europe ?? 0, render: (r: (typeof table)[number]) => pct(r.o?.europe) }] : []),
            { key: 'down', label: 'Sestup', num: true, hideSm: true, value: (r) => r.o?.relegate ?? 0, render: (r) => pct(r.o?.relegate) },
            {
              key: 'form',
              label: 'Forma',
              hideSm: true,
              render: (r) => <span className="form">{r.form.map((f, j) => <span key={j} className={`form-${f}`}>{f}</span>)}</span>,
            },
          ]}
        />
        {comp.clubIds.includes(ownId) && <RivalsLine game={game} />}
        <p className="muted small">
          Šance jsou odhad z 300 simulací zbytku sezóny podle síly sestav a trenérů.{' '}
          {comp.promote > 0 && <><span className="legend zone-up" /> postup </>}
          {lowerPlayoff && <><span className="legend zone-playoff" /> baráž </>}
          {comp.relegate > 0 && <><span className="legend zone-down" /> sestup</>}
          {comp.playoff && <><span className="legend zone-playoff" /> baráž</>}
        </p>
      </section>

      {comp.clubIds.includes(ownId) && (
        <>
          <StandingsPath game={game} />
          <RoundReportCard game={game} />
        </>
      )}

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
            {
              key: 'name',
              label: 'Hráč',
              value: (p) => p.lastName,
              render: (p) => (
                <>
                  {p.clubId !== ownId && nav.watch && (
                    <button className="star-btn" title="Sledovat hráče" onClick={(e) => { e.stopPropagation(); nav.watch!(p.id); }}>{(game.watchlist ?? []).includes(p.id) ? '★' : '☆'}</button>
                  )}
                  <PlayerLink id={p.id}>{playerName(p)}</PlayerLink>
                </>
              ),
            },
            { key: 'club', label: 'Klub', hideSm: true, value: (p) => game.clubs[p.clubId].shortName, className: () => 'muted' },
            { key: 'pos', label: 'Poz.', hideSm: true, value: (p) => ['GK', 'DF', 'MF', 'FW'].indexOf(p.position), render: (p) => POSITION_SHORT[p.position], className: () => 'muted' },
            { key: 'age', label: 'Věk', num: true, hideSm: true, value: (p) => playerAge(p, game.season) },
            { key: 'apps', label: 'Záp.', num: true, value: (p) => p.apps },
            { key: 'starts', label: 'Start', num: true, hideSm: true, title: 'Zápasy v základní sestavě', value: (p) => p.starts },
            { key: 'minutes', label: 'Min.', num: true, hideSm: true, value: (p) => p.minutes },
            { key: 'goals', label: 'G', num: true, title: 'Góly', value: (p) => p.goals, render: (p) => <strong>{p.goals}</strong> },
            { key: 'assists', label: 'A', num: true, title: 'Asistence', value: (p) => p.assists },
            { key: 'points', label: 'G+A', num: true, hideSm: true, value: (p) => p.goals + p.assists },
            { key: 'yellows', label: 'ŽK', num: true, hideSm: true, value: (p) => p.yellows },
            { key: 'reds', label: 'ČK', num: true, hideSm: true, value: (p) => p.reds },
            {
              key: 'avg',
              label: 'Ø zn.',
              num: true,
              title: 'Průměrná známka 1–10 (aspoň 3 hodnocené zápasy)',
              value: (p) => (p.ratingCount >= 3 ? averageRating(p)! : 0),
              render: (p) => (p.ratingCount >= 3 ? ratingText(averageRating(p)!, 2) : '–'),
            },
          ]}
        />
      </section>
    </div>
  );
}
