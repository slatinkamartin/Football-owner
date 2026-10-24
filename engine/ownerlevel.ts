import type { GameState } from './types';

/**
 * V1 (A9): Pověst majitele v úrovních. Zkušenosti (XP) sbírá majitel akcemi podle svých priorit měsíce, osobními schůzkami, splněnými projekty
 * a úspěchy v síni slávy. Úrovně odemykají větší sponzory, zahraniční kontakty, lepší trenéry a 4. prioritu měsíce (od 3. úrovně).
 */

export type OwnerUnlock = 'sponzori' | 'slot4' | 'zahranici' | 'treneri' | 'legenda';

interface LevelDef {
  xp: number;
  title: string;
  unlocks: OwnerUnlock[];
}

export const OWNER_LEVELS: LevelDef[] = [
  { xp: 0, title: 'Nováček v kanceláři', unlocks: [] },
  { xp: 40, title: 'Místní podnikatel', unlocks: ['sponzori'] },
  { xp: 110, title: 'Uznávaný majitel', unlocks: ['slot4'] },
  { xp: 200, title: 'Respektovaný předseda', unlocks: ['zahranici'] },
  { xp: 320, title: 'Fotbalový patriarcha', unlocks: ['treneri'] },
  { xp: 480, title: 'Legenda klubu', unlocks: ['legenda'] },
];

export const UNLOCK_LABEL: Record<OwnerUnlock, string> = {
  sponzori: 'Větší sponzoři: oběd se sponzorem může přinést prémiovou nabídku',
  slot4: '4. priorita měsíce (vedení se věnuje čtyřem oblastem)',
  zahranici: 'Zahraniční kontakty: skautské cesty i za hráči v cizině',
  treneri: 'Lepší trenéři a ředitelé ochotní přijít (o 5 bodů výš)',
  legenda: 'Legenda: odměny za strategické projekty o polovinu vyšší',
};

/** XP za jednotlivé zdroje. */
export const XP = { agenda: 1, project: 40, request: 1 } as const;

export function ownerXpTotal(state: GameState): number {
  const legacy = (state.trophies ?? []).reduce((a, t) => a + t.points, 0);
  return Math.round((state.ownerXp ?? 0) + legacy * 3);
}

export function addOwnerXp(state: GameState, amount: number): void {
  state.ownerXp = Math.max(0, (state.ownerXp ?? 0) + amount);
}

export interface OwnerLevelView {
  level: number;
  title: string;
  xp: number;
  /** XP potřebné pro další úroveň (undefined = nejvyšší úroveň). */
  next?: number;
  unlocked: string[];
  nextUnlocks: string[];
}

export function ownerLevel(state: GameState): OwnerLevelView {
  const xp = ownerXpTotal(state);
  let i = 0;
  while (i + 1 < OWNER_LEVELS.length && xp >= OWNER_LEVELS[i + 1].xp) i++;
  const nextDef = OWNER_LEVELS[i + 1];
  return {
    level: i + 1,
    title: OWNER_LEVELS[i].title,
    xp,
    next: nextDef?.xp,
    unlocked: OWNER_LEVELS.slice(0, i + 1).flatMap((l) => l.unlocks.map((u) => UNLOCK_LABEL[u])),
    nextUnlocks: nextDef ? nextDef.unlocks.map((u) => UNLOCK_LABEL[u]) : [],
  };
}

export function hasUnlock(state: GameState, u: OwnerUnlock): boolean {
  const xp = ownerXpTotal(state);
  return OWNER_LEVELS.some((l) => l.unlocks.includes(u) && xp >= l.xp);
}

/** O kolik bodů schopností výš jsou lidé ochotní do klubu přijít (úroveň „treneri“). */
export function staffPull(state: GameState): number {
  return hasUnlock(state, 'treneri') ? 5 : 0;
}
