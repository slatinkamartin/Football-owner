import {
  formatShortDate,
  NATURE_LABEL,
  OWNER_RATING_LABEL,
  ownerRatingNow,
  seasonLabel,
  topRivals,
  type GameState,
  type OwnerRatingParts,
} from '../../engine';
import { LineChart } from '../chart';
import { Badge, Meter } from '../components';
import { ClubLink } from '../nav';

const gradeTone = (g: string) => (g <= 'B' ? 'good' : g >= 'E' ? 'bad' : 'neutral');
const signed = (v: number) => `${v > 0 ? '+' : ''}${v}`;

/** Soupeři v kanceláři: tři největší rivalové mezi vedeními klubů. */
export function RivalsCard({ game }: { game: GameState }) {
  const rows = topRivals(game, 3);
  return (
    <section className="card rivals-card">
      <h2>Soupeři v kanceláři</h2>
      {rows.length === 0 ? (
        <p className="muted small">Zatím žádní rivalové.</p>
      ) : (
        <ul className="plain rivals-list">
          {rows.map((r) => (
            <li key={r.clubId}>
              <div className="row-between">
                <ClubLink id={r.clubId}>Vedení klubu {game.clubs[r.clubId].shortName}</ClubLink>
                <span className="small muted">{NATURE_LABEL[r.nature].label}</span>
              </div>
              <div className="rivals-meters small">
                <span>Rivalita</span>
                <Meter value={r.rivalry} tone={r.rivalry >= 60 ? 'bad' : r.rivalry >= 30 ? 'warn' : 'neutral'} />
                <span className="muted">{r.rivalry}</span>
                <span>Vztah <strong className={r.relation < 0 ? 'neg' : 'pos'}>{signed(r.relation)}</strong></span>
              </div>
              <p className="small muted">{r.last ? `Poslední střet ${formatShortDate(r.last.date)}: ${r.last.text}` : 'Zatím žádný střet.'}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">Rivalita roste po derby a vzájemných zápasech, při soubojích o hráče a sponzory. Dobré vztahy znamenají méně přebíjení a přetahování.</p>
    </section>
  );
}

/** Hodnocení majitele: průběžný odhad, pořadí mezi majiteli soutěže a graf posledních sezón. */
export function OwnerRatingCard({ game }: { game: GameState }) {
  const now = ownerRatingNow(game);
  const history = game.ownerRatings ?? [];
  return (
    <section className="card owner-rating">
      <div className="row-between">
        <h2>Hodnocení majitele</h2>
        {now && <span className="small muted">průběžný odhad</span>}
      </div>
      {!now ? (
        <p className="muted small">Hodnocení se ukáže, až bude klub hrát soutěž.</p>
      ) : (
        <>
          <div className="owner-grade-row">
            <span className={`owner-grade grade-${now.row.grade}`} aria-label={`Známka ${now.row.grade}`}>{now.row.grade}</span>
            <div>
              <strong>{now.rank}. z {now.of}</strong> <span className="muted">majitelů soutěže</span>
              <div className="small muted">
                skóre {now.row.score} ze 100 ·{' '}
                {now.row.played === 0 ? `liga ještě nezačala, podle pověsti se čeká ${now.row.expected}. místo` : `${now.row.position}. místo, podle pověsti se čekalo ${now.row.expected}.`}
              </div>
            </div>
          </div>
          <ul className="plain owner-rating-parts small">
            {(Object.keys(OWNER_RATING_LABEL) as (keyof OwnerRatingParts)[]).map((k) => (
              <li key={k}>
                <span>{OWNER_RATING_LABEL[k]}</span>
                <Meter value={now.row.parts[k]} />
                <span className="num">{now.row.parts[k]}</span>
              </li>
            ))}
          </ul>
          <p className="small muted">
            Nejlépe hodnocení:{' '}
            {now.rows.slice(0, 3).map((r, i) => (
              <span key={r.clubId}>
                {i > 0 && ', '}
                {r.clubId === game.owner.clubId ? <strong>vy</strong> : <>vedení klubu {game.clubs[r.clubId].shortName}</>} ({r.grade})
              </span>
            ))}
          </p>
        </>
      )}
      {history.length > 0 && (
        <>
          <LineChart title="Skóre majitele po sezónách" points={history.map((h) => ({ label: seasonLabel(h.season), value: h.score }))} format={(v) => String(Math.round(v))} min={0} max={100} height={140} />
          <p className="small">
            {history.slice(-6).map((h) => (
              <span key={h.season} className="owner-grade-past">
                {seasonLabel(h.season)} <Badge tone={gradeTone(h.grade)}>{h.grade}</Badge> <span className="muted">{h.rank}./{h.of}</span>
              </span>
            ))}
          </p>
        </>
      )}
      <p className="muted small">Známka na konci sezóny: výsledky proti očekávání (40 %), finance (25 %), fanoušci (20 %) a pověst (15 %). Majitelé soupeřů se hodnotí stejně.</p>
    </section>
  );
}
