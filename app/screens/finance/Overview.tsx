import { RatingCard, ScenariosCard } from './Extras';
import { useState } from 'react';
import {
  activeOverdraft,
  annualCosts,
  tierOf,
  balanceSheet,
  budgetApproved,
  budgetChanged,
  budgetWarnings,
  expiringSponsors,
  forecastSeason,
  hierarchyIssues,
  INCOME_CATEGORIES,
  INSOLVENCY_MONTHS,
  leagueBenchmarks,
  licenceProblems,
  moneyCalendar,
  operatingActual,
  SLOT_LABEL,
  type ActionResult,
  type BudgetLine,
  type GameState,
} from '../../../engine';
import { Notice } from '../../components';
import { money } from '../../format';
import type { FinanceTab } from '../Finance';
import { Composition, LeagueRanks, Waterfall } from './OverviewCharts';
import { CashChart, OwnerNeedActions } from './shared';

type Status = 'good' | 'warn' | 'bad';
const STATUS_TEXT: Record<Status, { icon: string; label: string }> = {
  good: { icon: '✓', label: 'V pořádku' },
  warn: { icon: '!', label: 'Pozor' },
  bad: { icon: '✕', label: 'Chybí peníze' },
};

const MONTHS = ['červenci', 'srpnu', 'září', 'říjnu', 'listopadu', 'prosinci', 'lednu', 'únoru', 'březnu', 'dubnu', 'květnu', 'červnu'];
const monthIn = (date: string) => MONTHS[(Number(date.slice(5, 7)) + 5) % 12];

/** Přehled financí: stav peněz s výhledem, hlavní čísla, upozornění, průběh sezóny a kalendář. */
export function FinanceOverview({ game, onOpen, onChange }: { game: GameState; onOpen: (tab: FinanceTab, line?: string) => void; onChange: (g: GameState) => void }) {
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const apply = (r: ActionResult) => {
    if (r.state !== game) onChange(r.state);
    setMessage({ text: r.message, ok: r.ok });
  };
  const club = game.clubs[game.owner.clubId];
  const plan = forecastSeason(game);
  const warnings = budgetWarnings(game, plan);
  const bench = leagueBenchmarks(game, plan);
  const sheet = balanceSheet(game);
  const totals = club.finance.season;
  const od = activeOverdraft(game);
  const approved = budgetApproved(game) ? game.budget!.plan! : undefined;
  const operating = operatingActual(game);
  const income = INCOME_CATEGORIES.filter((c) => !['uver', 'vklad'].includes(c)).reduce((a, c) => a + (totals[c] ?? 0), 0);
  const wages = -totals.platy;
  const wageShare = income > 0 ? wages / income : 0;

  const status: Status =
    game.crisis || club.finance.monthsNegative > 0 || (plan.ownerNeed ?? 0) > 0 ? 'bad' : warnings.length || plan.cashMin < 0 ? 'warn' : 'good';
  const verdict =
    (plan.ownerNeed ?? 0) > 0
      ? `Podle výhledu by klubu v ${monthIn(plan.cashMinDate ?? game.date)} chybělo až ${money(-(plan.cashMin + od))}. Potřeba od majitele asi ${money(plan.ownerNeed!)}.`
      : plan.cashMin < 0
        ? `Peníze vystačí, ale v ${monthIn(plan.cashMinDate ?? game.date)} klub sáhne do kontokorentu.`
        : `Peníze do konce sezóny vystačí. Na konci června bude na účtu asi ${money(plan.cashEnd)}.`;

  const alerts: { text: string; tone: 'bad' | 'warn'; tab?: FinanceTab }[] = [];
  if (game.crisis) alerts.push({ tone: 'bad', text: 'Klub je v krizovém režimu. Rozhodněte o krizovém plánu v Přehledu hry.' });
  if (club.finance.monthsNegative > 0) {
    alerts.push({ tone: 'bad', text: `Účet je ${club.finance.monthsNegative}. měsíc v minusu${od ? ' nad kontokorent' : ''}. Po ${INSOLVENCY_MONTHS}. měsíci přijde insolvence.`, tab: 'financovani' });
  }
  if (!budgetApproved(game)) alerts.push({ tone: 'warn', text: 'Rozpočet sezóny čeká na schválení.', tab: 'rozpocet' });
  if (budgetChanged(game)) alerts.push({ tone: 'warn', text: 'Nastavení rozpočtu se liší od schváleného. Schvalte revizi.', tab: 'rozpocet' });
  for (const w of warnings) if (!w.text.startsWith('Peníze:')) alerts.push({ tone: w.tone, text: w.text, tab: w.text.startsWith('Licence') ? 'financovani' : 'rozpocet' });
  const licence = licenceProblems(game);
  const licenceFailed = game.licence?.season === game.season && game.licence.status !== 'ok';
  if (licenceFailed) alerts.push({ tone: 'bad', text: game.licence!.note, tab: 'financovani' });
  else if (licence.length) alerts.push({ tone: 'warn', text: `Licence by teď neprošla: ${licence.join(', ')}.`, tab: 'financovani' });
  for (const h of hierarchyIssues(game)) alerts.push({ tone: 'warn', text: h, tab: 'vydaje' });
  const month = Number(game.date.slice(5, 7));
  const ending = month >= 1 && month <= 6 ? expiringSponsors(game) : [];
  if (ending.length) alerts.push({ tone: 'warn', text: `V létě končí sponzorské smlouvy: ${ending.map((c) => `${SLOT_LABEL[c.slot]} (${c.name})`).join(', ')}. Nabídky na prodloužení chodí od března.`, tab: 'prijmy' });
  const costs = annualCosts(club, tierOf(game, club.id));
  if (club.finance.balance > costs * 0.8 && plan.cashMin > costs * 0.5) {
    alerts.push({ tone: 'warn', text: `Na účtu leží ${money(club.finance.balance)} a do konce sezóny neklesne pod ${money(plan.cashMin)}. Ředitel doporučuje peníze využít: stavby a zázemí (Stadion), posily (Přestupy) nebo vyšší mzdový strop.`, tab: 'prestupy' });
  }
  const seen = new Set<string>();
  const shown = alerts.filter((a) => !seen.has(a.text) && seen.add(a.text));

  const calendar = moneyCalendar(game);
  const monthlyNet = calendar.monthly.reduce((a, m) => a + m.amount, 0);
  const lines = plan.lines.filter((l) => l.group === 'provoz' && (l.amount !== 0 || (l.actual ?? 0) !== 0));
  const other = plan.lines.filter((l) => l.group !== 'provoz' && (l.amount !== 0 || (l.actual ?? 0) !== 0));
  const max = Math.max(1, ...lines.map((l) => Math.abs(l.amount)), ...lines.map((l) => Math.abs(l.actual ?? 0)));
  const diff = approved ? plan.result - approved.result : 0;

  return (
    <div className="stack">
      <Notice message={message?.text ?? null} ok={message?.ok} />
      <section className={`card fin-hero ${status}`}>
        <div className="hero-main">
          <span className="kpi-label">Peníze na účtu</span>
          <strong className={`hero-value ${club.finance.balance < 0 ? 'neg' : ''}`}>{money(club.finance.balance)}</strong>
          <span className={`status-pill ${status}`}><span aria-hidden="true">{STATUS_TEXT[status].icon}</span> {STATUS_TEXT[status].label}</span>
          <p className="hero-verdict">{verdict}</p>
          <dl className="hero-facts">
            <div><dt>Na konci sezóny</dt><dd className={plan.cashEnd < 0 ? 'neg' : ''}>{money(plan.cashEnd)}</dd></div>
            <div><dt>Nejméně (v {monthIn(plan.cashMinDate ?? game.date)})</dt><dd className={plan.cashMin < -od ? 'neg' : ''}>{money(plan.cashMin)}</dd></div>
            <div><dt>Kontokorent</dt><dd>{od ? `do ${money(od)}` : 'nemáte'}</dd></div>
          </dl>
          <OwnerNeedActions game={game} need={plan.ownerNeed ?? 0} onResult={apply} />
        </div>
        <div className="hero-chart">
          <CashChart game={game} plan={plan} title="Skutečnost a výhled do konce sezóny" />
        </div>
      </section>

      <div className="kpis">
        <Kpi
          label="Provozní výsledek zatím"
          value={money(operating)}
          tone={operating < 0 ? 'neg' : 'pos'}
          sub={`výhled za sezónu ${money(plan.result)}`}
        />
        <Kpi
          label="Výhled proti schválenému"
          value={approved ? `${diff >= 0 ? '+' : '−'}${money(Math.abs(diff))}` : '–'}
          tone={!approved ? '' : diff >= 0 ? 'pos' : 'neg'}
          sub={approved ? `schváleno ${money(approved.result)}` : 'rozpočet není schválený'}
        />
        <div className="kpi">
          <span className="kpi-label">Platy / příjmy</span>
          <strong className={`kpi-value ${wageShare > 0.75 ? 'neg' : ''}`}>{income > 0 ? `${Math.round(wageShare * 100)} %` : '–'}</strong>
          <span className="ratio-meter" aria-hidden="true">
            <span className={wageShare > 0.75 ? 'bad' : wageShare > 0.7 ? 'warn' : 'good'} style={{ width: `${Math.min(100, wageShare * 100)}%` }} />
            <i style={{ left: '70%' }} />
          </span>
          <span className="kpi-sub">zdravé je do 70 %</span>
        </div>
        <Kpi label="Vlastní kapitál" value={money(sheet.equity)} tone={sheet.equity < 0 ? 'neg' : ''} sub={`dluhy ${money(sheet.debt)}`} />
        <Kpi label="Vaše osobní peníze" value={money(game.owner.wallet)} sub={game.ownerLoan ? `klub vám dluží ${money(game.ownerLoan.remaining)}` : 'klub vám nic nedluží'} />
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

      <div className="grid two">
        <section className="card wide">
          <Waterfall plan={plan} />
        </section>
        <section className="card wide">
          <h2>Složení sezóny</h2>
          <Composition plan={plan} />
        </section>
      </div>

      <section className="card">
        <div className="row-between">
          <h2>Kde jsme v lize</h2>
          <span className="muted small">pruh = vy, čárka = průměr ligy</span>
        </div>
        <LeagueRanks
          items={[
            { label: 'Příjmy za sezónu', b: bench.prijmy },
            { label: 'Platy hráčů', b: bench.platy, hint: 'víc = silnější kádr' },
            { label: 'Sponzoři a fanshop', b: bench.komercni },
            { label: 'Vstupné', b: bench.vstupne },
            { label: 'Peníze na účtu', b: bench.zustatek },
          ]}
        />
      </section>

      <section className="card">
        <div className="row-between">
          <h2>Sezóna v číslech</h2>
          <button className="linkbtn" onClick={() => onOpen('rozpocet')}>Rozpočet ›</button>
        </div>
        <p className="muted small">Plný pruh je skutečnost k dnešku, světlý celý výhled sezóny.</p>
        <BulletGroup title="Příjmy" lines={lines.filter((l) => l.amount > 0 || (l.actual ?? 0) > 0)} max={max} />
        <BulletGroup title="Výdaje" lines={lines.filter((l) => l.amount < 0 || (l.actual ?? 0) < 0)} max={max} />
        <div className="bullet-total">
          <span>Provozní výsledek</span>
          <span className={`num ${operating < 0 ? 'neg' : 'pos'}`}>{money(operating)}</span>
          <span className="muted small">výhled {money(plan.result)}</span>
        </div>
        {other.length > 0 && (
          <dl className="kv other-flows">
            {other.map((l) => (
              <span key={l.key} className="kv-row">
                <dt>{l.label}</dt>
                <dd>{money(l.actual ?? 0)} <span className="muted small">/ výhled {money(l.amount)}</span></dd>
              </span>
            ))}
          </dl>
        )}
      </section>

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
        <RatingCard game={game} />
        <ScenariosCard game={game} />
      </div>
    </div>
  );
}

/** Řádky „skutečnost z výhledu“: tenký pruh výhledu a plný pruh toho, co už je na účtu. */
function BulletGroup({ title, lines, max }: { title: string; lines: BudgetLine[]; max: number }) {
  if (!lines.length) return null;
  return (
    <div className="bullets">
      <h3>{title}</h3>
      <ul className="plain">
        {lines.map((l) => {
          const actual = l.actual ?? 0;
          const neg = l.amount < 0 || actual < 0;
          return (
            <li key={l.key} title={`${l.label}: ${money(actual)} z výhledu ${money(l.amount)}`}>
              <span className="bullet-label">{l.label}</span>
              <span className="bullet-bar">
                <span className={`bullet-track ${neg ? 'neg' : 'pos'}`} style={{ width: `${(Math.abs(l.amount) / max) * 100}%` }} />
                <span className={`bullet-fill ${neg ? 'neg' : 'pos'}`} style={{ width: `${(Math.abs(actual) / max) * 100}%` }} />
              </span>
              <span className="bullet-value">
                <strong>{money(actual)}</strong>
                <span className="muted small"> z {money(l.amount)}</span>
              </span>
            </li>
          );
        })}
      </ul>
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
