import type { Competition, GameState, NewsItem } from './types';

export const FREE = '';

export function competitionOf(state: GameState, clubId: string): Competition | undefined {
  return Object.values(state.competitions).find((c) => c.clubIds.includes(clubId));
}

export function tierOf(state: GameState, clubId: string): number {
  return competitionOf(state, clubId)?.tier ?? 4;
}

export function addNews(state: GameState, item: Omit<NewsItem, 'date'>): void {
  state.news.unshift({ date: state.date, ...item });
  state.news.length = Math.min(state.news.length, 300);
}

export function plural(n: number, one: string, few: string, many: string): string {
  return `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
}

export function clubLabel(state: GameState, id: string): string {
  if (id === FREE) return 'bez klubu';
  return state.clubs[id]?.shortName ?? id;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Deterministické číslo 0–1 z textu (např. pro skautskou nejistotu, která se nemění při každém překreslení). */
export function hash01(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/** Je otevřené přestupní okno? Léto 1. 7. – 31. 8., zima 8. 1. – 14. 2. */
export function transferWindow(date: string): 'leto' | 'zima' | null {
  const md = date.slice(5);
  if (md >= '07-01' && md <= '08-31') return 'leto';
  if (md >= '01-08' && md <= '02-14') return 'zima';
  return null;
}
