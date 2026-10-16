import {
  averageRating,
  clubLabel,
  competitionOf,
  contractExpiring,
  formatShortDate,
  FREE,
  interest,
  playerAge,
  playerName,
  playerWage,
  playerValue,
  POSITION_LABEL,
  scouted,
  transferWindow,
  type GameState,
} from '../../engine';
import { LineChart } from '../chart';
import { Badge, Meter } from '../components';
import { money } from '../format';
import { ClubLink, useNav } from '../nav';

const MONTHS = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];
const monthLabel = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(2, 4)}`;
const seasonShort = (s: number) => `${String(s).slice(2)}/${String(s + 1).slice(2)}`;

export function PlayerCard({ game, playerId }: { game: GameState; playerId: string }) {
  const nav = useNav();
  const p = game.players[playerId];
  if (!p) {
    return (
      <>
        <h2>Hráč už v české lize nehraje</h2>
        <p className="muted">Odešel do zahraničí, nebo ukončil kariéru.</p>
      </>
    );
  }
  const own = p.clubId === game.owner.clubId;
  const view = scouted(game, p);
  const approx = (v: number) => (view.exact ? String(v) : `≈${v}`);
  const injured = p.injuredUntil && p.injuredUntil >= game.date;
  const avg = averageRating(p);
  const comp = competitionOf(game, p.clubId);
  const value = playerValue(game, p);
  const canNegotiate = !own && !!transferWindow(game.date) && interest(game, p, game.owner.clubId).ok;

  // Vývoj: hráči klubu majitele mají měsíční záznamy, ostatní jen konce sezón.
  const monthly = own && (p.trend?.length ?? 0) >= 2;
  const overallPoints = monthly
    ? [...p.trend!.map((t) => ({ label: monthLabel(t.date), value: t.overall }))]
    : [...p.career.map((c) => ({ label: seasonShort(c.season), value: c.overall })), { label: 'teď', value: view.overall }];
  const valuePoints = monthly
    ? p.trend!.map((t) => ({ label: monthLabel(t.date), value: t.value }))
    : [...p.career.map((c) => ({ label: seasonShort(c.season), value: c.value })), { label: 'teď', value }];

  return (
    <div className="player-card">
      <header className="pc-head">
        <div>
          <h2>{playerName(p)}</h2>
          <p className="muted">
            {POSITION_LABEL[p.position]}, {playerAge(p, game.season)} let ·{' '}
            {p.clubId === FREE ? 'volný hráč' : <ClubLink id={p.clubId}>{clubLabel(game, p.clubId)}</ClubLink>}
            {comp && ` (${comp.name})`}
          </p>
        </div>
        <div className="pc-badges">
          {injured && <Badge tone="bad">zraněn do {formatShortDate(p.injuredUntil!)}</Badge>}
          {p.suspension > 0 && <Badge tone="warn">stop {p.suspension}</Badge>}
          {game.market.listed.includes(p.id) && <Badge tone="warn">na prodej</Badge>}
          {own && p.morale < 25 && <Badge tone="bad">nespokojený</Badge>}
        </div>
      </header>

      <div className="pc-facts">
        <div className="pc-big">
          <span className="pc-num">{approx(view.overall)}</span>
          <span className="muted small">hodnocení</span>
        </div>
        <div className="pc-big">
          <span className="pc-num muted">{approx(view.potential)}</span>
          <span className="muted small">potenciál</span>
        </div>
        <div className="pc-big">
          <span className="pc-num">{money(value)}</span>
          <span className="muted small">tržní hodnota</span>
        </div>
        <div className="pc-big">
          <span className="pc-num">{avg ? avg.toFixed(2) : '–'}</span>
          <span className="muted small">Ø známka v sezóně</span>
        </div>
      </div>
      {!view.exact && <p className="muted small">Hodnocení cizích hráčů jsou odhady skautů.</p>}

      <div className="grid two">
        <dl className="kv meters">
          <dt>Forma (poslední zápasy)</dt>
          <dd className="form-ratings">
            {p.recent.length ? p.recent.map((r, i) => <span key={i} className={`rating ${r >= 7.5 ? 'r-good' : r < 6 ? 'r-bad' : ''}`}>{r.toFixed(1)}</span>) : <span className="muted">–</span>}
          </dd>
          <dt>Morálka</dt>
          <dd><Meter value={p.morale} /> {Math.round(p.morale)}</dd>
          <dt>Kondice</dt>
          <dd><Meter value={p.fitness} /> {Math.round(p.fitness)} %</dd>
        </dl>
        <dl className="kv">
          <dt>Plat</dt>
          <dd>{p.clubId === FREE ? `nárok ${money(p.wage)}` : `${money(p.wage)} měsíčně`}</dd>
          {own && (() => {
            const ratio = p.wage / Math.max(5_000, playerWage(p.overall, game.clubs[p.clubId].reputation));
            return (
              <>
                <dt>Spokojenost s platem</dt>
                <dd className={ratio < 0.85 ? 'neg' : ratio > 1.2 ? 'pos' : ''}>
                  {ratio < 0.7 ? 'cítí se podhodnocený' : ratio < 0.85 ? 'chtěl by víc' : ratio > 1.2 ? 'nadstandardní' : 'odpovídá trhu'}
                </dd>
              </>
            );
          })()}
          <dt>Smlouva do</dt>
          <dd className={contractExpiring(game, p) ? 'neg' : ''}>{p.clubId === FREE ? '–' : `30. 6. ${p.contractUntil}`}</dd>
          {own && p.bookValue !== undefined && (
            <>
              <dt>Účetní hodnota registrace</dt>
              <dd>{money(p.bookValue)}</dd>
            </>
          )}
        </dl>
      </div>

      {canNegotiate && (
        <div className="buttons">
          <button className="primary" onClick={() => nav.negotiate(p.id)}>Jednat o přestupu</button>
        </div>
      )}

      <h3>Sezóna {seasonShort(game.season)}</h3>
      <div className="stat-tiles">
        {[
          ['Zápasy', p.apps],
          ['V základu', p.starts],
          ['Minuty', p.minutes],
          ['Góly', p.goals],
          ['Asistence', p.assists],
          ['Žluté', p.yellows],
          ['Červené', p.reds],
        ].map(([label, v]) => (
          <div key={label} className="tile">
            <span className="tile-num">{v}</span>
            <span className="muted small">{label}</span>
          </div>
        ))}
      </div>

      <h3>Vývoj</h3>
      <p className="muted small">{monthly ? 'Měsíční záznamy od příchodu do klubu.' : 'Stav na konci každé sezóny.'}</p>
      <div className="grid two">
        <LineChart title="Hodnocení" points={overallPoints} format={(v) => String(Math.round(v))} />
        <LineChart title="Tržní hodnota" points={valuePoints} format={(v) => money(v)} min={0} />
      </div>

      <h3>Kariéra</h3>
      {p.career.length === 0 ? (
        <p className="muted">První sezóna ve hře.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sezóna</th><th>Klub</th><th className="hide-sm">Soutěž</th>
                <th className="num">Záp.</th><th className="num">G</th><th className="num">A</th>
                <th className="num">Ø</th><th className="num">Hodn.</th><th className="num hide-sm">Hodnota</th>
              </tr>
            </thead>
            <tbody>
              {[...p.career].reverse().map((c) => (
                <tr key={c.season}>
                  <td>{seasonShort(c.season)}</td>
                  <td>{c.club}</td>
                  <td className="muted hide-sm">{c.competition}</td>
                  <td className="num">{c.apps}</td>
                  <td className="num">{c.goals}</td>
                  <td className="num">{c.assists}</td>
                  <td className="num">{c.avgRating?.toFixed(2) ?? '–'}</td>
                  <td className="num">{c.overall}</td>
                  <td className="num hide-sm">{money(c.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {p.transfers.length > 0 && (
        <>
          <h3>Přestupy</h3>
          <table>
            <tbody>
              {[...p.transfers].reverse().map((t, i) => (
                <tr key={i}>
                  <td className="muted">{formatShortDate(t.date)} {t.date.slice(0, 4)}</td>
                  <td className="wrap">{t.from} → {t.to}</td>
                  <td className="num">{t.fee ? money(t.fee) : 'zdarma'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
