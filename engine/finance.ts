import { squadQualityForReputation } from './players';
import { defaultFacilities, facilityUpkeep } from './stadium';
import type { Rng } from './rng';
import type { Accounting, Club, Departments, FinanceCategory, FinanceTotals, GameState, Player } from './types';
import { hash01, tierOf } from './world';

/**
 * Ekonomika je kalibrovaná podle české ligy (hodnoty z Transfermarktu, rozpočty klubů z výročních zpráv).
 * Příjmy plynou z trhu: TV, vstupné, sponzoři podle velikosti a úspěchu klubu, odměny, Evropa.
 * Největší náklad jsou platy hráčů (kolem 55–60 % nákladů), dál provoz, oddělení a vedení.
 * Běžný klub má bez prodejů hráčů mírnou ztrátu, kterou kryjí prodeje nebo vklady majitele.
 */

const round1000 = (v: number) => Math.round(v / 1000) * 1000;

/** Hodnota podle úrovně nastavení (nízká / běžná / vysoká). */
export function financeLevel(level: string | undefined, low: number, normal: number, high: number): number {
  return level === 'nizka' ? low : level === 'vysoka' ? high : normal;
}

/** Velké kluby platí za stejnou kvalitu víc, nejnižší soutěže jsou poloprofesionální. */
export function clubPayFactor(reputation: number): number {
  const pts: [number, number][] = [[30, 0.7], [40, 1], [45, 1.6], [50, 2.3], [55, 3], [62, 3.6], [76, 3.8], [86, 4], [95, 4.4]];
  if (reputation <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [r1, f1] = pts[i];
    const [r0, f0] = pts[i - 1];
    if (reputation <= r1) return f0 + ((reputation - r0) / (r1 - r0)) * (f1 - f0);
  }
  return pts[pts.length - 1][1];
}

/**
 * Tržní měsíční plat hráče dané kvality v klubu s danou pověstí.
 * Orientačně: hvězda Slavie (80) přes 1 mil. Kč, opora středu 1. ligy (65) asi 120 tis.,
 * hráč 2. ligy (50) asi 25 tis., hráč 3. ligy (40) do 10 tis.
 */
export function playerWage(overall: number, reputation: number): number {
  return Math.max(5_000, round1000(25_000 * Math.pow(1.111, overall - 50) * clubPayFactor(reputation)));
}

/** Nastaví hráčům tržní platy (s mírným rozptylem). Pro ostatní kluby a při založení hry. */
export function setMarketWages(players: Player[], club: Club): void {
  for (const p of players) {
    const noise = 0.85 + 0.3 * hash01(`${p.id}-plat`);
    p.wage = Math.max(5_000, round1000(playerWage(p.overall, club.reputation) * noise));
  }
}

/** Běžný měsíční mzdový rozpočet klubu (24 hráčů kolem typické kvality) násobený rozhodnutím majitele. */
export function wageBudgetMonthly(club: Club): number {
  const typical = playerWage(squadQualityForReputation(club.reputation), club.reputation);
  return round1000(24 * typical * 1.3 * club.policy.wageMultiplier);
}

function baseWageBudget(club: Club): number {
  return wageBudgetMonthly({ ...club, policy: { ...club.policy, wageMultiplier: 1 } });
}

/** Prémie za získaný bod pro celý tým (v české lize zhruba 10–15 tis. na hráče, u špičky kolem 50 tis.). */
export function bonusPerPoint(club: Club): number {
  return round1000(baseWageBudget(club) * 0.035);
}

/** Typické měsíční výdaje na hráče včetně prémií (zhruba 45 bodů za sezónu). */
function typicalPlayerCosts(club: Club): number {
  return baseWageBudget(club) * 1.08 + (bonusPerPoint(club) * 45) / 12;
}

export const HOME_GAMES_PER_SEASON = 15;

export function tvMonthly(tier: number): number {
  return tier === 1 ? 1_500_000 : tier === 2 ? 300_000 : 40_000;
}

/** Kapacita stadionu na začátku hry (údržba rozšířeného stadionu se počítá zvlášť). */
function baseCapacity(club: Club): number {
  return club.stadium.originalCapacity ?? club.stadium.capacity;
}

// ---------- Oddělení klubu ----------

export const DEPARTMENT_KEYS: (keyof Departments)[] = ['skauting', 'mladez', 'medicina', 'marketing'];
export const DEPARTMENT_LABEL: Record<keyof Departments, string> = {
  skauting: 'Skauting',
  mladez: 'Mládež',
  medicina: 'Medicína a regenerace',
  marketing: 'Marketing',
};
const DEPARTMENT_BASE: Record<number, Departments> = {
  1: { skauting: 2_500_000, mladez: 4_000_000, medicina: 2_000_000, marketing: 3_000_000 },
  2: { skauting: 500_000, mladez: 1_200_000, medicina: 400_000, marketing: 500_000 },
  3: { skauting: 80_000, mladez: 250_000, medicina: 80_000, marketing: 80_000 },
};
const TIER_REF_REP: Record<number, number> = { 1: 62, 2: 46, 3: 36 };

/** Běžný roční rozpočet oddělení pro klub této velikosti. */
export function departmentReference(club: Club, tier: number): Departments {
  const base = DEPARTMENT_BASE[Math.min(3, Math.max(1, tier))];
  const k = Math.pow(1.04, club.reputation - TIER_REF_REP[Math.min(3, Math.max(1, tier))]);
  return Object.fromEntries(DEPARTMENT_KEYS.map((key) => [key, Math.round((base[key] * k) / 50_000) * 50_000])) as unknown as Departments;
}

export function departmentsOf(club: Club, tier: number): Departments {
  return club.policy.departments ?? departmentReference(club, tier);
}

/** Účinek rozpočtu oddělení: běžná výše 0, polovina −0,5, dvojnásobek +0,5, čtyřnásobek +1 (klesající výnos). */
export function departmentEffect(club: Club, tier: number, key: keyof Departments): number {
  const spend = departmentsOf(club, tier)[key];
  const ref = departmentReference(club, tier)[key];
  if (spend <= 0) return -1;
  return Math.max(-1, Math.min(1, Math.log2(spend / Math.max(1, ref)) / 2));
}

export function departmentsMonthly(club: Club, tier: number): number {
  const d = departmentsOf(club, tier);
  return round1000(DEPARTMENT_KEYS.reduce((a, k) => a + d[k], 0) / 12);
}

/**
 * Měsíční provoz: administrativa, cestování, energie, údržba stadionu (podle kapacity)
 * a provoz zázemí (tréninkové centrum, akademie, medicína, VIP, catering).
 */
export function operatingMonthly(club: Club, tier: number): number {
  const admin = tier === 1 ? 450_000 : tier === 2 ? 110_000 : 30_000;
  return round1000(admin + club.stadium.capacity * 15 + facilityUpkeep(club.facilities, tier));
}

/** Typické roční náklady klubu (platy hráčů s prémiemi, vedení, oddělení, provoz). Měřítko pro rozpočty a částky. */
export function annualCosts(club: Club, tier: number): number {
  const staff = baseWageBudget(club) * 0.12;
  const depts = DEPARTMENT_KEYS.reduce((a, k) => a + departmentReference(club, tier)[k], 0) / 12;
  return (typicalPlayerCosts(club) + staff + depts + operatingMonthly({ ...club, stadium: { ...club.stadium, capacity: baseCapacity(club) }, facilities: defaultFacilities(club.reputation, tier) }, tier)) * 12;
}

// ---------- Sponzoři ----------

const SPONSOR_BASE: Record<number, number> = { 1: 27_000_000, 2: 8_000_000, 3: 3_000_000 };

/**
 * Roční příjmy od sponzorů, z reklamy a merchandisingu podle velikosti a pověsti klubu
 * (pověst roste s úspěchy) a nálady fanoušků. Smlouva s generálním partnerem je násobí.
 */
export function sponsorsAnnual(club: Club, tier: number): number {
  const t = Math.min(3, Math.max(1, tier));
  const fans = 0.85 + 0.3 * ((club.fanMood ?? 50) / 100);
  const deal = club.sponsorDeal?.factor ?? 1;
  return SPONSOR_BASE[t] * Math.pow(1.065, club.reputation - TIER_REF_REP[t]) * fans * deal;
}

/** Odměna za konečné umístění (vyplácí se na konci sezóny). */
export function prizeMoney(tier: number, position: number, size: number): number {
  const [best, worst] = tier === 1 ? [30_000_000, 3_000_000] : tier === 2 ? [6_000_000, 500_000] : [1_000_000, 100_000];
  const share = size > 1 ? (size - position) / (size - 1) : 1;
  return round1000(worst + (best - worst) * share);
}

export function defaultTicketPrice(tier: number): number {
  return tier === 1 ? 250 : tier === 2 ? 120 : 70;
}

/** Běžná návštěvnost při výchozí ceně (před omezením kapacitou). */
export function baseAttendance(reputation: number, tier: number): number {
  const tierFactor = tier === 1 ? 1 : tier === 2 ? 0.55 : 0.45;
  return 150 * Math.pow(1.06, reputation) * tierFactor;
}

/** Měsíční příjmy od sponzorů (bez vlivu pověsti majitele, obchodního ředitele a marketingu). */
export function commercialMonthly(club: Club, tier: number): number {
  return round1000(sponsorsAnnual(club, tier) / 12);
}

/** Výchozí rozpočet na odstupné: čtvrtina ročního mzdového rozpočtu. */
export function defaultTransferBudget(club: Club): number {
  return Math.round((baseWageBudget(club) * 12 * 0.25) / 100_000) * 100_000;
}

/** Návštěvnost domácího zápasu. */
export function matchAttendance(rng: Rng, home: Club, away: Club, tier: number, homeForm: number, capacity = home.stadium.capacity, damaged = false): number {
  const priceFactor = Math.pow(defaultTicketPrice(tier) / Math.max(home.policy.ticketPrice, 1), 0.8);
  const opponentFactor = 1 + (away.reputation - 50) / 200;
  const formFactor = 1 + homeForm * 0.2;
  const moodFactor = 0.85 + 0.3 * ((home.fanMood ?? 50) / 100);
  const raw = baseAttendance(home.reputation, tier) * priceFactor * opponentFactor * formFactor * moodFactor * (damaged ? 0.9 : 1) * rng.normal(1, 0.08);
  return Math.max(50, Math.min(capacity, Math.round(raw)));
}

export function emptyTotals(): FinanceTotals {
  return { vstupne: 0, stadion: 0, tv: 0, komercni: 0, evropa: 0, pohar: 0, ostatni: 0, uver: 0, platy: 0, vedeni: 0, oddeleni: 0, provoz: 0, prestupy: 0, investice: 0, dane: 0, vklad: 0, fanshop: 0, akce: 0, udrzba: 0, soustredeni: 0, bezpecnost: 0, komunita: 0 };
}

export function book(state: GameState, clubId: string, category: FinanceCategory, amount: number, note: string): void {
  const club = state.clubs[clubId];
  if (!club) return;
  const value = Math.round(amount);
  club.finance.balance += value;
  club.finance.season[category] = (club.finance.season[category] ?? 0) + value;
  if (clubId === state.owner.clubId) {
    club.finance.transactions.unshift({ date: state.date, category, amount: value, note });
    club.finance.transactions.length = Math.min(club.finance.transactions.length, 300);
  }
}

export const CATEGORY_LABEL: Record<FinanceCategory, string> = {
  vstupne: 'Vstupné',
  tv: 'TV práva a odměny soutěže',
  komercni: 'Sponzoři a komerční příjmy',
  platy: 'Platy hráčů',
  vedeni: 'Trenér a vedení (platy, odstupné)',
  provoz: 'Provoz klubu, stadionu a zázemí',
  oddeleni: 'Skauting, mládež, medicína, marketing',
  evropa: 'Evropské poháry',
  prestupy: 'Přestupy (odstupné, agenti)',
  pohar: 'Pohár (prémie za postup)',
  stadion: 'Catering, VIP a stadion',
  ostatni: 'Mimořádné příjmy a výdaje',
  investice: 'Investice do stadionu a zázemí',
  uver: 'Úvěr (čerpání a splátky)',
  dane: 'Daň z příjmů',
  vklad: 'Vklady majitele',
  fanshop: 'Fanshop a dresy',
  akce: 'Akce na stadionu',
  udrzba: 'Údržba stadionu a trávníku',
  soustredeni: 'Soustředění a cestování',
  bezpecnost: 'Pořadatelé a bezpečnost',
  komunita: 'Komunita, ženský a dětský fotbal',
};

// ---------- Účetnictví (klub majitele) ----------

export const TAX_RATE = 0.21;

export function emptyAccounting(): Accounting {
  return { amortization: 0, saleProfit: 0, writeOffs: 0, agentFees: 0, buildingDepreciation: 0, interest: 0 };
}

export function ownerAccounting(state: GameState): Accounting {
  const club = state.clubs[state.owner.clubId];
  club.finance.accounting ??= emptyAccounting();
  return club.finance.accounting;
}

/** Měsíční odpis registrací: cena hráče se rozkládá do délky smlouvy. */
export function monthlyAmortization(state: GameState): void {
  const acc = ownerAccounting(state);
  for (const p of Object.values(state.players)) {
    if (p.clubId !== state.owner.clubId || !p.bookValue || !p.amortization) continue;
    const a = Math.min(p.bookValue, p.amortization);
    p.bookValue -= a;
    acc.amortization += a;
  }
}

export interface ProfitAndLoss {
  revenues: { label: string; amount: number }[];
  costs: { label: string; amount: number }[];
  beforeTax: number;
}

/** Výsledovka: příjmy a náklady bez kapitálových pohybů, s odpisy a ziskem z prodeje hráčů. */
export function profitAndLoss(totals: FinanceTotals, acc: Accounting = emptyAccounting()): ProfitAndLoss {
  const revenues = [
    { label: CATEGORY_LABEL.vstupne, amount: totals.vstupne },
    { label: CATEGORY_LABEL.tv, amount: totals.tv },
    { label: CATEGORY_LABEL.komercni, amount: totals.komercni },
    { label: CATEGORY_LABEL.stadion, amount: totals.stadion ?? 0 },
    { label: CATEGORY_LABEL.fanshop, amount: totals.fanshop ?? 0 },
    { label: CATEGORY_LABEL.akce, amount: totals.akce ?? 0 },
    { label: CATEGORY_LABEL.evropa, amount: totals.evropa ?? 0 },
    { label: CATEGORY_LABEL.pohar, amount: totals.pohar },
    { label: CATEGORY_LABEL.ostatni, amount: totals.ostatni ?? 0 },
    { label: 'Zisk z prodeje hráčů', amount: acc.saleProfit },
  ];
  const costs = [
    { label: CATEGORY_LABEL.platy, amount: totals.platy },
    { label: CATEGORY_LABEL.vedeni, amount: totals.vedeni },
    { label: CATEGORY_LABEL.oddeleni, amount: totals.oddeleni ?? 0 },
    { label: CATEGORY_LABEL.provoz, amount: totals.provoz },
    { label: CATEGORY_LABEL.udrzba, amount: totals.udrzba ?? 0 },
    { label: CATEGORY_LABEL.soustredeni, amount: totals.soustredeni ?? 0 },
    { label: CATEGORY_LABEL.bezpecnost, amount: totals.bezpecnost ?? 0 },
    { label: CATEGORY_LABEL.komunita, amount: totals.komunita ?? 0 },
    { label: 'Odpisy hráčských registrací', amount: -acc.amortization },
    { label: 'Odpis při uvolnění hráčů', amount: -acc.writeOffs },
    { label: 'Odměny agentům', amount: -acc.agentFees },
    { label: 'Odpisy staveb a vybavení', amount: -(acc.buildingDepreciation ?? 0) },
    { label: 'Úroky z úvěrů', amount: -(acc.interest ?? 0) },
  ];
  const beforeTax = [...revenues, ...costs].reduce((a, x) => a + x.amount, 0);
  return { revenues, costs, beforeTax: Math.round(beforeTax) };
}

/** Rozvaha klubu majitele (zjednodušená): hotovost a registrace hráčů proti vlastnímu kapitálu a závazkům. */
export function balanceSheet(state: GameState) {
  const club = state.clubs[state.owner.clubId];
  const registrations = Object.values(state.players)
    .filter((p) => p.clubId === club.id)
    .reduce((a, p) => a + (p.bookValue ?? 0), 0);
  const cash = Math.max(0, club.finance.balance);
  const overdraft = Math.max(0, -club.finance.balance);
  const buildings = (club.finance.assets ?? []).reduce((a, x) => a + x.value, 0);
  const loans = state.loans.reduce((a, l) => a + l.remaining, 0);
  const own = club.id;
  const receivables = (state.payments ?? []).filter((p) => p.to === own).reduce((a, p) => a + p.amount, 0);
  const payables = (state.payments ?? []).filter((p) => p.from === own).reduce((a, p) => a + p.amount, 0);
  const ownerLoan = state.ownerLoan?.remaining ?? 0;
  const tvAdvance = state.tvAdvance ? state.tvAdvance.monthsLeft * state.tvAdvance.monthly : 0;
  const debt = overdraft + loans + payables + ownerLoan + tvAdvance;
  return {
    cash,
    registrations: Math.round(registrations),
    buildings: Math.round(buildings),
    receivables: Math.round(receivables),
    overdraft,
    loans: Math.round(loans),
    payables: Math.round(payables),
    ownerLoan: Math.round(ownerLoan),
    tvAdvance: Math.round(tvAdvance),
    debt: Math.round(debt),
    equity: Math.round(cash + registrations + buildings + receivables - debt),
  };
}

/** Konec sezóny: daň z kladného výsledku po odečtení ztrát z minulých let. */
export function settleTax(state: GameState): number {
  const club = state.clubs[state.owner.clubId];
  const pnl = profitAndLoss(club.finance.season, ownerAccounting(state));
  const carry = club.finance.lossCarry ?? 0;
  const taxable = pnl.beforeTax - carry;
  if (taxable > 0) {
    club.finance.lossCarry = 0;
    const tax = Math.round(taxable * TAX_RATE);
    book(state, club.id, 'dane', -tax, `Daň z příjmů za sezónu (21 % z ${Math.round(taxable).toLocaleString('cs-CZ')} Kč)`);
    return tax;
  }
  club.finance.lossCarry = -taxable;
  return 0;
}

// ---------- Úvěry ----------

export const LOAN_RATE = 0.07;
export const LOAN_MONTHS = 36;

/** Nabídky banky: podle velikosti klubu, nejvýš jeden úvěr najednou. */
export function loanOffers(state: GameState): number[] {
  const club = state.clubs[state.owner.clubId];
  if (state.loans.some((l) => (l.kind ?? 'provozni') === 'provozni')) return [];
  const yearly = annualCosts(club, tierOf(state, club.id));
  return [0.1, 0.25, 0.5].map((k) => Math.round((yearly * k) / 1_000_000) * 1_000_000).filter((v) => v > 0);
}

/** Investiční úvěr: jen na rozestavěné stavby, až 80 % jejich ceny, levnější a na 10 let. */
export const INVEST_RATE = 0.045;
export const INVEST_MONTHS = 120;
export function investmentLoanOffer(state: GameState): number {
  if (state.loans.some((l) => l.kind === 'investicni')) return 0;
  const building = state.projects.reduce((a, p) => a + p.cost, 0);
  return Math.round((building * 0.8) / 1_000_000) * 1_000_000;
}

/** Postoj spolumajitelů k úvěrům (stejná logika jako hlasování v ownership.ts, bez cyklického importu). */
const LOAN_BIAS = { investor: -8, patriot: -4, spekulant: 6, mesto: -10 } as const;

export function loanVotePasses(state: GameState): boolean {
  if (!state.shareholders.length) return true;
  const yes = state.owner.share + state.shareholders.filter((x) => x.satisfaction + LOAN_BIAS[x.kind] >= 50).reduce((a, x) => a + x.share, 0);
  return yes > 0.5;
}

export function annuity(principal: number, rate: number, months: number): number {
  const r = rate / 12;
  return Math.round((principal * r) / (1 - Math.pow(1 + r, -months)));
}

export function takeLoan(prev: GameState, amount: number, kind: 'provozni' | 'investicni' = 'provozni'): GameState {
  const allowed = kind === 'investicni' ? amount > 0 && amount === investmentLoanOffer(prev) : loanOffers(prev).includes(amount);
  if (!allowed || prev.owner.ousted) return prev;
  if (!loanVotePasses(prev)) return prev;
  const state = structuredClone(prev);
  const rate = kind === 'investicni' ? INVEST_RATE : LOAN_RATE;
  const months = kind === 'investicni' ? INVEST_MONTHS : LOAN_MONTHS;
  const payment = annuity(amount, rate, months);
  state.loans.push({ id: `u${++state.nextId}`, kind, principal: amount, remaining: amount, rate, payment, monthsLeft: months });
  book(state, state.owner.clubId, 'uver', amount, kind === 'investicni' ? 'Čerpání investičního úvěru na stavby' : 'Čerpání provozního úvěru od banky');
  return state;
}

/** Měsíční splátka: úrok jde do nákladů, jistina snižuje dluh. */
export function monthlyLoans(state: GameState): void {
  const acc = ownerAccounting(state);
  for (const loan of state.loans) {
    const interest = Math.round((loan.remaining * loan.rate) / 12);
    const principal = Math.min(loan.remaining, loan.payment - interest);
    loan.remaining -= principal;
    loan.monthsLeft -= 1;
    acc.interest += interest;
    book(state, state.owner.clubId, 'uver', -(principal + interest), 'Splátka úvěru');
  }
  state.loans = state.loans.filter((l) => l.remaining > 0 && l.monthsLeft > 0);
}
