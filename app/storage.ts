import { del, get, set } from 'idb-keyval';
import type { GameState } from '../engine';

const KEY = 'majitel:ulozena-hra';

export async function loadGame(): Promise<GameState | null> {
  try {
    const saved = await get<GameState>(KEY);
    return saved?.version === 1 ? saved : null;
  } catch {
    return null;
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

export function exportGame(state: GameState): void {
  const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `majitel-${state.clubs[state.owner.clubId].shortName}-${state.date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importGame(file: File): Promise<GameState> {
  const data = JSON.parse(await file.text()) as GameState;
  if (data?.version !== 1 || !data.clubs || !data.owner) throw new Error('Soubor není uložená hra Majitele.');
  return data;
}
