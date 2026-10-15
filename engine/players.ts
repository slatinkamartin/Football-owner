import { FIRST_NAMES, LAST_NAMES } from './names';
import type { Rng } from './rng';
import type { GameState, Player, Position } from './types';

/** Složení kádru: brankáři, obránci, záložníci, útočníci. */
export const SQUAD_SHAPE: Record<Position, number> = { GK: 3, DF: 8, MF: 8, FW: 5 };
/** Základní sestava 4-4-2, ze které trenér skládá jedenáctku. */
const LINEUP_SHAPE: Record<Position, number> = { GK: 1, DF: 4, MF: 4, FW: 2 };

export const POSITION_LABEL: Record<Position, string> = {
  GK: 'Brankář',
  DF: 'Obránce',
  MF: 'Záložník',
  FW: 'Útočník',
};

export const POSITION_SHORT: Record<Position, string> = { GK: 'BR', DF: 'OBR', MF: 'ZÁL', FW: 'ÚT' };

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** Průměrná kvalita kádru, kterou si klub s danou pověstí běžně může dovolit. */
export function squadQualityForReputation(reputation: number): number {
  return 25 + reputation * 0.5;
}

export function newId(state: Pick<GameState, 'nextId'>, prefix: string): string {
  state.nextId += 1;
  return `${prefix}${state.nextId}`;
}

export function generatePlayer(
  rng: Rng,
  state: Pick<GameState, 'nextId'>,
  opts: { clubId: string; position: Position; season: number; quality: number; age?: number },
): Player {
  const age = opts.age ?? rng.int(18, 33);
  // Mladší hráči jsou o něco slabší, ale mají prostor růst.
  const ageAdj = age < 21 ? -(21 - age) * 2 : age > 31 ? -(age - 31) * 1.5 : 0;
  const overall = Math.round(clamp(rng.normal(opts.quality + ageAdj, 5), 20, 95));
  const growth = age < 24 ? Math.max(0, rng.normal((24 - age) * 2.2, 3)) : rng.int(0, 2);
  return {
    id: newId(state, 'p'),
    firstName: rng.pick(FIRST_NAMES),
    lastName: rng.pick(LAST_NAMES),
    birthYear: opts.season - age,
    position: opts.position,
    overall,
    potential: Math.round(clamp(overall + growth, overall, 97)),
    clubId: opts.clubId,
    wage: 0,
    contractUntil: opts.season + rng.int(1, 4),
    goals: 0,
    apps: 0,
  };
}

export function generateSquad(
  rng: Rng,
  state: Pick<GameState, 'nextId'>,
  clubId: string,
  season: number,
  quality: number,
): Player[] {
  const squad: Player[] = [];
  for (const pos of Object.keys(SQUAD_SHAPE) as Position[]) {
    for (let i = 0; i < SQUAD_SHAPE[pos]; i++) {
      squad.push(generatePlayer(rng, state, { clubId, position: pos, season, quality }));
    }
  }
  return squad;
}

export function playerAge(p: Player, season: number): number {
  return season - p.birthYear;
}

/** Jedenáctka, kterou by postavil trenér: nejlepší hráči podle pozic, chybějící místa doplní kdokoli. */
export function bestEleven(players: Player[]): Player[] {
  const byPos = (pos: Position) =>
    players.filter((p) => p.position === pos).sort((a, b) => b.overall - a.overall);
  const xi: Player[] = [];
  for (const pos of Object.keys(LINEUP_SHAPE) as Position[]) {
    xi.push(...byPos(pos).slice(0, LINEUP_SHAPE[pos]));
  }
  if (xi.length < 11) {
    const rest = players.filter((p) => !xi.includes(p)).sort((a, b) => b.overall - a.overall);
    xi.push(...rest.slice(0, 11 - xi.length));
  }
  return xi;
}

export function teamStrength(players: Player[]): number {
  const xi = bestEleven(players);
  if (xi.length === 0) return 20;
  const avg = xi.reduce((s, p) => s + p.overall, 0) / xi.length;
  // Chybějící hráči do jedenáctky výrazně oslabují tým.
  return avg - (11 - xi.length) * 4;
}

/** Orientační tržní hodnota v Kč. */
export function marketValue(p: Player, season: number): number {
  const age = playerAge(p, season);
  const base = 40_000 * Math.pow(1.11, p.overall - 30);
  const ageFactor = age <= 21 ? 1.5 : age <= 25 ? 1.3 : age <= 28 ? 1 : age <= 31 ? 0.6 : 0.3;
  const potentialFactor = 1 + Math.max(0, p.potential - p.overall) / 40;
  return Math.round((base * ageFactor * potentialFactor) / 10_000) * 10_000;
}

/** Rozdělí měsíční mzdový rozpočet mezi hráče podle jejich kvality. */
export function assignWages(players: Player[], monthlyBudget: number): void {
  const weights = players.map((p) => Math.pow(p.overall, 3));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  players.forEach((p, i) => {
    p.wage = Math.max(5_000, Math.round((monthlyBudget * weights[i]) / total / 1000) * 1000);
  });
}

export function squadOf(state: GameState, clubId: string): Player[] {
  return Object.values(state.players).filter((p) => p.clubId === clubId);
}

export function playersByClub(state: GameState): Map<string, Player[]> {
  const map = new Map<string, Player[]>();
  for (const p of Object.values(state.players)) {
    const list = map.get(p.clubId);
    if (list) list.push(p);
    else map.set(p.clubId, [p]);
  }
  return map;
}
