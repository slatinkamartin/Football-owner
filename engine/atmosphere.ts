import { squadOf } from './players';
import { coachOf } from './staff';
import type { Club, GameState } from './types';
import { clamp } from './world';

/**
 * Lidský faktor na hřišti: domácí prostředí (zaplněný stadion a nálada fanoušků),
 * motivace trenéra (jeho důvěra v majitele) a nálada v kabině (průměrná morálka opor).
 */

/**
 * Domácí výhoda v bodech síly: poloprázdný stadion a naštvaní fanoušci asi 4, běžně kolem 6,
 * vyprodaný kotel a nadšení fanoušci přes 8 (domácí pak dávají asi o třetinu víc gólů).
 */
export function homeAdvantage(club: Club, attendance: number, capacity: number): number {
  const fill = capacity > 0 ? clamp(attendance / capacity, 0, 1) : 0.5;
  return 3 + 3.2 * fill + 2.4 * ((club.fanMood ?? 50) / 100);
}

/** Běžná domácí výhoda (70% zaplnění, nálada 50) pro srovnání v rozhraní. */
export const TYPICAL_HOME_ADVANTAGE = 3 + 3.2 * 0.7 + 1.2;

/** Motivace trenéra podle jeho důvěry v majitele: od −2 (vztah na bodu mrazu) do +0,75. */
export function coachMotivation(state: GameState): number {
  if (!coachOf(state, state.owner.clubId)) return 0;
  return clamp((state.owner.trust.trener - 55) / 20, -2, 0.75);
}

/** Nálada v kabině: průměrná morálka 16 nejlepších hráčů a její vliv na sílu týmu. */
export function dressingRoom(state: GameState, clubId = state.owner.clubId): { morale: number; bonus: number; label: string } {
  const core = squadOf(state, clubId).sort((a, b) => b.overall - a.overall).slice(0, 16);
  const morale = core.length ? core.reduce((a, p) => a + (p.morale ?? 60), 0) / core.length : 60;
  const bonus = morale < 35 ? -1.5 : morale < 45 ? -0.75 : morale > 72 ? 0.5 : 0;
  const label = morale < 35 ? 'rozpadlá kabina' : morale < 45 ? 'napjatá' : morale > 72 ? 'skvělá parta' : 'v pořádku';
  return { morale, bonus, label };
}

/** Celkový vliv lidí na sílu týmu majitele (motivace trenéra a kabina). */
export function ownTeamSpirit(state: GameState): number {
  return coachMotivation(state) + dressingRoom(state).bonus;
}
