import { addDays } from './calendar';
import { createEvent } from './events';
import { annualCosts, balanceSheet, book, departmentsOf, ownerAccounting, tvMonthly } from './finance';
import type { Rng } from './rng';
import type { ActionResult } from './staff';
import type { GameState, GrantApplication } from './types';
import { addNews, clamp, competitionOf, tierOf } from './world';

/**
 * Financování klubu majitele: půjčka majitele, kontokorent, prodej budoucích TV peněz, dotace,
 * splátky přestupů, licenční řízení a krizový režim.
 */

const own = (state: GameState) => state.clubs[state.owner.clubId];
const mil = (v: number) => `${(v / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč`;

// ---------- Půjčka majitele ----------

export const OWNER_LOAN_RATE = 0.03;

/** Majitel půjčí klubu: na rozdíl od vkladu se peníze vracejí (s úrokem 3 %). Svaz ji bere jako podřízenou. */
export function lendToClub(prev: GameState, amount: number): ActionResult {
  const value = Math.floor(amount);
  if (value <= 0 || value > prev.owner.wallet) return { state: prev, ok: false, message: 'Na to nemáte dost osobních peněz.' };
  if (prev.owner.ousted) return { state: prev, ok: false, message: 'Klub teď řídí představenstvo.' };
  const state = structuredClone(prev);
  state.owner.wallet -= value;
  const loan = state.ownerLoan ?? { principal: 0, remaining: 0, rate: OWNER_LOAN_RATE };
  loan.principal += value;
  loan.remaining += value;
  state.ownerLoan = loan;
  book(state, state.owner.clubId, 'uver', value, 'Půjčka od majitele');
  const message = `Půjčil jste klubu ${mil(value)}. Klub ji splácí, kdy bude mít peníze; úrok ${Math.round(OWNER_LOAN_RATE * 100)} % ročně.`;
  addNews(state, { kind: 'info', title: 'Půjčka majitele', text: message });
  return { state, ok: true, message };
}

export function repayOwnerLoan(prev: GameState, amount: number): ActionResult {
  const loan = prev.ownerLoan;
  const club = own(prev);
  const value = Math.min(Math.floor(amount), loan?.remaining ?? 0, Math.max(0, club.finance.balance));
  if (!loan || value <= 0) return { state: prev, ok: false, message: 'Klub teď nemá z čeho splácet.' };
  const state = structuredClone(prev);
  state.ownerLoan!.remaining -= value;
  state.owner.wallet += value;
  book(state, state.owner.clubId, 'uver', -value, 'Splátka půjčky majiteli');
  if (state.ownerLoan!.remaining <= 0) state.ownerLoan = undefined;
  return { state, ok: true, message: `Klub vám vrátil ${mil(value)}.` };
}

// ---------- Kontokorent ----------

export function overdraftLimit(state: GameState): number {
  const club = own(state);
  return Math.round((annualCosts(club, tierOf(state, club.id)) * 0.1) / 1_000_000) * 1_000_000;
}

export function activeOverdraft(state: GameState): number {
  return own(state).policy.overdraft ? overdraftLimit(state) : 0;
}

export const OVERDRAFT_RATE = 0.12;

export function setOverdraft(prev: GameState, on: boolean): ActionResult {
  if (prev.owner.ousted) return { state: prev, ok: false, message: 'Klub teď řídí představenstvo.' };
  if (!on && own(prev).finance.balance < 0) return { state: prev, ok: false, message: 'Kontokorent nejde zrušit, dokud je účet v minusu.' };
  const state = structuredClone(prev);
  own(state).policy.overdraft = on;
  const message = on
    ? `Kontokorent sjednán: klub může jít do minusu až ${mil(overdraftLimit(state))} bez rizika insolvence. Úrok ${Math.round(OVERDRAFT_RATE * 100)} % z čerpané částky, poplatek 0,5 % z limitu ročně.`
    : 'Kontokorent zrušen.';
  return { state, ok: true, message };
}

// ---------- Prodej budoucích TV peněz ----------

export function tvAdvanceOffer(state: GameState): number {
  if (state.tvAdvance) return 0;
  return Math.round((tvMonthly(tierOf(state, state.owner.clubId)) * 6 * 0.92) / 100_000) * 100_000;
}

export function sellTvAdvance(prev: GameState): ActionResult {
  const amount = tvAdvanceOffer(prev);
  if (!amount || prev.owner.ousted) return { state: prev, ok: false, message: 'Zálohu na TV práva teď nejde získat.' };
  const state = structuredClone(prev);
  const monthly = tvMonthly(tierOf(state, state.owner.clubId));
  state.tvAdvance = { monthsLeft: 6, monthly };
  book(state, state.owner.clubId, 'uver', amount, 'Záloha na budoucí TV peníze');
  ownerAccounting(state).interest += monthly * 6 - amount;
  const message = `Banka vyplatila ${mil(amount)} za TV peníze příštích 6 měsíců (o 8 % méně, než by klub dostal).`;
  addNews(state, { kind: 'info', title: 'Prodej budoucích TV příjmů', text: message });
  return { state, ok: true, message };
}

// ---------- Dotace ----------

export interface GrantOption {
  kind: GrantApplication['kind'];
  label: string;
  amount: number;
  chance: number;
  blocked?: string;
}

const GRANT_LABEL: Record<GrantApplication['kind'], string> = {
  mladez: 'Dotace na mládež (město a Národní sportovní agentura)',
  stadion: 'Dotace na stavbu (kraj a město)',
  energie: 'Dotace na úspory energie',
};

function grantChance(state: GameState): number {
  const city = state.shareholders.find((s) => s.kind === 'mesto')?.satisfaction ?? 50;
  return clamp(0.3 + city / 250 + state.owner.media / 500 + state.owner.league / 500 - (state.grey.scandalUntil && state.grey.scandalUntil > state.date ? 0.25 : 0), 0.1, 0.85);
}

export function grantOptions(state: GameState): GrantOption[] {
  const club = own(state);
  const tier = tierOf(state, club.id);
  const used = new Set((state.grants ?? []).filter((g) => g.season === state.season).map((g) => g.kind));
  const chance = grantChance(state);
  const building = state.projects.reduce((a, p) => a + p.cost, 0);
  const options: GrantOption[] = [
    { kind: 'mladez', label: GRANT_LABEL.mladez, amount: Math.round((departmentsOf(club, tier).mladez * 0.3) / 50_000) * 50_000, chance },
    { kind: 'stadion', label: GRANT_LABEL.stadion, amount: Math.round((building * 0.25) / 100_000) * 100_000, chance: chance * 0.8, blocked: building ? undefined : 'Jen při rozestavěné stavbě.' },
    { kind: 'energie', label: GRANT_LABEL.energie, amount: Math.round((annualCosts(club, tier) * 0.015) / 50_000) * 50_000, chance: Math.min(0.9, chance + 0.1) },
  ];
  return options.map((o) => (used.has(o.kind) ? { ...o, blocked: 'O tuto dotaci už klub letos žádal.' } : o));
}

export function applyGrant(prev: GameState, kind: GrantApplication['kind']): ActionResult {
  const option = grantOptions(prev).find((o) => o.kind === kind);
  if (!option || option.blocked || option.amount <= 0) return { state: prev, ok: false, message: option?.blocked ?? 'O dotaci teď nejde žádat.' };
  const state = structuredClone(prev);
  state.grants = [...(state.grants ?? []), { id: `g${++state.nextId}`, kind, amount: option.amount, decided: addDays(state.date, 60), season: state.season }].slice(-12);
  const message = `Žádost odeslána: ${option.label}, ${mil(option.amount)}. Rozhodnutí do dvou měsíců (šance asi ${Math.round(option.chance * 100)} %).`;
  return { state, ok: true, message };
}

function decideGrants(state: GameState, rng: Rng): void {
  for (const g of state.grants ?? []) {
    if (g.result || g.decided > state.date) continue;
    const chance = g.kind === 'energie' ? Math.min(0.9, grantChance(state) + 0.1) : g.kind === 'stadion' ? grantChance(state) * 0.8 : grantChance(state);
    g.result = rng.chance(chance) ? 'schvaleno' : 'zamitnuto';
    if (g.result === 'schvaleno') book(state, state.owner.clubId, 'ostatni', g.amount, `Dotace: ${GRANT_LABEL[g.kind]}`);
    addNews(state, {
      kind: g.result === 'schvaleno' ? 'info' : 'varovani',
      title: g.result === 'schvaleno' ? `Dotace schválena: ${mil(g.amount)}` : 'Žádost o dotaci zamítnuta',
      text: GRANT_LABEL[g.kind],
    });
  }
}

// ---------- Splátky přestupů ----------

/** Rozložení odstupného: polovina hned, čtvrtina za 6 a čtvrtina za 12 měsíců. */
export function scheduleInstalments(state: GameState, from: string, to: string, fee: number, note: string): number {
  const now = Math.round(fee * 0.5);
  const later = fee - now;
  const parts = [Math.round(later / 2), later - Math.round(later / 2)];
  state.payments = [
    ...(state.payments ?? []),
    { id: `pay${++state.nextId}`, due: addDays(state.date, 182), from, to, amount: parts[0], note: `${note} (2. splátka)` },
    { id: `pay${++state.nextId}`, due: addDays(state.date, 365), from, to, amount: parts[1], note: `${note} (3. splátka)` },
  ];
  return now;
}

function settlePayments(state: GameState): void {
  const due = (state.payments ?? []).filter((p) => p.due <= state.date);
  if (!due.length) return;
  for (const p of due) {
    if (state.clubs[p.from]) book(state, p.from, 'prestupy', -p.amount, p.note);
    if (state.clubs[p.to]) book(state, p.to, 'prestupy', p.amount, p.note);
  }
  state.payments = (state.payments ?? []).filter((p) => p.due > state.date);
}

// ---------- Licenční řízení ----------

export function licenceProblems(state: GameState): string[] {
  const out: string[] = [];
  const sheet = balanceSheet(state);
  // Půjčka majitele je podřízená, svaz ji počítá jako vlastní zdroje.
  if (sheet.equity + sheet.ownerLoan < 0) out.push(`záporný vlastní kapitál (${mil(sheet.equity + sheet.ownerLoan)})`);
  if (own(state).finance.balance < -activeOverdraft(state)) out.push('neuhrazené závazky (účet v minusu nad kontokorent)');
  return out;
}

function licenceCheck(state: GameState): void {
  const md = state.date.slice(5);
  const problems = licenceProblems(state);
  if (md === '03-31') {
    state.licence = {
      season: state.season,
      status: problems.length ? 'podminka' : 'ok',
      checked: state.date,
      note: problems.length ? `Licence s podmínkou: ${problems.join(', ')}. Do 31. 5. je třeba to napravit.` : 'Licence pro příští sezónu udělena.',
    };
    addNews(state, { kind: problems.length ? 'varovani' : 'info', title: 'Licenční řízení svazu', text: state.licence.note });
  }
  if (md === '05-31' && state.licence?.season === state.season && state.licence.status === 'podminka') {
    if (problems.length) {
      const club = own(state);
      const fine = Math.round((annualCosts(club, tierOf(state, club.id)) * 0.02) / 10_000) * 10_000;
      book(state, club.id, 'ostatni', -fine, 'Licenční sankce');
      state.licence = { ...state.licence, status: 'sankce', checked: state.date, note: `Podmínky licence nesplněny: pokuta ${mil(fine)} a odečet 5 bodů v příští sezóně.` };
      addNews(state, { kind: 'varovani', title: 'Licenční sankce', text: state.licence.note });
    } else {
      state.licence = { ...state.licence, status: 'ok', checked: state.date, note: 'Podmínky licence splněny.' };
      addNews(state, { kind: 'info', title: 'Licence udělena', text: state.licence.note });
    }
  }
}

/** Začátek sezóny: odečet bodů za loňskou licenční sankci. */
export function applyLicenceSanction(state: GameState): void {
  if (state.licence?.status !== 'sankce' || state.licence.season !== state.season - 1) return;
  const comp = competitionOf(state, state.owner.clubId);
  if (!comp) return;
  comp.penalties = { ...(comp.penalties ?? {}), [state.owner.clubId]: (comp.penalties?.[state.owner.clubId] ?? 0) + 5 };
  addNews(state, { kind: 'varovani', title: 'Odečet 5 bodů za licenci', text: 'Klub začíná sezónu s minusem kvůli nesplněným licenčním podmínkám.' });
}

// ---------- Denní a měsíční zpracování ----------

export function dailyFinancing(state: GameState, rng: Rng): void {
  settlePayments(state);
  decideGrants(state, rng);
  const md = state.date.slice(5);
  if (md === '03-31' || md === '05-31') licenceCheck(state);
}

/** Měsíčně: úroky z kontokorentu a půjčky majitele, splátka zálohy na TV. */
export function monthlyFinancing(state: GameState): void {
  const club = own(state);
  const acc = ownerAccounting(state);
  if (club.policy.overdraft) {
    const fee = Math.round((overdraftLimit(state) * 0.005) / 12);
    const interest = club.finance.balance < 0 ? Math.round((-club.finance.balance * OVERDRAFT_RATE) / 12) : 0;
    book(state, club.id, 'uver', -(fee + interest), 'Kontokorent: úrok a poplatek');
    acc.interest += fee + interest;
  }
  if (state.ownerLoan) {
    const interest = Math.round((state.ownerLoan.remaining * state.ownerLoan.rate) / 12);
    if (interest > 0) {
      book(state, club.id, 'uver', -interest, 'Úrok z půjčky majitele');
      state.owner.wallet += interest;
      acc.interest += interest;
    }
  }
  if (state.tvAdvance) {
    book(state, club.id, 'uver', -state.tvAdvance.monthly, 'Splátka zálohy na TV peníze');
    state.tvAdvance.monthsLeft -= 1;
    if (state.tvAdvance.monthsLeft <= 0) state.tvAdvance = undefined;
  }
}

// ---------- Krize ----------

/** Měsíce v minusu nad kontokorent: 2 = krizový režim, 4 = insolvence. */
export const CRISIS_MONTHS = 2;
export const INSOLVENCY_MONTHS = 4;

export function enterCrisis(state: GameState, rng: Rng): void {
  if (state.crisis || state.gameOver) return;
  state.crisis = { since: state.date };
  createEvent(state, rng, 'krize', addDays(state.date, 21));
}

export function leaveCrisisIfSolved(state: GameState): void {
  if (state.crisis && own(state).finance.balance >= -activeOverdraft(state)) {
    state.crisis = undefined;
    own(state).finance.monthsNegative = 0;
    addNews(state, { kind: 'info', title: 'Klub překonal krizi', text: 'Účet je zpět v pořádku.' });
  }
}
