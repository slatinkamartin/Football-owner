import { competitionOf, computeTable, formatDate, formatShortDate, seasonLabel, type GameState } from '../../engine';
import { money } from '../format';

export function Overview({ game }: { game: GameState }) {
  const club = game.clubs[game.owner.clubId];
  const comp = competitionOf(game, club.id);
  const table = comp ? computeTable(comp, game) : [];
  const position = table.findIndex((r) => r.clubId === club.id);
  const row = table[position];
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

      <section className="card wide">
        <h2>Zprávy</h2>
        <ul className="news">
          {game.news.slice(0, 25).map((n, i) => (
            <li key={i} className={`news-${n.kind}`}>
              <span className="news-date">{formatShortDate(n.date)}</span>
              <div>
                <strong>{n.title}</strong>
                {n.text && <p>{n.text}</p>}
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
