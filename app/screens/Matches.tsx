import { useState } from 'react';
import { competitionOf, cupPath, EUROPE_LABEL, europeStrength, formatShortDate, leaguePhaseChance, workload, type Cup, type Fixture, type GameState } from '../../engine';
import { Badge, Meter } from '../components';
import { money } from '../format';
import { num } from '../format';
import { Chips, DataTable, useStoredState } from '../table';
import { ClubLink } from '../nav';

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

  const w = workload(game);
  const path = cupPath(game);
  return (
    <div className="stack">
    <div className="grid two">
      <section className="card">
        <div className="row-between">
          <h2>Zátěž a kalendář</h2>
          <Badge tone={w.level === 'vysoka' ? 'bad' : w.level === 'stredni' ? 'warn' : 'good'}>{w.level === 'vysoka' ? 'vysoká zátěž' : w.level === 'stredni' ? 'střední zátěž' : 'klid'}</Badge>
        </div>
        <dl className="kv meters">
          <dt>Zápasy za poslední týden</dt>
          <dd>{w.recent}</dd>
          <dt>Zápasy v příštích 14 dnech</dt>
          <dd>{w.upcoming}</dd>
          <dt>Kondice opor</dt>
          <dd><Meter value={w.fitness} /> {w.fitness} %</dd>
          <dt>Zranění</dt>
          <dd>{w.injured}</dd>
        </dl>
        <p className="muted small">{w.advice} Rotaci doporučíte trenérovi v přípravě před zápasem. Šíře kádru a medicína rozhodují, jak zátěž tým unese.</p>
      </section>
      {path.length > 0 && (
        <section className="card">
          <h2>Cesta pohárem</h2>
          <ul className="plain cup-path">
            {path.map((s) => (
              <li key={s.name} className={`cup-${s.status}`}>
                <span className="cup-round-name">{s.name}</span>
                <span className="muted small">{formatShortDate(s.date)}</span>
                <span className="cup-text">{s.text}</span>
                <span className="num small">{money(s.prize)}</span>
              </li>
            ))}
          </ul>
          <p className="muted small">Prémie za postup do kola. U pohárového zápasu se vás hra zeptá na prémii hráčům a vstupné.</p>
        </section>
      )}
    </div>
    <EuropeRow game={game} />
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
            {
              key: 'opp',
              label: 'Soupeř',
              value: (x) => game.clubs[x.home ? x.f.awayId : x.f.homeId].shortName,
              render: (x) => <ClubLink id={x.home ? x.f.awayId : x.f.homeId}>{game.clubs[x.home ? x.f.awayId : x.f.homeId].shortName}</ClubLink>,
            },
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
    {Object.values(game.cups).map((cup) => (
      <CupSection key={cup.id} game={game} cup={cup} onOpenMatch={onOpenMatch} />
    ))}
    </div>
  );
}

function CupSection({ game, cup, onOpenMatch }: { game: GameState; cup: Cup; onOpenMatch: (id: string) => void }) {
  const own = game.owner.clubId;
  const inCup = cup.alive.includes(own);
  const played = cup.fixtures.some((f) => f.homeId === own || f.awayId === own);
  const status = cup.winner
    ? `Vítěz: ${game.clubs[cup.winner].shortName}`
    : !played && !inCup
      ? 'Váš klub se neúčastní.'
      : inCup
        ? 'Váš klub je stále ve hře.'
        : 'Váš klub je vyřazený.';
  const rounds = cup.kind === 'baraz' ? [1, 2] : cup.rounds.map((_, i) => i + 1).filter((r) => cup.fixtures.some((f) => f.round === r));
  return (
    <section className="card">
      <div className="row-between">
        <h2>{cup.name}</h2>
        <span className="muted small">{status}</span>
      </div>
      {cup.kind === 'pohar' && (
        <p className="muted small">
          Hraje se v úterý: {cup.rounds.map((r) => `${r.name} ${formatShortDate(r.date)}`).join(', ')}. Postup přináší prémie, vítěz dostane 10 mil. Kč.
        </p>
      )}
      <div className="cup-rounds">
        {[...rounds].reverse().map((r) => {
          const all = cup.fixtures.filter((f) => f.round === r);
          const mine = all.filter((f) => [f.homeId, f.awayId].includes(own));
          // Váš klub: jen jeho cesta, ostatní zápasy kola sbalené (finále se ukáže vždy).
          const others = all.filter((f) => ![f.homeId, f.awayId].includes(own));
          const showAll = cup.kind === 'baraz' || all.length <= 1;
          const list = (items: Fixture[]) => (
            <ul className="fixtures">
              {items.map((f) => (
                  <li key={f.id} className={[f.homeId, f.awayId].includes(own) ? 'own-row' : ''}>
                    <button className="fixture-btn" disabled={!f.result} onClick={() => onOpenMatch(f.id)}>
                      <div className="fixture-line">
                        <span className="team home">{game.clubs[f.homeId].shortName}</span>
                        <span className="score-box">
                          {f.result ? `${f.result.homeGoals}:${f.result.awayGoals}` : formatShortDate(f.date)}
                          {f.result?.penalties && <small className="muted"> pen. {f.result.penalties[0]}:{f.result.penalties[1]}</small>}
                        </span>
                        <span className="team">{game.clubs[f.awayId].shortName}</span>
                      </div>
                    </button>
                  </li>
                ))}
            </ul>
          );
          return (
            <div key={r} className="cup-round">
              <h3>{cup.kind === 'baraz' ? `${r}. zápas` : cup.rounds[r - 1].name}</h3>
              {showAll ? list(all) : (
                <>
                  {mine.length > 0 && list(mine)}
                  {others.length > 0 && (
                    <details className="cup-others">
                      <summary className="muted small">{mine.length ? 'Ostatní zápasy kola' : 'Zápasy kola'} ({others.length})</summary>
                      {list(others)}
                    </details>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Evropské poháry: předkola se nehrají jako zápasy, výsledek se rozhodne na konci srpna. */
function EuropeRow({ game }: { game: GameState }) {
  const eu = game.europe;
  const own = game.owner.clubId;
  const e = eu?.season === game.season ? eu.entries.find((x) => x.clubId === own) : undefined;
  if (!eu || !e) return null;
  const chance = Math.round(leaguePhaseChance(europeStrength(game, own), e.entry) * 100);
  return (
    <section className="card europe-row">
      <div className="row-between">
        <h2>Evropské poháry: předkola {EUROPE_LABEL[e.entry]}</h2>
        {eu.resolved ? (
          <Badge tone={e.result === 'predkola' ? 'bad' : 'good'}>{e.result === 'predkola' ? EUROPE_LABEL.predkola : `ligová fáze: ${EUROPE_LABEL[e.result]}`}</Badge>
        ) : (
          <Badge tone="warn">rozhodne se do konce srpna</Badge>
        )}
      </div>
      <p className="muted small">
        {eu.resolved
          ? e.result === 'predkola'
            ? `Klub vypadl v předkolech. Za účast dostal ${money(e.revenue)}.`
            : `Postup do ligové fáze. Peníze ${money(e.revenue)} chodí od října do ledna po částech.`
          : `Předkola se nehrají jako jednotlivé zápasy: o postupu rozhodne síla kádru (průměr 14 nejlepších hráčů). Šance na ligovou fázi teď asi ${chance} %. Posily do konce srpna ji zvednou.`}
      </p>
    </section>
  );
}
