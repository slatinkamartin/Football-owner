import { playerWage, wageBudgetMonthly } from './finance';
import { playerAge, squadOf } from './players';
import type { BonusScheme, GameState, Player, WageSection } from './types';
import { clamp } from './world';

/**
 * Mzdový rozpočet po sekcích. Strop pro platy hráčů se dělí do obálek (opory, základ, rotace, mladí).
 * Sportovní ředitel podepisuje a prodlužuje jen v rámci obálky sekce, kam hráč patří.
 */

export const WAGE_SECTIONS: WageSection[] = ['opory', 'zaklad', 'rotace', 'mladi'];
export const SECTION_LABEL: Record<WageSection, string> = {
  opory: 'Opory',
  zaklad: 'Základ sestavy',
  rotace: 'Rotace a doplněk',
  mladi: 'Mladí do 21 let',
};
export const SECTION_HINT: Record<WageSection, string> = {
  opory: '6 nejlepších hráčů kádru',
  zaklad: 'dalších 9 hráčů, kteří pravidelně hrají',
  rotace: 'zbytek kádru',
  mladi: 'hráči do 21 let mimo opory',
};
export const DEFAULT_SPLIT: Record<WageSection, number> = { opory: 0.42, zaklad: 0.33, rotace: 0.17, mladi: 0.08 };

/** Rozdělení, které pokryje současné platy v každé sekci; volné místo se rozdělí podle běžného poměru. */
export function suggestedSplit(state: GameState): Record<WageSection, number> {
  const club = state.clubs[state.owner.clubId];
  const sections = sectionsOf(state);
  const squad = squadOf(state, club.id);
  const bills = WAGE_SECTIONS.map((sec) => squad.filter((p) => sections.get(p.id) === sec).reduce((a, p) => a + p.wage, 0));
  const total = bills.reduce((a, b) => a + b, 0);
  const cap = Math.max(wageBudgetMonthly(club), total, 1);
  const free = cap - total;
  const raw = WAGE_SECTIONS.map((sec, i) => (bills[i] + free * DEFAULT_SPLIT[sec]) / cap);
  const sum = raw.reduce((a, b) => a + b, 0);
  return Object.fromEntries(WAGE_SECTIONS.map((sec, i) => [sec, Math.ceil((raw[i] / sum) * 1000) / 1000])) as Record<WageSection, number>;
}

export function wageSplit(state: GameState): Record<WageSection, number> {
  return state.clubs[state.owner.clubId].policy.wageSplit ?? DEFAULT_SPLIT;
}

/** Automatické zařazení podle pořadí v kádru a věku (ruční zařazení má přednost). */
export function sectionsOf(state: GameState, clubId = state.owner.clubId, extra?: Player): Map<string, WageSection> {
  const squad = [...squadOf(state, clubId), ...(extra ? [extra] : [])].sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id));
  const map = new Map<string, WageSection>();
  // Ručně zařazení hráči zabírají místa své sekce, ostatní se řadí podle pořadí.
  const manual = squad.filter((p) => p.wageSection && clubId === state.owner.clubId && p !== extra);
  for (const p of manual) map.set(p.id, p.wageSection!);
  let opory = manual.filter((p) => p.wageSection === 'opory').length;
  let zaklad = manual.filter((p) => p.wageSection === 'zaklad').length;
  squad.forEach((p) => {
    if (map.has(p.id)) return;
    if (opory < 6) {
      map.set(p.id, 'opory');
      opory++;
    }
    else if (playerAge(p, state.season) <= 21) map.set(p.id, 'mladi');
    else if (zaklad < 9) {
      map.set(p.id, 'zaklad');
      zaklad++;
    } else map.set(p.id, 'rotace');
  });
  return map;
}

export function sectionOf(state: GameState, p: Player): WageSection {
  return sectionsOf(state, p.clubId).get(p.id) ?? 'rotace';
}

export interface SectionUsage {
  section: WageSection;
  cap: number;
  bill: number;
  /** Platy hráčů, kterým smlouva pokračuje i příští sezónu. */
  continuing: number;
  /** Platy hráčů, kterým smlouva končí v létě. */
  expiring: number;
  room: number;
  players: number;
}

export function sectionUsage(state: GameState): SectionUsage[] {
  const club = state.clubs[state.owner.clubId];
  const cap = wageBudgetMonthly(club);
  const split = wageSplit(state);
  const sections = sectionsOf(state);
  const squad = squadOf(state, club.id);
  return WAGE_SECTIONS.map((section) => {
    const list = squad.filter((p) => sections.get(p.id) === section);
    const bill = list.reduce((a, p) => a + p.wage, 0);
    const continuing = list.filter((p) => p.contractUntil > state.season + 1).reduce((a, p) => a + p.wage, 0);
    const c = Math.round(cap * split[section]);
    return { section, cap: c, bill, continuing, expiring: bill - continuing, room: c - bill, players: list.length };
  });
}

/** Kolik místa zbývá v sekci, kam by hráč s daným platem přišel (záporné = přečerpání). */
export function sectionRoomFor(state: GameState, p: Player, wage: number): { section: WageSection; room: number } {
  const candidate = { ...p, clubId: state.owner.clubId, wageSection: undefined };
  const section = sectionsOf(state, state.owner.clubId, candidate).get(p.id) ?? 'rotace';
  const usage = sectionUsage(state).find((u) => u.section === section)!;
  const already = p.clubId === state.owner.clubId ? p.wage : 0;
  return { section, room: usage.room + already - wage };
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
  const sections = sectionsOf(state);
  const maxLower = Math.max(0, ...squad.filter((p) => sections.get(p.id) !== 'opory').map((p) => p.wage));
  const sorted = [...squad].sort((a, b) => a.wage - b.wage);
  const median = sorted[Math.floor(sorted.length / 2)]?.wage ?? 0;
  const star = sorted[sorted.length - 1];
  const envy = star && median > 0 && star.wage > median * 4;
  for (const p of squad) {
    const ratio = p.wage / Math.max(5_000, playerWage(p.overall, rep));
    let delta = ratio < 0.7 ? -4 : ratio < 0.85 ? -2 : ratio > 1.2 ? 1 : 0;
    if (sections.get(p.id) === 'opory' && p.wage < maxLower) delta -= 2;
    if (envy && p !== star && sections.get(p.id) === 'opory') delta -= 1;
    if (delta) p.morale = clamp(p.morale + delta, 0, 100);
  }
}

/** Upozornění na platovou hierarchii pro rozhraní. */
export function hierarchyIssues(state: GameState): string[] {
  const squad = squadOf(state, state.owner.clubId);
  const sections = sectionsOf(state);
  const out: string[] = [];
  const lower = squad.filter((p) => sections.get(p.id) !== 'opory').sort((a, b) => b.wage - a.wage)[0];
  const underpaid = squad.filter((p) => sections.get(p.id) === 'opory' && lower && p.wage < lower.wage);
  if (lower && underpaid.length) {
    out.push(`${underpaid.length} ${underpaid.length === 1 ? 'opora bere' : 'opory berou'} méně než ${lower.firstName} ${lower.lastName} z nižší sekce. V kabině to vadí.`);
  }
  const sorted = [...squad].sort((a, b) => a.wage - b.wage);
  const median = sorted[Math.floor(sorted.length / 2)]?.wage ?? 0;
  const star = sorted[sorted.length - 1];
  if (star && median > 0 && star.wage > median * 4) out.push(`${star.firstName} ${star.lastName} bere přes čtyřnásobek mediánu kádru. Ostatní opory mu to závidí.`);
  return out;
}

/** Ruční přeřazení hráče do mzdové sekce (undefined = automaticky podle role). */
export function setWageSection(prev: GameState, playerId: string, section?: WageSection): GameState {
  const p = prev.players[playerId];
  if (!p || p.clubId !== prev.owner.clubId) return prev;
  const state = structuredClone(prev);
  state.players[playerId].wageSection = section;
  return state;
}
