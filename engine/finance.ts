import { squadQualityForReputation } from './players';
import { CATERING_SPEND, defaultFacilities, facilityUpkeepDelta, vipRate } from './stadium';
import type { Rng } from './rng';
import type { Accounting, Club, FinanceCategory, FinanceTotals, GameState, Player } from './types';
import { hash01 } from './world';

/**
 * Ekonomika je kalibrovaná podle české ligy (platy z médií, hodnoty z Transfermarktu).
 * Kluby mají při běžném provozu strukturální ztrátu kolem 12 % nákladů, kterou kryjí
 * prodeje hráčů (hlavně do zahraničí) nebo vklady majitele, stejně jako ve skutečnosti.
 */

const round1000 = (v: number) => Math.round(v / 1000) * 1000;

/** Velké kluby platí za stejnou kvalitu víc, nejnižší soutěže jsou poloprofesionální. */
export function clubPayFactor(reputation: number): number {
  if (reputation >= 70) return 1.3 + (reputation - 70) / 25;
  if (reputation >= 60) return 1.3;
  if (reputation >= 50) return 1 + ((reputation - 50) / 10) * 0.3;
  if (reputation >= 40) return 1;
  return 0.75;
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
  return round1000(baseWageBudget(club) * 0.06);
}

/** Typické měsíční výdaje na hráče včetně prémií (zhruba 45 bodů za sezónu). */
function typicalPlayerCosts(club: Club): number {
  return baseWageBudget(club) * 1.08 + (bonusPerPoint(club) * 45) / 12;
}

const HOME_GAMES_PER_SEASON = 15;

export function tvMonthly(tier: number): number {
  return tier === 1 ? 1_500_000 : tier === 2 ? 300_000 : 40_000;
}

/** Příjmy, které klub dostane bez ohledu na sponzory: TV, vstupné a odměna za průměrné umístění. */
/** Kapacita stadionu na začátku hry: investice do stadionu nemají snižovat běžné komerční příjmy. */
function baseCapacity(club: Club): number {
  return club.stadium.originalCapacity ?? club.stadium.capacity;
}

function baseIncome(club: Club, tier: number): number {
  const fans = Math.min(baseCapacity(club), baseAttendance(club.reputation, tier));
  const tickets = fans * defaultTicketPrice(tier) * HOME_GAMES_PER_SEASON;
  // Catering a VIP při běžném vybavení klubu této velikosti.
  const f = defaultFacilities(club.reputation, tier);
  const extras = (fans * CATERING_SPEND[f.catering] + f.vip * vipRate(tier)) * HOME_GAMES_PER_SEASON;
  return tvMonthly(tier) * 12 + tickets + extras + prizeMoney(tier, 8, 16);
}

/**
 * Měsíční provoz: zaměstnanci, akademie, stadion, cestování, zdravotní péče. Nejméně tolik,
 * aby běžné příjmy pokryly nejvýš 85 % nákladů (kluby utratí, co dostanou z TV a vstupného).
 */
function operatingBase(club: Club, tier: number): number {
  const wages = typicalPlayerCosts(club);
  const own = baseWageBudget(club) * 0.6 + baseCapacity(club) * 25 + 100_000;
  const floor = baseIncome(club, tier) / 0.85 / 12 - wages;
  return Math.max(own, floor);
}

/** Provoz včetně údržby rozšířeného stadionu a zázemí nad běžnou úroveň. */
export function operatingMonthly(club: Club, tier: number): number {
  const extraSeats = club.stadium.capacity - baseCapacity(club);
  return round1000(operatingBase(club, tier) + extraSeats * 25 + facilityUpkeepDelta(club, tier));
}

/** Typické roční náklady klubu (platy hráčů a vedení, provoz). Měřítko pro rozpočty a počáteční hotovost. */
export function annualCosts(club: Club, tier: number): number {
  return (typicalPlayerCosts(club) + operatingBase(club, tier)) * 12;
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

/**
 * Měsíční komerční příjmy (sponzoři, reklama, merch, catering). Spolu s ostatními příjmy pokryjí
 * zhruba 88 % běžných nákladů. Zbytek musí klub vydělat prodeji hráčů, lepším umístěním nebo vklady.
 */
export function commercialMonthly(club: Club, tier: number): number {
  const costs = annualCosts(club, tier);
  const rest = costs * 0.88 - baseIncome(club, tier);
  // Spokojení fanoušci kupují víc a sponzoři platí víc.
  const fans = 0.92 + 0.16 * ((club.fanMood ?? 50) / 100);
  const sponsor = club.sponsorDeal?.factor ?? 1;
  return round1000((Math.max(costs * 0.1, rest) / 12) * fans * sponsor);
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
  return { vstupne: 0, stadion: 0, tv: 0, komercni: 0, pohar: 0, ostatni: 0, uver: 0, platy: 0, vedeni: 0, provoz: 0, prestupy: 0, investice: 0, dane: 0, vklad: 0 };
}

export function book(state: GameState, clubId: string, category: FinanceCategory, amount: number, note: string): void {
  const club = state.clubs[clubId];
  if (!club) return;
  const value = Math.round(amount);
  club.finance.balance += value;
  club.finance.season[category] += value;
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
  provoz: 'Provoz, zaměstnanci, akademie',
  prestupy: 'Přestupy (odstupné, agenti)',
  pohar: 'Pohár (prémie za postup)',
  stadion: 'Catering, VIP a stadion',
  ostatni: 'Mimořádné příjmy a výdaje',
  investice: 'Investice do stadionu a zázemí',
  uver: 'Úvěr (čerpání a splátky)',
  dane: 'Daň z příjmů',
  vklad: 'Vklady majitele',
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
    { label: CATEGORY_LABEL.pohar, amount: totals.pohar },
    { label: CATEGORY_LABEL.ostatni, amount: totals.ostatni ?? 0 },
    { label: 'Zisk z prodeje hráčů', amount: acc.saleProfit },
  ];
  const costs = [
    { label: CATEGORY_LABEL.platy, amount: totals.platy },
    { label: CATEGORY_LABEL.vedeni, amount: totals.vedeni },
    { label: CATEGORY_LABEL.provoz, amount: totals.provoz },
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
  const debt = overdraft + loans;
  return {
    cash,
    registrations: Math.round(registrations),
    buildings: Math.round(buildings),
    overdraft,
    loans: Math.round(loans),
    debt: Math.round(debt),
    equity: Math.round(cash + registrations + buildings - debt),
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
  if (state.loans.length) return [];
  const yearly = annualCosts(club, 1);
  return [0.1, 0.25, 0.5].map((k) => Math.round((yearly * k) / 1_000_000) * 1_000_000).filter((v) => v > 0);
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

export function takeLoan(prev: GameState, amount: number): GameState {
  if (!loanOffers(prev).includes(amount) || prev.owner.ousted) return prev;
  if (!loanVotePasses(prev)) return prev;
  const state = structuredClone(prev);
  const payment = annuity(amount, LOAN_RATE, LOAN_MONTHS);
  state.loans.push({ id: `u${++state.nextId}`, principal: amount, remaining: amount, rate: LOAN_RATE, payment, monthsLeft: LOAN_MONTHS });
  book(state, state.owner.clubId, 'uver', amount, 'Čerpání úvěru od banky');
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
