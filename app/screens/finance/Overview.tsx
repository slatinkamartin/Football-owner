import {
  activeOverdraft,
  balanceSheet,
  budgetApproved,
  budgetWarnings,
  CATEGORY_LABEL,
  EXPENSE_CATEGORIES,
  expiringSponsors,
  forecastSeason,
  hierarchyIssues,
  INCOME_CATEGORIES,
  INSOLVENCY_MONTHS,
  licenceProblems,
  moneyCalendar,
  planToDate,
  SLOT_LABEL,
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
  const licenceFailed = game.licence?.season === game.season && game.licence.status !== 'ok';
  if (licence.length && !licenceFailed) alerts.push({ tone: 'warn', text: `Licence by teď neprošla: ${licence.join(', ')}.`, tab: 'financovani' });
  for (const h of hierarchyIssues(game)) alerts.push({ tone: 'warn', text: h, tab: 'naklady' });
  if (licenceFailed) alerts.push({ tone: 'bad', text: game.licence!.note, tab: 'financovani' });

  const ending = Number(game.date.slice(5, 7)) <= 6 && Number(game.date.slice(5, 7)) >= 1 ? expiringSponsors(game) : [];
  if (ending.length) alerts.push({ tone: 'warn', text: `V létě končí sponzorské smlouvy: ${ending.map((c) => `${SLOT_LABEL[c.slot]} (${c.name})`).join(', ')}. Nabídky na prodloužení chodí od března.`, tab: 'prijmy' });
  const seen = new Set<string>();
  const shown = alerts.filter((a) => !seen.has(a.text) && seen.add(a.text));

  const basePlan = budgetApproved(game) ? game.budget!.plan! : plan;
  const operating = basePlan.lines.filter((l) => !l.categories.some((c) => ['uver', 'vklad', 'investice'].includes(c)));
  const planNow = operating.reduce((a, l) => a + planToDate(game, l), 0);
  const calendar = moneyCalendar(game);
  const monthlyNet = calendar.monthly.reduce((a, m) => a + m.amount, 0);

  const flows = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES].map((c) => ({ c, v: totals[c] })).filter((x) => x.v !== 0);
  const max = Math.max(1, ...flows.map((x) => Math.abs(x.v)));

  return (
    <div className="stack">
      <div className="kpis">
        <Kpi label="Zůstatek klubu" value={money(club.finance.balance)} tone={club.finance.balance < 0 ? 'neg' : ''} sub={od ? `kontokorent do ${money(od)}` : 'bez kontokorentu'} />
        <Kpi label="Nejnižší zůstatek v plánu" value={money(plan.cashMin)} tone={plan.cashMin < -od ? 'neg' : ''} sub={`na konci sezóny ${money(plan.cashEnd)}`} />
        <Kpi label="Výsledek sezóny zatím" value={money(result)} tone={result < 0 ? 'neg' : 'pos'} sub={`plán k dnešku ${money(planNow)} · celá sezóna ${money(basePlan.result)}`} />
        <Kpi label="Platy / příjmy" value={income > 0 && wages > 0 ? `${Math.round((wages / income) * 100)} %` : '–'} tone={income > 0 && wages / income > 0.75 ? 'neg' : ''} sub="zdravé je do 70 %" />
        <Kpi label="Dluhy" value={money(sheet.debt)} sub={`vlastní kapitál ${money(sheet.equity)}`} tone={sheet.equity < 0 ? 'neg' : ''} />
        <Kpi label="Osobní peníze majitele" value={money(game.owner.wallet)} sub={game.ownerLoan ? `půjčka klubu ${money(game.ownerLoan.remaining)}` : 'bez půjčky klubu'} />
      </div>

      {shown.length > 0 && (
        <section className="card">
          <h2>Na co se podívat</h2>
          <ul className="plain alerts">
            {shown.map((a, i) => (
              <li key={i} className={a.tone}>
                <span>{a.text}</span>
                {a.tab && <button className="linkbtn" onClick={() => onOpen(a.tab!)}>Otevřít ›</button>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card calendar-card">
        <h2>Kalendář peněz <span className="muted small">· příštích 12 měsíců</span></h2>
        <div className="grid two">
          <div>
            <h3>Každý měsíc</h3>
            <dl className="kv">
              {calendar.monthly.map((m) => (
                <span key={m.label} className="kv-row">
                  <dt>{m.label}</dt>
                  <dd className={m.amount < 0 ? 'neg' : 'pos'}>{money(m.amount)}</dd>
                </span>
              ))}
              <dt className="total-row">Pravidelně za měsíc</dt>
              <dd className={`total-row ${monthlyNet < 0 ? 'neg' : 'pos'}`}>{money(monthlyNet)}</dd>
            </dl>
            <p className="muted small">Bez vstupného, zápasových prémií a přestupů.</p>
          </div>
          <div>
            <h3>Termíny</h3>
            <ul className="plain calendar-list">
              {calendar.items.map((it, i) => (
                <li key={i}>
                  <span className="cal-date">{shortDate(it.date)}</span>
                  <span className="cal-label">{it.label}</span>
                  {it.amount !== undefined && <span className={`num ${it.amount < 0 ? 'neg' : 'pos'}`}>{money(it.amount)}</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

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

function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${Number(d)}. ${Number(m)}. ${y}`;
}
