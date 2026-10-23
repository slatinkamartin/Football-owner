import { formatShortDate, ownerPledges, type GameState, type OwnerPledge } from '../../engine';
import { Badge, Meter } from '../components';

/** R1: Sliby majitele s měřítkem a termínem (z rozhodnutí, fóra, tiskovek i z pohovorů – V4). */

const STAKE: Record<OwnerPledge['stake'], string> = { fanousci: 'fanouškům', kabina: 'kabině', trener: 'trenérovi', media: 'médiím', hrac: 'hráči' };

export function PromisesCard({ game }: { game: GameState }) {
  const { active, done: allDone } = ownerPledges(game);
  const done = allDone.slice(0, 4);
  if (!active.length && !done.length) return null;
  return (
    <section className="card promises-card">
      <h2>Sliby majitele</h2>
      {active.length > 0 ? (
        <ul className="plain promises-list">
          {active.map(({ pledge: p, status: st, legacy }) => (
            <li key={p.id}>
              <div className="promise-head">
                <strong>{p.text}</strong>
                <span className="muted small">
                  {legacy ? (p.text.includes('řediteli') ? 'řediteli' : 'trenérovi') : STAKE[p.stake]} · do {formatShortDate(p.until)}
                </span>
              </div>
              {((p.metric !== 'coachKept' && p.metric !== 'manual') || (legacy && p.kind === 'starsi-rozpocet')) && (
                <Meter value={st.progress * 100} tone={st.progress >= 1 ? 'good' : st.daysLeft <= 7 ? 'warn' : 'neutral'} />
              )}
              <p className="muted small">{st.label}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">Žádný slib teď neběží.</p>
      )}
      {done.length > 0 && (
        <>
          <h3>Vyhodnocené</h3>
          <ul className="plain promises-done">
            {done.map(({ pledge: p }) => (
              <li key={p.id} className="small">
                <Badge tone={p.status === 'splneno' ? 'good' : 'bad'}>{p.status === 'splneno' ? 'splněno' : 'nesplněno'}</Badge> {p.text}{' '}
                <span className="muted">({formatShortDate(p.resolved ?? p.until)})</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
