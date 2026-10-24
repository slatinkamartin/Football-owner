import { useState } from 'react';
import {
  captainChangeFree,
  chemistryEffect,
  coachLeadershipPick,
  currentCaptain,
  currentLeaders,
  playerAge,
  resetLeadership,
  setCaptain,
  setLeaders,
  squadOf,
  squadShape,
  teamChemistry,
  type ActionResult,
  type GameState,
  type Player,
  type Position,
} from '../../engine';
import { Badge, Meter, Notice } from '../components';
import { money } from '../format';
import { PlayerLink } from '../nav';
import { Trend } from '../ui';

/** W4: Tým › Složení – rozestavení, hloubka postů, věk, cizinci, smlouvy, platy, forma, chemie, kapitán a lídři. */

type Props = { game: GameState; onChange: (g: GameState) => void };

const ROW_Y: Record<Position, number> = { GK: 104, DF: 80, MF: 54, FW: 28 };
const LINE_WORD: Record<Position, string> = { GK: 'Brankář', DF: 'Obrana', MF: 'Záloha', FW: 'Útok' };
const surname = (p: Player) => p.lastName;
const fullName = (p: Player) => `${p.firstName} ${p.lastName}`;

export function TeamShape({ game, onChange }: Props) {
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const apply = (r: ActionResult) => {
    if (r.state !== game) onChange(r.state);
    setMessage({ text: r.message, ok: r.ok });
  };
  const own = game.owner.clubId;
  const club = game.clubs[own];
  const shape = squadShape(game);
  const chem = teamChemistry(game);
  const effect = chemistryEffect(game);
  const captain = currentCaptain(game);
  const leaders = currentLeaders(game);
  const weakLines = shape.lines.filter((l) => l.weak);

  return (
    <div className="stack ts">
      <Notice message={message?.text ?? null} ok={message?.ok} />
      <div className="grid two">
        <ChemistryCard chem={chem} effectText={effect.text} />
        <section className="card" aria-labelledby="ts-xi">
          <div className="row-between">
            <h2 id="ts-xi">Základní sestava</h2>
            <Badge>{shape.formation}</Badge>
          </div>
          <p className="muted small">Jedenáctka, kterou by trenér postavil dnes (zranění a tresty se nepočítají). C = kapitán, L = lídr kabiny.</p>
          <Pitch shape={shape} colors={club.colors} captainId={captain?.id} leaderIds={leaders.map((p) => p.id)} lines={chem.lines} />
          <h3>Lavička</h3>
          {shape.bench.length ? (
            <ul className="ts-chips">
              {shape.bench.map((p) => (
                <li key={p.id}>
                  <PlayerLink id={p.id}>{surname(p)}</PlayerLink> <span className="muted small">{p.position === 'GK' ? 'BR' : p.position === 'DF' ? 'OBR' : p.position === 'MF' ? 'ZÁL' : 'ÚT'} {p.overall}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">Na lavičku nezbývá nikdo.</p>
          )}
          {shape.unavailable.length > 0 && <p className="small">Chybí: {shape.unavailable.map((p) => `${surname(p)} (${p.suspension > 0 ? 'trest' : 'zranění'})`).join(', ')}</p>}
        </section>
      </div>

      <section className="card" aria-labelledby="ts-depth">
        <div className="row-between">
          <h2 id="ts-depth">Hloubka kádru</h2>
          {weakLines.length ? <Badge tone="warn">{weakLines.length} {weakLines.length === 1 ? 'slabé místo' : 'slabá místa'}</Badge> : <Badge tone="good">bez děr</Badge>}
        </div>
        <div className="ts-depth">
          {shape.lines.map((l) => (
            <div key={l.position} className={`ts-line ${l.weak ? 'ts-weak' : ''}`}>
              <div className="row-between">
                <strong>{l.label}</strong>
                <span className="muted small">
                  základ {l.need} · v kádru {l.players.length}{l.avg ? ` · Ø ${l.avg}` : ''}
                </span>
              </div>
              {l.weak && <p className="ts-ribbon">Slabé místo: {l.weak}</p>}
              <ul className="ts-chips">
                {l.players.map((p) => {
                  const starter = l.starters.includes(p);
                  const out = shape.unavailable.includes(p);
                  return (
                    <li key={p.id} className={starter ? 'ts-starter' : out ? 'ts-out' : ''}>
                      <PlayerLink id={p.id}>{surname(p)}</PlayerLink> <span className="num">{p.overall}</span>
                      <span className="ts-sr">{starter ? ' (základ)' : out ? ' (chybí)' : ' (náhradník)'}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <p className="muted small">Tučně základ, přeškrtnutí chybí (zranění, trest). Díra = méně hráčů, než je potřeba do základu i s náhradníkem, nebo základ výrazně pod úrovní týmu.</p>
      </section>

      <div className="grid two">
        <LeadershipCard game={game} onResult={apply} />
        <AgeCard shape={shape} />
      </div>

      <div className="grid two">
        <section className="card" aria-labelledby="ts-numbers">
          <h2 id="ts-numbers">Kádr v číslech</h2>
          <dl className="kv">
            <dt>Hráčů v kádru</dt>
            <dd>{squadOf(game, own).length}</dd>
            <dt>Průměrný věk</dt>
            <dd>{shape.avgAge.toLocaleString('cs-CZ')} let</dd>
            <dt>Cizinci</dt>
            <dd>{shape.foreigners}</dd>
            <dt>Mimo EU (limit {shape.nonEuLimit})</dt>
            <dd>
              <Meter value={shape.nonEu} max={shape.nonEuLimit} tone={shape.nonEu >= shape.nonEuLimit ? 'bad' : shape.nonEu >= shape.nonEuLimit - 1 ? 'warn' : 'good'} />
              {shape.nonEu} / {shape.nonEuLimit}
            </dd>
            <dt>Odchovanci</dt>
            <dd>{shape.academy}</dd>
            <dt>Smlouva končí do léta {game.season + 1}</dt>
            <dd className={shape.expiring.length >= 5 ? 'neg' : ''}>{shape.expiring.length}</dd>
          </dl>
          {shape.expiring.length > 0 && (
            <p className="small">
              Končící smlouvy:{' '}
              {shape.expiring.slice(0, 6).map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ', '}
                  <PlayerLink id={p.id}>{surname(p)}</PlayerLink> ({p.contractUntil})
                </span>
              ))}
              {shape.expiring.length > 6 && ` a ${shape.expiring.length - 6} dalších`}
            </p>
          )}
          <h3>Forma a kondice</h3>
          <ul className="plain small">
            <li>Ve formě: {shape.inForm.length ? shape.inForm.map(surname).join(', ') : '–'}</li>
            <li>Bez formy: {shape.outOfForm.length ? shape.outOfForm.map(surname).join(', ') : '–'}</li>
            <li>Unavení (kondice pod 80): {shape.tired.length ? shape.tired.map((p) => `${surname(p)} ${Math.round(p.fitness)}`).join(', ') : '–'}</li>
          </ul>
        </section>
        <section className="card" aria-labelledby="ts-wages">
          <h2 id="ts-wages">Platová hierarchie</h2>
          <p className="muted small">Medián platu v kádru {money(shape.wageMedian)} měsíčně. Velká propast mezi nejvyšším platem a zbytkem kabiny snižuje spokojenost.</p>
          <ol className="ts-wages">
            {shape.topWages.map((p) => {
              const ratio = shape.wageMedian ? p.wage / shape.wageMedian : 0;
              return (
                <li key={p.id}>
                  <span className="ts-wage-name">
                    <PlayerLink id={p.id}>{fullName(p)}</PlayerLink>
                  </span>
                  <span className="ts-wage-bar" aria-hidden="true">
                    <span style={{ width: `${Math.min(100, (p.wage / Math.max(1, shape.topWages[0].wage)) * 100)}%` }} className={ratio > 4 ? 'bad' : ''} />
                  </span>
                  <span className="num small">
                    {money(p.wage)} <span className="muted">({ratio.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })}× medián)</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </div>
  );
}

function ChemistryCard({ chem, effectText }: { chem: ReturnType<typeof teamChemistry>; effectText: string }) {
  return (
    <section className="card" aria-labelledby="ts-chem">
      <div className="row-between">
        <h2 id="ts-chem">Týmová chemie</h2>
        <Badge tone={chem.tone}>{chem.label}</Badge>
      </div>
      <div className="ts-chem-head">
        <span className="ts-chem-num num">{chem.value}</span>
        <span className="muted small">ze 100</span>
        <Trend value={chem.trend} title="Změna za poslední měsíc" />
      </div>
      <p className="small">{effectText}</p>
      <ul className="ts-parts">
        {chem.parts.map((p) => (
          <li key={p.key}>
            <div className="row-between">
              <span>{p.label}</span>
              <span className="ts-part-val">
                <Meter value={p.value} />
                <span className="num">{p.value}</span>
              </span>
            </div>
            <p className="muted small">Proč: {p.why}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Pitch({ shape, colors, captainId, leaderIds, lines }: { shape: ReturnType<typeof squadShape>; colors: [string, string]; captainId?: string; leaderIds: string[]; lines: Partial<Record<Position, number>> }) {
  const H = 124;
  const rows: Position[] = ['FW', 'MF', 'DF', 'GK'];
  const weak = new Map(shape.lines.filter((l) => l.weak).map((l) => [l.position, l.weak!]));
  const label = `Rozestavení ${shape.formation}: ${rows.map((pos) => `${LINE_WORD[pos]} ${shape.xi.filter((p) => p.position === pos).map(surname).join(', ')}`).join('; ')}`;
  return (
    <div className="pitch-wrap ts-pitch">
      <svg className="pitch" viewBox={`0 0 100 ${H}`} role="img" aria-label={label}>
        <rect x="0" y="0" width="100" height={H} className="pt-grass" />
        <g className="pt-lines">
          <rect x="3" y="2" width="94" height={H - 4} />
          <line x1="3" y1="2" x2="97" y2="2" />
          <circle cx="50" cy="2" r="9" />
          <rect x="25" y={H - 19} width="50" height="17" />
          <rect x="39" y={H - 8} width="22" height="6" />
        </g>
        {rows.map((pos) => {
          const row = shape.xi.filter((p) => p.position === pos);
          const y = ROW_Y[pos];
          return (
            <g key={pos}>
              {weak.has(pos) && (
                <g>
                  <rect x="1" y={y - 6} width="98" height="17" rx="2" className="ts-pt-weak" />
                  <text x="3" y={y - 7.2} className="ts-pt-weak-text">slabé místo</text>
                </g>
              )}
              {lines[pos] !== undefined && pos !== 'GK' && (
                <text x="97" y={y - 7.2} className="ts-pt-line">sehranost {lines[pos]}</text>
              )}
              {row.map((p, i) => {
                const x = ((i + 1) / (row.length + 1)) * 100;
                return (
                  <g key={p.id} transform={`translate(${x} ${y})`}>
                    <title>{`${fullName(p)}, hodnocení ${p.overall}${p.id === captainId ? ', kapitán' : leaderIds.includes(p.id) ? ', lídr kabiny' : ''}`}</title>
                    <circle r="3.8" fill={colors[0]} stroke={colors[1] ?? '#fff'} strokeWidth="0.9" />
                    <text y="7.6" className="pt-name">{surname(p)}</text>
                    <text y="11" className="pt-rating">{p.overall}</text>
                    {p.id === captainId && (
                      <g transform="translate(4.4 -3.2)">
                        <circle r="2.1" className="ts-pt-cap" />
                        <text y="0.9" className="ts-pt-cap-text">C</text>
                      </g>
                    )}
                    {leaderIds.includes(p.id) && (
                      <g transform="translate(4.4 -3.2)">
                        <circle r="2.1" className="ts-pt-lead" />
                        <text y="0.9" className="ts-pt-cap-text">L</text>
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function LeadershipCard({ game, onResult }: { game: GameState; onResult: (r: ActionResult) => void }) {
  const own = game.owner.clubId;
  const captain = currentCaptain(game);
  const leaders = currentLeaders(game);
  const pick = coachLeadershipPick(game);
  const chosen = !!game.chemistry?.captainId && game.players[game.chemistry.captainId]?.clubId === own && game.chemistry.captainId !== coachLeadershipPick(game).captainId;
  const free = captainChangeFree(game);
  const core = squadOf(game, own).sort((a, b) => b.overall - a.overall).slice(0, 18);
  const leaderIds = leaders.map((p) => p.id);
  const ownLeaders = !!game.chemistry?.leaders?.length;
  const toggleLeader = (id: string) => {
    const next = leaderIds.includes(id) ? leaderIds.filter((x) => x !== id) : [...leaderIds, id];
    onResult(setLeaders(game, next));
  };
  return (
    <section className="card" aria-labelledby="ts-lead">
      <div className="row-between">
        <h2 id="ts-lead">Kapitán a lídři kabiny</h2>
        <Badge tone={chosen ? 'neutral' : 'good'}>{chosen ? 'volba majitele' : 'návrh trenéra'}</Badge>
      </div>
      <p className="small">
        Kapitán: <strong>{captain ? <PlayerLink id={captain.id}>{fullName(captain)}</PlayerLink> : '–'}</strong>
        {captain && <span className="muted"> ({playerAge(captain, game.season)} let, hodnocení {captain.overall})</span>}
      </p>
      <p className="small">Lídři: {leaders.length ? leaders.map((p) => surname(p)).join(', ') : '–'}</p>
      <p className="muted small">
        Trenér navrhuje kapitánem {pick.captainId ? fullName(game.players[pick.captainId]) : '–'}. Kapitán a lídři (věk, délka v klubu, místo v sestavě) tvoří složku chemie „Kapitán a lídři“.{' '}
        {free ? 'Teď lze kapitána změnit bez následků.' : 'Změna kapitána během sezóny sníží morálku bývalého kapitána o 8 a chemii na zhruba 3 měsíce.'}
      </p>
      <label className="ts-field">
        <span className="small">Kapitán</span>
        <select value={captain?.id ?? ''} onChange={(e) => e.target.value && onResult(setCaptain(game, e.target.value))}>
          {core.map((p) => (
            <option key={p.id} value={p.id}>
              {fullName(p)} ({playerAge(p, game.season)} let, {p.overall}){p.id === pick.captainId ? ' – návrh trenéra' : ''}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="ts-leaders">
        <legend className="small">Lídři kabiny (nejvýš 3{ownLeaders ? '' : ', teď vybírá trenér'})</legend>
        <ul className="ts-chips">
          {core.filter((p) => p.id !== captain?.id).slice(0, 14).map((p) => (
            <li key={p.id}>
              <label>
                <input type="checkbox" checked={leaderIds.includes(p.id)} disabled={!leaderIds.includes(p.id) && leaderIds.length >= 3} onChange={() => toggleLeader(p.id)} /> {surname(p)}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      {(chosen || ownLeaders) && (
        <div className="buttons">
          <button onClick={() => onResult(resetLeadership(game))}>Vrátit na návrh trenéra</button>
        </div>
      )}
    </section>
  );
}

function AgeCard({ shape }: { shape: ReturnType<typeof squadShape> }) {
  const max = Math.max(1, ...shape.ages.map((a) => a.count));
  return (
    <section className="card" aria-labelledby="ts-age">
      <h2 id="ts-age">Věková struktura</h2>
      <p className="muted small">Počet hráčů podle věku a jejich podíl na odehraných minutách v sezóně.</p>
      <ul className="ts-ages" aria-label="Věková struktura kádru">
        {shape.ages.map((a) => (
          <li key={a.label}>
            <span className="ts-age-label">{a.label}</span>
            <span className="ts-age-bar" aria-hidden="true">
              <span style={{ width: `${(a.count / max) * 100}%` }} />
            </span>
            <span className="num small">
              {a.count} <span className="muted">· {a.minutesShare} % minut</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
