import {
  allFixtures,
  coachOf,
  competitionOf,
  finalStandings,
  formatShortDate,
  playerAge,
  playerName,
  playerValue,
  POSITION_SHORT,
  scouted,
  squadOf,
  STYLE_LABEL,
  clubMoment,
  isRival,
  OWNER_TYPE_LABEL,
  ownerTypeOf,
  type GameState,
} from '../../engine';
import { money, num } from '../format';
import { PlayerLink, useNav } from '../nav';
import { DataTable } from '../table';

export function ClubCard({ game, clubId }: { game: GameState; clubId: string }) {
  const nav = useNav();
  const club = game.clubs[clubId];
  if (!club) return <p className="muted">Klub nenalezen.</p>;
  const comp = competitionOf(game, clubId);
  const table = comp ? finalStandings(comp, game) : [];
  const idx = table.findIndex((r) => r.clubId === clubId);
  const row = table[idx];
  const coach = coachOf(game, clubId);
  const own = clubId === game.owner.clubId;
  const fixtures = allFixtures(game)
    .filter((x) => x.fixture.homeId === clubId || x.fixture.awayId === clubId)
    .sort((a, b) => (a.fixture.date < b.fixture.date ? -1 : 1));
  const played = fixtures.filter((x) => x.fixture.result).slice(-5).reverse();
  const next = fixtures.find((x) => !x.fixture.result);
  const squad = squadOf(game, clubId).map((p) => ({ p, view: scouted(game, p) }));
  const parent = club.reserveOf ? game.clubs[club.reserveOf] : undefined;

  return (
    <div className="club-card-sheet">
      <header className="pc-head">
        <div className="topbar-club">
          <span className="crest" style={{ background: club.colors[0], borderColor: club.colors[1] }} />
          <div>
            <h2>{club.name}</h2>
            <p className="muted">
              {club.city} · {comp?.name ?? 'mimo soutěž'}
              {parent && ` · B-tým klubu ${parent.shortName}`}
            </p>
            {!own && (
              <p className="small">
                Majitel: <strong>{OWNER_TYPE_LABEL[ownerTypeOf(clubId)].label}</strong> <span className="muted">({OWNER_TYPE_LABEL[ownerTypeOf(clubId)].hint})</span>
                {clubMoment(game, clubId) === 'krize' && <> · <span className="neg">v krizi</span></>}
                {clubMoment(game, clubId) === 'snura' && <> · <span className="pos">vítězná šňůra</span></>}
                {isRival(game, clubId) && <> · <strong>váš rival ({isRival(game, clubId)!.label})</strong></>}
              </p>
            )}
          </div>
        </div>
      </header>

      <div className="pc-facts">
        <div className="pc-big">
          <span className="pc-num">{row ? `${idx + 1}.` : '–'}</span>
          <span className="muted small">místo v tabulce</span>
        </div>
        <div className="pc-big">
          <span className="pc-num">{row ? row.points : '–'}</span>
          <span className="muted small">bodů, skóre {row ? `${row.goalsFor}:${row.goalsAgainst}` : '–'}</span>
        </div>
        <div className="pc-big">
          <span className="pc-num">{Math.round(club.reputation)}</span>
          <span className="muted small">pověst</span>
        </div>
        <div className="pc-big">
          <span className="pc-num">{money(squad.reduce((a, x) => a + playerValue(game, x.p), 0))}</span>
          <span className="muted small">hodnota kádru</span>
        </div>
      </div>

      <div className="grid two">
        <dl className="kv">
          <dt>Trenér</dt>
          <dd>{coach ? `${coach.firstName} ${coach.lastName}` : 'asistent'}</dd>
          {coach && (
            <>
              <dt>Schopnosti a styl</dt>
              <dd>{coach.ability}, {STYLE_LABEL[coach.style]}</dd>
            </>
          )}
          <dt>Stadion</dt>
          <dd>{club.stadium.name}</dd>
          <dt>Kapacita</dt>
          <dd>{num(club.stadium.capacity)}</dd>
        </dl>
        <div>
          <h3 className="h3-tight">Poslední zápasy</h3>
          {played.length === 0 ? (
            <p className="muted">Zatím nehrál.</p>
          ) : (
            <ul className="mini-results">
              {played.map(({ fixture: f, name }) => {
                const home = f.homeId === clubId;
                const r = f.result!;
                const diff = (home ? 1 : -1) * (r.homeGoals - r.awayGoals);
                const pen = r.penalties ? (home ? 1 : -1) * (r.penalties[0] - r.penalties[1]) : 0;
                const tone = diff > 0 || pen > 0 ? 'win' : diff < 0 || pen < 0 ? 'loss' : 'draw';
                return (
                  <li key={f.id}>
                    <button className="fixture-btn" onClick={() => nav.open({ type: 'match', id: f.id })}>
                      <span className={`score ${tone}`}>{r.homeGoals}:{r.awayGoals}</span>{' '}
                      {home ? 'doma s' : 'venku s'} {game.clubs[home ? f.awayId : f.homeId].shortName}
                      <span className="muted small"> · {name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {next && (
            <p className="muted small">
              Další zápas {formatShortDate(next.fixture.date)}: {game.clubs[next.fixture.homeId].shortName} – {game.clubs[next.fixture.awayId].shortName}
            </p>
          )}
        </div>
      </div>

      <h3>Kádr</h3>
      {!own && <p className="muted small">Hodnocení jsou odhady vašich skautů.</p>}
      <DataTable
        id="kadr-soupere"
        rows={squad}
        rowKey={(x) => x.p.id}
        initialSort={{ key: 'ovr', dir: 'desc' }}
        columns={[
          { key: 'name', label: 'Hráč', value: (x) => x.p.lastName, render: (x) => <PlayerLink id={x.p.id}>{playerName(x.p)}</PlayerLink> },
          { key: 'pos', label: 'Poz.', value: (x) => ['GK', 'DF', 'MF', 'FW'].indexOf(x.p.position), render: (x) => POSITION_SHORT[x.p.position], className: () => 'muted' },
          { key: 'age', label: 'Věk', num: true, value: (x) => playerAge(x.p, game.season) },
          { key: 'ovr', label: 'Hodn.', num: true, value: (x) => x.view.overall, render: (x) => <span className="rating">{x.view.exact ? '' : '≈'}{x.view.overall}</span> },
          { key: 'apps', label: 'Záp.', num: true, hideSm: true, value: (x) => x.p.apps },
          { key: 'goals', label: 'G', num: true, value: (x) => x.p.goals },
          { key: 'value', label: 'Hodnota', num: true, value: (x) => playerValue(game, x.p), render: (x) => money(playerValue(game, x.p)) },
        ]}
      />
    </div>
  );
}
