import { addDays } from './calendar';
import {
  annualCosts,
  baseAttendance,
  bonusPerPoint,
  book,
  defaultTicketPrice,
  defaultTransferBudget,
  DEPARTMENT_KEYS,
  departmentEffect,
  departmentReference,
  departmentsOf,
  operatingMonthly,
  prizeMoney,
  tvMonthly,
  wageBudgetMonthly,
} from './finance';
import { satisfy } from './ownership';
import { squadOf } from './players';
import { financeFactor, goalTarget, staffAbility, STAFF_KEY, expectedPosition, type ActionResult } from './staff';
import { matchdayExtras } from './stadium';
import { goalBonusPoints, pointsBonusFactor, suggestedSplit } from './wages';
import { overdraftLimit } from './financing';
import { sponsorForecast, sponsorMonthly } from './sponsors';

const sponsorMonthlyTotal = (state: GameState) => { const m = sponsorMonthly(state); return m.contracts + m.small; };
import type { BudgetLine, BudgetPlan, Club, FinanceCategory, GameState, SeasonBudget, StaffRole } from './types';
import { addNews, clamp, competitionOf, tierOf } from './world';

/**
 * Rozpočet sezóny: na začátku sezóny ho připraví finanční ředitel (nebo účetní), majitel ho upraví
 * a schválí. Hra spočítá plánovaný výsledek a pohyb hotovosti, hlídá licenci a soulad s cílem sezóny.
 * Během sezóny se porovnává plán se skutečností.
 */

export const BUDGET_DEADLINE = '07-15';

function ownClub(state: GameState): Club {
  return state.clubs[state.owner.clubId];
}

/** Běžná cena permanentky: 15 zápasů se slevou asi 30 %. */
export function defaultSeasonTicketPrice(tier: number): number {
  return Math.round((defaultTicketPrice(tier) * 15 * 0.7) / 50) * 50;
}

export function seasonTicketPrice(state: GameState): number {
  const club = ownClub(state);
  return club.policy.seasonTicketPrice ?? defaultSeasonTicketPrice(tierOf(state, club.id));
}

/** Kolik permanentek by se při dané ceně prodalo. */
export function seasonTicketDemand(state: GameState, price = seasonTicketPrice(state)): number {
  const club = ownClub(state);
  const tier = tierOf(state, club.id);
  const share = tier === 1 ? 0.4 : tier === 2 ? 0.3 : 0.2;
  const mood = 0.7 + 0.6 * (club.fanMood / 100);
  const priceFactor = Math.pow(defaultSeasonTicketPrice(tier) / Math.max(price, 1), 1.3);
  const raw = baseAttendance(club.reputation, tier) * share * mood * priceFactor;
  return Math.max(0, Math.min(Math.round(club.stadium.capacity * 0.7), Math.round(raw)));
}

/** Držitelé permanentek v aktuální sezóně. */
export function seasonTicketHolders(state: GameState): number {
  return state.budget?.season === state.season ? state.budget.seasonTickets ?? 0 : 0;
}

function homeGames(state: GameState): number {
  const comp = competitionOf(state, state.owner.clubId);
  if (!comp) return 0;
  const own = state.owner.clubId;
  const league = comp.fixtures.filter((f) => f.homeId === own).length;
  return league + (comp.format === 'nadstavba' ? 2.5 : 0);
}

function expectedAttendance(state: GameState): number {
  const club = ownClub(state);
  const tier = tierOf(state, club.id);
  const price = Math.pow(defaultTicketPrice(tier) / Math.max(club.policy.ticketPrice, 1), 0.8);
  const mood = 0.85 + 0.3 * (club.fanMood / 100);
  return Math.min(club.stadium.capacity, baseAttendance(club.reputation, tier) * price * mood);
}

function staffWages(state: GameState): number {
  const club = ownClub(state);
  return (Object.keys(STAFF_KEY) as StaffRole[]).reduce((a, r) => a + (state.staff[club.staff[STAFF_KEY[r]] ?? '']?.wage ?? 0), 0);
}

/** Pořadí, kterému odpovídá mzdový strop klubu mezi soupeři v soutěži. */
export function wageRank(state: GameState): number {
  const comp = competitionOf(state, state.owner.clubId);
  if (!comp) return 1;
  const own = wageBudgetMonthly(ownClub(state));
  const bills = comp.clubIds
    .filter((id) => id !== state.owner.clubId)
    .map((id) => squadOf(state, id).reduce((a, p) => a + p.wage, 0));
  return 1 + bills.filter((b) => b > own).length;
}

/**
 * Mzdový rozpočet sezóny: počítá se s celým mzdovým stropem (to je rozpočet na platy),
 * nebo se skutečnými platy, pokud strop převyšují. K tomu prémie podle očekávaných bodů a cíle.
 */
export function wagePlan(state: GameState): { cap: number; contracts: number; wages: number; bonuses: number } {
  const club = ownClub(state);
  const comp = competitionOf(state, club.id);
  const position = comp ? expectedPosition(state, club.id) : 8;
  const size = comp?.clubIds.length ?? 16;
  const points = Math.round(45 * (1 + (size / 2 - position) / size));
  const cap = wageBudgetMonthly(club) * 12;
  const contracts = squadOf(state, club.id).reduce((a, p) => a + p.wage, 0) * 12;
  const goal = comp && position <= goalTarget(state.owner.seasonGoal, comp) ? goalBonusPoints(state) : 0;
  const bonuses = bonusPerPoint(club) * (points * pointsBonusFactor(state, club.id) + goal);
  return { cap, contracts, wages: Math.max(cap, contracts), bonuses: Math.round(bonuses) };
}

/** Plán sezóny podle aktuálního nastavení. */
export function forecastSeason(state: GameState): BudgetPlan {
  const club = ownClub(state);
  const tier = tierOf(state, club.id);
  const comp = competitionOf(state, club.id);
  const games = homeGames(state);
  const sold = state.budget?.season === state.season && state.budget.seasonTickets !== undefined;
  const holders = sold ? state.budget!.seasonTickets! : seasonTicketDemand(state);
  const att = Math.max(expectedAttendance(state), holders * 0.9);
  const ticketsNow = sold ? 0 : holders * seasonTicketPrice(state);
  const seasonTicketMoney = sold ? state.budget!.seasonTicketRevenue ?? 0 : ticketsNow;
  const position = comp ? expectedPosition(state, club.id) : 8;
  const size = comp?.clubIds.length ?? 16;
  const europe = state.europe?.season === state.season ? state.europe.entries.find((e) => e.clubId === club.id) : undefined;
  const loanPayments =
    state.loans.reduce((a, l) => a + l.payment * Math.min(12, l.monthsLeft), 0) +
    (state.tvAdvance ? state.tvAdvance.monthsLeft * state.tvAdvance.monthly : 0) +
    (state.ownerLoan ? state.ownerLoan.remaining * state.ownerLoan.rate : 0) +
    (club.policy.overdraft ? overdraftLimit(state) * 0.005 : 0);
  const yearEnd = `${state.season + 1}-06-30`;
  const scheduled = (state.payments ?? [])
    .filter((p) => p.due <= yearEnd)
    .reduce((a, p) => a + (p.to === club.id ? p.amount : p.from === club.id ? -p.amount : 0), 0);
  const wp = wagePlan(state);
  const depts = departmentsOf(club, tier);

  const lines: BudgetLine[] = [
    { key: 'vstupne', label: 'Vstupné a permanentky', amount: seasonTicketMoney + games * Math.max(0, att - holders) * club.policy.ticketPrice, categories: ['vstupne'], upfront: seasonTicketMoney },
    { key: 'stadion', label: 'Catering, fanshop a VIP', amount: games * matchdayExtras(club, att, tier), categories: ['stadion'] },
    { key: 'tv', label: 'TV práva a odměna za umístění', amount: tvMonthly(tier) * 12 + prizeMoney(tier, position, size), categories: ['tv'], atEnd: prizeMoney(tier, position, size) },
    { key: 'komercni', label: 'Sponzoři a reklama', amount: sponsorForecast(state), categories: ['komercni'] },
    { key: 'evropa', label: 'Evropské poháry', amount: europe?.revenue ?? 0, categories: ['evropa'] },
    { key: 'platy', label: 'Platy hráčů (mzdový strop) a prémie', amount: -(wp.wages + wp.bonuses), categories: ['platy'] },
    { key: 'vedeni', label: 'Trenér a ředitelé', amount: -staffWages(state) * 12, categories: ['vedeni'] },
    { key: 'oddeleni', label: 'Oddělení (skauting, mládež, medicína, marketing)', amount: -DEPARTMENT_KEYS.reduce((a, k) => a + depts[k], 0), categories: ['oddeleni'] },
    { key: 'provoz', label: 'Provoz klubu a stadionu', amount: -operatingMonthly(club, tier) * financeFactor(state) * 12, categories: ['provoz'] },
    { key: 'prestupy', label: 'Přestupy (rozpočet na odstupné a splátky)', amount: -club.policy.transferBudget + scheduled, categories: ['prestupy'], upfront: -club.policy.transferBudget * 0.7 },
    { key: 'uver', label: 'Úvěry, půjčky a zálohy (splátky a úroky)', amount: -loanPayments, categories: ['uver'] },
  ].map((l) => ({ ...l, amount: Math.round(l.amount) }) as BudgetLine);
  // Prodané permanentky už jsou na účtu: do pohybu hotovosti se nepočítají znovu.
  const alreadyIn = sold ? seasonTicketMoney : 0;

  const result = lines.reduce((a, l) => a + l.amount, 0);
  // Hotovost po měsících: permanentky v červenci, přestupy v létě, odměna za umístění na konci.
  const prize = prizeMoney(tier, position, size);
  const regular = result - alreadyIn - ticketsNow + club.policy.transferBudget - prize - (europe?.revenue ?? 0);
  let balance = club.finance.balance;
  const months: BudgetPlan['months'] = [];
  for (let i = 0; i < 12; i++) {
    const date = addDays(`${state.season}-07-01`, Math.round(i * 30.4));
    balance += regular / 12;
    if (i === 0) balance += ticketsNow - club.policy.transferBudget * 0.7;
    if (i === 1) balance -= club.policy.transferBudget * 0.1;
    if (i === 6) balance -= club.policy.transferBudget * 0.2;
    if (europe && i >= 2 && i <= 5) balance += europe.revenue / 4;
    if (i === 11) balance += prize;
    months.push({ date, balance: Math.round(balance) });
  }
  return { lines, result, cashMin: Math.min(club.finance.balance, ...months.map((m) => m.balance)), cashEnd: Math.round(balance), months };
}

export interface BudgetWarning {
  tone: 'warn' | 'bad';
  text: string;
}

export function budgetWarnings(state: GameState, plan = forecastSeason(state)): BudgetWarning[] {
  const out: BudgetWarning[] = [];
  const club = ownClub(state);
  const tier = tierOf(state, club.id);
  const comp = competitionOf(state, club.id);
  const od = club.policy.overdraft ? overdraftLimit(state) : 0;
  const tolerance = annualCosts(club, tier) * 0.01;
  if (plan.cashMin < -od - tolerance) {
    out.push({ tone: 'bad', text: `Licence: v průběhu sezóny by klubu chybělo až ${Math.round(-(plan.cashMin + od) / 100_000) / 10} mil. Kč${od ? ' i po vyčerpání kontokorentu' : ''}. Svaz chce doložit financování (vklad nebo půjčka majitele, úvěr, nebo prodeje).` });
  } else if (plan.cashMin < -tolerance) {
    out.push({ tone: 'warn', text: 'Během sezóny klub sáhne do kontokorentu. Počítejte s úroky 12 %.' });
  }
  if (comp) {
    const target = goalTarget(state.owner.seasonGoal, comp);
    const rank = wageRank(state);
    if (rank > target + 3) out.push({ tone: 'warn', text: `Mzdovým stropem patříte až na ${rank}. místo ligy, cíl sezóny je ale do ${target}. místa. Trenér i ředitel budou rozpočet považovat za nedostatečný.` });
  }
  const costs = annualCosts(club, tier);
  if (plan.result < -costs * 0.25) out.push({ tone: 'warn', text: 'Plánovaná ztráta je přes čtvrtinu běžných nákladů. Bez prodejů hráčů nebo vkladu to klub dlouho nevydrží.' });
  if (club.policy.ticketPrice > defaultTicketPrice(tier) * 1.3) out.push({ tone: 'warn', text: 'Vstupenky jsou výrazně dražší než obvykle. Fanoušci budou nespokojení a přijde jich méně.' });
  const ref = departmentReference(club, tier);
  const d = departmentsOf(club, tier);
  if (d.medicina < ref.medicina * 0.5) out.push({ tone: 'warn', text: 'Škrty v medicíně zvýší počet a délku zranění.' });
  return out;
}

// ---------- Hlasování akcionářů o rozpočtu ----------

export function budgetVote(state: GameState, plan = forecastSeason(state)) {
  const club = ownClub(state);
  const tier = tierOf(state, club.id);
  const costs = annualCosts(club, tier);
  const youth = departmentEffect(club, tier, 'mladez');
  const marketing = departmentEffect(club, tier, 'marketing');
  const cheap = club.policy.ticketPrice <= defaultTicketPrice(tier) * 1.1;
  const votes = [
    { name: 'Vy', share: state.owner.share, yes: true, why: '' },
    ...state.shareholders.map((s) => {
      let bonus = 0;
      let why = '';
      if (s.kind === 'investor') {
        bonus = plan.result >= 0 ? 10 : plan.result < -costs * 0.15 ? -15 : -3;
        why = plan.result >= 0 ? 'rozpočet je v zisku' : 'nelíbí se mu ztráta';
      } else if (s.kind === 'patriot') {
        bonus = youth * 20;
        why = youth >= 0 ? 'mládež má dost peněz' : 'chce víc peněz na mládež';
      } else if (s.kind === 'mesto') {
        bonus = marketing * 15 + (cheap ? 5 : -10);
        why = cheap ? 'vstupné je dostupné' : 'vadí mu drahé vstupné';
      } else {
        bonus = club.policy.transferBudget >= defaultTransferBudget(club) ? 8 : -5;
        why = bonus > 0 ? 'líbí se mu investice do kádru' : 'chce víc peněz na přestupy';
      }
      return { name: s.name, share: s.share, yes: s.satisfaction + bonus >= 50, why };
    }),
  ];
  const yes = votes.filter((v) => v.yes).reduce((a, v) => a + v.share, 0);
  return { needed: state.shareholders.length > 0, threshold: 0.5, yes, passes: yes > 0.5 + 1e-9, votes, label: 'nadpoloviční většina' };
}

// ---------- Schválení ----------

function sellSeasonTickets(state: GameState): number {
  const count = seasonTicketDemand(state);
  const price = seasonTicketPrice(state);
  state.budget = { ...(state.budget ?? { season: state.season }), season: state.season, seasonTickets: count, seasonTicketRevenue: count * price };
  if (count > 0 && price > 0) book(state, state.owner.clubId, 'vstupne', count * price, `Permanentky: ${count.toLocaleString('cs-CZ')} ks`);
  return count;
}

export function budgetApproved(state: GameState): boolean {
  return state.budget?.season === state.season && !!state.budget.approved;
}

export function approveBudget(prev: GameState): ActionResult {
  if (prev.owner.ousted) return { state: prev, ok: false, message: 'Rozpočet teď schvaluje představenstvo.' };
  const vote = budgetVote(prev);
  if (vote.needed && !vote.passes) {
    return { state: prev, ok: false, message: `Akcionáři rozpočet neschválili (pro ${Math.round(vote.yes * 100)} %). Upravte ho podle jejich výhrad.` };
  }
  const state = structuredClone(prev);
  const first = !budgetApproved(state);
  let tickets = '';
  if (state.budget?.season !== state.season || state.budget.seasonTickets === undefined) {
    const n = sellSeasonTickets(state);
    tickets = ` Prodáno ${n.toLocaleString('cs-CZ')} permanentek.`;
  }
  const plan = forecastSeason(state);
  state.budget = { ...state.budget!, approved: state.date, revised: !first, plan };
  if (first) reactToBudget(state, plan);
  const message = `${first ? 'Rozpočet schválen' : 'Revize rozpočtu schválena'}: plánovaný výsledek ${(plan.result / 1e6).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč.${tickets}`;
  addNews(state, { kind: 'info', title: message });
  return { state, ok: true, message };
}

/** Reakce vedení na schválený rozpočet. */
function reactToBudget(state: GameState, plan: BudgetPlan): void {
  const comp = competitionOf(state, state.owner.clubId);
  if (!comp) return;
  const gap = wageRank(state) - goalTarget(state.owner.seasonGoal, comp);
  if (gap > 3) {
    state.owner.trust.trener = clamp(state.owner.trust.trener - 5, 0, 100);
    state.owner.trust.reditel = clamp(state.owner.trust.reditel - 5, 0, 100);
    addNews(state, { kind: 'varovani', title: 'Trenér a ředitel: rozpočet neodpovídá cíli', text: 'S takovým mzdovým stropem cíl sezóny podle nich splnit nejde.' });
  } else if (gap <= -3) {
    state.owner.trust.trener = clamp(state.owner.trust.trener + 3, 0, 100);
    state.owner.trust.reditel = clamp(state.owner.trust.reditel + 3, 0, 100);
  }
  if (plan.result >= 0) satisfy(state, 4, ['investor']);
}

/** Začátek sezóny: finanční ředitel (nebo účetní) připraví návrh. */
export function prepareBudget(state: GameState): void {
  const club = ownClub(state);
  const tier = tierOf(state, club.id);
  state.budget = { season: state.season };
  club.policy.departments ??= departmentReference(club, tier);
  club.policy.wageSplit ??= suggestedSplit(state);
  club.policy.seasonTicketPrice ??= defaultSeasonTicketPrice(tier);
  const cfo = staffAbility(state, 'financni');
  // Návrh rozpočtu na přestupy: tolik, aby klubu během sezóny nedošly peníze.
  // Finanční ředitel navíc drží rezervu 5 % nákladů, účetní jen nulu.
  club.policy.transferBudget = defaultTransferBudget(club);
  const plan = forecastSeason(state);
  const reserve = annualCosts(club, tier) * (cfo !== undefined ? 0.05 : 0.01);
  if (plan.cashMin < reserve) {
    club.policy.transferBudget = Math.max(0, Math.round((club.policy.transferBudget - (reserve - plan.cashMin)) / 100_000) * 100_000);
  }
  // Velká plánovaná ztráta: návrh sníží mzdový strop pod současné platy, aby ředitel neprodlužoval drahé smlouvy.
  const after = forecastSeason(state);
  if (after.result + club.policy.transferBudget < -annualCosts(club, tier) * 0.15) {
    const bill = squadOf(state, club.id).reduce((a, p) => a + p.wage, 0);
    const base = wageBudgetMonthly({ ...club, policy: { ...club.policy, wageMultiplier: 1 } });
    club.policy.wageMultiplier = Math.max(0.5, Math.min(club.policy.wageMultiplier, (bill * 1.05) / Math.max(1, base)));
  }
  state.budget.draft = policySnapshot(club);
  addNews(state, {
    kind: 'info',
    title: `Rozpočtová porada: schvalte rozpočet do ${BUDGET_DEADLINE.split('-').reverse().map(Number).join('. ')}.`,
    text: cfo !== undefined ? 'Finanční ředitel připravil návrh. Najdete ho ve Financích.' : 'Návrh připravila účetní podle loňska. Najdete ho ve Financích.',
  });
}

/** Termín: když majitel neschválí, platí návrh (při nesouhlasu akcionářů úsporná varianta). */
export function budgetDeadline(state: GameState): void {
  if (budgetApproved(state)) return;
  const club = ownClub(state);
  const tier = tierOf(state, club.id);
  const vote = budgetVote(state);
  let text = 'Majitel rozpočet neschválil, platí návrh vedení.';
  if (state.owner.ousted || (vote.needed && !vote.passes)) {
    club.policy.departments = departmentReference(club, tier);
    club.policy.transferBudget = Math.round(defaultTransferBudget(club) * 0.5);
    text = state.owner.ousted ? 'Představenstvo schválilo úsporný rozpočet.' : 'Akcionáři prosadili úspornou variantu rozpočtu.';
  }
  if (state.budget?.season !== state.season || state.budget.seasonTickets === undefined) sellSeasonTickets(state);
  const plan = forecastSeason(state);
  state.budget = { ...state.budget!, approved: state.date, plan };
  addNews(state, { kind: 'varovani', title: 'Rozpočet sezóny schválen automaticky', text });
}

/** Přestup do jiné soutěže: ceny vstupného a oddělení se přepočítají na úroveň nové soutěže. */
export function adjustForNewTier(state: GameState, oldTier: number, newTier: number): void {
  if (oldTier === newTier) return;
  const club = ownClub(state);
  const k = defaultTicketPrice(newTier) / defaultTicketPrice(oldTier);
  club.policy.ticketPrice = Math.round((club.policy.ticketPrice * k) / 10) * 10;
  if (club.policy.seasonTicketPrice) club.policy.seasonTicketPrice = Math.round((club.policy.seasonTicketPrice * k) / 50) * 50;
  if (club.policy.departments) {
    const before = departmentReference(club, oldTier);
    const after = departmentReference(club, newTier);
    for (const key of DEPARTMENT_KEYS) club.policy.departments[key] = Math.round((club.policy.departments[key] * (after[key] / Math.max(1, before[key]))) / 50_000) * 50_000;
  }
  let wages = '';
  if (newTier > oldTier) {
    // Smlouvy mají sestupovou klauzuli: platy hráčů klesnou o 30 %, mzdový strop o pětinu.
    for (const p of squadOf(state, club.id)) p.wage = Math.max(5_000, Math.round((p.wage * 0.7) / 1000) * 1000);
    club.policy.wageMultiplier = Math.max(0.5, club.policy.wageMultiplier * 0.8);
    wages = ' Podle sestupové klauzule ve smlouvách klesly platy hráčů o 30 % a mzdový strop o pětinu.';
  }
  addNews(state, {
    kind: 'info',
    title: 'Ceny a rozpočty upraveny pro novou soutěž',
    text: `Vstupné teď stojí ${club.policy.ticketPrice} Kč. Rozpočty oddělení se přepočítaly na úroveň soutěže.${wages}`,
  });
}

/** Plán proti skutečnosti po řádcích. */
export function budgetComparison(state: GameState): { line: BudgetLine; actual: number }[] {
  const plan = state.budget?.season === state.season ? state.budget.plan : undefined;
  if (!plan) return [];
  const totals = ownClub(state).finance.season;
  return plan.lines.map((line) => ({ line, actual: line.categories.reduce((a, c) => a + (totals[c] ?? 0), 0) }));
}

/** Pro rozhraní: kolik dní zbývá na schválení. */
export function budgetDue(state: GameState): string {
  return `${state.season}-${BUDGET_DEADLINE}`;
}

// ---------- Plán k dnešku, návrh, uzávěrka, kalendář ----------

function policySnapshot(club: Club): NonNullable<SeasonBudget['draft']> {
  const p = club.policy;
  return {
    ticketPrice: p.ticketPrice,
    seasonTicketPrice: p.seasonTicketPrice,
    wageMultiplier: p.wageMultiplier,
    transferBudget: p.transferBudget,
    departments: p.departments ? { ...p.departments } : undefined,
    wageSplit: p.wageSplit ? { ...p.wageSplit } : undefined,
    bonusScheme: p.bonusScheme,
  };
}

/** Vrátí nastavení rozpočtu na návrh, který připravilo vedení. */
export function resetBudgetToDraft(prev: GameState): ActionResult {
  const draft = prev.budget?.season === prev.season ? prev.budget.draft : undefined;
  if (!draft) return { state: prev, ok: false, message: 'Návrh vedení pro tuto sezónu není k dispozici.' };
  const state = structuredClone(prev);
  const club = ownClub(state);
  const sold = state.budget?.seasonTickets !== undefined;
  club.policy = { ...club.policy, ...draft, seasonTicketPrice: sold ? club.policy.seasonTicketPrice : draft.seasonTicketPrice };
  return { state, ok: true, message: 'Nastavení vráceno na návrh vedení.' };
}

/** Podíl uplynulé sezóny (1. 7. až 30. 6.). */
export function seasonProgress(state: GameState): number {
  const start = new Date(`${state.season}-07-01T00:00:00Z`).getTime();
  const now = new Date(`${state.date}T00:00:00Z`).getTime();
  return clamp((now - start) / (365 * 86_400_000), 0, 1);
}

/** Kolik z řádku plánu mělo přijít nebo odejít k dnešnímu dni. */
export function planToDate(state: GameState, line: BudgetLine): number {
  const f = seasonProgress(state);
  const upfront = line.upfront ?? 0;
  const atEnd = line.atEnd ?? 0;
  return Math.round(upfront + (line.amount - upfront - atEnd) * f + (f >= 0.999 ? atEnd : 0));
}

/** Skutečnost minulé sezóny pro řádek plánu. */
export function lastSeasonActual(state: GameState, line: BudgetLine): number | undefined {
  const last = ownClub(state).finance.lastSeason;
  if (!last) return undefined;
  return line.categories.reduce((a, c) => a + (last[c] ?? 0), 0);
}

/** Odhad návštěvy a příjmu ze zápasu při dané ceně vstupenky (pro okamžitý náhled). */
export function ticketPreview(state: GameState, price: number): { attendance: number; fill: number; perMatch: number } {
  const club = ownClub(state);
  const tier = tierOf(state, club.id);
  const priceFactor = Math.pow(defaultTicketPrice(tier) / Math.max(price, 1), 0.8);
  const mood = 0.85 + 0.3 * (club.fanMood / 100);
  const holders = seasonTicketHolders(state) || seasonTicketDemand(state);
  const attendance = Math.min(club.stadium.capacity, Math.max(holders * 0.9, baseAttendance(club.reputation, tier) * priceFactor * mood));
  return { attendance: Math.round(attendance), fill: attendance / club.stadium.capacity, perMatch: Math.round(Math.max(0, attendance - holders) * price) };
}

/** Měsíční uzávěrka: zpráva o příjmech, výdajích a odchylce od plánu za uplynulý měsíc. */
export function monthlyReport(state: GameState): void {
  const club = ownClub(state);
  const totals = club.finance.season;
  const prev = state.budget?.season === state.season ? state.budget.monthStart : undefined;
  if (state.budget?.season === state.season) state.budget.monthStart = { ...totals };
  if (!prev || state.date.slice(5) === '07-01') return;
  const operating: FinanceCategory[] = ['vstupne', 'stadion', 'tv', 'komercni', 'evropa', 'pohar', 'ostatni', 'platy', 'vedeni', 'oddeleni', 'provoz'];
  const diff = (c: FinanceCategory) => (totals[c] ?? 0) - (prev[c] ?? 0);
  const income = operating.filter((c) => diff(c) > 0).reduce((a, c) => a + diff(c), 0);
  const expense = operating.filter((c) => diff(c) < 0).reduce((a, c) => a + diff(c), 0);
  const transfers = diff('prestupy');
  const plan = state.budget?.plan;
  const toDate = plan ? plan.lines.filter((l) => l.categories.every((c) => operating.includes(c))).reduce((a, l) => a + planToDate(state, l), 0) : undefined;
  const actualToDate = operating.reduce((a, c) => a + (totals[c] ?? 0), 0);
  const month = new Date(`${addDays(state.date, -1)}T00:00:00Z`).toLocaleString('cs-CZ', { month: 'long', timeZone: 'UTC' });
  const m = (v: number) => `${(v / 1e6).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč`;
  addNews(state, {
    kind: 'info',
    title: `Měsíční uzávěrka (${month}): provozní výsledek ${m(income + expense)}`,
    text: `Příjmy ${m(income)}, výdaje ${m(expense)}${transfers ? `, přestupy ${m(transfers)}` : ''}. ${toDate !== undefined ? `Od začátku sezóny ${m(actualToDate)}, plán k dnešku ${m(toDate)} (${actualToDate >= toDate ? 'lepší' : 'horší'} o ${m(Math.abs(actualToDate - toDate))}).` : ''}`,
  });
}

export interface CalendarItem {
  date: string;
  label: string;
  amount?: number;
}

/** Kalendář peněz na příštích 12 měsíců: kdy co přijde a odejde. */
export function moneyCalendar(state: GameState): { monthly: { label: string; amount: number }[]; items: CalendarItem[] } {
  const club = ownClub(state);
  const tier = tierOf(state, club.id);
  const end = addDays(state.date, 365);
  const items: CalendarItem[] = [];
  const add = (date: string, label: string, amount?: number) => {
    if (date > state.date && date <= end) items.push({ date, label, amount });
  };
  const y = state.season;
  if (!budgetApproved(state)) add(`${y}-${BUDGET_DEADLINE}`, `Termín schválení rozpočtu, prodej permanentek (asi ${Math.round(seasonTicketDemand(state) * seasonTicketPrice(state) / 1e5) / 10} mil. Kč)`, seasonTicketDemand(state) * seasonTicketPrice(state));
  for (const p of state.payments ?? []) {
    if (p.to === club.id) add(p.due, p.note, p.amount);
    if (p.from === club.id) add(p.due, p.note, -p.amount);
  }
  const eu = state.europe?.season === state.season ? state.europe.entries.find((e) => e.clubId === club.id) : undefined;
  if (eu && !state.europe!.resolved) add(`${y}-08-28`, 'Evropa: rozhodnutí předkol (peníze za účast)', undefined);
  if (eu?.result && eu.result !== 'predkola') for (const m of ['10', '11', '12']) add(`${y}-${m}-01`, 'Evropa: splátka za ligovou fázi', undefined);
  add(`${y}-08-31`, 'Konec letního přestupního okna');
  add(`${y + 1}-02-14`, 'Konec zimního přestupního okna');
  add(`${y + 1}-03-31`, 'Licenční řízení svazu');
  add(`${y + 1}-06-20`, 'Valná hromada (dividenda)');
  const comp = competitionOf(state, club.id);
  const position = comp ? expectedPosition(state, club.id) : 8;
  add(`${y + 1}-06-30`, `Odměna za umístění (odhad pro ${position}. místo)`, prizeMoney(tier, position, comp?.clubIds.length ?? 16));
  const ending = (club.sponsors ?? []).filter((c) => c.untilSeason === y);
  if (ending.length) add(`${y + 1}-06-30`, `Končí sponzorské smlouvy: ${ending.map((c) => c.name).join(', ')}`, undefined);
  const expiring = squadOf(state, club.id).filter((p) => p.contractUntil <= y + 1).length;
  if (expiring) add(`${y + 1}-06-30`, `Končí smlouvy ${expiring} hráčů`, undefined);
  if (state.tvAdvance) add(addDays(state.date.slice(0, 8) + '01', 30 * state.tvAdvance.monthsLeft), 'Poslední splátka zálohy na TV peníze', undefined);
  items.sort((a, b) => (a.date < b.date ? -1 : 1));
  const wages = squadOf(state, club.id).reduce((a, p) => a + p.wage, 0);
  const staff = staffWages(state);
  const loans = state.loans.reduce((a, l) => a + l.payment, 0);
  const sp = sponsorMonthlyTotal(state);
  const monthly = [
    { label: 'TV práva', amount: tvMonthly(tier) },
    { label: 'Sponzoři', amount: sp },
    { label: 'Platy hráčů', amount: -wages },
    { label: 'Trenér a ředitelé', amount: -staff },
    { label: 'Oddělení', amount: -DEPARTMENT_KEYS.reduce((a, k) => a + departmentsOf(club, tier)[k], 0) / 12 },
    { label: 'Provoz', amount: -operatingMonthly(club, tier) * financeFactor(state) },
    ...(loans ? [{ label: 'Splátky úvěrů', amount: -loans }] : []),
  ].map((x) => ({ ...x, amount: Math.round(x.amount) }));
  return { monthly, items };
}
