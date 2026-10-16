import { Fragment, useEffect, useState } from 'react';
import {
  balanceSheet,
  CATEGORY_LABEL,
  formatShortDate,
  OPERATING_CATEGORIES,
  profitAndLoss,
  TAX_RATE,
  type FinanceCategory,
  type FinanceTotals,
  type GameState,
} from '../../engine';
import { money } from '../format';
import { Chips, DataTable, useStoredState } from '../table';
import { BudgetCard } from './finance/Budget';
import { FinanceExpenses } from './finance/Expenses';
import { FinanceFunding } from './finance/Funding';
import { FinanceIncome } from './finance/Income';
import { FinanceOverview } from './finance/Overview';

export type FinanceTab = 'prehled' | 'rozpocet' | 'prijmy' | 'vydaje' | 'financovani' | 'ucetnictvi';

const TABS: { id: FinanceTab; label: string }[] = [
  { id: 'prehled', label: 'Přehled' },
  { id: 'rozpocet', label: 'Rozpočet' },
  { id: 'prijmy', label: 'Příjmy' },
  { id: 'vydaje', label: 'Výdaje' },
  { id: 'financovani', label: 'Financování' },
  { id: 'ucetnictvi', label: 'Účetnictví' },
];

/** Finance se otevírají na Přehledu (nebo na záložce, kam vede okno milníku). */
export function Finance({ game, onChange, initialTab = 'prehled' }: { game: GameState; onChange: (g: GameState) => void; initialTab?: FinanceTab }) {
  const [tab, setTab] = useState<FinanceTab>(initialTab);
  const [focus, setFocus] = useState<string | undefined>(undefined);
  const open = (t: FinanceTab, line?: string) => {
    setFocus(line);
    setTab(t);
  };
  useEffect(() => {
    if (!focus) window.scrollTo(0, 0);
  }, [tab, focus]);
  return (
    <div className="stack">
      <nav className="subtabs" aria-label="Části financí">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => open(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'prehled' && <FinanceOverview game={game} onOpen={open} onChange={onChange} />}
      {tab === 'rozpocet' && <BudgetCard game={game} onChange={onChange} onOpen={open} />}
      {tab === 'prijmy' && <FinanceIncome game={game} onChange={onChange} onOpen={open} focus={focus} />}
      {tab === 'vydaje' && <FinanceExpenses game={game} onChange={onChange} focus={focus} />}
      {tab === 'financovani' && <FinanceFunding game={game} onChange={onChange} />}
      {tab === 'ucetnictvi' && <Accounting game={game} />}
    </div>
  );
}

function Accounting({ game }: { game: GameState }) {
  const club = game.clubs[game.owner.clubId];
  return (
    <div className="grid accounting-grid">
      <ProfitLoss game={game} />
      <section className="card">
        <h2>Peněžní toky</h2>
        <p className="muted small">Stejné členění jako rozpočet. Rozbalte skupinu pro jednotlivé položky.</p>
        <CashFlow current={club.finance.season} last={club.finance.lastSeason} />
      </section>
      <Movements game={game} />
    </div>
  );
}

/** Peněžní toky ve třech skupinách jako v rozpočtu, s rozbalitelnými položkami. */
function CashFlow({ current, last }: { current: FinanceTotals; last?: FinanceTotals }) {
  const [open, setOpen] = useState<string | null>(null);
  const groups: { label: string; cats: FinanceCategory[] }[] = [
    { label: 'Provozní výsledek', cats: OPERATING_CATEGORIES },
    { label: 'Přestupy, investice a daň', cats: ['prestupy', 'investice', 'dane'] },
    { label: 'Úvěry, půjčky a vklady majitele', cats: ['uver', 'vklad'] },
  ];
  const sum = (t: FinanceTotals | undefined, cats: FinanceCategory[]) => (t ? cats.reduce((a, c) => a + (t[c] ?? 0), 0) : 0);
  const total = (t?: FinanceTotals) => groups.reduce((a, g) => a + sum(t, g.cats), 0);
  return (
    <table className="cashflow">
      <thead>
        <tr><th /><th className="num">Tato sezóna</th>{last && <th className="num">Minulá</th>}</tr>
      </thead>
      <tbody>
        {groups.map((g) => {
          const cats = g.cats.filter((c) => (current[c] ?? 0) !== 0 || (last?.[c] ?? 0) !== 0);
          const expanded = open === g.label;
          return (
            <Fragment key={g.label}>
              <tr className="group-row">
                <td className="wrap">
                  {cats.length > 0 ? (
                    <button className="linkbtn" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : g.label)}>{expanded ? '▾' : '▸'} {g.label}</button>
                  ) : g.label}
                </td>
                <td className={`num ${sum(current, g.cats) < 0 ? 'neg' : 'pos'}`}>{money(sum(current, g.cats))}</td>
                {last && <td className="num muted">{money(sum(last, g.cats))}</td>}
              </tr>
              {expanded && cats.map((c) => (
                <tr key={c} className="detail-row">
                  <td className="wrap">{CATEGORY_LABEL[c]}</td>
                  <td className="num">{money(current[c] ?? 0)}</td>
                  {last && <td className="num muted">{money(last[c] ?? 0)}</td>}
                </tr>
              ))}
            </Fragment>
          );
        })}
        <tr className="total">
          <td>Změna peněz na účtu</td>
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
    now[key].map((l, i) => ({ l, i })).filter(({ l, i }) => Math.round(l.amount) !== 0 || Math.round(last?.[key][i].amount ?? 0) !== 0).map(({ l, i }) => (
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
          Účetní pohled: na rozdíl od provozního výsledku v rozpočtu obsahuje odpisy hráčů a staveb, zisk z prodeje hráčů a úroky. Cena koupeného hráče se rozkládá do let smlouvy. Vklady a půjčky majitele nejsou výnos. Nulové řádky jsou skryté.
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
              <td>Účetní výsledek před zdaněním</td>
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
