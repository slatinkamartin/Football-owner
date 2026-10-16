import { clamp } from './world';

/**
 * Jednotná škála 0–100 pro rozhraní. Hra uvnitř počítá s vlastními jednotkami
 * (známka 3–10, úroveň zázemí 1–5, domácí výhoda 3–8,6), hráč všude vidí 0–100.
 */
export function toScore(value: number, min: number, max: number): number {
  return clamp(Math.round(((value - min) / Math.max(1e-9, max - min)) * 100), 0, 100);
}

/** Známka hráče ze zápasu (interně 3–10 s desetinou) jako hodnocení 0–100. */
export function ratingScore(rating: number): number {
  return clamp(Math.round(rating * 10), 0, 100);
}

/** Úroveň zázemí (trénink, akademie, medicína 1–5, catering 0–3) jako 0–100. */
export function facilityScore(level: number, max: number): number {
  return toScore(level, 0, max);
}

/** Domácí prostředí v zápase (interně 3 až 8,6 bodu výhody) jako 0–100. */
export function homeEdgeScore(edge: number): number {
  return toScore(edge, 3, 8.6);
}

/** Vliv na sílu týmu (body hodnocení) se znaménkem pro texty. */
export function strengthDelta(v: number): string {
  return `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })}`;
}
