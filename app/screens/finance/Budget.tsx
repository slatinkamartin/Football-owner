import { useState } from 'react';
import {
  approveBudget,
  budgetApproved,
  budgetChanged,
  budgetDue,
  changeImpact,
  budgetVote,
  budgetWarnings,
  forecastSeason,
  formatDate,
  lastSeasonActual,
  multiYearOutlook,
  planToDate,
  resetBudgetToDraft,
  seasonLabel,
  staffAbility,
  type ActionResult,
  type BudgetLine,
  type BudgetPlan,
  type GameState,
} from '../../../engine';
import { Badge, Notice } from '../../components';
import { money } from '../../format';
import { VoteInfo } from '../../VoteInfo';
import type { FinanceTab } from '../Finance';
import { CashChart, OwnerNeedActions } from './shared';

const INCOME_KEYS = ['vstupne', 'stadion', 'fanshop', 'akce', 'tv', 'komercni', 'evropa', 'pohar', 'ostatni'];
const COST_CARDS = ['platy', 'vedeni', 'oddeleni', 'provoz', 'udrzba', 'soustredeni', 'bezpecnost', 'komunita', 'prestupy'];
const MONTHS = ['červenci', 'srpnu', 'září', 'říjnu', 'listopadu', 'prosinci', 'lednu', 'únoru', 'březnu', 'dubnu', 'květnu', 'červnu'];
const monthIn = (date: string) => MONTHS[(Number(date.slice(5, 7)) + 5) % 12];

/** Kam vede klik na řádek výsledovky: záložka a karta s nastavením. */
function target(key: string): { tab: FinanceTab; card?: string } | undefined {
  if (INCOME_KEYS.includes(key)) return { tab: 'prijmy', card: key === 'pohar' ? 'evropa' : key };
  if (key === 'rezerva') return { tab: 'vydaje', card: 'platy' };
  if (COST_CARDS.includes(key)) return { tab: 'vydaje', card: key };
  if (key === 'financovani') return { tab: 'financovani' };
  return undefined;
}

type Props = { game: GameState; onChange: (g: GameState) => void; onOpen: (tab: FinanceTab, line?: string) => void };

/** Rozpočet: přehledná výsledovka sezóny ke schválení. Řádky se nastavují v Příjmech a Výdajích. */
export function BudgetCard({ game, onChange, onOpen }: Props) {
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const apply = (r: ActionResult) => {
    if (r.state !== game) onChange(r.state);
    setMessage({ text: r.message, ok: r.ok });
  };
  const approved = budgetApproved(game);
  const plan = forecastSeason(game);
  const warnings = budgetWarnings(game, plan);
  const vote = budgetVote(game, plan);
  const approvedPlan = approved ? game.budget!.plan : undefined;
  const changed = budgetChanged(game);
  const impact = changeImpact(game);
  const drift = approvedPlan && !changed ? plan.result - approvedPlan.result : 0;
  const cfo = staffAbility(game, 'financni');
  const club = game.clubs[game.owner.clubId];
  const totals = club.finance.season;
  const hasLast = !!club.finance.lastSeason;
  const started = plan.lines.some((l) => (l.actual ?? 0) !== 0);
  const actualOf = (l: BudgetLine) => l.categories.reduce((a, c) => a + (totals[c] ?? 0), 0);
  const future = multiYearOutlook(game);

  const income = plan.lines.filter((l) => l.group === 'provoz' && INCOME_KEYS.includes(l.key));
  const costs = plan.lines.filter((l) => l.group === 'provoz' && !INCOME_KEYS.includes(l.key));
  const capital = plan.lines.filter((l) => l.group === 'kapital');
  const financing = plan.lines.filter((l) => l.group === 'financovani');
  const keys = (ls: BudgetLine[]) => ls.map((l) => l.key);
  const pick = (p: BudgetPlan, ks: string[]) => p.lines.filter((l) => ks.includes(l.key)).reduce((a, l) => a + l.amount, 0);
  const visible = (l: BudgetLine) =>
    l.amount !== 0 || actualOf(l) !== 0 || (approvedPlan?.lines.find((x) => x.key === l.key)?.amount ?? 0) !== 0 || ['vstupne', 'platy', 'tv'].includes(l.key);
  const cols = 2 + (approvedPlan ? 1 : 0) + (started ? 1 : 0) + (hasLast ? 1 : 0);

  const row = (l: BudgetLine) => {
    const a = approvedPlan?.lines.find((x) => x.key === l.key);
    const go = target(l.key);
    const toDate = a && approvedPlan && l.categories.length ? planToDate(game, a, approvedPlan.from) : undefined;
    return (
      <tr key={l.key} className={go ? 'clickable' : ''} onClick={go ? () => onOpen(go.tab, go.card) : undefined}>
        <td className="wrap">
          {l.label}
          {go && <span className="row-go" aria-hidden="true"> ›</span>}
        </td>
        {approvedPlan && <td className="num muted">{money(a?.amount ?? 0)}</td>}
        <td className={`num ${l.amount < 0 ? 'neg' : ''}`}>{money(l.amount)}</td>
        {started && (
          <td className="num">
            {l.categories.length ? money(actualOf(l)) : '–'}
            {toDate !== undefined && <span className="diff muted">plán k dnešku {money(toDate)}</span>}
          </td>
        )}
        {hasLast && <td className="num muted hide-sm">{l.categories.length ? money(lastSeasonActual(game, l) ?? 0) : ''}</td>}
      </tr>
    );
  };
  const total = (label: string, ks: string[], cls = 'total') => {
    const lines = plan.lines.filter((l) => ks.includes(l.key));
    const v = pick(plan, ks);
    return (
      <tr key={label} className={cls}>
        <td>{label}</td>
        {approvedPlan && <td className="num muted">{money(pick(approvedPlan, ks))}</td>}
        <td className={`num ${v < 0 ? 'neg' : 'pos'}`}>{money(v)}</td>
        {started && <td className="num">{money(lines.reduce((a, l) => a + actualOf(l), 0))}</td>}
        {hasLast && <td className="num muted hide-sm">{money(lines.reduce((a, l) => a + (lastSeasonActual(game, l) ?? 0), 0))}</td>}
      </tr>
    );
  };
  const head = (label: string) => (
    <tr key={`h-${label}`} className="subhead"><td colSpan={cols}>{label}</td></tr>
  );

  return (
    <div className="stack">
      <section className="card wide budget">
        <div className="row-between">
          <h2>Rozpočet sezóny {seasonLabel(game.season)}</h2>
          {approved ? (
            <Badge tone="good">Schváleno {formatDate(game.budget!.approved!)}{game.budget!.revised ? ' (revize)' : ''}</Badge>
          ) : (
            <Badge tone="warn">Návrh · schvalte do {formatDate(budgetDue(game))}</Badge>
          )}
        </div>
        <p className="muted small">
          {cfo !== undefined ? 'Návrh připravil finanční ředitel.' : 'Návrh připravila účetní podle loňska.'} Řádky se nastavují v záložkách Příjmy a Výdaje; kliknutím na řádek se k němu dostanete.
          {approved ? ' Výhled = co už je na účtu + odhad zbytku sezóny.' : ''}{' '}
          {game.budget?.draft && <button className="linkbtn" onClick={() => apply(resetBudgetToDraft(game))}>Vrátit na návrh vedení</button>}
        </p>
        {impact && (
          <p className="warning soft">
            Změnili jste nastavení: provozní výsledek {impact.after - impact.before >= 0 ? 'se zlepší' : 'se zhorší'} o {money(Math.abs(impact.after - impact.before))} ({money(impact.before)} → {money(impact.after)}). Schvalte revizi dole.
          </p>
        )}
        {!changed && Math.abs(drift) >= Math.max(500_000, Math.abs(approvedPlan?.result ?? 0) * 0.05) && (
          <p className="muted small drift">Výhled se od schválení posunul o {drift >= 0 ? '+' : '−'}{money(Math.abs(drift))} (výsledky, pohár, sponzoři, přestupy). Nastavení se nezměnilo, není co schvalovat.</p>
        )}
        <Notice message={message?.text ?? null} ok={message?.ok} />

        <div className="kpis pl-kpis">
          <div className="kpi">
            <span className="kpi-label">Provozní výsledek</span>
            <strong className={`kpi-value ${plan.result < 0 ? 'neg' : 'pos'}`}>{money(plan.result)}</strong>
            <span className="kpi-sub">{approvedPlan ? `schváleno ${money(approvedPlan.result)}` : 'příjmy minus provozní výdaje'}</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Změna peněz za sezónu</span>
            <strong className={`kpi-value ${(plan.cashFlow ?? 0) < 0 ? 'neg' : 'pos'}`}>{money(plan.cashFlow ?? 0)}</strong>
            <span className="kpi-sub">včetně přestupů, daně a úvěrů</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Na konci sezóny</span>
            <strong className={`kpi-value ${plan.cashEnd < 0 ? 'neg' : ''}`}>{money(plan.cashEnd)}</strong>
            <span className="kpi-sub">nejméně {money(plan.cashMin)} v {monthIn(plan.cashMinDate ?? game.date)}</span>
          </div>
        </div>

        <div className="table-wrap">
          <table className="plan-table pl-table">
            <thead>
              <tr>
                <th>Položka</th>
                {approvedPlan && <th className="num">Schváleno</th>}
                <th className="num">{approved ? 'Výhled' : 'Plán'}</th>
                {started && <th className="num">Skutečnost</th>}
                {hasLast && <th className="num hide-sm">Loni</th>}
              </tr>
            </thead>
            <tbody>
              {head('Příjmy')}
              {income.filter(visible).map(row)}
              {total('Provozní příjmy', keys(income))}
              {head('Provozní výdaje')}
              {costs.filter(visible).map(row)}
              {total('Provozní výdaje', keys(costs))}
              {total('Provozní výsledek', [...keys(income), ...keys(costs)], 'total grand')}
              {head('Přestupy, investice a daň')}
              {capital.filter(visible).map(row)}
              {financing.filter(visible).length > 0 && head('Financování')}
              {financing.filter(visible).map(row)}
              {total('Změna peněz na účtu', keys(plan.lines), 'total grand')}
            </tbody>
          </table>
        </div>
        {approvedPlan && started && <p className="muted small">„Plán k dnešku“ je část schváleného plánu, která už měla proběhnout.</p>}

        {warnings.map((w, i) => (
          <p key={i} className={w.tone === 'bad' ? 'warning' : 'warning soft'}>{w.text}</p>
        ))}
        <OwnerNeedActions game={game} need={plan.ownerNeed ?? 0} onResult={apply} />
        <VoteInfo vote={vote} />
        {vote.needed && !vote.passes && (
          <ul className="plain small muted">
            {vote.votes.filter((v) => !v.yes).map((v) => (
              <li key={v.name}>{v.name}: {v.why}</li>
            ))}
          </ul>
        )}
        <button className="primary" disabled={(vote.needed && !vote.passes) || !!game.owner.ousted || (approved && !changed)} onClick={() => apply(approveBudget(game))}>
          {approved ? (changed ? 'Schválit revizi rozpočtu' : 'Rozpočet je schválený') : 'Schválit rozpočet'}
        </button>
      </section>

      <section className="card">
        <CashChart game={game} plan={plan} title="Peníze na účtu: skutečnost a výhled" height={170} />
      </section>
      <section className="card">
          <h2>Závazky na další sezóny</h2>
          <p className="muted small">Co je už dnes podepsané: platy, splátky přestupů a úvěrů proti jistým příjmům.</p>
          <div className="table-wrap">
            <table className="future-table">
              <thead>
                <tr>
                  <th />
                  {future.map((f) => <th key={f.season} className="num">{seasonLabel(f.season)}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr><td>Platy ve smlouvách</td>{future.map((f) => <td key={f.season} className="num neg">{money(f.wages)} <span className="muted small">({f.players})</span></td>)}</tr>
                <tr><td>Splátky přestupů</td>{future.map((f) => <td key={f.season} className="num">{money(f.transfers)}</td>)}</tr>
                <tr><td>Úvěry</td>{future.map((f) => <td key={f.season} className="num">{money(f.loans)}</td>)}</tr>
                <tr><td>Sponzorské smlouvy</td>{future.map((f) => <td key={f.season} className="num pos">{money(f.sponsors)}</td>)}</tr>
                <tr><td>TV práva (stejná soutěž)</td>{future.map((f) => <td key={f.season} className="num pos">{money(f.tv)}</td>)}</tr>
                <tr className="total">
                  <td>Jisté saldo</td>
                  {future.map((f) => {
                    const v = f.wages + f.transfers + f.loans + f.sponsors + f.tv;
                    return <td key={f.season} className={`num ${v < 0 ? 'neg' : 'pos'}`}>{money(v)}</td>;
                  })}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="muted small">Bez vstupného, nových smluv a odměn: ty se doplní v rozpočtu dané sezóny.</p>
      </section>
    </div>
  );
}
