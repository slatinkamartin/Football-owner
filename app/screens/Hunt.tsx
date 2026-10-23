import { useState } from 'react';
import { huntTargets, planAgendaAction, setHuntPlan, suggestedPositions, toggleHunt, weekAgenda, type ActionResult, type GameState, type Position } from '../../engine';
import { Badge } from '../components';
import { money } from '../format';
import { PlayerLink } from '../nav';

const POS: Record<Position, string> = { GK: 'Brankář', DF: 'Obránce', MF: 'Záložník', FW: 'Útočník' };

/** V1 (A7): přestupy jako lov – cíle, skautské cesty, konkurence, plán okna. */
export function HuntCard({ game, onResult }: { game: GameState; onResult: (r: ActionResult) => void }) {
  const list = huntTargets(game);
  const plan = game.hunt?.plan && game.hunt.plan.season === game.season ? game.hunt.plan : undefined;
  const [budget, setBudget] = useState(String(Math.round((plan?.budget ?? game.clubs[game.owner.clubId].policy.transferBudget) / 1e6)));
  const [positions, setPositions] = useState<Position[]>(plan?.positions ?? suggestedPositions(game));
  const ag = weekAgenda(game).options;
  const trip = ag.find((o) => o.id === 'skauting');
  const pitch = ag.find((o) => o.id === 'prestup');
  return (
    <section className="card hunt-card">
      <h2>Lov na posily</h2>
      <h3>Plán okna</h3>
      <div className="buttons">
        {(Object.keys(POS) as Position[]).map((p) => (
          <button key={p} className={positions.includes(p) ? 'primary' : ''} onClick={() => setPositions(positions.includes(p) ? positions.filter((x) => x !== p) : [...positions, p])}>
            {POS[p]}
          </button>
        ))}
      </div>
      <div className="inline-form wrap">
        <input inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} aria-label="Rozpočet v milionech" /> <span>mil. Kč</span>
        <button onClick={() => onResult(setHuntPlan(game, positions, (Number(budget.replace(',', '.')) || 0) * 1e6))}>Uložit plán</button>
      </div>
      <h3>Cíle</h3>
      {!list.length && <p className="muted small">Žádné cíle. Přidejte hráče mezi sledované (karta hráče, Přestupy) nebo požádejte ředitele o tipy (schůzka s postavou).</p>}
      <ul className="plain hunt-list">
        {list.map((t) => (
          <li key={t.id} className={t.fitsPlan ? '' : 'muted'}>
            <div className="row-between">
              <span>
                {t.foreign ? <strong>{t.name}</strong> : <PlayerLink id={t.playerId}>{t.name}</PlayerLink>} <span className="small muted">{POS[t.position]}, {t.age} let, {t.clubName}</span>
              </span>
              {t.hot && <Badge tone="good">výhodná chvíle</Badge>}
            </div>
            <p className="small">
              Odhad <span className="num">{t.lo}–{t.hi}</span> (potenciál {t.potLo}–{t.potHi}) · cena {money(t.price)} · cesty {t.trips}/3
              {t.rival && <> · <span className={t.rival.strength >= 60 ? 'neg' : ''}>soupeř {t.rival.name} {t.rival.strength} %</span></>}
            </p>
            {t.notes.length > 0 && <p className="muted small">{t.notes.join(' · ')}</p>}
            <div className="buttons">
              <button disabled={!!trip?.disabledReason || !trip?.targets?.some((x) => x.id === t.id)} title={trip?.disabledReason} onClick={() => onResult(planAgendaAction(game, 'skauting', t.id))}>
                Skautská cesta (agenda)
              </button>
              {!t.foreign && (
                <button disabled={!!pitch?.disabledReason || !pitch?.targets?.some((x) => x.id === t.playerId)} title={pitch?.disabledReason} onClick={() => onResult(planAgendaAction(game, 'prestup', t.playerId))}>
                  Osobní jednání (agenda)
                </button>
              )}
              {!t.foreign && (
                <button className="linkbtn" onClick={() => onResult(toggleHunt(game, t.playerId))}>
                  Odebrat
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
