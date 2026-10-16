import { useState } from 'react';
import {
  CATERING_SPEND,
  effectiveCapacity,
  facilityUpkeepDelta,
  formatDate,
  previewVote,
  projectOptions,
  startProject,
  tierOf,
  vipRate,
  type ActionResult,
  type GameState,
} from '../../engine';
import { Badge, Meter, Notice } from '../components';
import { VoteInfo } from '../VoteInfo';
import { money, num } from '../format';

type Props = { game: GameState; onChange: (g: GameState) => void };

const LEVEL_TEXT = {
  training: ['', 'základní hřiště', 'běžné tréninkové zázemí', 'moderní tréninkové centrum', 'špičkové centrum', 'evropská špička'],
  academy: ['', 'jen dorost', 'malá akademie', 'kvalitní akademie', 'jedna z nejlepších v zemi', 'evropská úroveň'],
  medical: ['', 'základní péče', 'fyzioterapeut', 'regenerační centrum', 'moderní medicína', 'špičková klinika'],
};

export function Stadium({ game, onChange }: Props) {
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const club = game.clubs[game.owner.clubId];
  const tier = tierOf(game, club.id);
  const f = club.facilities;
  const capacity = effectiveCapacity(game, club);
  const upkeep = facilityUpkeepDelta(club, tier);
  const damaged = club.pitchDamagedUntil && club.pitchDamagedUntil >= game.date;
  const apply = (r: ActionResult) => {
    if (r.state !== game) onChange(r.state);
    setMessage({ text: r.message, ok: r.ok });
    setPending(null);
  };

  return (
    <div className="stack">
      <Notice message={message?.text ?? null} ok={message?.ok} />
      <div className="grid">
        <section className="card">
          <h2>{club.stadium.name}</h2>
          <dl className="kv">
            <dt>Kapacita</dt>
            <dd>
              {num(club.stadium.capacity)}
              {capacity < club.stadium.capacity && <span className="muted small"> (při stavbě {num(capacity)})</span>}
            </dd>
            <dt>VIP skyboxy</dt>
            <dd>{f.vip} <span className="muted small">· {money(vipRate(tier))} za zápas</span></dd>
            <dt>Catering a fanshop</dt>
            <dd>úroveň {f.catering} <span className="muted small">· {CATERING_SPEND[f.catering]} Kč na diváka</span></dd>
            <dt>Vyhřívaný trávník</dt>
            <dd>{f.heating ? 'ano' : tier === 1 ? <Badge tone="bad">chybí (licence)</Badge> : 'ne'}</dd>
            <dt>Stav trávníku</dt>
            <dd>{damaged ? <Badge tone="warn">poškozený</Badge> : 'v pořádku'}</dd>
          </dl>
        </section>

        <section className="card">
          <h2>Zázemí</h2>
          <dl className="kv meters">
            <dt>Tréninkové centrum</dt>
            <dd><Meter value={f.training} max={5} tone="good" /> {f.training}</dd>
            <dt>Akademie</dt>
            <dd><Meter value={f.academy} max={5} tone="good" /> {f.academy}</dd>
            <dt>Regenerace a medicína</dt>
            <dd><Meter value={f.medical} max={5} tone="good" /> {f.medical}</dd>
          </dl>
          <ul className="plain small muted">
            <li>Trénink: {LEVEL_TEXT.training[f.training]}, vývoj hráčů {Math.round((0.8 + 0.1 * f.training) * 100)} % běžného.</li>
            <li>Akademie: {LEVEL_TEXT.academy[f.academy]}, {f.academy >= 4 ? 3 : f.academy >= 2 ? 2 : 1} dorostenci ročně.</li>
            <li>Medicína: {LEVEL_TEXT.medical[f.medical]}, riziko zranění {Math.round((1.25 - 0.08 * f.medical) * 100)} %, délka {Math.round((1.2 - 0.07 * f.medical) * 100)} % běžné.</li>
          </ul>
          <p className="muted small">
            Provoz zázemí {upkeep >= 0 ? 'navíc' : 'méně'} proti běžnému klubu vaší velikosti: {money(Math.abs(upkeep))} měsíčně.
          </p>
        </section>

        <section className="card">
          <h2>Fanoušci a partneři</h2>
          <dl className="kv meters">
            <dt>Nálada fanoušků</dt>
            <dd><Meter value={club.fanMood} /> {Math.round(club.fanMood)}</dd>
          </dl>
          <p className="muted small">
            Nálada mění návštěvnost (±15 %) i příjmy od sponzorů a z merchandisingu (±8 %). Zlepšují ji výhry a postup, kazí prohry, drahé vstupenky a sestup.
          </p>
          <dl className="kv">
            <dt>Generální partner</dt>
            <dd>{club.sponsors?.find((c) => c.slot === 'generalni')?.name ?? 'volné místo'}</dd>
            <dt>Název stadionu</dt>
            <dd>{club.sponsors?.find((c) => c.slot === 'stadion')?.name ?? 'neprodán'}</dd>
          </dl>
        </section>
      </div>

      {game.projects.length > 0 && (
        <section className="card">
          <h2>Probíhající stavby</h2>
          <ul className="plain projects">
            {game.projects.map((p) => {
              const total = new Date(`${p.end}T00:00:00Z`).getTime() - new Date(`${p.start}T00:00:00Z`).getTime();
              const done = new Date(`${game.date}T00:00:00Z`).getTime() - new Date(`${p.start}T00:00:00Z`).getTime();
              return (
                <li key={p.id}>
                  <div className="row-between">
                    <strong>{p.label}</strong>
                    <span className="muted small">hotovo {formatDate(p.end)}</span>
                  </div>
                  <Meter value={Math.max(0, Math.min(100, (done / total) * 100))} tone="good" />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>Nové stavby a vybavení</h2>
        <p className="muted small">
          Stavba se zaplatí hned z peněz klubu a stane se majetkem v rozvaze, který se postupně odepisuje. Najednou může běžet jedna stavba od každého druhu.{game.shareholders.length > 0 && ' Stavby nad 20 mil. Kč schvalují spolumajitelé.'}
          Klub má teď {money(club.finance.balance)}.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Stavba</th>
                <th className="hide-sm">Co přinese</th>
                <th className="num">Cena</th>
                <th className="num">Doba</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {projectOptions(game).map((o) => (
                <tr key={o.label}>
                  <td className="wrap"><strong>{o.label}</strong></td>
                  <td className="wrap muted hide-sm">{o.description}</td>
                  <td className="num">{money(o.cost)}</td>
                  <td className="num">{o.weeks} týd.</td>
                  <td className="num">
                    {o.blocked ? (
                      <span className="muted small">{o.blocked}</span>
                    ) : pending === o.label ? (
                      <span className="buttons end">
                        <VoteInfo vote={previewVote(game, 'stavba', o.cost)} />
                        <button className="primary" onClick={() => apply(startProject(game, o.label))}>Potvrdit</button>
                        <button onClick={() => setPending(null)}>Zpět</button>
                      </span>
                    ) : (
                      <button onClick={() => setPending(o.label)}>Postavit</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
