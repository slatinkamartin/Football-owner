import { useState, type ReactNode } from 'react';
import { activeOverdraft, injectCapital, lendToClub, policyImpact, type ActionResult, type Benchmark, type BudgetLine, type BudgetPlan, type Club, type GameState } from '../../../engine';
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
      <button disabled={!enough || !!game.owner.ousted} onClick={() => onResult({ state: injectCapital(game, need), ok: true, message: `Vklad do klubu: ${money(need)}.` })}>
        Vložit {money(need)}
      </button>
      {!enough && <span className="small neg">Na to nemáte dost osobních peněz ({money(game.owner.wallet)}).</span>}
    </div>
  );
}

/**
 * Posuvník s okamžitě viditelnou hodnotou a srovnáním s běžnou výší. Náhled se počítá průběžně,
 * hra se uloží až po puštění posuvníku.
 */
export function SliderField({ label, value, min, max, step, format, reference, onChange, disabled, preview }: {
  label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; reference?: string;
  onChange: (v: number) => void; disabled?: boolean; preview?: (v: number) => ReactNode;
}) {
  const [local, setLocal] = useState<number | null>(null);
  const shown = local ?? value;
  const commit = () => {
    if (local !== null && local !== value) onChange(local);
    setLocal(null);
  };
  return (
    <div className="field">
      <label className="row-between">
        <span>{label}: <strong>{format(shown)}</strong></span>
        {reference && <span className="muted small">{reference}</span>}
      </label>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, shown))}
        disabled={disabled}
        onChange={(e) => setLocal(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      {preview && preview(shown)}
    </div>
  );
}

/** Volba z několika možností (úroveň, politika) s krátkým vysvětlením a dopadem každé. */
export function Choices<T extends string>({ value, options, onChange, label, detail, disabled }: {
  value: T; label: string; options: { id: T; label: string; hint: string }[]; onChange: (v: T) => void;
  /** Proměnná vysvětlivka: co by volba udělala proti současnému stavu. */
  detail?: (id: T) => ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="field">
      <span className="small muted">{label}</span>
      <div className="choices compact" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.id} role="radio" aria-checked={value === o.id} disabled={disabled && value !== o.id} className={`choice ${value === o.id ? 'selected' : ''}`} onClick={() => onChange(o.id)}>
            <strong>{o.label}</strong>
            <span>{o.hint}</span>
            {detail && <span className="choice-impact">{value === o.id ? 'současné nastavení' : detail(o.id)}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Výchozí hodnoty nastavení (nezměněné = běžná volba). */
const DEFAULTS: Partial<Club['policy']> = { cashReserve: 0, stadiumEvents: 0, newKit: false, cateringPrice: 'bezna', merchPrice: 'bezna', maintenance: 'bezna', security: 'bezna', summerCamp: 'doma', winterCamp: 'doma', salesPolicy: 'dobra' };

const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${money(Math.abs(v))}`;

/** Krátký text dopadu změny: provozní výsledek, peníze na konci a nálada fanoušků. */
export function impactText(game: GameState, patch: Partial<Club['policy']>, short = false): string {
  const i = policyImpact(game, patch);
  const parts: string[] = [];
  if (Math.abs(i.result) >= 1_000) parts.push(`${short ? 'výsledek' : 'provozní výsledek'} ${signed(i.result)}`);
  if (!short && Math.abs(i.cashEnd - i.result) >= 100_000) parts.push(`peníze na konci ${signed(i.cashEnd)}`);
  if (Math.abs(i.moodYear) >= 0.5) parts.push(`nálada ${i.moodYear > 0 ? '+' : '−'}${Math.abs(Math.round(i.moodYear))} za rok`);
  return parts.length ? parts.join(' · ') : 'bez vlivu na peníze';
}

/** Vysvětlivka dopadu změny proti současnému nastavení (mění se podle zvolené hodnoty). */
export function Impact({ game, patch, extra }: { game: GameState; patch: Partial<Club['policy']>; extra?: (string | false | undefined)[] }) {
  const club = game.clubs[game.owner.clubId];
  const same = (Object.keys(patch) as (keyof Club['policy'])[]).every((k) => JSON.stringify(club.policy[k] ?? DEFAULTS[k]) === JSON.stringify(patch[k]));
  const notes = (extra ?? []).filter(Boolean) as string[];
  return (
    <div className="impact small">
      <span className="impact-label">Dopad:</span> {same ? 'současné nastavení' : `${impactText(game, patch)} (proti současnému)`}
      {notes.length > 0 && <> · {notes.join(' · ')}</>}
    </div>
  );
}

/**
 * Karta jednoho řádku rozpočtu: částka za sezónu (výhled), skutečnost k dnešku,
 * co řádek ve hře ovlivňuje, srovnání s ligou a ovládání.
 */
export function LineCard({ id, title, lines, effects, bench, children, note }: {
  id: string; title: string; lines: BudgetLine[]; effects?: string[]; bench?: Benchmark; children?: ReactNode; note?: ReactNode;
}) {
  const amount = lines.reduce((a, l) => a + l.amount, 0);
  const actual = lines.reduce((a, l) => a + (l.actual ?? 0), 0);
  const share = amount ? Math.min(1, Math.abs(actual) / Math.max(1, Math.abs(amount))) : 0;
  return (
    <section className="card line-card" id={`line-${id}`}>
      <div className="line-head">
        <h2>{title}</h2>
        {lines.length > 0 && (
          <div className="line-amount">
            <strong className={amount < 0 ? 'neg' : amount > 0 ? 'pos' : ''}>{money(amount)}</strong>
            <span className="muted small">za sezónu</span>
          </div>
        )}
      </div>
      {lines.length > 0 && amount !== 0 && (
        <div className="line-progress" title={`Skutečnost ${money(actual)} z ${money(amount)}`}>
          <span className={`line-progress-fill ${amount < 0 ? 'neg' : 'pos'}`} style={{ width: `${share * 100}%` }} />
        </div>
      )}
      <p className="line-meta small muted">
        {lines.length > 0 && <>zatím {money(actual)}</>}
        {bench && (
          <>
            {lines.length > 0 && ' · '}liga: průměr {money(bench.avg)}, nejvíc {money(bench.max)} · vy {bench.rank}. z {bench.clubs}
          </>
        )}
      </p>
      {effects && effects.length > 0 && (
        <div className="effects">
          <span className="small muted">Ovlivňuje:</span>
          {effects.map((e) => <span key={e} className="effect-chip">{e}</span>)}
        </div>
      )}
      {children}
      {note && <p className="muted small">{note}</p>}
    </section>
  );
}
