import { useState } from 'react';
import {
  approveBudget,
  budgetApproved,
  budgetComparison,
  budgetDue,
  budgetVote,
  budgetWarnings,
  defaultSeasonTicketPrice,
  defaultTicketPrice,
  defaultTransferBudget,
  DEPARTMENT_KEYS,
  DEPARTMENT_LABEL,
  departmentEffect,
  departmentReference,
  departmentsOf,
  forecastSeason,
  formatDate,
  seasonLabel,
  seasonTicketDemand,
  seasonTicketHolders,
  seasonTicketPrice,
  staffAbility,
  tierOf,
  updatePolicy,
  wageBudgetMonthly,
  wageRank,
  type ActionResult,
  type Departments,
  type GameState,
} from '../../engine';
import { LineChart } from '../chart';
import { Badge, Notice } from '../components';
import { money, num } from '../format';
import { VoteInfo } from '../VoteInfo';

type Props = { game: GameState; onChange: (g: GameState) => void };

const EFFECT_TEXT: Record<keyof Departments, (e: number) => string> = {
  skauting: (e) => `přesnost odhadů ${e >= 0 ? '+' : ''}${Math.round(e * 35)} %`,
  mladez: (e) => `dorostenci ${e >= 0 ? '+' : ''}${(e * 2.5).toFixed(1)} bodu`,
  medicina: (e) => `zranění ${e >= 0 ? '−' : '+'}${Math.abs(Math.round(e * 15))} %`,
  marketing: (e) => `sponzoři ${e >= 0 ? '+' : ''}${Math.round(e * 8)} %, nálada fanoušků ${e >= 0 ? '+' : ''}${Math.round(e * 6)}`,
};

function effectTone(e: number): string {
  return e > 0.05 ? 'pos' : e < -0.05 ? 'neg' : 'muted';
}

/** Rozpočet sezóny: nastavení, plán, hotovost po měsících, varování, hlasování a plán proti skutečnosti. */
export function BudgetCard({ game, onChange }: Props) {
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const club = game.clubs[game.owner.clubId];
  const tier = tierOf(game, club.id);
  const approved = budgetApproved(game);
  const plan = forecastSeason(game);
  const warnings = budgetWarnings(game, plan);
  const vote = budgetVote(game, plan);
  const comparison = approved ? budgetComparison(game) : [];
  const holders = seasonTicketHolders(game);
  const sold = game.budget?.season === game.season && game.budget.seasonTickets !== undefined;
  const ref = departmentReference(club, tier);
  const depts = departmentsOf(club, tier);
  const set = (patch: Parameters<typeof updatePolicy>[1]) => onChange(updatePolicy(game, patch));
  const apply = (r: ActionResult) => {
    if (r.state !== game) onChange(r.state);
    setMessage({ text: r.message, ok: r.ok });
  };
  const cfo = staffAbility(game, 'financni');

  return (
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
        {cfo !== undefined ? 'Návrh připravil finanční ředitel.' : 'Návrh připravila účetní podle loňska. Finanční ředitel by ho připravil přesněji.'}{' '}
        Změny se hned promítnou do plánu. Po schválení se plán porovnává se skutečností; rozpočet můžete kdykoli revidovat.
      </p>
      <Notice message={message?.text ?? null} ok={message?.ok} />

      <div className="budget-grid">
        <div className="budget-settings">
          <h3>Příjmy ze vstupného</h3>
          <NumberField
            label={`Vstupenka (běžně ${defaultTicketPrice(tier)} Kč)`}
            value={club.policy.ticketPrice}
            unit="Kč"
            onSet={(v) => set({ ticketPrice: v })}
          />
          <NumberField
            label={`Permanentka (běžně ${num(defaultSeasonTicketPrice(tier))} Kč)`}
            value={seasonTicketPrice(game)}
            unit="Kč"
            disabled={sold}
            onSet={(v) => set({ seasonTicketPrice: v })}
          />
          <p className="muted small">
            {sold
              ? `Prodáno ${num(holders)} permanentek. Další prodej až příští sezónu.`
              : `Odhad prodeje: ${num(seasonTicketDemand(game))} permanentek (peníze přijdou při schválení, jejich držitelé pak neplatí vstupné).`}
          </p>

          <h3>Hráči</h3>
          <label className="field">
            <span>Mzdový strop: {money(wageBudgetMonthly(club))} měsíčně ({Math.round(club.policy.wageMultiplier * 100)} % běžného)</span>
            <input
              type="range"
              min={50}
              max={200}
              step={5}
              value={Math.round(club.policy.wageMultiplier * 100)}
              onChange={(e) => set({ wageMultiplier: Number(e.target.value) / 100 })}
            />
            <small className="muted">Mzdovým stropem patříte na {wageRank(game)}. místo v lize. Platy ve smlouvách se tím nemění.</small>
          </label>
          <NumberField
            label={`Odstupné za posily (běžně ${money(defaultTransferBudget(club))})`}
            value={club.policy.transferBudget / 1_000_000}
            unit="mil. Kč"
            decimal
            onSet={(v) => set({ transferBudget: v * 1_000_000 })}
          />
          <label className="check">
            <input type="checkbox" checked={club.policy.autoSquad !== false} onChange={(e) => set({ autoSquad: e.target.checked })} />
            <span>Sportovní ředitel sám prodlužuje smlouvy a doplňuje kádr na 22 hráčů v rámci mzdového stropu</span>
          </label>

          <h3>Oddělení</h3>
          {DEPARTMENT_KEYS.map((key) => {
            const e = departmentEffect(club, tier, key);
            const pct = Math.round((depts[key] / Math.max(1, ref[key])) * 100);
            return (
              <label key={key} className="field">
                <span className="row-between">
                  <span>{DEPARTMENT_LABEL[key]}: {money(depts[key])} ročně ({pct} % běžného)</span>
                  <span className={`small ${effectTone(e)}`}>{EFFECT_TEXT[key](e)}</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={400}
                  step={25}
                  value={pct}
                  onChange={(ev) => set({ departments: { ...depts, [key]: Math.round((ref[key] * Number(ev.target.value)) / 100 / 10_000) * 10_000 } })}
                />
              </label>
            );
          })}
          <p className="muted small">Každá další koruna přinese méně: dvojnásobek běžné částky má poloviční účinek proti čtyřnásobku.</p>
        </div>

        <div className="budget-plan">
          <h3>Plán sezóny</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Položka</th>
                  <th className="num">Plán</th>
                  {approved && <th className="num">Skutečnost</th>}
                </tr>
              </thead>
              <tbody>
                {plan.lines
                  .filter((l) => l.amount !== 0 || l.key === 'evropa')
                  .map((l) => {
                    const actual = comparison.find((c) => c.line.key === l.key);
                    const planned = actual?.line.amount ?? l.amount;
                    return (
                      <tr key={l.key}>
                        <td className="wrap">{l.label}</td>
                        <td className={`num ${planned < 0 ? 'neg' : ''}`}>{money(planned)}</td>
                        {approved && <td className={`num ${(actual?.actual ?? 0) < 0 ? 'neg' : ''}`}>{money(actual?.actual ?? 0)}</td>}
                      </tr>
                    );
                  })}
                <tr className="total">
                  <td>Plánovaný výsledek</td>
                  <td className={`num ${plan.result < 0 ? 'neg' : 'pos'}`}>{money(approved ? game.budget!.plan!.result : plan.result)}</td>
                  {approved && <td className="num">{money(comparison.reduce((a, c) => a + c.actual, 0))}</td>}
                </tr>
              </tbody>
            </table>
          </div>
          <dl className="kv">
            <dt>Nejnižší zůstatek během sezóny</dt>
            <dd className={plan.cashMin < 0 ? 'neg' : ''}>{money(plan.cashMin)}</dd>
            <dt>Zůstatek na konci sezóny</dt>
            <dd className={plan.cashEnd < 0 ? 'neg' : ''}>{money(plan.cashEnd)}</dd>
          </dl>
          <LineChart
            title="Plánovaný zůstatek po měsících"
            points={plan.months.map((m) => ({ label: `${m.date.slice(5, 7)}/${m.date.slice(2, 4)}`, value: m.balance }))}
            format={(v) => money(v)}
            height={140}
          />
          {warnings.map((w, i) => (
            <p key={i} className={w.tone === 'bad' ? 'warning' : 'warning soft'}>{w.text}</p>
          ))}
          <VoteInfo vote={vote} />
          {vote.needed && !vote.passes && (
            <ul className="plain small muted">
              {vote.votes.filter((v) => !v.yes).map((v) => (
                <li key={v.name}>{v.name}: {v.why}</li>
              ))}
            </ul>
          )}
          <button className="primary" disabled={(vote.needed && !vote.passes) || !!game.owner.ousted} onClick={() => apply(approveBudget(game))}>
            {approved ? 'Schválit revizi rozpočtu' : 'Schválit rozpočet'}
          </button>
        </div>
      </div>
    </section>
  );
}

function NumberField({ label, value, unit, onSet, decimal, disabled }: {
  label: string; value: number; unit: string; onSet: (v: number) => void; decimal?: boolean; disabled?: boolean;
}) {
  const shown = decimal ? String(Math.round(value * 10) / 10).replace('.', ',') : String(Math.round(value));
  const [text, setText] = useState(shown);
  const parsed = Number(text.replace(',', '.'));
  return (
    <label className="field">
      <span>{label}</span>
      <div className="inline-form">
        <input inputMode={decimal ? 'decimal' : 'numeric'} value={text} disabled={disabled} onChange={(e) => setText(e.target.value)} />
        <span>{unit}</span>
        <button disabled={disabled || !(parsed >= 0) || text === shown} onClick={() => onSet(parsed)}>Nastavit</button>
      </div>
    </label>
  );
}
