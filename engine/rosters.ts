import { setMarketWages } from './finance';
import { EU_COUNTRIES } from './names';
import { emptySeasonStats, newId, squadQualityForReputation } from './players';
import type { Club, GameState, Player, Position } from './types';
import { clamp, hash01 } from './world';

/**
 * Databáze skutečných soupisek (data/soupisky/hraci.csv). Jeden řádek = jeden hráč, oddělovač středník.
 * Hodnocení a potenciál se dopočítají z pověsti klubu, role v kádru a věku, pokud nejsou vyplněné ručně.
 */

export const ROSTER_COLUMNS = ['klub', 'jmeno', 'prijmeni', 'rok_narozeni', 'pozice', 'narodnost', 'role', 'hodnoceni', 'potencial', 'smlouva_do', 'zdroj'] as const;

export type RosterRole = 'zaklad' | 'rotace' | 'rezerva' | 'talent';

export interface RosterRow {
  club: string;
  firstName: string;
  lastName: string;
  birthYear: number;
  position: Position;
  nationality: string;
  role: RosterRole;
  overall?: number;
  potential?: number;
  contractUntil?: number;
}

const POSITIONS: Record<string, Position> = { BR: 'GK', OBR: 'DF', ZAL: 'MF', UT: 'FW', GK: 'GK', DF: 'DF', MF: 'MF', FW: 'FW' };
const ROLES: RosterRole[] = ['zaklad', 'rotace', 'rezerva', 'talent'];
const DOMESTIC = new Set(['česko', 'česká republika', 'cz', 'cze']);

export interface RosterParse {
  rows: RosterRow[];
  errors: string[];
}

/** Přečte CSV se soupiskami. Chybné řádky přeskočí a vrátí jejich popis. */
export function parseRosterCsv(text: string): RosterParse {
  const rows: RosterRow[] = [];
  const errors: string[] = [];
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const header = (lines[0] ?? '').split(';').map((h) => h.trim().toLowerCase());
  const col = (name: (typeof ROSTER_COLUMNS)[number]) => header.indexOf(name);
  for (const need of ['klub', 'jmeno', 'prijmeni', 'rok_narozeni', 'pozice'] as const) {
    if (col(need) < 0) errors.push(`Chybí sloupec „${need}“.`);
  }
  if (errors.length) return { rows, errors };
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.startsWith('#')) continue;
    const cells = line.split(';').map((c) => c.trim());
    const get = (name: (typeof ROSTER_COLUMNS)[number]) => (col(name) >= 0 ? cells[col(name)] ?? '' : '');
    const where = `Řádek ${i + 1}`;
    const position = POSITIONS[get('pozice').toUpperCase()];
    const birthYear = Number(get('rok_narozeni'));
    const role = (get('role').toLowerCase() || 'rotace') as RosterRole;
    const num = (name: 'hodnoceni' | 'potencial' | 'smlouva_do') => {
      const v = get(name);
      return v ? Number(v) : undefined;
    };
    if (!get('klub') || !get('prijmeni')) errors.push(`${where}: chybí klub nebo příjmení.`);
    else if (!position) errors.push(`${where}: neznámá pozice „${get('pozice')}“ (BR, OBR, ZAL, UT).`);
    else if (!Number.isInteger(birthYear) || birthYear < 1970 || birthYear > 2015) errors.push(`${where}: rok narození „${get('rok_narozeni')}“ nedává smysl.`);
    else if (!ROLES.includes(role)) errors.push(`${where}: neznámá role „${role}“ (zaklad, rotace, rezerva, talent).`);
    else if ([num('hodnoceni'), num('potencial'), num('smlouva_do')].some((v) => v !== undefined && !Number.isFinite(v))) errors.push(`${where}: hodnocení, potenciál a konec smlouvy musí být čísla.`);
    else {
      rows.push({
        club: get('klub'),
        firstName: get('jmeno'),
        lastName: get('prijmeni'),
        birthYear,
        position,
        nationality: get('narodnost') || 'Česko',
        role,
        overall: num('hodnoceni'),
        potential: num('potencial'),
        contractUntil: num('smlouva_do'),
      });
    }
  }
  return { rows, errors };
}

/** Soupisky podle klubů. */
export function rostersByClub(rows: RosterRow[]): Map<string, RosterRow[]> {
  const map = new Map<string, RosterRow[]>();
  for (const r of rows) map.set(r.club, [...(map.get(r.club) ?? []), r]);
  return map;
}

const ROLE_ADJ: Record<RosterRole, number> = { zaklad: 4, rotace: 0, rezerva: -5, talent: -3 };

/** Hodnocení hráče ze soupisky: úroveň klubu, role v kádru a věk; malý rozptyl podle jména. */
export function rosterRating(row: RosterRow, reputation: number, season: number): { overall: number; potential: number } {
  const age = season - row.birthYear;
  const base = squadQualityForReputation(reputation);
  const ageAdj = age < 21 ? -(21 - age) * 1.5 : age > 32 ? -(age - 32) * 1.5 : 0;
  const noise = (hash01(`${row.firstName} ${row.lastName} ${row.birthYear}`) - 0.5) * 6;
  const overall = Math.round(clamp(row.overall ?? base + ROLE_ADJ[row.role] + ageAdj + noise, 25, 92));
  const growth = age < 24 ? (24 - age) * 2.2 + (row.role === 'talent' ? 4 : 0) + hash01(`${row.lastName}-pot`) * 4 : hash01(`${row.lastName}-pot`) * 2;
  const potential = Math.round(clamp(row.potential ?? overall + growth, overall, 95));
  return { overall, potential };
}

/** Hráč ze soupisky do hry. */
export function rosterPlayer(state: GameState, club: Club, row: RosterRow): Player {
  const { overall, potential } = rosterRating(row, club.reputation, state.season);
  const domestic = DOMESTIC.has(row.nationality.toLowerCase());
  const contract = row.contractUntil && row.contractUntil > state.season ? row.contractUntil : state.season + 1 + Math.floor(hash01(`${row.lastName}-smlouva`) * 3);
  return {
    id: newId(state, 'p'),
    firstName: row.firstName,
    lastName: row.lastName,
    birthYear: row.birthYear,
    position: row.position,
    overall,
    potential,
    clubId: club.id,
    wage: 0,
    contractUntil: contract,
    ...emptySeasonStats(),
    fitness: 100,
    suspension: 0,
    morale: 60,
    recent: [],
    career: [],
    transfers: [],
    ...(domestic ? {} : { nationality: row.nationality, nonEu: !EU_COUNTRIES.has(row.nationality) }),
  };
}

/** Naplní kádr klubu ze soupisky. Vrací false, když klub v databázi není. */
export function fillFromRoster(state: GameState, club: Club, rows: RosterRow[] | undefined): boolean {
  if (!rows?.length) return false;
  const squad = rows.map((r) => rosterPlayer(state, club, r));
  for (const p of squad) state.players[p.id] = p;
  setMarketWages(squad, club);
  return true;
}
