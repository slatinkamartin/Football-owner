import type { Rng } from './rng';
import type { Club, FinanceCategory, FinanceTotals, GameState } from './types';

/**
 * Ekonomika první verze je záměrně jednoduchá: z pověsti klubu se odvodí běžný roční obrat.
 * Při běžném hospodaření klub zhruba vyrovnaně hospodaří, rozdíly dělají výsledky,
 * návštěvnost a rozhodnutí majitele (ceny vstupenek, mzdový rozpočet, posily, vklady).
 */
export function annualRevenue(reputation: number): number {
  return 2_000_000 * Math.pow(1.065, reputation);
}

export function tvMonthly(tier: number): number {
  return tier === 1 ? 2_500_000 : tier === 2 ? 400_000 : 50_000;
}

export function defaultTicketPrice(tier: number): number {
  return tier === 1 ? 250 : tier === 2 ? 150 : 80;
}

/** Běžná návštěvnost při výchozí ceně (před omezením kapacitou). */
export function baseAttendance(reputation: number): number {
  return 150 * Math.pow(1.06, reputation);
}

const HOME_GAMES_PER_SEASON = 15;

/** Měsíční komerční příjmy (sponzoři, reklama, merch, catering), dopočtené tak, aby klub byl při běžném provozu vyrovnaný. */
export function commercialMonthly(club: Club, tier: number): number {
  const revenue = annualRevenue(club.reputation);
  const expectedTickets =
    Math.min(club.stadium.capacity, baseAttendance(club.reputation)) *
    defaultTicketPrice(tier) *
    HOME_GAMES_PER_SEASON;
  const rest = revenue - tvMonthly(tier) * 12 - expectedTickets;
  return Math.max(revenue * 0.1, rest) / 12;
}

export function wageBudgetMonthly(club: Club): number {
  return ((annualRevenue(club.reputation) * 0.6) / 12) * club.policy.wageMultiplier;
}

export function operatingMonthly(club: Club): number {
  return (annualRevenue(club.reputation) * 0.3) / 12 + club.stadium.capacity * 25;
}

export function defaultTransferBudget(club: Club): number {
  return Math.round((annualRevenue(club.reputation) * 0.05) / 100_000) * 100_000;
}

/** Návštěvnost domácího zápasu. */
export function matchAttendance(
  rng: Rng,
  home: Club,
  away: Club,
  tier: number,
  homeForm: number,
): number {
  const priceFactor = Math.pow(defaultTicketPrice(tier) / Math.max(home.policy.ticketPrice, 1), 0.8);
  const opponentFactor = 1 + (away.reputation - 50) / 200;
  const formFactor = 1 + homeForm * 0.2;
  const raw = baseAttendance(home.reputation) * priceFactor * opponentFactor * formFactor * rng.normal(1, 0.08);
  return Math.max(50, Math.min(home.stadium.capacity, Math.round(raw)));
}

export function emptyTotals(): FinanceTotals {
  return { vstupne: 0, tv: 0, komercni: 0, platy: 0, provoz: 0, prestupy: 0, vklad: 0 };
}

export function book(
  state: GameState,
  clubId: string,
  category: FinanceCategory,
  amount: number,
  note: string,
): void {
  const club = state.clubs[clubId];
  const value = Math.round(amount);
  club.finance.balance += value;
  club.finance.season[category] += value;
  if (clubId === state.owner.clubId) {
    club.finance.transactions.unshift({ date: state.date, category, amount: value, note });
    club.finance.transactions.length = Math.min(club.finance.transactions.length, 200);
  }
}

export const CATEGORY_LABEL: Record<FinanceCategory, string> = {
  vstupne: 'Vstupné',
  tv: 'TV práva a odměny soutěže',
  komercni: 'Sponzoři a komerční příjmy',
  platy: 'Platy hráčů',
  provoz: 'Provoz klubu a stadionu',
  prestupy: 'Přestupy',
  vklad: 'Vklady majitele',
};
