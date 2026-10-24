/**
 * v0.29 (W2 kalibrace): sdílené tlumení zisků vztahů a důvěry.
 * Pod hranicí (knee, ~80) platí zisk naplno, nad ní se zmenšuje (u 100 skoro na nulu),
 * takže hodnoty nad ~85 drží jen dlouhodobý úspěch. Ztráty se netlumí.
 */
export const EASE_KNEE = 80;

export function easeGain(cur: number, delta: number, knee = EASE_KNEE): number {
  if (!(delta > 0)) return delta;
  const below = Math.max(0, Math.min(delta, knee - cur));
  const above = delta - below;
  if (above <= 0) return below;
  const at = Math.max(cur, knee);
  return below + above * Math.max(0.05, (100 - at) / (100 - knee)) * 0.5;
}

/** Přičte delta s tlumením zisku a ořízne na 0–100. */
export function easeAdd(cur: number, delta: number, knee = EASE_KNEE): number {
  return Math.max(0, Math.min(100, cur + easeGain(cur, delta, knee)));
}
