import { describePlan, setTrainingPlan, trainingPlan, TRAINING_OPTIONS, type ActionResult, type GameState } from '../../engine';
import { Badge } from '../components';

/** V1 (A8): týdenní plán tréninku s trenérem. */
export function TrainingCard({ game, onResult }: { game: GameState; onResult: (r: ActionResult) => void }) {
  const t = trainingPlan(game);
  return (
    <section className="card training-card">
      <div className="row-between">
        <h2>Plán tréninku</h2>
        {t.owner ? <Badge tone={t.accepted ? 'good' : 'warn'}>{t.accepted ? 'trenér plán dodržuje' : 'trenér trénuje po svém'}</Badge> : <Badge>bez plánu majitele</Badge>}
      </div>
      <p className="muted small">
        Teď: {describePlan(t)}. Šance, že trenér návrh přijme: {Math.round(t.acceptChance * 100)} % (podle důvěry). Návštěva tréninku z agendy zajistí, že plán dodrží.
      </p>
      <h3>Zaměření</h3>
      <div className="buttons">
        {TRAINING_OPTIONS.focus.map((o) => (
          <button key={o.id} className={t.owner && t.focus === o.id ? 'primary' : ''} title={o.hint} onClick={() => onResult(setTrainingPlan(game, { focus: o.id }))}>
            {o.label}
          </button>
        ))}
      </div>
      <h3>Intenzita</h3>
      <div className="buttons">
        {TRAINING_OPTIONS.intensity.map((o) => (
          <button key={o.id} className={t.owner && t.intensity === o.id ? 'primary' : ''} title={o.hint} onClick={() => onResult(setTrainingPlan(game, { intensity: o.id }))}>
            {o.label}
          </button>
        ))}
      </div>
      <label className="small">
        <input type="checkbox" checked={t.rest} onChange={(e) => onResult(setTrainingPlan(game, { rest: e.target.checked }))} /> {TRAINING_OPTIONS.rest.label} <span className="muted">({TRAINING_OPTIONS.rest.hint})</span>
      </label>
      {t.lastWeek && t.lastWeek.lines.length > 0 && <p className="small">Minulý týden: {t.lastWeek.lines.join(' · ')}</p>}
    </section>
  );
}
