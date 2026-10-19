import { del, get, set } from 'idb-keyval';
import { migrateSave, type Career, type GameState, type RosterRow } from '../engine';

const KEY = 'majitel:ulozena-hra';

export async function loadGame(): Promise<{ game: GameState | null; outdated: boolean }> {
  try {
    const saved = await get<{ version: number } & Record<string, unknown>>(KEY);
    if (!saved) return { game: null, outdated: false };
    const game = migrateSave(saved);
    return { game, outdated: !game };
  } catch {
    return { game: null, outdated: false };
  }
}

export async function saveGame(state: GameState): Promise<void> {
  try {
    await set(KEY, state);
  } catch {
    // Prohlížeč může úložiště zakázat (anonymní okno). Hra běží dál, jen se neuloží.
  }
}

export async function deleteGame(): Promise<void> {
  try {
    await del(KEY);
  } catch {
    // Viz saveGame.
  }
}

export function serializeGame(state: GameState): string {
  return JSON.stringify(state);
}

export function parseGame(text: string): GameState {
  let data: { version: number } & Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Záloha není platný text uložené hry. Zkopírujte ji znovu celou.');
  }
  const game = data && typeof data.version === 'number' ? migrateSave(data) : null;
  if (!game || !game.clubs || !game.owner) throw new Error('Tohle není uložená hra Majitele, nebo je z příliš staré verze.');
  return game;
}

const CAREER_KEY = 'majitel:kariera';

/** Kariéra majitele mezi hrami (peníze, pověst, síň slávy). */
export function saveCareer(career: Career | null): void {
  try {
    if (career) localStorage.setItem(CAREER_KEY, JSON.stringify(career));
    else localStorage.removeItem(CAREER_KEY);
  } catch {
    // Bez úložiště kariéra nepokračuje, hra funguje dál.
  }
}

export function loadCareer(): Career | null {
  try {
    const raw = localStorage.getItem(CAREER_KEY);
    return raw ? (JSON.parse(raw) as Career) : null;
  } catch {
    return null;
  }
}

const ROSTERS_KEY = 'majitel:soupisky';

/** Vlastní soupisky z konfigurátoru (uložené v prohlížeči). */
export interface RosterSet {
  id: string;
  name: string;
  updated: string;
  rows: RosterRow[];
}

export async function listRosterSets(): Promise<RosterSet[]> {
  try {
    return ((await get<RosterSet[]>(ROSTERS_KEY)) ?? []).sort((a, b) => (a.updated < b.updated ? 1 : -1));
  } catch {
    return [];
  }
}

export async function saveRosterSet(set_: RosterSet): Promise<void> {
  const all = (await get<RosterSet[]>(ROSTERS_KEY).catch(() => undefined)) ?? [];
  await set(ROSTERS_KEY, [...all.filter((s) => s.id !== set_.id), set_]);
}

export async function deleteRosterSet(id: string): Promise<void> {
  const all = (await get<RosterSet[]>(ROSTERS_KEY).catch(() => undefined)) ?? [];
  await set(ROSTERS_KEY, all.filter((s) => s.id !== id));
}
