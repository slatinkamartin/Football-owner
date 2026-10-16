import type { Club, Facilities } from './types';
import { clamp } from './world';

/** Výchozí vybavení klubu podle jeho velikosti (velké kluby mají lepší zázemí). */
export function defaultFacilities(reputation: number, tier: number): Facilities {
  const level = clamp(Math.round(reputation / 20), 1, 5);
  return {
    vip: reputation >= 85 ? 24 : reputation >= 70 ? 12 : reputation >= 55 ? 6 : reputation >= 45 ? 2 : 0,
    catering: reputation >= 80 ? 3 : reputation >= 60 ? 2 : reputation >= 40 ? 1 : 0,
    heating: tier === 1 || reputation >= 60,
    training: level,
    academy: level,
    medical: level,
  };
}

const TRAINING_UPKEEP = [0, 100_000, 250_000, 500_000, 900_000, 1_500_000];
const ACADEMY_UPKEEP = [0, 80_000, 200_000, 400_000, 700_000, 1_100_000];
const MEDICAL_UPKEEP = [0, 50_000, 120_000, 250_000, 400_000, 600_000];
/** Útrata diváka za občerstvení a suvenýry podle úrovně cateringu. */
export const CATERING_SPEND = [20, 45, 70, 100];

/** Ceny provozu zázemí podle soutěže (v nižších soutěžích jsou mzdy i energie levnější). */
const UPKEEP_SCALE: Record<number, number> = { 1: 0.8, 2: 0.35, 3: 0.12 };

/** Měsíční provoz zázemí. */
export function facilityUpkeep(f: Facilities, tier = 1): number {
  const k = UPKEEP_SCALE[Math.min(3, Math.max(1, tier))];
  return Math.round((TRAINING_UPKEEP[f.training] + ACADEMY_UPKEEP[f.academy] + MEDICAL_UPKEEP[f.medical] + f.vip * 10_000 + f.catering * 30_000 + (f.heating ? 60_000 : 0)) * k);
}

/** O kolik dražší (nebo levnější) je provoz zázemí proti běžnému pro klub této velikosti. */
export function facilityUpkeepDelta(club: Club, tier: number): number {
  return facilityUpkeep(club.facilities, tier) - facilityUpkeep(defaultFacilities(club.reputation, tier), tier);
}

export function vipRate(tier: number): number {
  return tier === 1 ? 40_000 : tier === 2 ? 12_000 : 4_000;
}

/** Příjmy ze zápasu kromě vstupného: catering, fanshop a VIP skyboxy. */
export function matchdayExtras(club: Club, attendance: number, tier: number): number {
  // Cenová úroveň cateringu a VIP (jen klub majitele ji mění).
  const price = club.policy?.cateringPrice === 'nizka' ? 0.8 : club.policy?.cateringPrice === 'vysoka' ? 1.2 : 1;
  return (attendance * CATERING_SPEND[club.facilities.catering] + club.facilities.vip * vipRate(tier)) * price;
}

