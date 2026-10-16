import { useEffect } from 'react';
import {
  balanceSheet,
  CATEGORY_LABEL,
  EXPENSE_CATEGORIES,
  formatShortDate,
  INCOME_CATEGORIES,
  profitAndLoss,
  TAX_RATE,
  type FinanceCategory,
  type FinanceTotals,
  type GameState,
} from '../../engine';
import { money } from '../format';
import { Chips, DataTable, useStoredState } from '../table';
import { BudgetCard } from './finance/Budget';
import { FinanceCosts } from './finance/Costs';
import { FinanceFunding } from './finance/Funding';
import { FinanceIncome } from './finance/Income';
import { FinanceOverview } from './finance/Overview';

export type FinanceTab = 'prehled' | 'rozpocet' | 'prijmy' | 'naklady' | 'financovani' | 'ucetnictvi';

const TABS: { id: FinanceTab; label: string }[] = [
  { id: 'prehled', label: 'Přehled' },
  { id: 'rozpocet', label: 'Rozpočet' },
  { id: 'prijmy', label: 'Příjmy' },
  { id: 'naklady', label: 'Náklady' },
  { id: 'financovani', label: 'Financování' },
  { id: 'ucetnictvi', label: 'Účetnictví' },
];

export function Finance({ game, onChange }: { game: GameState; onChange: (g: GameState) => void }) {
  const [tab, setTab] = useStoredState<FinanceTab>('finance:zalozka', 'prehled');
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);
  return (
    <div className="stack">
      <nav className="subtabs" aria-label="Části financí">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'prehled' && <FinanceOverview game={game} onOpen={setTab} />}
      {tab === 'rozpocet' && <BudgetCard game={game} onChange={onChange} onOpen={setTab} />}
      {tab === 'prijmy' && <FinanceIncome game={game} onChange={onChange} onBudget={() => setTab('rozpocet')} />}
      {tab === 'naklady' && <FinanceCosts game={game} onChange={onChange} onBudget={() => setTab('rozpocet')} />}
      {tab === 'financovani' && <FinanceFunding game={game} onChange={onChange} />}
      {tab === 'ucetnictvi' && <Accounting game={game} />}
    </div>
  );
}

function Accounting({ game }: { game: GameState }) {
  const club = game.clubs[game.owner.clubId];
  return (
    <div className="grid two">
      <ProfitLoss game={game} />
      <section className="card">
        <h2>Peněžní toky</h2>
        <CashFlow current={club.finance.season} last={club.finance.lastSeason} />
      </section>
      <section className="card">
        <h2>Pohyby podle kategorií</h2>
        <Totals current={club.finance.season} last={club.finance.lastSeason} />
      </section>
      <Movements game={game} />
    </div>
  );
}

/** Výkaz peněžních toků: provozní, investiční a finanční činnost. */
function CashFlow({ current, last }: { current: FinanceTotals; last?: FinanceTotals }) {
  const groups: { label: string; cats: FinanceCategory[] }[] = [
    { label: 'Provozní činnost', cats: ['vstupne', 'stadion', 'tv', 'komercni', 'evropa', 'pohar', 'ostatni', 'platy', 'vedeni', 'oddeleni', 'provoz', 'dane'] },
    { label: 'Investiční činnost (stavby a přestupy)', cats: ['investice', 'prestupy'] },
    { label: 'Finanční činnost (úvěry, půjčky, vklady)', cats: ['uver', 'vklad'] },
  ];
  const sum = (t: FinanceTotals | undefined, cats: FinanceCategory[]) => (t ? cats.reduce((a, c) => a + (t[c] ?? 0), 0) : 0);
  const total = (t?: FinanceTotals) => groups.reduce((a, g) => a + sum(t, g.cats), 0);
  return (
    <table>
      <thead>
        <tr><th /><th className="num">Tato sezóna</th>{last && <th className="num">Minulá</th>}</tr>
      </thead>
      <tbody>
        {groups.map((g) => (
          <tr key={g.label}>
            <td className="wrap">{g.label}</td>
            <td className={`num ${sum(current, g.cats) < 0 ? 'neg' : 'pos'}`}>{money(sum(current, g.cats))}</td>
            {last && <td className="num muted">{money(sum(last, g.cats))}</td>}
          </tr>
        ))}
        <tr className="total">
          <td>Změna hotovosti</td>
          <td className={`num ${total(current) < 0 ? 'neg' : 'pos'}`}>{money(total(current))}</td>
          {last && <td className="num">{money(total(last))}</td>}
        </tr>
      </tbody>
    </table>
  );
}

function ProfitLoss({ game }: { game: GameState }) {
  const club = game.clubs[game.owner.clubId];
  const f = club.finance;
  const now = profitAndLoss(f.season, f.accounting);
  const last = f.lastSeason ? profitAndLoss(f.lastSeason, f.lastAccounting) : undefined;
  const bs = balanceSheet(game);
  const lines = (key: 'revenues' | 'costs') =>
    now[key].map((l, i) => (
      <tr key={l.label}>
        <td className="wrap">{l.label}</td>
        <td className="num">{money(l.amount)}</td>
        {last && <td className="num muted">{money(last[key][i].amount)}</td>}
      </tr>
    ));
  return (
    <>
      <section className="card">
        <h2>Výsledovka</h2>
        <p className="muted small">
          Účetní pohled: cena koupeného hráče se rozkládá do let smlouvy (odpisy), u prodeje se počítá zisk proti zůstatkové hodnotě. Vklady majitele nejsou výnos.
        </p>
        <table>
          <thead>
            <tr><th /><th className="num">Tato sezóna</th>{last && <th className="num">Minulá</th>}</tr>
          </thead>
          <tbody>
            <tr className="subhead"><td colSpan={3}>Výnosy</td></tr>
            {lines('revenues')}
            <tr className="subhead"><td colSpan={3}>Náklady</td></tr>
            {lines('costs')}
            <tr className="total">
              <td>Výsledek před zdaněním</td>
              <td className={`num ${now.beforeTax < 0 ? 'neg' : 'pos'}`}>{money(now.beforeTax)}</td>
              {last && <td className={`num ${last.beforeTax < 0 ? 'neg' : 'pos'}`}>{money(last.beforeTax)}</td>}
            </tr>
          </tbody>
        </table>
        <p className="muted small">
          Daň z příjmů {Math.round(TAX_RATE * 100)} % se platí na konci sezóny z kladného výsledku po odečtení ztrát z minulých let
          {f.lossCarry ? ` (neuplatněná ztráta ${money(f.lossCarry)})` : ''}.
        </p>
      </section>

      <section className="card">
        <h2>Rozvaha</h2>
        <table>
          <tbody>
            <tr className="subhead"><td colSpan={2}>Aktiva</td></tr>
            <tr><td>Peníze na účtu</td><td className="num">{money(bs.cash)}</td></tr>
            <tr><td className="wrap">Hráčské registrace (neodepsaná hodnota)</td><td className="num">{money(bs.registrations)}</td></tr>
            <tr><td className="wrap">Stavby a vybavení (neodepsaná hodnota)</td><td className="num">{money(bs.buildings)}</td></tr>
            {bs.receivables > 0 && <tr><td className="wrap">Pohledávky ze splátek přestupů</td><td className="num">{money(bs.receivables)}</td></tr>}
            <tr className="subhead"><td colSpan={2}>Pasiva</td></tr>
            <tr><td>Úvěry</td><td className="num">{money(bs.loans)}</td></tr>
            {bs.payables > 0 && <tr><td className="wrap">Závazky ze splátek přestupů</td><td className="num">{money(bs.payables)}</td></tr>}
            {bs.ownerLoan > 0 && <tr><td className="wrap">Půjčka majitele (podřízená)</td><td className="num">{money(bs.ownerLoan)}</td></tr>}
            {bs.tvAdvance > 0 && <tr><td className="wrap">Záloha na TV peníze</td><td className="num">{money(bs.tvAdvance)}</td></tr>}
            <tr><td>Záporný zůstatek účtu</td><td className="num">{money(bs.overdraft)}</td></tr>
            <tr className="total"><td>Vlastní kapitál</td><td className={`num ${bs.equity < 0 ? 'neg' : ''}`}>{money(bs.equity)}</td></tr>
          </tbody>
        </table>
        <p className="muted small">Stavby se zapisují do majetku a odepisují 10–30 let podle druhu.</p>
      </section>

    </>
  );
}

function Movements({ game }: { game: GameState }) {
  const club = game.clubs[game.owner.clubId];
  const [filter, setFilter] = useStoredState('filtr:pohyby', { category: '' as FinanceCategory | '' });
  const rows = club.finance.transactions
    .map((t, i) => ({ ...t, i }))
    .filter((t) => !filter.category || t.category === filter.category);
  const used = [...new Set(club.finance.transactions.map((t) => t.category))];
  return (
    <section className="card wide">
      <h2>Pohyby na účtu</h2>
      <div className="filters">
        <Chips
          options={used.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))}
          value={filter.category}
          onChange={(category) => setFilter({ category })}
          allLabel="všechny"
        />
      </div>
      <DataTable
        id="pohyby"
        rows={rows}
        rowKey={(t) => String(t.i)}
        initialSort={{ key: 'date', dir: 'desc' }}
        limit={40}
        empty="Žádné pohyby."
        columns={[
          { key: 'date', label: 'Datum', value: (t) => `${t.date}-${String(9999 - t.i).padStart(4, '0')}`, render: (t) => formatShortDate(t.date), className: () => 'muted' },
          { key: 'note', label: 'Popis', value: (t) => t.note, className: () => 'wrap' },
          { key: 'cat', label: 'Kategorie', hideSm: true, value: (t) => CATEGORY_LABEL[t.category], className: () => 'muted' },
          { key: 'amount', label: 'Částka', num: true, value: (t) => t.amount, render: (t) => money(t.amount), className: (t) => (t.amount < 0 ? 'neg' : 'pos') },
        ]}
      />
    </section>
  );
}

function Totals({ current, last }: { current: FinanceTotals; last?: FinanceTotals }) {
  const sum = (t: FinanceTotals | undefined, cats: typeof INCOME_CATEGORIES) => (t ? cats.reduce((s, c) => s + t[c], 0) : 0);
  const rows = (cats: typeof INCOME_CATEGORIES) =>
    cats.map((c) => (
      <tr key={c}>
        <td className="wrap">{CATEGORY_LABEL[c]}</td>
        <td className="num">{money(current[c])}</td>
        {last && <td className="num muted">{money(last[c])}</td>}
      </tr>
    ));
  const result = sum(current, INCOME_CATEGORIES) + sum(current, EXPENSE_CATEGORIES);
  const lastResult = sum(last, INCOME_CATEGORIES) + sum(last, EXPENSE_CATEGORIES);
  return (
    <table>
      <thead>
        <tr><th /><th className="num">Tato sezóna</th>{last && <th className="num">Minulá</th>}</tr>
      </thead>
      <tbody>
        <tr className="subhead"><td colSpan={3}>Příjmy</td></tr>
        {rows(INCOME_CATEGORIES)}
        <tr className="subhead"><td colSpan={3}>Výdaje</td></tr>
        {rows(EXPENSE_CATEGORIES)}
        <tr className="total">
          <td>Výsledek</td>
          <td className={`num ${result < 0 ? 'neg' : 'pos'}`}>{money(result)}</td>
          {last && <td className={`num ${lastResult < 0 ? 'neg' : 'pos'}`}>{money(lastResult)}</td>}
        </tr>
      </tbody>
    </table>
  );
}
