import {
  activeOverdraft,
  balanceSheet,
  budgetApproved,
  budgetWarnings,
  CATEGORY_LABEL,
  EXPENSE_CATEGORIES,
  forecastSeason,
  hierarchyIssues,
  INCOME_CATEGORIES,
  INSOLVENCY_MONTHS,
  licenceProblems,
  type GameState,
} from '../../../engine';
import { LineChart } from '../../chart';
import { money } from '../../format';
import type { FinanceTab } from '../Finance';

/** Přehled financí: ukazatele, upozornění, vývoj zůstatku a kam jdou peníze. */
export function FinanceOverview({ game, onOpen }: { game: GameState; onOpen: (tab: FinanceTab) => void }) {
  const club = game.clubs[game.owner.clubId];
  const plan = forecastSeason(game);
  const sheet = balanceSheet(game);
  const totals = club.finance.season;
  const income = INCOME_CATEGORIES.filter((c) => c !== 'uver' && c !== 'vklad').reduce((a, c) => a + totals[c], 0);
  const wages = -totals.platy;
  const result = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES].filter((c) => !['uver', 'vklad', 'investice'].includes(c)).reduce((a, c) => a + totals[c], 0);
  const od = activeOverdraft(game);
  const licence = licenceProblems(game);

  const alerts: { text: string; tone: 'bad' | 'warn'; tab?: FinanceTab }[] = [];
  if (game.crisis) alerts.push({ tone: 'bad', text: 'Klub je v krizovém režimu. Rozhodněte o krizovém plánu v Přehledu hry.' });
  if (club.finance.monthsNegative > 0) {
    alerts.push({ tone: 'bad', text: `Účet je ${club.finance.monthsNegative}. měsíc v minusu${od ? ' nad kontokorent' : ''}. Po ${INSOLVENCY_MONTHS}. měsíci přijde insolvence.`, tab: 'financovani' });
  }
  if (!budgetApproved(game)) alerts.push({ tone: 'warn', text: 'Rozpočet sezóny čeká na schválení.', tab: 'rozpocet' });
  for (const w of budgetWarnings(game, plan)) alerts.push({ tone: w.tone, text: w.text, tab: 'rozpocet' });
  if (licence.length) alerts.push({ tone: 'warn', text: `Licence by teď neprošla: ${licence.join(', ')}.`, tab: 'financovani' });
  for (const h of hierarchyIssues(game)) alerts.push({ tone: 'warn', text: h, tab: 'naklady' });
  if (game.licence?.season === game.season && game.licence.status !== 'ok') alerts.push({ tone: 'bad', text: game.licence.note, tab: 'financovani' });

  const flows = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES].map((c) => ({ c, v: totals[c] })).filter((x) => x.v !== 0);
  const max = Math.max(1, ...flows.map((x) => Math.abs(x.v)));

  return (
    <div className="stack">
      <div className="kpis">
        <Kpi label="Zůstatek klubu" value={money(club.finance.balance)} tone={club.finance.balance < 0 ? 'neg' : ''} sub={od ? `kontokorent do ${money(od)}` : 'bez kontokorentu'} />
        <Kpi label="Nejnižší zůstatek v plánu" value={money(plan.cashMin)} tone={plan.cashMin < -od ? 'neg' : ''} sub={`na konci sezóny ${money(plan.cashEnd)}`} />
        <Kpi label="Výsledek sezóny zatím" value={money(result)} tone={result < 0 ? 'neg' : 'pos'} sub={`plán celé sezóny ${money(budgetApproved(game) ? game.budget!.plan!.result : plan.result)}`} />
        <Kpi label="Platy / příjmy" value={income > 0 && wages > 0 ? `${Math.round((wages / income) * 100)} %` : '–'} tone={income > 0 && wages / income > 0.75 ? 'neg' : ''} sub="zdravé je do 70 %" />
        <Kpi label="Dluhy" value={money(sheet.debt)} sub={`vlastní kapitál ${money(sheet.equity)}`} tone={sheet.equity < 0 ? 'neg' : ''} />
        <Kpi label="Osobní peníze majitele" value={money(game.owner.wallet)} sub={game.ownerLoan ? `půjčka klubu ${money(game.ownerLoan.remaining)}` : 'bez půjčky klubu'} />
      </div>

      {alerts.length > 0 && (
        <section className="card">
          <h2>Na co se podívat</h2>
          <ul className="plain alerts">
            {alerts.map((a, i) => (
              <li key={i} className={a.tone}>
                <span>{a.text}</span>
                {a.tab && <button className="linkbtn" onClick={() => onOpen(a.tab!)}>Otevřít ›</button>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid two">
        <section className="card">
          <h2>Kam jdou peníze v této sezóně</h2>
          {flows.length === 0 ? (
            <p className="muted">Sezóna teprve začala.</p>
          ) : (
            <ul className="plain flows">
              {flows.map(({ c, v }) => (
                <li key={c}>
                  <span className="flow-label">{CATEGORY_LABEL[c]}</span>
                  <span className="flow-bar"><span className={v < 0 ? 'neg-bar' : 'pos-bar'} style={{ width: `${(Math.abs(v) / max) * 100}%` }} /></span>
                  <span className={`num ${v < 0 ? 'neg' : 'pos'}`}>{money(v)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <LineChart
            title="Zůstatek klubu na začátku měsíce"
            points={(club.finance.balanceHistory ?? []).map((h) => ({ label: `${h.date.slice(5, 7)}/${h.date.slice(2, 4)}`, value: h.balance }))}
            format={(v) => money(v)}
          />
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, tone = '' }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <strong className={`kpi-value ${tone}`}>{value}</strong>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}
