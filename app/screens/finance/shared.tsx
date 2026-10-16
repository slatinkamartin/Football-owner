import { activeOverdraft, injectCapital, lendToClub, type ActionResult, type BudgetPlan, type GameState } from '../../../engine';
import { LineChart, type ChartPoint } from '../../chart';
import { money } from '../../format';

const label = (date: string) => (date.endsWith('-06-30') ? 'konec' : `${date.slice(5, 7)}/${date.slice(2, 4)}`);

/** Zůstatek v této sezóně: skutečnost na začátku měsíců, dnešek a výhled do konce sezóny. */
export function cashSeries(game: GameState, plan: BudgetPlan): { points: ChartPoint[]; forecastFrom: number } {
  const club = game.clubs[game.owner.clubId];
  const start = `${game.season}-07-01`;
  const history = (club.finance.balanceHistory ?? []).filter((h) => h.date >= start && h.date < game.date);
  const points: ChartPoint[] = [
    ...history.map((h) => ({ label: label(h.date), value: h.balance })),
    { label: 'dnes', value: club.finance.balance },
  ];
  const forecastFrom = points.length;
  for (const m of plan.months) if (m.date > game.date) points.push({ label: label(m.date), value: m.balance });
  return { points, forecastFrom };
}

/** Graf peněz na účtu: plná čára skutečnost, čárkovaná výhled. */
export function CashChart({ game, plan, title = 'Peníze na účtu: skutečnost a výhled do konce sezóny', height = 190 }: { game: GameState; plan: BudgetPlan; title?: string; height?: number }) {
  const { points, forecastFrom } = cashSeries(game, plan);
  const od = activeOverdraft(game);
  return (
    <LineChart
      title={title}
      points={points}
      forecastFrom={forecastFrom}
      baseline={{ value: -od, label: od ? 'limit' : '0' }}
      format={(v) => money(v)}
      height={height}
    />
  );
}

/** Tlačítka, kterými majitel jedním klikem pokryje díru ve výhledu. */
export function OwnerNeedActions({ game, need, onResult }: { game: GameState; need: number; onResult: (r: ActionResult) => void }) {
  if (!need) return null;
  const enough = game.owner.wallet >= need;
  return (
    <div className="need-actions">
      <button className="primary" disabled={!enough || !!game.owner.ousted} onClick={() => onResult(lendToClub(game, need))}>
        Půjčit klubu {money(need)}
      </button>
      <button disabled={!enough || !!game.owner.ousted} onClick={() => onResult({ state: injectCapital(game, need), ok: true, message: `Vložil jste do klubu ${money(need)}.` })}>
        Vložit {money(need)}
      </button>
      {!enough && <span className="small neg">Na to nemáte dost osobních peněz ({money(game.owner.wallet)}).</span>}
    </div>
  );
}
