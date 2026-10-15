import { useState } from 'react';
import {
  CATEGORY_LABEL,
  competitionOf,
  defaultTicketPrice,
  defaultTransferBudget,
  EXPENSE_CATEGORIES,
  formatShortDate,
  INCOME_CATEGORIES,
  injectCapital,
  updatePolicy,
  wageBudgetMonthly,
  type FinanceCategory,
  type FinanceTotals,
  type GameState,
} from '../../engine';
import { money } from '../format';
import { Chips, DataTable, useStoredState } from '../table';

export function Finance({ game, onChange }: { game: GameState; onChange: (g: GameState) => void }) {
  const club = game.clubs[game.owner.clubId];
  const tier = competitionOf(game, club.id)?.tier ?? 3;
  const [capital, setCapital] = useState('');
  const [ticket, setTicket] = useState(String(club.policy.ticketPrice));
  const [transfer, setTransfer] = useState(String(club.policy.transferBudget / 1_000_000));

  const capitalValue = Number(capital.replace(',', '.')) * 1_000_000;
  const canInject = capitalValue > 0 && capitalValue <= game.owner.wallet;

  return (
    <div className="grid two">
      <section className="card">
        <h2>Stav</h2>
        <dl className="kv">
          <dt>Zůstatek klubu</dt>
          <dd className={club.finance.balance < 0 ? 'neg' : ''}>{money(club.finance.balance)}</dd>
          <dt>Vaše osobní peníze</dt>
          <dd>{money(game.owner.wallet)}</dd>
        </dl>
        {club.finance.monthsNegative > 0 && (
          <p className="warning">
            Klub je {club.finance.monthsNegative}. měsíc v minusu. Po třetím měsíci v řadě zkrachuje.
          </p>
        )}
        <h3>Vložit vlastní kapitál</h3>
        <div className="inline-form">
          <input inputMode="decimal" value={capital} placeholder="0" onChange={(e) => setCapital(e.target.value)} />
          <span>mil. Kč</span>
          <button
            disabled={!canInject}
            onClick={() => {
              onChange(injectCapital(game, capitalValue));
              setCapital('');
            }}
          >
            Vložit
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Rozhodnutí majitele</h2>

        <label className="field">
          <span>Cena vstupenky (běžně {defaultTicketPrice(tier)} Kč)</span>
          <div className="inline-form">
            <input inputMode="numeric" value={ticket} onChange={(e) => setTicket(e.target.value)} />
            <span>Kč</span>
            <button
              disabled={Number(ticket) === club.policy.ticketPrice || !(Number(ticket) >= 0)}
              onClick={() => onChange(updatePolicy(game, { ticketPrice: Number(ticket) }))}
            >
              Nastavit
            </button>
          </div>
          <small className="muted">Vyšší cena přinese víc za vstupenku, ale přijde méně diváků.</small>
        </label>

        <label className="field">
          <span>Mzdový rozpočet: {Math.round(club.policy.wageMultiplier * 100)} % běžného ({money(wageBudgetMonthly(club))} měsíčně)</span>
          <input
            type="range"
            min={70}
            max={150}
            step={5}
            value={Math.round(club.policy.wageMultiplier * 100)}
            onChange={(e) => onChange(updatePolicy(game, { wageMultiplier: Number(e.target.value) / 100 }))}
          />
          <small className="muted">Strop pro platy hráčů, který hlídá sportovní ředitel. Vyšší rozpočet přiláká i hráče, kteří by jinak nepřišli. Platy ve smlouvách se změnou rozpočtu nemění.</small>
        </label>

        <label className="field">
          <span>Rozpočet na odstupné za sezónu (běžně {money(defaultTransferBudget(club))})</span>
          <div className="inline-form">
            <input inputMode="decimal" value={transfer} onChange={(e) => setTransfer(e.target.value)} />
            <span>mil. Kč</span>
            <button
              disabled={!(Number(transfer.replace(',', '.')) >= 0)}
              onClick={() => onChange(updatePolicy(game, { transferBudget: Number(transfer.replace(',', '.')) * 1_000_000 }))}
            >
              Nastavit
            </button>
          </div>
          <small className="muted">
            Platí pro letní i zimní okno, polovina peněz z prodejů se do něj vrací. Teď nastaveno {money(club.policy.transferBudget)}.
          </small>
        </label>
      </section>

      <section className="card">
        <h2>Hospodaření v sezóně</h2>
        <Totals current={club.finance.season} last={club.finance.lastSeason} />
      </section>

      <Movements game={game} />
    </div>
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
