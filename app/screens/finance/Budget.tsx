import { Fragment, useState } from 'react';
import {
  approveBudget,
  BONUS_HINT,
  BONUS_LABEL,
  bonusScheme,
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
  SECTION_HINT,
  SECTION_LABEL,
  sectionUsage,
  seasonLabel,
  seasonTicketDemand,
  seasonTicketHolders,
  seasonTicketPrice,
  sponsorMonthly,
  staffAbility,
  tierOf,
  updatePolicy,
  wageBudgetMonthly,
  wageCommitments,
  wagePlan,
  wageRank,
  wageSplit,
  WAGE_SECTIONS,
  type ActionResult,
  type BonusScheme,
  type Departments,
  type GameState,
  type WageSection,
} from '../../../engine';
import { LineChart } from '../../chart';
import { Badge, Notice } from '../../components';
import { money, num } from '../../format';
import { VoteInfo } from '../../VoteInfo';

type Props = { game: GameState; onChange: (g: GameState) => void; onOpen?: (tab: 'prijmy' | 'naklady') => void };

const STEPS = [
  { id: 'prijmy', label: 'Příjmy' },
  { id: 'hraci', label: 'Hráči a platy' },
  { id: 'oddeleni', label: 'Oddělení' },
  { id: 'shrnuti', label: 'Shrnutí a schválení' },
] as const;
type Step = (typeof STEPS)[number]['id'];

const EFFECT_TEXT: Record<keyof Departments, (e: number) => string> = {
  skauting: (e) => `přesnost odhadů ${e >= 0 ? '+' : ''}${Math.round(e * 35)} %`,
  mladez: (e) => `dorostenci ${e >= 0 ? '+' : ''}${(e * 2.5).toFixed(1)} bodu`,
  medicina: (e) => `zranění ${e >= 0 ? '−' : '+'}${Math.abs(Math.round(e * 15))} %`,
  marketing: (e) => `sponzoři ${e >= 0 ? '+' : ''}${Math.round(e * 8)} %, fanoušci ${e >= 0 ? '+' : ''}${Math.round(e * 6)}`,
};

function tone(v: number): string {
  return v > 0.05 ? 'pos' : v < -0.05 ? 'neg' : 'muted';
}

/** Rozpočet sezóny ve čtyřech krocích s plánem v kostce po straně. */
export function BudgetCard({ game, onChange, onOpen }: Props) {
  const [step, setStep] = useState<Step>('prijmy');
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const approved = budgetApproved(game);
  const plan = forecastSeason(game);
  const warnings = budgetWarnings(game, plan);
  const set = (patch: Parameters<typeof updatePolicy>[1]) => onChange(updatePolicy(game, patch));
  const apply = (r: ActionResult) => {
    if (r.state !== game) onChange(r.state);
    setMessage({ text: r.message, ok: r.ok });
  };
  const income = plan.lines.filter((l) => l.amount > 0).reduce((a, l) => a + l.amount, 0);
  const costs = plan.lines.filter((l) => l.amount < 0).reduce((a, l) => a + l.amount, 0);
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
        {cfo !== undefined ? 'Návrh připravil finanční ředitel.' : 'Návrh připravila účetní podle loňska.'} Každá změna se hned promítne do plánu vpravo.
        Rozpočet můžete kdykoli revidovat.
      </p>
      <Notice message={message?.text ?? null} ok={message?.ok} />

      <nav className="stepper" aria-label="Kroky rozpočtu">
        {STEPS.map((s, i) => (
          <button key={s.id} className={step === s.id ? 'active' : ''} onClick={() => setStep(s.id)}>
            <span className="step-no">{i + 1}</span> {s.label}
          </button>
        ))}
      </nav>

      <div className="budget-grid">
        <div className="budget-settings">
          {step === 'prijmy' && <IncomeStep game={game} set={set} onOpen={onOpen} />}
          {step === 'hraci' && <PlayersStep game={game} set={set} onOpen={onOpen} />}
          {step === 'oddeleni' && <DepartmentsStep game={game} set={set} />}
          {step === 'shrnuti' && <SummaryStep game={game} onApply={apply} />}
        </div>
        <aside className="budget-aside">
          <h3>Plán v kostce</h3>
          <dl className="kv">
            <dt>Mzdový strop</dt>
            <dd>{money(wageBudgetMonthly(game.clubs[game.owner.clubId]))} / měs.</dd>
            <dt>Příjmy</dt>
            <dd className="pos">{money(income)}</dd>
            <dt>Výdaje</dt>
            <dd className="neg">{money(costs)}</dd>
            <dt>Výsledek</dt>
            <dd className={plan.result < 0 ? 'neg' : 'pos'}>{money(plan.result)}</dd>
            <dt>Nejnižší zůstatek</dt>
            <dd className={plan.cashMin < 0 ? 'neg' : ''}>{money(plan.cashMin)}</dd>
            <dt>Zůstatek na konci</dt>
            <dd>{money(plan.cashEnd)}</dd>
          </dl>
          {warnings.length > 0 && (
            <p className={warnings.some((w) => w.tone === 'bad') ? 'warning' : 'warning soft'}>
              {warnings.length === 1 ? warnings[0].text : `${warnings.length} upozornění, podrobnosti ve shrnutí.`}
            </p>
          )}
          {step !== 'shrnuti' && (
            <button className="primary" onClick={() => setStep(STEPS[STEPS.findIndex((s) => s.id === step) + 1].id)}>
              Další krok ›
            </button>
          )}
        </aside>
      </div>
    </section>
  );
}

type SetPolicy = (patch: Parameters<typeof updatePolicy>[1]) => void;

/** Součet řádků plánu, které patří ke kroku rozpočtu. */
function StepTotals({ game, keys, title, totalLabel }: { game: GameState; keys: string[]; title: string; totalLabel: string }) {
  const lines = forecastSeason(game).lines.filter((l) => keys.includes(l.key));
  const total = lines.reduce((a, l) => a + l.amount, 0);
  return (
    <div className="step-totals">
      <h3>{title}</h3>
      <table>
        <tbody>
          {lines.map((l) => (
            <tr key={l.key}>
              <td className="wrap">{l.label}</td>
              <td className={`num ${l.amount < 0 ? 'neg' : ''}`}>{money(l.amount)}</td>
            </tr>
          ))}
          <tr className="total">
            <td>{totalLabel}</td>
            <td className={`num ${total < 0 ? 'neg' : 'pos'}`}>{money(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function IncomeStep({ game, set, onOpen }: { game: GameState; set: SetPolicy; onOpen?: Props['onOpen'] }) {
  const club = game.clubs[game.owner.clubId];
  const tier = tierOf(game, club.id);
  const sold = game.budget?.season === game.season && game.budget.seasonTickets !== undefined;
  const sp = sponsorMonthly(game);
  return (
    <>
      <h3>Vstupné a permanentky</h3>
      <NumberField label={`Vstupenka (běžně ${defaultTicketPrice(tier)} Kč)`} value={club.policy.ticketPrice} unit="Kč" onSet={(v) => set({ ticketPrice: v })} />
      <NumberField
        label={`Permanentka (běžně ${num(defaultSeasonTicketPrice(tier))} Kč)`}
        value={seasonTicketPrice(game)}
        unit="Kč"
        disabled={sold}
        onSet={(v) => set({ seasonTicketPrice: v })}
      />
      <p className="muted small">
        {sold
          ? `Prodáno ${num(seasonTicketHolders(game))} permanentek. Další prodej až příští sezónu.`
          : `Odhad prodeje: ${num(seasonTicketDemand(game))} permanentek. Peníze přijdou při schválení, držitelé pak neplatí vstupné.`}
      </p>
      <h3>Sponzoři</h3>
      <p className="small">
        Smlouvy {money(sp.contracts * 12)} ročně, drobní sponzoři a reklama {money(sp.small * 12)}.{' '}
        {onOpen && <button className="linkbtn" onClick={() => onOpen('prijmy')}>Sponzorská místa a nabídky ›</button>}
      </p>
      <StepTotals game={game} keys={['vstupne', 'stadion', 'tv', 'komercni', 'evropa']} title="Plánované příjmy za sezónu" totalLabel="Příjmy celkem" />
    </>
  );
}

function PlayersStep({ game, set, onOpen }: { game: GameState; set: SetPolicy; onOpen?: Props['onOpen'] }) {
  const club = game.clubs[game.owner.clubId];
  const split = wageSplit(game);
  const usage = sectionUsage(game);
  const scheme = bonusScheme(game);
  const commitments = wageCommitments(game);
  const wp = wagePlan(game);
  const sum = (k: 'cap' | 'bill' | 'expiring' | 'room') => usage.reduce((a, u) => a + u[k], 0);
  // Posun jedné sekce rozloží rozdíl poměrně mezi ostatní, součet zůstane 100 %.
  const changeSplit = (section: WageSection, value: number) => {
    const others = WAGE_SECTIONS.filter((s) => s !== section);
    const rest = others.reduce((a, s) => a + split[s], 0);
    const next = { ...split, [section]: value } as Record<WageSection, number>;
    for (const s of others) next[s] = rest > 0 ? (split[s] / rest) * (1 - value) : (1 - value) / others.length;
    set({ wageSplit: next });
  };
  return (
    <>
      <h3>Mzdový strop (rozpočet na platy hráčů)</h3>
      <div className="cap-box">
        <div><span className="muted small">Strop měsíčně</span><strong>{money(wageBudgetMonthly(club))}</strong></div>
        <div><span className="muted small">Strop na sezónu</span><strong>{money(wp.cap)}</strong></div>
        <div><span className="muted small">Platy ve smlouvách teď</span><strong>{money(wp.contracts / 12)} / měs.</strong></div>
        <div><span className="muted small">Volné místo pod stropem</span><strong className={wp.cap - wp.contracts < 0 ? 'neg' : 'pos'}>{money((wp.cap - wp.contracts) / 12)} / měs.</strong></div>
      </div>
      <label className="field">
        <span>{Math.round(club.policy.wageMultiplier * 100)} % běžného stropu pro klub této velikosti, {wageRank(game)}. místo v lize</span>
        <input type="range" min={50} max={200} step={5} value={Math.round(club.policy.wageMultiplier * 100)} onChange={(e) => set({ wageMultiplier: Number(e.target.value) / 100 })} />
      </label>

      <h3>Rozdělení do sekcí</h3>
      <div className="table-wrap">
        <table className="sections">
          <thead>
            <tr>
              <th>Sekce</th>
              <th className="num">Podíl</th>
              <th className="num">Rozpočet</th>
              <th className="num">Platy</th>
              <th className="num hide-sm">Končí v létě</th>
              <th className="num">Zbývá</th>
            </tr>
          </thead>
          <tbody>
            {usage.map((u) => (
              <tr key={u.section}>
                <td className="wrap">
                  <strong>{SECTION_LABEL[u.section]}</strong> <span className="muted small">({u.players})</span>
                  <input
                    type="range"
                    min={0}
                    max={70}
                    step={1}
                    value={Math.round(split[u.section] * 100)}
                    aria-label={`Podíl sekce ${SECTION_LABEL[u.section]}`}
                    onChange={(e) => changeSplit(u.section, Number(e.target.value) / 100)}
                  />
                  <span className="muted small">{SECTION_HINT[u.section]}</span>
                </td>
                <td className="num" data-label="Podíl">{Math.round(split[u.section] * 100)} %</td>
                <td className="num" data-label="Rozpočet">{money(u.cap)}</td>
                <td className="num" data-label="Platy">{money(u.bill)}</td>
                <td className="num hide-sm muted">{money(u.expiring)}</td>
                <td className={`num ${u.room < 0 ? 'neg' : 'pos'}`} data-label="Zbývá">{money(u.room)}</td>
              </tr>
            ))}
            <tr className="total">
              <td>Celkem</td>
              <td className="num" data-label="Podíl">100 %</td>
              <td className="num" data-label="Rozpočet">{money(sum('cap'))}</td>
              <td className="num" data-label="Platy">{money(sum('bill'))}</td>
              <td className="num hide-sm">{money(sum('expiring'))}</td>
              <td className={`num ${sum('room') < 0 ? 'neg' : 'pos'}`} data-label="Zbývá">{money(sum('room'))}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Částky jsou měsíční. Sportovní ředitel podepisuje a prodlužuje jen v rámci rozpočtu sekce, kam hráč patří.{' '}
        {onOpen && <button className="linkbtn" onClick={() => onOpen('naklady')}>Hráči po sekcích ›</button>}
      </p>

      <h3>Systém prémií</h3>
      <div className="choices compact">
        {(['fixni', 'vyvazeny', 'vykonovy'] as BonusScheme[]).map((b) => (
          <button key={b} className={`choice ${scheme === b ? 'selected' : ''}`} onClick={() => set({ bonusScheme: b })}>
            <strong>{BONUS_LABEL[b]}</strong>
            <span>{BONUS_HINT[b]}</span>
          </button>
        ))}
      </div>

      <h3>Přestupy</h3>
      <NumberField
        label={`Odstupné za posily (běžně ${money(defaultTransferBudget(club))})`}
        value={club.policy.transferBudget / 1_000_000}
        unit="mil. Kč"
        decimal
        onSet={(v) => set({ transferBudget: v * 1_000_000 })}
      />
      <label className="check">
        <input type="checkbox" checked={club.policy.autoSquad !== false} onChange={(e) => set({ autoSquad: e.target.checked })} />
        <span>Sportovní ředitel sám prodlužuje smlouvy a doplňuje kádr na 22 hráčů v rámci sekcí</span>
      </label>

      <h3>Podepsané platy do budoucna</h3>
      <dl className="kv">
        {commitments.map((c) => (
          <Fragment key={c.season}>
            <dt>Sezóna {seasonLabel(c.season)} ({c.players} hráčů)</dt>
            <dd>{money(c.amount)}</dd>
          </Fragment>
        ))}
      </dl>
      <StepTotals game={game} keys={['platy', 'vedeni', 'prestupy']} title="Plánované výdaje na hráče a vedení" totalLabel="Hráči a vedení celkem" />
      <p className="muted small">
        Platy se plánují podle stropu ({money(wp.cap)}), protože do něj smí ředitel podepisovat. Současné smlouvy dělají {money(wp.contracts)}, prémie za body a cíl odhadem {money(wp.bonuses)}.
      </p>
    </>
  );
}

function DepartmentsStep({ game, set }: { game: GameState; set: SetPolicy }) {
  const club = game.clubs[game.owner.clubId];
  const tier = tierOf(game, club.id);
  const ref = departmentReference(club, tier);
  const depts = departmentsOf(club, tier);
  return (
    <>
      <h3>Rozpočty oddělení</h3>
      {DEPARTMENT_KEYS.map((key) => {
        const e = departmentEffect(club, tier, key);
        const pct = Math.round((depts[key] / Math.max(1, ref[key])) * 100);
        return (
          <label key={key} className="field">
            <span className="row-between">
              <span>{DEPARTMENT_LABEL[key]}: {money(depts[key])} ročně ({pct} % běžného)</span>
              <span className={`small ${tone(e)}`}>{EFFECT_TEXT[key](e)}</span>
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
      <div className="step-totals">
        <table>
          <tbody>
            {DEPARTMENT_KEYS.map((k) => (
              <tr key={k}>
                <td>{DEPARTMENT_LABEL[k]}</td>
                <td className="num">{money(depts[k])}</td>
                <td className="num muted">{money(ref[k])}</td>
              </tr>
            ))}
            <tr className="total">
              <td>Oddělení celkem (vy / běžně)</td>
              <td className="num neg">{money(DEPARTMENT_KEYS.reduce((a, k) => a + depts[k], 0))}</td>
              <td className="num muted">{money(DEPARTMENT_KEYS.reduce((a, k) => a + ref[k], 0))}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <StepTotals game={game} keys={['oddeleni', 'provoz']} title="Oddělení a provoz za sezónu" totalLabel="Oddělení a provoz celkem" />
    </>
  );
}

function SummaryStep({ game, onApply }: { game: GameState; onApply: (r: ActionResult) => void }) {
  const approved = budgetApproved(game);
  const plan = forecastSeason(game);
  const warnings = budgetWarnings(game, plan);
  const vote = budgetVote(game, plan);
  const comparison = approved ? budgetComparison(game) : [];
  return (
    <>
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
      <button className="primary" disabled={(vote.needed && !vote.passes) || !!game.owner.ousted} onClick={() => onApply(approveBudget(game))}>
        {approved ? 'Schválit revizi rozpočtu' : 'Schválit rozpočet'}
      </button>
    </>
  );
}

export function NumberField({ label, value, unit, onSet, decimal, disabled }: {
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
