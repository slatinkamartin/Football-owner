import { useState } from 'react';
import { seasonOutlook, isRival, ratingText, averageRating, competitionOf, finalStandings, playerAge, playerName, POSITION_LABEL, POSITION_SHORT, accessLabel, europeZones, formatShortDate, isPlacementFormat, placementCup, type AccessSlot, type Competition, type GameState, type Position } from '../../engine';
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
  // W1 v0.29: evropská místa podle přístupového seznamu UEFA (během nadstavby podle průběžného konečného pořadí).
  const euro = comp.tier === 1 ? europeZones(game, table.map((r) => r.clubId)) : undefined;
  const zoneTitle = (r: (typeof table)[number]) => {
    const e = euro?.get(r.clubId);
    if (e) return `${accessLabel(e)}${e.viaCup ? ' (vítěz poháru)' : ''}`;
    if (r.rank > n - comp.relegate) return 'sestup';
    if (comp.playoff?.upper.includes(r.rank) || lowerPlayoff?.lower.includes(r.rank)) return 'baráž';
    if (r.rank <= comp.promote) return 'postup';
    return undefined;
  };
  const zone = (rank: number, clubId?: string) => {
    const e = clubId ? euro?.get(clubId) : undefined;
    if (e) return euroZoneClass(e);
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
          <p className="muted small">
            {comp.clubIds.length === 16
              ? 'Po 30 kolech nadstavba (květen): skupina o titul (1.–6.) a o záchranu (11.–16.) jednokolově 5 kol, body zůstávají; 7.–10. hraje play-off o umístění.'
              : 'Po základní části se soutěž rozdělí na skupinu o titul, o umístění a o záchranu.'}
          </p>
        ) : null}
        <DataTable
          id="tabulka-souteze"
          rows={table}
          rowKey={(r) => r.clubId}
          initialSort={{ key: 'rank', dir: 'asc' }}
          rowClassName={(r) => `${zone(r.rank, r.clubId)} ${r.clubId === ownId ? 'own-row' : ''} ${groupStart.has(r.rank) ? 'group-start' : ''}`}
          columns={[
            { key: 'rank', label: '#', num: true, value: (r) => r.rank, render: (r) => <span title={zoneTitle(r)}>{r.rank}.</span> },
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
        {euro ? (
          <EuropeLegend game={game} comp={comp} ownRank={table.find((r) => r.clubId === ownId)?.rank} ownZone={(() => { const r = table.find((x) => x.clubId === ownId); return r ? zoneTitle(r) : undefined; })()} />
        ) : (
          <p className="muted small">
            {comp.promote > 0 && <><span className="legend zone-up" /> postup </>}
            {lowerPlayoff && <><span className="legend zone-playoff" /> baráž </>}
            {comp.relegate > 0 && <><span className="legend zone-down" /> sestup</>}
            {comp.playoff && <><span className="legend zone-playoff" /> baráž</>}
          </p>
        )}
        <p className="muted small">Šance jsou odhad z 300 simulací zbytku sezóny podle síly sestav a trenérů.</p>
      </section>

      {comp.groups && <NadstavbaCard game={game} comp={comp} />}

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

/** W1 v0.29: třída barevného pásma pro evropské místo. */
function euroZoneClass(e: AccessSlot): string {
  if (e.comp === 'LM') return e.stage === 'liga' ? 'zone-lm-liga' : 'zone-lm-q';
  if (e.comp === 'EL') return e.stage === 'PO' ? 'zone-el-po' : 'zone-el-q';
  return 'zone-kl';
}

/** W1 v0.29: legenda evropských míst, baráže a sestupu 1. ligy + vysvětlení pro váš klub (čitelné i na mobilu). */
function EuropeLegend({ game, comp, ownRank, ownZone }: { game: GameState; comp: Competition; ownRank?: number; ownZone?: string }) {
  const winner = game.cups.pohar?.winner;
  const items: { cls: string; label: string }[] = [
    { cls: 'zone-lm-liga', label: 'Liga mistrů – ligová fáze' },
    { cls: 'zone-lm-q', label: 'Liga mistrů – 2. předkolo' },
    ...(winner ? [{ cls: 'zone-el-po', label: 'Evropská liga – play-off' }] : []),
    { cls: 'zone-el-q', label: 'Evropská liga – 2. předkolo' },
    { cls: 'zone-kl', label: 'Konferenční liga – 2. předkolo' },
    ...(comp.playoff ? [{ cls: 'zone-playoff', label: 'baráž' }] : []),
    ...(comp.relegate > 0 ? [{ cls: 'zone-down', label: 'sestup' }] : []),
  ];
  const during = !!comp.groups;
  return (
    <div className="league-legend">
      <ul className="league-legend-list">
        {items.map((i) => (
          <li key={i.cls}><span className={`legend ${i.cls}`} />{i.label}</li>
        ))}
      </ul>
      <p className="muted small">
        Vítěz MOL Cupu (domácí pohár): Evropská liga – play-off (místo se jinak posouvá: když vítěz poháru skončí v lize 1.–4., hraje 3. tým EL play-off, 4. EL 2. předkolo a 5. KL 2. předkolo).
        {winner ? ` Letos pohár vyhrál ${game.clubs[winner]?.shortName ?? winner}.` : ''}
        {during ? ' Během nadstavby pásma ukazují průběžné konečné pořadí.' : ''}
      </p>
      {ownRank !== undefined && (
        <p className="small league-legend-own">
          Váš klub je teď {ownRank}.{ownZone ? <>: <strong>{ownZone}</strong></> : ' – mimo evropská místa'}.
        </p>
      )}
    </div>
  );
}

/** W1 v0.29: nadstavba – skupiny a pavouk play-off o umístění. */
function NadstavbaCard({ game, comp }: { game: GameState; comp: Competition }) {
  const cup = placementCup(game, comp);
  const groups = comp.groups ?? [];
  const ownId = game.owner.clubId;
  const name = (id: string) => game.clubs[id]?.shortName ?? id;
  const seeds = cup?.placement?.seeds ?? [];
  const seedNo = (id: string) => seeds.indexOf(id) + 7;
  let from = 1;
  const ranges = groups.map((g) => {
    const r = `${from}.–${from + g.clubIds.length - 1}.`;
    from += g.clubIds.length;
    return r;
  });
  const tieRow = (t: { upper: string; lower: string; winner?: string }, firstRound: number, label: string) => {
    const legs = (cup?.fixtures ?? []).filter((f) => (f.round === firstRound || f.round === firstRound + 1) && [f.homeId, f.awayId].includes(t.upper) && [f.homeId, f.awayId].includes(t.lower));
    const goals = (id: string) => legs.reduce((a, f) => a + (f.result ? (f.homeId === id ? f.result.homeGoals : f.result.awayGoals) : 0), 0);
    const played = legs.some((f) => f.result);
    const pens = legs.find((f) => f.result?.penalties)?.result?.penalties;
    const side = (id: string) => (
      <div className={`po-team ${t.winner === id ? 'won' : t.winner ? 'lost' : ''} ${id === ownId ? 'own' : ''}`}>
        <span className="po-seed">{seedNo(id)}.</span>
        <span className="po-name">{name(id)}</span>
        <span className="po-score">{played ? goals(id) : ''}</span>
      </div>
    );
    return (
      <div className="po-tie">
        <div className="po-label muted small">{label}</div>
        {side(t.lower)}
        {side(t.upper)}
        <div className="po-legs muted small">
          {legs.length
            ? legs.map((f) => `${name(f.homeId)} – ${name(f.awayId)} ${f.result ? `${f.result.homeGoals}:${f.result.awayGoals}` : formatShortDate(f.date)}`).join(' · ')
            : `${cup?.rounds[firstRound - 1]?.date ? formatShortDate(cup.rounds[firstRound - 1].date) : ''}`}
          {pens ? ` · pen. ${pens[0]}:${pens[1]}` : ''}
        </div>
      </div>
    );
  };
  const ties = cup?.ties ?? [];
  const final = ties[2];
  const modern = isPlacementFormat(comp);
  return (
    <section className="card nadstavba-card">
      <h2>Nadstavba</h2>
      <ul className="nadstavba-groups">
        {groups.map((g, i) => (
          <li key={g.name} className={g.clubIds.includes(ownId) ? 'own' : ''}>
            <strong>{g.name}</strong> <span className="muted small">({ranges[i]} místo{g.playoff ? ', vyřazovací dvojzápasy' : modern ? ', jednokolově 5 kol' : ', dvoukolově'})</span>
          </li>
        ))}
      </ul>
      {cup && (
        <>
          <h3>Play-off o umístění</h3>
          <div className="po-bracket">
            <div className="po-col">
              {ties[0] && tieRow(ties[0], 1, 'Semifinále 10.–7.')}
              {ties[1] && tieRow(ties[1], 1, 'Semifinále 9.–8.')}
            </div>
            <div className="po-col po-final">
              {final ? tieRow(final, 3, 'Finále o 7. místo') : (
                <div className="po-tie po-empty">
                  <div className="po-label muted small">Finále o 7. místo</div>
                  <div className="muted small">Vítězové semifinále, {formatShortDate(cup.rounds[2].date)} a {formatShortDate(cup.rounds[3].date)}</div>
                </div>
              )}
            </div>
          </div>
          <p className="muted small">
            1. zápas doma hůře umístěný po základní části. Při shodě skóre prodloužení a penalty. Vítěz finále je 7. a má volný los do 2. kola poháru (3 mil. Kč), poražený finalista 8. (1,5 mil. Kč), poražení semifinalisté 9. a 10. (9. je ten, kdo byl po základní části výš).
          </p>
        </>
      )}
    </section>
  );
}
