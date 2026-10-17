import { addDays } from './calendar';
import {
  annualCosts,
  baseAttendance,
  sponsorsAnnual,
  bonusPerPoint,
  book,
  defaultTicketPrice,
  defaultTransferBudget,
  balanceSheet,
  DEPARTMENT_KEYS,
  departmentsMonthly,
  TAX_RATE,
  departmentEffect,
  departmentReference,
  departmentsOf,
  operatingMonthly,
  prizeMoney,
  tvMonthly,
  wageBudgetMonthly,
  newStadiumFactor,
} from './finance';
import { effectiveCapacity } from './facilities';
import { networksMonthly } from './foreign';
import { bigPaymentSchedule, commercialIncomeMonthly, programsMonthly, womenSponsorMonthly } from './investments';
import { satisfy } from './ownership';
import { squadOf } from './players';
import { financeFactor, goalTarget, staffAbility, STAFF_KEY, expectedPosition, type ActionResult } from './staff';
import { matchdayExtras } from './stadium';
import { CUP_FINALIST_PRIZE, CUP_ROUNDS } from './competitions';
import { EUROPE_BONUS_SHARE, europeRange } from './europe';
import { goalBonusPoints, pointsBonusFactor, suggestedSplit } from './wages';
import { overdraftLimit } from './financing';
import { sponsorForecast, sponsorMonthly } from './sponsors';

const sponsorMonthlyTotal = (state: GameState) => { const m = sponsorMonthly(state); return m.contracts + m.small; };
import type { BudgetLine, BudgetPlan, BudgetPolicy, Club, FinanceCategory, GameState, StaffRole } from './types';
import { adminMonthly, campCost, communityReference, policyMoodDrift, ticketMoodPenalty, communitySpend, fanshopDetail, maintenanceMonthly, projectMood, securityPerMatch, TICKET_ANGER } from './operations';
import { budgetRemaining } from './transfers';
import { extrasEffect, extrasMonthly, scheduledEventIncome, sectorEffect } from './venue';
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
  const raw = baseAttendance(club.reputation, tier) * share * mood * priceFactor * newStadiumFactor(club);
  return Math.max(0, Math.min(Math.round(club.stadium.capacity * 0.7), Math.round(raw)));
}

/** Držitelé permanentek v aktuální sezóně. */
export function seasonTicketHolders(state: GameState): number {
  return state.budget?.season === state.season ? state.budget.seasonTickets ?? 0 : 0;
}

function expectedAttendance(state: GameState, fanMood = ownClub(state).fanMood): number {
  const club = ownClub(state);
  const tier = tierOf(state, club.id);
  const price = Math.pow(defaultTicketPrice(tier) / Math.max(club.policy.ticketPrice, 1), 0.8);
  const mood = (0.85 + 0.3 * (fanMood / 100)) * newStadiumFactor(club) * sectorEffect(club).attendance * extrasEffect(club).attendance;
  return Math.min(effectiveCapacity(state, club), baseAttendance(club.reputation, tier) * price * mood);
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
export function wagePlan(state: GameState): { cap: number; contracts: number; wages: number; bonuses: number; pointsPerMatch: number; goal: number } {
  const club = ownClub(state);
  const comp = competitionOf(state, club.id);
  const position = comp ? expectedPosition(state, club.id) : 8;
  const size = comp?.clubIds.length ?? 16;
  // Body na zápas podle očekávaného umístění (lídr kolem 2,3, střed 1,3, chvost pod 1).
  const pointsPerMatch = clamp(1.35 + ((size / 2 - position) / size) * 2.2, 0.6, 2.4);
  const matches = (comp ? comp.fixtures.filter((f) => f.homeId === club.id || f.awayId === club.id).length : 30) + (comp?.format === 'nadstavba' && !comp.groups ? 5 : 0);
  const cap = wageBudgetMonthly(club) * 12;
  const contracts = squadOf(state, club.id).reduce((a, p) => a + p.wage, 0) * 12;
  const goal = comp && position <= goalTarget(state.owner.seasonGoal, comp) ? goalBonusPoints(state) * bonusPerPoint(club) : 0;
  const bonuses = bonusPerPoint(club) * pointsPerMatch * matches * pointsBonusFactor(state, club.id) + goal;
  return { cap, contracts, wages: Math.max(cap, contracts), bonuses: Math.round(bonuses), pointsPerMatch, goal };
}

/** Provozní kategorie: z nich se počítá provozní výsledek (bez přestupů, investic, daní a financování). */
export const OPERATING_CATEGORIES: FinanceCategory[] = ['vstupne', 'stadion', 'fanshop', 'akce', 'tv', 'komercni', 'evropa', 'pohar', 'ostatni', 'platy', 'vedeni', 'oddeleni', 'provoz', 'udrzba', 'soustredeni', 'bezpecnost', 'komunita', 'skautsit', 'programy', 'areal'];

/** Provozní výsledek sezóny k dnešku podle účtu. */
export function operatingActual(state: GameState): number {
  const totals = ownClub(state).finance.season;
  return OPERATING_CATEGORIES.reduce((a, c) => a + (totals[c] ?? 0), 0);
}

const SEASON_END_MD = '06-20';

/** Data výplat na začátku měsíce, která v této sezóně ještě přijdou. */
function remainingMonthStarts(state: GameState): string[] {
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    const y = i < 6 ? state.season : state.season + 1;
    const mo = ((6 + i) % 12) + 1;
    const d = `${y}-${String(mo).padStart(2, '0')}-01`;
    if (d > state.date) out.push(d);
  }
  return out;
}

/** Očekávané peníze z domácího poháru (každé kolo zhruba napůl). */
function cupForecast(state: GameState): { date: string; amount: number }[] {
  const cup = state.cups.pohar;
  const own = state.owner.clubId;
  const fresh = !cup || Number(cup.rounds[0]?.date.slice(0, 4)) < state.season;
  if (!fresh && (cup!.winner || !cup!.alive.includes(own))) return [];
  const rounds = CUP_ROUNDS.map((r, i) => ({ ...r, date: fresh ? `${r.spring ? state.season + 1 : state.season}-${r.md}` : cup!.rounds[i].date }));
  const out: { date: string; amount: number }[] = [];
  let p = 1;
  for (const r of rounds) {
    if (r.date <= state.date) continue;
    p *= 0.5;
    out.push({ date: r.date, amount: r.prize * p });
    if (r === rounds[rounds.length - 1]) out.push({ date: r.date, amount: CUP_FINALIST_PRIZE * p });
  }
  return out;
}

/**
 * Výhled sezóny: co už se stalo (skutečnost na účtu) plus odhad zbytku sezóny podle aktuálního nastavení.
 * Na začátku sezóny je to celý plán, v jejím průběhu výhled. Hotovost se počítá den po dni až do konce června.
 */
export function forecastSeason(state: GameState): BudgetPlan {
  const club = ownClub(state);
  const tier = tierOf(state, club.id);
  const comp = competitionOf(state, club.id);
  const own = club.id;
  const totals = club.finance.season;
  const seasonEnd = `${state.season + 1}-06-30`;
  const endDay = `${state.season + 1}-${SEASON_END_MD}`;
  const months = remainingMonthStarts(state);
  const soon = addDays(state.date, 1);
  const flows = new Map<string, Map<string, number>>();
  // Peníze, které klub utratit může, ale nemusí (nevyužitý mzdový strop, zbytek rozpočtu na přestupy),
  // se ve výhledu hotovosti nepočítají (jen závazky a reálné očekávání, Evropa vážená šancí);
  // nejhorší případ je počítá celé.
  const flexByDate = new Map<string, number>();
  const add = (key: string, date: string, amount: number, tag?: 'flex') => {
    if (!amount || date <= state.date || date > seasonEnd) return;
    const m = flows.get(key) ?? new Map<string, number>();
    m.set(date, (m.get(date) ?? 0) + amount);
    flows.set(key, m);
    if (tag === 'flex') flexByDate.set(date, (flexByDate.get(date) ?? 0) + amount);
  };
  const monthly = (key: string, amount: number) => months.forEach((d) => add(key, d, amount));

  // Zápasy, které se ještě hrají.
  const position = comp ? expectedPosition(state, own) : 8;
  const size = comp?.clubIds.length ?? 16;
  const league = comp?.fixtures.filter((f) => f.homeId === own || f.awayId === own) ?? [];
  const leftLeague = league.filter((f) => !f.result && f.date > state.date);
  const leftHome = leftLeague.filter((f) => f.homeId === own).map((f) => f.date);
  if (comp?.format === 'nadstavba' && !comp.groups) for (let i = 0; i < 2.5; i++) leftHome.push(`${state.season + 1}-05-${String(5 + i * 7).padStart(2, '0')}`);
  const sold = state.budget?.season === state.season && state.budget.seasonTickets !== undefined;
  const holders = sold ? state.budget!.seasonTickets! : seasonTicketDemand(state);
  // Nálada fanoušků se během sezóny posouvá podle cen a údržby: návštěva a fanshop s tím počítají.
  const moodTarget = 50 + 6 * departmentEffect(club, tier, 'marketing');
  const monthsAhead = (d: string) => Math.max(0, (Number(d.slice(0, 4)) - Number(state.date.slice(0, 4))) * 12 + Number(d.slice(5, 7)) - Number(state.date.slice(5, 7)));
  const moodAt = (d: string) => projectMood(club, tier, defaultTicketPrice(tier), moodTarget, monthsAhead(d));
  if (!sold) add('vstupne', soon, holders * seasonTicketPrice(state));
  for (const d of leftHome) {
    const att = Math.max(expectedAttendance(state, moodAt(d)), holders * 0.9);
    add('vstupne', d, Math.max(0, att - holders) * club.policy.ticketPrice * sectorEffect(club).ticketFactor);
    add('stadion', d, matchdayExtras(club, att, tier));
  }

  monthly('tv', tvMonthly(tier));
  const prize = prizeMoney(tier, position, size);
  add('tv', endDay, prize);
  monthly('komercni', sponsorForecast(state) / 12 + womenSponsorMonthly(state));
  monthly('areal', commercialIncomeMonthly(state));

  const eu = state.europe?.season === state.season ? state.europe.entries.find((e) => e.clubId === own) : undefined;
  if (eu) {
    const qual = { LM: 25_000_000, EL: 15_000_000, KL: 10_000_000 }[eu.entry];
    if (!state.europe!.resolved) {
      add('evropa', `${state.season}-08-28`, qual);
      add('platy', `${state.season}-08-28`, -qual * EUROPE_BONUS_SHARE);
    }
    if (!state.europe!.resolved || eu.result !== 'predkola') {
      const part = (eu.revenue - qual) / 4;
      for (const d of [`${state.season}-10-01`, `${state.season}-11-01`, `${state.season}-12-01`, `${state.season + 1}-01-01`]) {
        add('evropa', d, part);
        add('platy', d, -part * EUROPE_BONUS_SHARE);
      }
    }
  }
  for (const c of cupForecast(state)) add('pohar', c.date, c.amount);

  const wp = wagePlan(state);
  const bill = squadOf(state, own).reduce((a, p) => a + p.wage, 0);
  const scheme = !!state.grey.taxSchemeUntil && state.grey.taxSchemeUntil > state.date ? 0.9 : 1;
  monthly('platy', -bill * scheme);
  const perMatch = bonusPerPoint(club) * wp.pointsPerMatch * pointsBonusFactor(state, own);
  for (const f of leftLeague) add('platy', f.date, -perMatch);
  if (comp?.format === 'nadstavba' && !comp.groups) for (let i = 0; i < 5; i++) add('platy', `${state.season + 1}-05-${String(3 + i * 5).padStart(2, '0')}`, -perMatch);
  add('platy', endDay, -wp.goal);
  months.forEach((d) => add('rezerva', d, -Math.max(0, wp.cap / 12 - bill), 'flex'));
  monthly('vedeni', -staffWages(state));
  monthly('oddeleni', -departmentsMonthly(club, tier));
  const ff = financeFactor(state);
  monthly('provoz', -adminMonthly(tier) * ff);
  monthly('udrzba', -maintenanceMonthly(club, tier) * ff);
  for (const d of months) add('fanshop', d, fanshopDetail(state, moodAt(d)).net);
  monthly('komunita', -communitySpend(club, tier) / 12);
  monthly('skautsit', -networksMonthly(state));
  monthly('programy', -programsMonthly(state));
  for (const p of bigPaymentSchedule(state)) add('investice', p.date, -p.amount);
  // Přijaté akce na stadionu, muzeum a obrazovka.
  for (const e of scheduledEventIncome(state)) add('akce', e.date, e.amount);
  const extras = extrasMonthly(state);
  monthly('stadion', extras.museum);
  monthly('komercni', extras.screen);
  add('soustredeni', `${state.season}-07-10`, -campCost(tier, club.policy.summerCamp));
  add('soustredeni', `${state.season + 1}-01-10`, -campCost(tier, club.policy.winterCamp));
  for (const d of leftHome) add('bezpecnost', d, -securityPerMatch(tier, club.policy.security));

  // Přestupy: naplánované splátky a zbytek rozpočtu, dokud je nebo bude otevřené okno.
  for (const p of state.payments ?? []) {
    if (p.to === own) add('prestupy', p.due, p.amount);
    if (p.from === own) add('prestupy', p.due, -p.amount);
  }
  // Zbytek rozpočtu na přestupy (hlídá i minimální rezervu na účtu).
  const room = budgetRemaining(state);
  const winter = `${state.season + 1}-01-20`;
  if (state.date < `${state.season}-08-31`) {
    add('prestupy', soon, -room * 0.7, 'flex');
    add('prestupy', winter, -room * 0.3, 'flex');
  } else if (state.date < `${state.season + 1}-02-14`) {
    add('prestupy', state.date < winter ? winter : soon, -room, 'flex');
  }

  // Financování: splátky úvěrů, záloha na TV, úroky z půjčky majitele a poplatek za kontokorent.
  for (const l of state.loans) months.slice(0, l.monthsLeft).forEach((d) => add('financovani', d, -l.payment));
  if (state.tvAdvance) months.slice(0, state.tvAdvance.monthsLeft).forEach((d) => add('financovani', d, -state.tvAdvance!.monthly));
  if (state.ownerLoan) monthly('financovani', -(state.ownerLoan.remaining * state.ownerLoan.rate) / 12);
  if (club.policy.overdraft) monthly('financovani', -(overdraftLimit(state) * 0.005) / 12);

  const sumOf = (key: string) => [...(flows.get(key)?.values() ?? [])].reduce((a, v) => a + v, 0);
  const actualOf = (cats: FinanceCategory[]) => cats.reduce((a, c) => a + (totals[c] ?? 0), 0);
  const def: [string, string, FinanceCategory[], BudgetLine['group']][] = [
    ['vstupne', 'Vstupné a permanentky', ['vstupne'], 'provoz'],
    ['stadion', 'Catering a VIP', ['stadion'], 'provoz'],
    ['fanshop', 'Fanshop a dresy', ['fanshop'], 'provoz'],
    ['akce', 'Akce na stadionu', ['akce'], 'provoz'],
    ['areal', 'Komerční areál (hotel, obchody)', ['areal'], 'provoz'],
    ['tv', 'TV práva a odměna za umístění', ['tv'], 'provoz'],
    ['komercni', 'Sponzoři a reklama', ['komercni'], 'provoz'],
    ['evropa', 'Evropské poháry', ['evropa'], 'provoz'],
    ['pohar', 'Domácí pohár', ['pohar'], 'provoz'],
    ['ostatni', 'Mimořádné příjmy a výdaje (dotace, pokuty)', ['ostatni'], 'provoz'],
    ['platy', 'Platy hráčů a prémie', ['platy'], 'provoz'],
    ['rezerva', 'Rezerva ve mzdovém stropu (zatím nevyužitá)', [], 'provoz'],
    ['vedeni', 'Trenér a ředitelé', ['vedeni'], 'provoz'],
    ['oddeleni', 'Oddělení (skauting, mládež, medicína, marketing)', ['oddeleni'], 'provoz'],
    ['provoz', 'Administrativa, cestování a energie', ['provoz'], 'provoz'],
    ['udrzba', 'Údržba stadionu a trávníku', ['udrzba'], 'provoz'],
    ['soustredeni', 'Soustředění', ['soustredeni'], 'provoz'],
    ['bezpecnost', 'Pořadatelé a bezpečnost', ['bezpecnost'], 'provoz'],
    ['komunita', 'Komunita, ženský a dětský fotbal', ['komunita'], 'provoz'],
    ['skautsit', 'Zahraniční skauting', ['skautsit'], 'provoz'],
    ['programy', 'Programy klubu (B-tým, ženy, analytika, partner)', ['programy'], 'provoz'],
    ['prestupy', 'Přestupy (nákupy, prodeje, splátky)', ['prestupy'], 'kapital'],
    ['investice', 'Investice do stadionu a zázemí', ['investice'], 'kapital'],
    ['dane', 'Daň z příjmů', ['dane'], 'kapital'],
    ['financovani', 'Úvěry, půjčky a vklady majitele', ['uver', 'vklad'], 'financovani'],
  ];
  const build = () =>
    def.map(([key, label, categories, group]) => {
      const actual = actualOf(categories);
      const amount = Math.round(actual + sumOf(key));
      const next = flows.get(key);
      const immediate = next ? [...next.entries()].filter(([d]) => d === soon).reduce((a, [, v]) => a + v, 0) : 0;
      const final = next ? [...next.entries()].filter(([d]) => d >= endDay).reduce((a, [, v]) => a + v, 0) : 0;
      return { key, label, categories, group, amount, actual: Math.round(actual), upfront: Math.round(immediate) || undefined, atEnd: Math.round(final) || undefined } as BudgetLine;
    });
  // Daň: 21 % z odhadu zisku po odečtení ztrát z minulých let (platí se na konci sezóny).
  if (state.date < endDay) {
    const acc = club.finance.accounting;
    const operating = build().filter((l) => l.group === 'provoz').reduce((a, l) => a + l.amount, 0);
    const taxable = operating + (acc?.saleProfit ?? 0) - (acc?.amortization ?? 0) - (acc?.interest ?? 0) - (club.finance.lossCarry ?? 0);
    add('dane', endDay, -Math.max(0, taxable) * TAX_RATE);
  }
  const lines = build();
  const result = lines.filter((l) => l.group === 'provoz').reduce((a, l) => a + l.amount, 0);
  const cashFlow = lines.reduce((a, l) => a + l.amount, 0);

  // Hotovost den po dni do konce sezóny: závazky a reálné očekávání (bez nevyužitého stropu a rozpočtu na přestupy).
  const allByDate = new Map<string, number>();
  for (const m of flows.values()) for (const [d, v] of m) allByDate.set(d, (allByDate.get(d) ?? 0) + v);
  const byDate = new Map<string, number>();
  for (const [d, v] of allByDate) byDate.set(d, v - (flexByDate.get(d) ?? 0));
  const dates = [...byDate.keys()].sort();
  // Nejhorší případ: utratí se celý mzdový strop i rozpočet na přestupy.
  let worst = club.finance.balance;
  let worstMin = worst;
  let worstMinDate = state.date;
  for (const d of dates) {
    worst += allByDate.get(d)!;
    if (worst < worstMin) {
      worstMin = worst;
      worstMinDate = d;
    }
  }
  let balance = club.finance.balance;
  let cashMin = balance;
  let cashMinDate = state.date;
  const points: BudgetPlan['months'] = [];
  const checkpoints = [...months, seasonEnd];
  let ci = 0;
  for (const d of dates) {
    while (ci < checkpoints.length && checkpoints[ci] < d) points.push({ date: checkpoints[ci++], balance: Math.round(balance) });
    balance += byDate.get(d)!;
    if (balance < cashMin) {
      cashMin = balance;
      cashMinDate = d;
    }
    if (ci < checkpoints.length && checkpoints[ci] === d) points.push({ date: checkpoints[ci++], balance: Math.round(balance) });
  }
  while (ci < checkpoints.length) points.push({ date: checkpoints[ci++], balance: Math.round(balance) });
  const balanceOn = (date: string) => club.finance.balance + dates.filter((d) => d <= date).reduce((a, d) => a + byDate.get(d)!, 0);
  const od = club.policy.overdraft ? overdraftLimit(state) : 0;
  const tolerance = annualCosts(club, tier) * 0.01;
  // Potřeba od majitele s rezervou 3 % nákladů na výkyvy (pokuty, horší výsledky, zranění).
  const needFor = (min: number) => (min < -od - tolerance ? Math.ceil((-(min + od) + annualCosts(club, tier) * 0.03) / 500_000) * 500_000 : 0);
  const ownerNeed = needFor(cashMin);
  const worstNeed = needFor(worstMin);
  return {
    lines,
    result: Math.round(result),
    cashFlow: Math.round(cashFlow),
    cashMin: Math.round(cashMin),
    cashMinDate,
    cashEnd: Math.round(balance),
    months: points,
    from: state.date,
    licenceBalance: Math.round(balanceOn(`${state.season + 1}-03-31`)),
    ownerNeed,
    worstMin: Math.round(worstMin),
    worstMinDate,
    worstNeed,
    committedResult: Math.round(result - (lines.find((l) => l.key === 'rezerva')?.amount ?? 0)),
    europeRange: eu && !state.europe!.resolved ? europeRange(eu.entry) : undefined,
  };
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
  const when = plan.cashMinDate ? monthName(plan.cashMinDate) : '';
  if (plan.ownerNeed) {
    out.push({ tone: 'bad', text: `Peníze: ${when ? `v ${when} ` : ''}by klubu chybělo až ${mil(-(plan.cashMin + od))}${od ? ' i po vyčerpání kontokorentu' : ''}. Potřeba od majitele asi ${mil(plan.ownerNeed)} (vklad nebo půjčka), jinak prodeje hráčů nebo škrty.` });
  } else if (plan.cashMin < -tolerance) {
    out.push({ tone: 'warn', text: `Peníze: ${when ? `v ${when} ` : ''}klub sáhne do kontokorentu. Počítejte s úroky 12 %.` });
  } else if (plan.worstNeed) {
    const worstWhen = plan.worstMinDate ? monthName(plan.worstMinDate) : '';
    out.push({ tone: 'warn', text: `Peníze v nejhorším případě: pokud se využije celý mzdový strop i rozpočet na přestupy, ${worstWhen ? `v ${worstWhen} ` : ''}by chybělo asi ${mil(plan.worstNeed)}. Na podepsané závazky peníze jsou.` });
  }
  // Licence: svaz 31. 3. kontroluje vlastní kapitál a neuhrazené závazky.
  const check = `${state.season + 1}-03-31`;
  if (state.date < check && plan.licenceBalance !== undefined) {
    const sheet = balanceSheet(state);
    const equity = sheet.equity + sheet.ownerLoan + (plan.licenceBalance - club.finance.balance);
    if (plan.licenceBalance < -od - tolerance) out.push({ tone: 'bad', text: `Licence 31. 3.: účet by byl v minusu ${mil(-plan.licenceBalance)}${od ? ' i nad kontokorent' : ''}. Svaz to bere jako neuhrazené závazky.` });
    else if (equity < -tolerance) out.push({ tone: 'bad', text: `Licence 31. 3.: vlastní kapitál by byl záporný (asi ${mil(equity)}). Pomůže vklad nebo půjčka majitele, svaz ji počítá jako vlastní zdroje.` });
  }
  const minimum = club.policy.cashReserve ?? 0;
  if (minimum > 0 && !plan.ownerNeed && plan.cashMin < minimum) out.push({ tone: 'warn', text: `Peníze: zůstatek klesne pod vaši minimální rezervu ${mil(minimum)} (nejníž ${mil(plan.cashMin)}). Ředitel pod ni nebude utrácet za přestupy.` });
  if (comp) {
    const target = goalTarget(state.owner.seasonGoal, comp);
    const rank = wageRank(state);
    if (rank > target + 3) out.push({ tone: 'warn', text: `Mzdovým stropem patříte až na ${rank}. místo ligy, cíl sezóny je ale do ${target}. místa. Trenér i ředitel budou rozpočet považovat za nedostatečný.` });
  }
  const costs = annualCosts(club, tier);
  if ((plan.committedResult ?? plan.result) < -costs * 0.25) out.push({ tone: 'warn', text: 'Provozní ztráta je přes čtvrtinu běžných nákladů. Bez prodejů hráčů nebo vkladu to klub dlouho nevydrží.' });
  const ratio = club.policy.ticketPrice / defaultTicketPrice(tier);
  if (ratio > TICKET_ANGER) out.push({ tone: 'warn', text: `Vstupenky jsou o ${Math.round((ratio - 1) * 100)} % dražší než obvykle. Nálada fanoušků každý měsíc klesá a přijde jich méně.` });
  const ref = departmentReference(club, tier);
  const d = departmentsOf(club, tier);
  if (d.medicina < ref.medicina * 0.5) out.push({ tone: 'warn', text: 'Škrty v medicíně zvýší počet a délku zranění.' });
  return out;
}

export { TICKET_ANGER } from './operations';

function mil(v: number): string {
  if (Math.abs(v) < 1_000_000) return `${Math.round(v / 1_000).toLocaleString('cs-CZ')} tis. Kč`;
  return `${(v / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč`;
}

function monthName(date: string): string {
  return ['červenci', 'srpnu', 'září', 'říjnu', 'listopadu', 'prosinci', 'lednu', 'únoru', 'březnu', 'dubnu', 'květnu', 'červnu'][(Number(date.slice(5, 7)) + 5) % 12];
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
  state.budget = { ...state.budget!, approved: state.date, revised: !first, plan, approvedPolicy: policySnapshot(ownClub(state), tierOf(state, state.owner.clubId)) };
  if (first) reactToBudget(state, plan);
  const message = `${first ? 'Rozpočet schválen' : 'Revize rozpočtu schválena'}: provozní výsledek ${(plan.result / 1e6).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč.${tickets}`;
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
  const reserve = Math.max(annualCosts(club, tier) * (cfo !== undefined ? 0.05 : 0.01), club.policy.cashReserve ?? 0);
  // Návrh počítá s nejhorším případem (celý strop i rozpočet na přestupy utracený), aby sám nevyvolal varování.
  const worstMin = plan.worstMin ?? plan.cashMin;
  if (worstMin < reserve) {
    club.policy.transferBudget = Math.max(0, Math.round((club.policy.transferBudget - (reserve - worstMin)) / 100_000) * 100_000);
  }
  // Velká plánovaná ztráta: návrh sníží mzdový strop pod současné platy, aby ředitel neprodlužoval drahé smlouvy.
  const after = forecastSeason(state);
  if (after.result < -annualCosts(club, tier) * 0.15) {
    const bill = squadOf(state, club.id).reduce((a, p) => a + p.wage, 0);
    const base = wageBudgetMonthly({ ...club, policy: { ...club.policy, wageMultiplier: 1 } });
    club.policy.wageMultiplier = Math.max(0.5, Math.min(club.policy.wageMultiplier, (bill * 1.05) / Math.max(1, base)));
  }
  // Návrh vždy pokryje platy podepsaných smluv (strop nesmí být pod tím, co klub už musí platit).
  const contracted = squadOf(state, club.id).reduce((a, p) => a + p.wage, 0);
  const baseCap = wageBudgetMonthly({ ...club, policy: { ...club.policy, wageMultiplier: 1 } });
  if (wageBudgetMonthly(club) < contracted) club.policy.wageMultiplier = Math.min(2, Math.ceil((contracted / Math.max(1, baseCap)) * 20) / 20);
  // Ani bez přestupů nejhorší případ nevychází: návrh sníží nevyužitou rezervu ve mzdovém stropu (ne pod podepsané platy).
  const worstAfter = forecastSeason(state);
  const gap = reserve - (worstAfter.worstMin ?? worstAfter.cashMin);
  if (gap > 0 && club.policy.transferBudget === 0 && (worstAfter.ownerNeed ?? 0) === 0) {
    const left = Math.max(1, worstAfter.months.length - 1);
    const cap = Math.max(contracted * 1.02, wageBudgetMonthly(club) - gap / left);
    club.policy.wageMultiplier = Math.max(0.5, Math.min(club.policy.wageMultiplier, Math.ceil((cap / Math.max(1, baseCap)) * 100) / 100));
  }
  // Velká nevyužitá hotovost: návrh zvedne mzdový strop (o 10 %) a rozpočet na přestupy, aby peníze pracovaly.
  const idle = club.finance.balance - annualCosts(club, tier) * 1.2;
  let idleNote = '';
  if (idle > 0 && club.policy.wageMultiplier < 1.6 && (forecastSeason(state).ownerNeed ?? 0) === 0) {
    club.policy.wageMultiplier = Math.min(1.6, Math.round((club.policy.wageMultiplier + 0.1) * 100) / 100);
    club.policy.transferBudget = Math.round((club.policy.transferBudget + idle * 0.25) / 100_000) * 100_000;
    idleNote = ' Klub má velkou nevyužitou hotovost, návrh proto zvedá mzdový strop o 10 % a rozpočet na přestupy.';
  }
  state.budget.draft = policySnapshot(club, tier);
  const need = forecastSeason(state).ownerNeed ?? 0;
  addNews(state, {
    kind: need ? 'varovani' : 'info',
    title: `Rozpočtová porada: schvalte rozpočet do ${BUDGET_DEADLINE.split('-').reverse().map(Number).join('. ')}.`,
    text: `${cfo !== undefined ? 'Finanční ředitel připravil návrh.' : 'Návrh připravila účetní podle loňska.'}${need ? ` Ani s úsporami klub sezónu bez peněz navíc neutáhne: potřeba od majitele asi ${mil(need)}.` : ''} Najdete ho ve Financích.${idleNote}`,
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
  state.budget = { ...state.budget!, approved: state.date, plan, approvedPolicy: policySnapshot(club, tier) };
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

function policySnapshot(club: Club, tier = 1): BudgetPolicy {
  const { overdraft: _o, autoSquad: _a, ...rest } = club.policy;
  void _o;
  void _a;
  return normalizePolicy(structuredClone(rest), club, tier);
}

/** Doplní výchozí hodnoty, aby „běžná“ volba a nezměněné nastavení byly totéž. */
function normalizePolicy(p: BudgetPolicy, club: Club, tier: number): BudgetPolicy {
  const full: BudgetPolicy = {
    ...p,
    cateringPrice: p.cateringPrice ?? 'bezna',
    merchPrice: p.merchPrice ?? 'bezna',
    newKit: p.newKit ?? false,
    stadiumEvents: p.stadiumEvents ?? 0,
    salesPolicy: p.salesPolicy ?? 'dobra',
    maintenance: p.maintenance ?? 'bezna',
    summerCamp: p.summerCamp ?? 'doma',
    winterCamp: p.winterCamp ?? 'doma',
    security: p.security ?? 'bezna',
    community: p.community ?? communityReference(tier),
    cashReserve: p.cashReserve ?? 0,
  };
  void club;
  return Object.fromEntries(Object.keys(full).sort().map((k) => [k, full[k as keyof BudgetPolicy]])) as BudgetPolicy;
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

/** Podíl období od data plánu do konce sezóny, který už uplynul. */
function progressSince(state: GameState, from: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${state.season + 1}-${SEASON_END_MD}T00:00:00Z`).getTime();
  const now = new Date(`${state.date}T00:00:00Z`).getTime();
  return b <= a ? 1 : clamp((now - a) / (b - a), 0, 1);
}

/** Kolik z řádku plánu mělo přijít nebo odejít k dnešnímu dni (od data, kdy byl plán spočítaný). */
export function planToDate(state: GameState, line: BudgetLine, from = `${state.season}-07-01`): number {
  const f = progressSince(state, from);
  const base = line.actual ?? 0;
  const upfront = line.upfront ?? 0;
  const atEnd = line.atEnd ?? 0;
  const rest = line.amount - base - upfront - atEnd;
  return Math.round(base + (state.date > from ? upfront : 0) + rest * f + (f >= 0.999 ? atEnd : 0));
}

/** Dopad neschválených změn: výhled se schváleným nastavením proti výhledu s aktuálním. */
export function changeImpact(state: GameState): { before: number; after: number } | undefined {
  const saved = state.budget?.season === state.season ? state.budget.approvedPolicy : undefined;
  if (!saved || !budgetChanged(state)) return undefined;
  const alt = structuredClone(state);
  const club = ownClub(alt);
  club.policy = { ...normalizePolicy(structuredClone(saved), club, tierOf(alt, club.id)), overdraft: club.policy.overdraft, autoSquad: club.policy.autoSquad };
  return { before: forecastSeason(alt).result, after: forecastSeason(state).result };
}

export interface PolicyImpact {
  /** Změna provozního výsledku sezóny (výhled). */
  result: number;
  /** Změna peněz na konci sezóny. */
  cashEnd: number;
  /** Změna nálady fanoušků za rok (z cen a údržby). */
  moodYear: number;
}

/** Co by změna nastavení udělala s výhledem sezóny a s náladou fanoušků (proti současnému stavu). */
export function policyImpact(state: GameState, patch: Partial<Club['policy']>): PolicyImpact {
  const club = ownClub(state);
  const tier = tierOf(state, club.id);
  const alt = structuredClone(state);
  const altClub = ownClub(alt);
  altClub.policy = { ...altClub.policy, ...patch };
  const before = forecastSeason(state);
  const after = forecastSeason(alt);
  const price = defaultTicketPrice(tier);
  const drift = (c: Club) => policyMoodDrift(c) - ticketMoodPenalty(c, tier, price);
  return { result: after.result - before.result, cashEnd: after.cashEnd - before.cashEnd, moodYear: (drift(altClub) - drift(club)) * 12 };
}

/** Liší se nastavení od schváleného rozpočtu? (Posun výhledu kvůli výsledkům se nepočítá.) */
export function budgetChanged(state: GameState): boolean {
  const saved = state.budget?.season === state.season ? state.budget.approvedPolicy : undefined;
  if (!budgetApproved(state) || !saved) return false;
  const club = ownClub(state);
  const tier = tierOf(state, club.id);
  return JSON.stringify(policySnapshot(club, tier)) !== JSON.stringify(normalizePolicy(saved, club, tier));
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
  const operating = OPERATING_CATEGORIES;
  const diff = (c: FinanceCategory) => (totals[c] ?? 0) - (prev[c] ?? 0);
  const income = operating.filter((c) => diff(c) > 0).reduce((a, c) => a + diff(c), 0);
  const expense = operating.filter((c) => diff(c) < 0).reduce((a, c) => a + diff(c), 0);
  const transfers = diff('prestupy');
  const plan = state.budget?.plan;
  const toDate = plan ? plan.lines.filter((l) => l.group === 'provoz').reduce((a, l) => a + planToDate(state, l, plan.from), 0) : undefined;
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
    { label: 'Fanshop a dresy', amount: fanshopDetail(state).net },
    { label: 'Administrativa a provoz', amount: -adminMonthly(tier) * financeFactor(state) },
    { label: 'Údržba stadionu', amount: -maintenanceMonthly(club, tier) * financeFactor(state) },
    { label: 'Komunita', amount: -communitySpend(club, tier) / 12 },
    ...(loans ? [{ label: 'Splátky úvěrů', amount: -loans }] : []),
  ].map((x) => ({ ...x, amount: Math.round(x.amount) }));
  return { monthly, items };
}

// ---------- Srovnání s ligou a závazky do budoucna ----------

export interface Benchmark {
  own: number;
  avg: number;
  max: number;
  /** Pořadí klubu v soutěži (1 = nejvíc). */
  rank: number;
  clubs: number;
}

/** Roční odhad hlavních položek ostatních klubů soutěže (pro srovnání v rozpočtu). */
export function leagueBenchmarks(state: GameState, plan = forecastSeason(state)): Record<'vstupne' | 'stadion' | 'komercni' | 'platy' | 'oddeleni' | 'provoz' | 'prijmy' | 'zustatek', Benchmark> {
  const club = ownClub(state);
  const comp = competitionOf(state, club.id);
  const tier = tierOf(state, club.id);
  const others = (comp?.clubIds ?? []).filter((id) => id !== club.id).map((id) => state.clubs[id]);
  const line = (k: string) => plan.lines.find((l) => l.key === k)?.amount ?? 0;
  const estimate = (c: Club) => {
    const att = Math.min(c.stadium.capacity, baseAttendance(c.reputation, tier));
    const vstupne = att * defaultTicketPrice(tier) * 15;
    const stadion = matchdayExtras(c, att, tier) * 15;
    const komercni = sponsorsAnnual(c, tier);
    const platy = squadOf(state, c.id).reduce((a, p) => a + p.wage, 0) * 12 + bonusPerPoint(c) * 45;
    const oddeleni = DEPARTMENT_KEYS.reduce((a, k) => a + departmentReference(c, tier)[k], 0);
    const provoz = operatingMonthly(c, tier) * 12;
    return { vstupne, stadion, komercni, platy, oddeleni, provoz, prijmy: vstupne + stadion + komercni + tvMonthly(tier) * 12, zustatek: c.finance.balance };
  };
  const ownValues = {
    vstupne: line('vstupne'),
    stadion: line('stadion'),
    komercni: line('komercni') + line('fanshop'),
    platy: -line('platy'),
    oddeleni: -line('oddeleni'),
    provoz: -(line('provoz') + line('udrzba') + line('soustredeni') + line('bezpecnost') + line('komunita')),
    prijmy: line('vstupne') + line('stadion') + line('komercni') + line('fanshop') + tvMonthly(tier) * 12,
    zustatek: club.finance.balance,
  };
  const rows = others.map(estimate);
  const out = {} as Record<keyof typeof ownValues, Benchmark>;
  for (const k of Object.keys(ownValues) as (keyof typeof ownValues)[]) {
    const vals = rows.map((r) => r[k]);
    const all = [...vals, ownValues[k]];
    out[k] = {
      own: Math.round(ownValues[k]),
      avg: Math.round(all.reduce((a, v) => a + v, 0) / Math.max(1, all.length)),
      max: Math.round(Math.max(...all)),
      rank: 1 + vals.filter((v) => v > ownValues[k]).length,
      clubs: all.length,
    };
  }
  return out;
}

export interface FutureSeason {
  season: number;
  wages: number;
  transfers: number;
  loans: number;
  /** Splátky velkých staveb a programy klubu. */
  investments: number;
  sponsors: number;
  tv: number;
  players: number;
}

/** Co je už dnes podepsané na tři další sezóny: platy, splátky přestupů a úvěrů, sponzorské smlouvy, TV. */
export function multiYearOutlook(state: GameState, years = 3): FutureSeason[] {
  const club = ownClub(state);
  const tier = tierOf(state, club.id);
  const squad = squadOf(state, club.id);
  const out: FutureSeason[] = [];
  let loanMonthsUsed = Math.max(0, remainingMonthStarts(state).length);
  for (let k = 1; k <= years; k++) {
    const season = state.season + k;
    const from = `${season}-07-01`;
    const to = `${season + 1}-06-30`;
    const list = squad.filter((p) => p.contractUntil > season);
    const transfers = (state.payments ?? [])
      .filter((p) => p.due >= from && p.due <= to)
      .reduce((a, p) => a + (p.to === club.id ? p.amount : p.from === club.id ? -p.amount : 0), 0);
    const loans = state.loans.reduce((a, l) => a + l.payment * Math.max(0, Math.min(12, l.monthsLeft - loanMonthsUsed)), 0);
    loanMonthsUsed += 12;
    const sponsors = (club.sponsors ?? []).filter((c) => c.untilSeason >= season).reduce((a, c) => a + c.annual, 0);
    const building = bigPaymentSchedule(state).filter((p) => p.date >= from && p.date <= to).reduce((a, p) => a + p.amount, 0);
    const programs = (programsMonthly(state) - womenSponsorMonthly(state)) * 12;
    out.push({ season, wages: -list.reduce((a, p) => a + p.wage, 0) * 12, transfers, loans: -loans, investments: -Math.round(building + programs), sponsors, tv: tvMonthly(tier) * 12, players: list.length });
  }
  return out;
}
