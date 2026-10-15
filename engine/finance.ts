import { squadQualityForReputation } from './players';
import type { Rng } from './rng';
import type { Club, FinanceCategory, FinanceTotals, GameState, Player } from './types';
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
function baseIncome(club: Club, tier: number): number {
  const tickets = Math.min(club.stadium.capacity, baseAttendance(club.reputation, tier)) * defaultTicketPrice(tier) * HOME_GAMES_PER_SEASON;
  return tvMonthly(tier) * 12 + tickets + prizeMoney(tier, 8, 16);
}

/**
 * Měsíční provoz: zaměstnanci, akademie, stadion, cestování, zdravotní péče. Nejméně tolik,
 * aby běžné příjmy pokryly nejvýš 85 % nákladů (kluby utratí, co dostanou z TV a vstupného).
 */
export function operatingMonthly(club: Club, tier: number): number {
  const wages = typicalPlayerCosts(club);
  const own = baseWageBudget(club) * 0.6 + club.stadium.capacity * 25 + 100_000;
  const floor = baseIncome(club, tier) / 0.85 / 12 - wages;
  return round1000(Math.max(own, floor));
}

/** Typické roční náklady klubu (platy hráčů a vedení, provoz). Měřítko pro rozpočty a počáteční hotovost. */
export function annualCosts(club: Club, tier: number): number {
  return (typicalPlayerCosts(club) + operatingMonthly(club, tier)) * 12;
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
  return round1000(Math.max(costs * 0.1, rest) / 12);
}

/** Výchozí rozpočet na odstupné: čtvrtina ročního mzdového rozpočtu. */
export function defaultTransferBudget(club: Club): number {
  return Math.round((baseWageBudget(club) * 12 * 0.25) / 100_000) * 100_000;
}

/** Návštěvnost domácího zápasu. */
export function matchAttendance(rng: Rng, home: Club, away: Club, tier: number, homeForm: number): number {
  const priceFactor = Math.pow(defaultTicketPrice(tier) / Math.max(home.policy.ticketPrice, 1), 0.8);
  const opponentFactor = 1 + (away.reputation - 50) / 200;
  const formFactor = 1 + homeForm * 0.2;
  const raw = baseAttendance(home.reputation, tier) * priceFactor * opponentFactor * formFactor * rng.normal(1, 0.08);
  return Math.max(50, Math.min(home.stadium.capacity, Math.round(raw)));
}

export function emptyTotals(): FinanceTotals {
  return { vstupne: 0, tv: 0, komercni: 0, platy: 0, vedeni: 0, provoz: 0, prestupy: 0, vklad: 0 };
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
  prestupy: 'Přestupy',
  vklad: 'Vklady majitele',
};
