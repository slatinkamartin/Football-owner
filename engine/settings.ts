import type { ActionResult } from './staff';
import type { GameSettings, GameState } from './types';

/** Nastavení hry: kolik se toho děje, jak přísný je svaz a jak velkou roli hraje náhoda. */

export const DEFAULT_SETTINGS: GameSettings = {
  drama: 'bezne',
  strictness: 'bezna',
  randomness: 'bezna',
  stops: { decision: true, offer: true, offerMin: 0, injury: true, milestone: true },
};

export function settingsOf(state: GameState): GameSettings {
  const s = state.settings;
  return s ? { ...DEFAULT_SETTINGS, ...s, stops: { ...DEFAULT_SETTINGS.stops, ...s.stops } } : DEFAULT_SETTINGS;
}

/** Násobek četnosti situací a příběhů. */
export function dramaFactor(state: GameState): number {
  return { klid: 0.5, bezne: 1, drama: 1.6 }[settingsOf(state).drama];
}

/** Kolik situací k rozhodnutí může čekat najednou. */
export function maxOpenEvents(state: GameState): number {
  return { klid: 2, bezne: 3, drama: 4 }[settingsOf(state).drama];
}

/** Násobek pokut a sankcí svazu. */
export function strictnessFactor(state: GameState): number {
  return { mirna: 0.6, bezna: 1, prisna: 1.4 }[settingsOf(state).strictness];
}

/** Jak moc rozhoduje rozdíl v síle týmů (víc = méně náhody). */
export function decisiveness(state: GameState): number {
  return { nizka: 1.3, bezna: 1, vysoka: 0.75 }[settingsOf(state).randomness];
}

export function updateSettings(prev: GameState, patch: Partial<GameSettings>): ActionResult {
  const state = structuredClone(prev);
  const current = settingsOf(state);
  state.settings = { ...current, ...patch, stops: { ...current.stops, ...(patch.stops ?? {}) } };
  return { state, ok: true, message: 'Nastavení uloženo.' };
}
