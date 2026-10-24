import { useState } from 'react';
import { focusHuntTarget, huntTargets, monthPriorities, setHuntPlan, suggestedPositions, toggleHunt, type ActionResult, type GameState, type Position } from '../../engine';
import { chemistryImpact } from '../../engine'; // W4
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
  const focus = game.agenda?.focus;
  const scoutsOn = monthPriorities(game).priorities.includes('prestupy');
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
      <p className="muted small">{scoutsOn ? 'Skautské cesty a v okně i osobní jednání dělá vedení každý týden podle priority „Skauting a přestupy“.' : 'Skautské cesty a osobní jednání dělá vedení, když mezi priority měsíce zařadíte „Skauting a přestupy“.'}</p>
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
            {(() => { const pl = game.players[t.playerId] ?? game.foreign?.targets.find((f) => f.player.id === t.playerId || f.id === t.id)?.player; const ci = pl ? chemistryImpact(game, pl) : undefined; return ci?.text ? <p className={`small ${ci.delta < 0 ? 'neg' : ''}`}>{ci.text}</p> : null; })()}{/* W4: odhad dopadu na chemii */}
            <div className="buttons">
              <button className={focus === t.id ? 'primary' : ''} aria-pressed={focus === t.id} disabled={t.trips >= 3 && focus !== t.id} onClick={() => onResult(focusHuntTarget(game, focus === t.id ? undefined : t.id))}>
                {focus === t.id ? 'Skauti jedou přednostně' : 'Poslat skauty přednostně'}
              </button>
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
