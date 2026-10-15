import { del, get, set } from 'idb-keyval';
import { SAVE_VERSION, type GameState } from '../engine';

const KEY = 'majitel:ulozena-hra';

export async function loadGame(): Promise<{ game: GameState | null; outdated: boolean }> {
  try {
    const saved = await get<GameState>(KEY);
    if (!saved) return { game: null, outdated: false };
    return saved.version === SAVE_VERSION ? { game: saved, outdated: false } : { game: null, outdated: true };
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
  let data: GameState;
  try {
    data = JSON.parse(text) as GameState;
  } catch {
    throw new Error('Záloha není platný text uložené hry. Zkopírujte ji znovu celou.');
  }
  if (data?.version !== SAVE_VERSION || !data.clubs || !data.owner) throw new Error('Tohle není uložená hra Majitele.');
  return data;
}
