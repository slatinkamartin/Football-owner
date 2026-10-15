import {
  coachOf,
  competitionOf,
  computeTable,
  contractExpiring,
  directorOf,
  formatDate,
  formatShortDate,
  goalLabel,
  goalTarget,
  seasonLabel,
  squadOf,
  transferWindow,
  type GameState,
} from '../../engine';
import { Badge } from '../components';
import { findFixture } from './MatchDetail';
import { LineChart } from '../chart';
import { PlayerLink } from '../nav';
import { money } from '../format';

type Target = 'prestupy' | 'vedeni' | 'kadr';

export function Overview({
  game,
  onNavigate,
  onOpenMatch,
}: {
  game: GameState;
  onNavigate: (tab: Target) => void;
  onOpenMatch: (id: string) => void;
}) {
  const club = game.clubs[game.owner.clubId];
  const comp = competitionOf(game, club.id);
  const table = comp ? computeTable(comp, game) : [];
  const position = table.findIndex((r) => r.clubId === club.id);
  const row = table[position];
  const last = comp?.fixtures
    .filter((f) => f.result && (f.homeId === club.id || f.awayId === club.id))
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const next = comp?.fixtures
    .filter((f) => !f.result && (f.homeId === club.id || f.awayId === club.id))
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0];

  return (
    <div className="grid">
      <section className="card">
        <h2>Další zápas</h2>
        {next ? (
          <>
            <div className="match-big">
              <span className={next.homeId === club.id ? 'own' : ''}>{game.clubs[next.homeId].shortName}</span>
              <span className="vs">–</span>
              <span className={next.awayId === club.id ? 'own' : ''}>{game.clubs[next.awayId].shortName}</span>
            </div>
            <p className="muted">
              {formatDate(next.date, true)} · {comp?.name}, {next.round}. kolo
            </p>
          </>
        ) : (
          <p className="muted">V této sezóně už klub nehraje.</p>
        )}
      </section>

      {last && (
        <section className="card">
          <h2>Poslední zápas</h2>
          <div className="match-big">
            <span className={last.homeId === club.id ? 'own' : ''}>{game.clubs[last.homeId].shortName}</span>
            <span>{last.result!.homeGoals}:{last.result!.awayGoals}</span>
            <span className={last.awayId === club.id ? 'own' : ''}>{game.clubs[last.awayId].shortName}</span>
          </div>
          <p className="muted">
            {formatDate(last.date, true)}
            {last.result!.detail && <> · xG {last.result!.detail.home.xg.toFixed(1)} : {last.result!.detail.away.xg.toFixed(1)}</>}
          </p>
          <button onClick={() => onOpenMatch(last.id)}>Náhled zápasu</button>
        </section>
      )}

      <section className="card">
        <h2>Tabulka</h2>
        {row && row.played === 0 ? (
          <p className="muted">Sezóna ještě nezačala. {comp?.name}, {table.length} týmů.</p>
        ) : row ? (
          <>
            <div className="stat-big">{position + 1}. místo</div>
            <p className="muted">
              {comp?.name} · {row.points} bodů z {row.played} zápasů · skóre {row.goalsFor}:{row.goalsAgainst}
            </p>
            <div className="form">
              {row.form.map((f, i) => (
                <span key={i} className={`form-${f}`}>{f}</span>
              ))}
            </div>
          </>
        ) : (
          <p className="muted">Klub nehraje žádnou soutěž.</p>
        )}
      </section>

      <section className="card">
        <h2>Peníze</h2>
        <dl className="kv">
          <dt>Zůstatek klubu</dt>
          <dd className={club.finance.balance < 0 ? 'neg' : ''}>{money(club.finance.balance)}</dd>
          <dt>Vaše osobní peníze</dt>
          <dd>{money(game.owner.wallet)}</dd>
          <dt>Váš podíl</dt>
          <dd>{Math.round(game.owner.share * 100)} %</dd>
        </dl>
      </section>

      <ToDo game={game} onNavigate={onNavigate} />

      {game.timeline.length >= 2 && comp && (
        <section className="card wide">
          <LineChart
            title={`Pozice v tabulce v sezóně ${seasonLabel(game.season)}`}
            points={[...game.timeline].sort((a, b) => a.round - b.round).map((t) => ({ label: `${t.round}. kolo`, value: t.position }))}
            format={(v) => `${Math.round(v)}.`}
            invert
            min={1}
            max={comp.clubIds.length}
          />
        </section>
      )}

      <section className="card wide">
        <h2>Zprávy</h2>
        <ul className="news">
          {game.news.slice(0, 25).map((n, i) => (
            <li key={i} className={`news-${n.kind}`}>
              <span className="news-date">{formatShortDate(n.date)}</span>
              <div>
                <strong>{n.title}</strong>
                {n.text && <p>{n.text}</p>}
                {n.playerId && game.players[n.playerId] && (
                  <PlayerLink id={n.playerId}>Karta hráče</PlayerLink>
                )}{' '}
                {n.fixtureId && findFixture(game, n.fixtureId) && (
                  <button className="linkbtn" onClick={() => onOpenMatch(n.fixtureId!)}>
                    Náhled zápasu
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {game.history.length > 0 && (
        <section className="card wide">
          <h2>Historie klubu</h2>
          <table>
            <thead>
              <tr><th>Sezóna</th><th>Soutěž</th><th className="num">Umístění</th><th className="num">Body</th></tr>
            </thead>
            <tbody>
              {[...game.history].reverse().map((h) => (
                <tr key={h.season}>
                  <td>{seasonLabel(h.season)}</td>
                  <td>{game.competitions[h.ownerClub.competitionId]?.name ?? '–'}</td>
                  <td className="num">{h.ownerClub.position}.</td>
                  <td className="num">{h.ownerClub.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function ToDo({ game, onNavigate }: { game: GameState; onNavigate: (tab: Target) => void }) {
  const own = game.owner.clubId;
  const comp = competitionOf(game, own);
  const coach = coachOf(game, own);
  const director = directorOf(game, own);
  const window = transferWindow(game.date);
  const items: { text: string; tab: Target; tone: 'good' | 'warn' | 'bad' | 'neutral' }[] = [];
  if (!coach) items.push({ text: 'Klub nemá hlavního trenéra', tab: 'vedeni', tone: 'bad' });
  if (!director) items.push({ text: 'Klub nemá sportovního ředitele', tab: 'vedeni', tone: 'warn' });
  if (game.market.offers.length) items.push({ text: `Nabídky na naše hráče: ${game.market.offers.length}`, tab: 'prestupy', tone: 'warn' });
  if (window && game.market.proposals.length) items.push({ text: `Návrhy posil od ředitele: ${game.market.proposals.length}`, tab: 'prestupy', tone: 'neutral' });
  if (game.market.negotiation && !['hotovo', 'neuspech'].includes(game.market.negotiation.stage)) {
    items.push({ text: 'Rozjednaný přestup čeká na vaši nabídku', tab: 'prestupy', tone: 'warn' });
  }
  const injured = squadOf(game, own).filter((p) => p.injuredUntil && p.injuredUntil >= game.date).length;
  const banned = squadOf(game, own).filter((p) => p.suspension > 0).length;
  if (injured) items.push({ text: `Zranění hráči: ${injured}`, tab: 'kadr', tone: injured >= 4 ? 'bad' : 'warn' });
  if (banned) items.push({ text: `Hráči se stopkou: ${banned}`, tab: 'kadr', tone: 'warn' });
  const expiring = squadOf(game, own).filter((p) => contractExpiring(game, p)).length;
  if (expiring && game.date.slice(5) >= '01-01' && game.date.slice(5) < '06-20') {
    items.push({ text: `Končící smlouvy: ${expiring}`, tab: 'kadr', tone: 'neutral' });
  }
  for (const role of ['trener', 'reditel'] as const) {
    if (game.owner.trust[role] < 30) {
      items.push({ text: `${role === 'trener' ? 'Trenér' : 'Ředitel'} ztrácí důvěru ve vedení`, tab: 'vedeni', tone: 'bad' });
    }
  }

  return (
    <section className="card">
      <h2>Vedení klubu</h2>
      <dl className="kv">
        <dt>Cíl sezóny</dt>
        <dd>{comp ? `${goalLabel(game.owner.seasonGoal, comp)}` : '–'}</dd>
        <dt>Trenér</dt>
        <dd>{coach ? `${coach.firstName} ${coach.lastName}` : 'neobsazeno'}</dd>
        <dt>Sportovní ředitel</dt>
        <dd>{director ? `${director.firstName} ${director.lastName}` : 'neobsazeno'}</dd>
        <dt>Přestupní okno</dt>
        <dd>{window ? 'otevřené' : 'zavřené'}</dd>
      </dl>
      {comp && <p className="muted small">Cíl znamená skončit do {goalTarget(game.owner.seasonGoal, comp)}. místa.</p>}
      {items.length > 0 && (
        <ul className="todo">
          {items.map((it, i) => (
            <li key={i}>
              <button className="linklike" onClick={() => onNavigate(it.tab)}>
                <Badge tone={it.tone}>{it.text}</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
