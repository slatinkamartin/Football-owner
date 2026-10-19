import { playerWage, wageBudgetMonthly } from './finance';
import { squadOf } from './players';
import type { BonusScheme, GameState, Player } from './types';
import { clamp } from './world';

/**
 * Mzdový rozpočet: jeden strop pro platy celého kádru. Sportovní ředitel podepisuje a prodlužuje,
 * jen dokud se platy vejdou pod strop.
 */

/** Opory kádru: šest nejlepších hráčů (pro platovou hierarchii v kabině). */
export function coreIds(state: GameState, clubId = state.owner.clubId): Set<string> {
  const squad = [...squadOf(state, clubId)].sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id));
  return new Set(squad.slice(0, 6).map((p) => p.id));
}

export interface WageUsage {
  cap: number;
  bill: number;
  /** Platy hráčů, kterým smlouva pokračuje i příští sezónu. */
  continuing: number;
  /** Platy hráčů, kterým smlouva končí v létě. */
  expiring: number;
  room: number;
  players: number;
}

/** Čerpání mzdového rozpočtu klubu majitele. */
export function wageUsage(state: GameState): WageUsage {
  const club = state.clubs[state.owner.clubId];
  const cap = wageBudgetMonthly(club);
  const squad = squadOf(state, club.id);
  const bill = squad.reduce((a, p) => a + p.wage, 0);
  const continuing = squad.filter((p) => p.contractUntil > state.season + 1).reduce((a, p) => a + p.wage, 0);
  return { cap, bill, continuing, expiring: bill - continuing, room: cap - bill, players: squad.length };
}

/** Kolik místa v mzdovém rozpočtu zbude, když hráč bude brát daný plat (záporné = přečerpání). */
export function wageRoomFor(state: GameState, p: Player, wage: number): number {
  const already = p.clubId === state.owner.clubId ? p.wage : 0;
  return wageUsage(state).room + already - wage;
}

/** Závazky z podepsaných smluv na příští sezóny (roční platy). */
export function wageCommitments(state: GameState, years = 3): { season: number; amount: number; players: number }[] {
  const squad = squadOf(state, state.owner.clubId);
  return Array.from({ length: years }, (_, k) => {
    const season = state.season + 1 + k;
    const list = squad.filter((p) => p.contractUntil > season);
    return { season, amount: list.reduce((a, p) => a + p.wage, 0) * 12, players: list.length };
  });
}

// ---------- Systém prémií ----------

export const BONUS_LABEL: Record<BonusScheme, string> = {
  fixni: 'Vyšší pevné platy, malé prémie',
  vyvazeny: 'Vyvážený',
  vykonovy: 'Nižší pevné platy, vysoké prémie',
};
export const BONUS_HINT: Record<BonusScheme, string> = {
  fixni: 'Prémie za body poloviční, hráči chtějí o 5 % vyšší plat. Klid v kabině, menší výkyvy nákladů.',
  vyvazeny: 'Běžné prémie za body a za splnění cíle.',
  vykonovy: 'Prémie za body 1,8× a dvojnásobná za cíl, hráči se spokojí s o 8 % nižším platem a víc táhnou (+0,4 síly). Při úspěchu dražší.',
};

export function bonusScheme(state: GameState): BonusScheme {
  return state.clubs[state.owner.clubId]?.policy.bonusScheme ?? 'vyvazeny';
}

/** Násobek prémií za body podle systému (jen klub majitele). */
export function pointsBonusFactor(state: GameState, clubId: string): number {
  if (clubId !== state.owner.clubId) return 1;
  return { fixni: 0.5, vyvazeny: 1, vykonovy: 1.8 }[bonusScheme(state)];
}

/** Prémie za splnění cíle sezóny (násobek prémie za bod). */
export function goalBonusPoints(state: GameState): number {
  return { fixni: 5, vyvazeny: 10, vykonovy: 20 }[bonusScheme(state)];
}

/** Jak systém prémií mění platové nároky nových a prodlužovaných smluv. */
export function schemeWageFactor(state: GameState, clubId: string): number {
  if (clubId !== state.owner.clubId) return 1;
  return { fixni: 1.05, vyvazeny: 1, vykonovy: 0.92 }[bonusScheme(state)];
}

export function schemeSpirit(state: GameState): number {
  return bonusScheme(state) === 'vykonovy' ? 0.4 : 0;
}

/**
 * Měsíčně: spokojenost s platem proti trhu a platová hierarchie v kabině
 * (opora, která bere méně než hráč z rotace, ztrácí chuť; extrémní plat jedné hvězdy budí závist).
 */
export function wageMorale(state: GameState): void {
  const own = state.owner.clubId;
  const rep = state.clubs[own].reputation;
  const squad = squadOf(state, own);
  const core = coreIds(state);
  const maxLower = Math.max(0, ...squad.filter((p) => !core.has(p.id)).map((p) => p.wage));
  const sorted = [...squad].sort((a, b) => a.wage - b.wage);
  const median = sorted[Math.floor(sorted.length / 2)]?.wage ?? 0;
  const star = sorted[sorted.length - 1];
  const envy = star && median > 0 && star.wage > median * 4;
  for (const p of squad) {
    const ratio = p.wage / Math.max(5_000, playerWage(p.overall, rep));
    let delta = ratio < 0.7 ? -4 : ratio < 0.85 ? -2 : ratio > 1.2 ? 1 : 0;
    if (core.has(p.id) && p.wage < maxLower) delta -= 2;
    if (envy && p !== star && core.has(p.id)) delta -= 1;
    if (delta) p.morale = clamp(p.morale + delta, 0, 100);
  }
}

/** Upozornění na platovou hierarchii pro rozhraní. */
export function hierarchyIssues(state: GameState): string[] {
  const squad = squadOf(state, state.owner.clubId);
  const core = coreIds(state);
  const out: string[] = [];
  const lower = squad.filter((p) => !core.has(p.id)).sort((a, b) => b.wage - a.wage)[0];
  const underpaid = squad.filter((p) => core.has(p.id) && lower && p.wage < lower.wage);
  if (lower && underpaid.length) {
    out.push(`${underpaid.length} ${underpaid.length === 1 ? 'opora bere' : 'opory berou'} méně než ${lower.firstName} ${lower.lastName}, který mezi opory nepatří. V kabině to vadí.`);
  }
  const sorted = [...squad].sort((a, b) => a.wage - b.wage);
  const median = sorted[Math.floor(sorted.length / 2)]?.wage ?? 0;
  const star = sorted[sorted.length - 1];
  if (star && median > 0 && star.wage > median * 4) out.push(`${star.firstName} ${star.lastName} bere přes čtyřnásobek mediánu kádru. Ostatní opory mu to závidí.`);
  return out;
}
