import { clamp } from './world';

/**
 * Škály pro rozhraní: většina hodnot je 0–100, známky ze zápasu 1–10 a zázemí v hvězdách.
 */
export function toScore(value: number, min: number, max: number): number {
  return clamp(Math.round(((value - min) / Math.max(1e-9, max - min)) * 100), 0, 100);
}

/** Známka hráče ze zápasu na škále 1–10 (s desetinou, průměr se dvěma desetinami). */
export function ratingText(rating: number, digits = 1): string {
  return rating.toLocaleString('cs-CZ', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Zázemí v hvězdách: trénink, akademie a medicína 1–5, catering (úroveň 0–3) 1–4. */
export function facilityStars(level: number, kind: 'catering' | 'other'): { stars: number; max: number } {
  return kind === 'catering' ? { stars: level + 1, max: 4 } : { stars: level, max: 5 };
}

/** Domácí prostředí v zápase (interně 3 až 8,6 bodu výhody) jako 0–100. */
export function homeEdgeScore(edge: number): number {
  return toScore(edge, 3, 8.6);
}

/** Vliv na sílu týmu (body hodnocení) se znaménkem pro texty. */
export function strengthDelta(v: number): string {
  return `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })}`;
}
