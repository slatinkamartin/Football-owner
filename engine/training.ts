import { addDays, formatShortDate } from './calendar';
import { playerAge, squadOf } from './players';
import type { Rng } from './rng';
import { coachOf, type ActionResult } from './staff';
import type { Fixture, GameState, Player } from './types';
import { clamp, hash01 } from './world';

/**
 * V1 (A8): Týdenní plán tréninku s trenérem. Majitel navrhne zaměření, intenzitu a šetření opor;
 * trenér poslechne podle důvěry (a povahy). Přijatý plán má reálný vliv na zápas (bonus síly v planEffect),
 * na kondici, zranění a rozvoj mladých. Návštěva tréninku z agendy zajistí, že se plán dodrží.
 */

export type TrainingFocus = 'souper' | 'kondice' | 'utok' | 'obrana' | 'mladi';
export type TrainingIntensity = 'nizka' | 'stredni' | 'vysoka';

export interface TrainingState {
  focus: TrainingFocus;
  intensity: TrainingIntensity;
  /** Šetřit opory (méně zátěže pro nejlepší hráče). */
  rest: boolean;
  /** Kdy majitel plán naposledy změnil. */
  set?: string;
  /** Přijal trenér plán? (bez plánu majitele trenér trénuje po svém) */
  accepted: boolean;
  /** Co přinesl poslední týden (pro shrnutí týdne). */
  lastWeek?: { date: string; lines: string[] };
}

export const TRAINING_OPTIONS = {
  focus: [
    { id: 'souper' as TrainingFocus, label: 'Na soupeře', hint: 'Příprava na příští zápas: síla v něm +0,6.' },
    { id: 'kondice' as TrainingFocus, label: 'Kondice', hint: 'Rychlejší regenerace (+10 kondice týdně), síla +0,2.' },
    { id: 'utok' as TrainingFocus, label: 'Útok', hint: 'Víc šancí: síla +0,4 (útočnější hra).' },
    { id: 'obrana' as TrainingFocus, label: 'Obrana', hint: 'Pevnější obrana: síla +0,4 (opatrnější hra).' },
    { id: 'mladi' as TrainingFocus, label: 'Mladí', hint: 'Hráči do 21 let se rychleji zlepšují, síla −0,3.' },
  ],
  intensity: [
    { id: 'nizka' as TrainingIntensity, label: 'Nízká', hint: 'Síla −0,3, téměř žádná zranění, kondice +5.' },
    { id: 'stredni' as TrainingIntensity, label: 'Střední', hint: 'Bez vlivu.' },
    { id: 'vysoka' as TrainingIntensity, label: 'Vysoká', hint: 'Síla +0,5, ale riziko zranění na tréninku (asi 1× za 5 týdnů).' },
  ],
  rest: { label: 'Šetřit opory', hint: 'Pět nejlepších hráčů trénuje méně: kondice +10, síla −0,2, menší riziko zranění.' },
};

const DEFAULT: TrainingState = { focus: 'kondice', intensity: 'stredni', rest: false, accepted: false };

export function trainingPlan(state: GameState): TrainingState & { acceptChance: number; owner: boolean } {
  const t = state.training ?? DEFAULT;
  return { ...t, acceptChance: acceptChance(state), owner: !!state.training?.set };
}

function acceptChance(state: GameState): number {
  const coach = coachOf(state, state.owner.clubId);
  if (!coach) return 1;
  return clamp(state.owner.trust.trener / 100 - (coach.ego - 10) / 40 + 0.25, 0.15, 0.97);
}

/** Návrh plánu trenérovi. Trenér ho přijme podle důvěry; odmítnutí ubere trochu důvěry, příště to jde znovu. */
export function setTrainingPlan(prev: GameState, patch: Partial<Pick<TrainingState, 'focus' | 'intensity' | 'rest'>>): ActionResult {
  if (prev.owner.ousted) return { state: prev, ok: false, message: 'Odvolaný majitel do tréninku nemluví.' };
  const cur = prev.training ?? DEFAULT;
  if (cur.set === prev.date && !cur.accepted) return { state: prev, ok: false, message: 'Trenér dnes plán už jednou odmítl. Zkuste to zítra nebo se přijďte podívat na trénink.' };
  const state = structuredClone(prev);
  const next: TrainingState = { ...cur, ...patch, set: state.date };
  const coach = coachOf(state, state.owner.clubId);
  const chance = acceptChance(state);
  const roll = hash01(`trenink-${state.date}-${next.focus}-${next.intensity}-${next.rest}`);
  next.accepted = !coach || roll < chance;
  state.training = next;
  const name = coach ? `Trenér ${coach.lastName}` : 'Asistent';
  if (!next.accepted) {
    state.owner.trust.trener = clamp(state.owner.trust.trener - 1, 0, 100);
    return { state, ok: true, message: `${name} plán vyslechl, ale trénuje po svém (šance na souhlas ${Math.round(chance * 100)} %). Návštěva tréninku z agendy ho přesvědčí.` };
  }
  return { state, ok: true, message: `${name} plán přijal: ${describePlan(next)}.` };
}

export function describePlan(t: Pick<TrainingState, 'focus' | 'intensity' | 'rest'>): string {
  const f = TRAINING_OPTIONS.focus.find((x) => x.id === t.focus)?.label ?? t.focus;
  const i = TRAINING_OPTIONS.intensity.find((x) => x.id === t.intensity)?.label ?? t.intensity;
  return `zaměření ${f.toLowerCase()}, intenzita ${i.toLowerCase()}${t.rest ? ', opory šetří' : ''}`;
}

/** Návštěva tréninku (agenda): trenér plán majitele dodrží. Vrací text výsledku. */
export function enforceTraining(state: GameState): string | undefined {
  const t = state.training;
  if (!t?.set || t.accepted) return undefined;
  t.accepted = true;
  return `Trenér na místě souhlasil s vaším plánem (${describePlan(t)}).`;
}

/** Bonus síly v zápase z přijatého plánu tréninku (volá matchday.planEffect). */
export function trainingMatchBonus(state: GameState, f?: Fixture): number {
  const t = state.training;
  if (!t?.set || !t.accepted) return 0;
  let b = 0;
  if (t.focus === 'souper') b += f && f.date <= addDays(t.set, 10) ? 0.6 : 0.2;
  if (t.focus === 'kondice') b += 0.2;
  if (t.focus === 'utok' || t.focus === 'obrana') b += 0.4;
  if (t.focus === 'mladi') b -= 0.3;
  if (t.intensity === 'vysoka') b += 0.5;
  if (t.intensity === 'nizka') b -= 0.3;
  if (t.rest) b -= 0.2;
  return b;
}

function core(state: GameState): Player[] {
  return [...squadOf(state, state.owner.clubId)].sort((a, b) => b.overall - a.overall).slice(0, 5);
}

/** Pondělí: dopady týdne tréninku (kondice, zranění, rozvoj mladých). */
export function weeklyTraining(state: GameState, rng?: Rng): void {
  const t = state.training;
  if (!t?.set || !t.accepted || state.owner.ousted) return;
  const lines: string[] = [];
  const squad = squadOf(state, state.owner.clubId).filter((p) => !(p.injuredUntil && p.injuredUntil >= state.date));
  if (t.focus === 'kondice' || t.intensity === 'nizka') {
    const add = (t.focus === 'kondice' ? 10 : 0) + (t.intensity === 'nizka' ? 5 : 0);
    for (const p of squad) p.fitness = Math.min(100, p.fitness + add);
    lines.push(`Kondice týmu +${add}`);
  }
  if (t.rest) {
    for (const p of core(state)) p.fitness = Math.min(100, p.fitness + 10);
    lines.push('Opory šetřené (kondice +10)');
  }
  if (t.focus === 'mladi') {
    const young = squad.filter((p) => playerAge(p, state.season) <= 21 && p.overall < p.potential);
    let up = 0;
    for (const p of young) {
      if (hash01(`mladi-${p.id}-${state.date}`) < 0.2) {
        p.overall += 1;
        up++;
      }
    }
    if (up) lines.push(`${up} ${up === 1 ? 'mladý hráč se zlepšil' : 'mladí hráči se zlepšili'} (+1)`);
  }
  if (t.intensity === 'vysoka') {
    const chance = t.rest ? 0.14 : 0.2;
    const roll = rng ? rng.next() : hash01(`zraneni-trenink-${state.date}`);
    if (roll < chance && squad.length) {
      const pool = t.rest ? squad.filter((p) => !core(state).includes(p)) : squad;
      const p = pool[Math.floor(hash01(`kdo-${state.date}`) * pool.length)];
      if (p) {
        const days = 5 + Math.floor(hash01(`dny-${state.date}`) * 12);
        p.injuredUntil = addDays(state.date, days);
        p.injury = 'lehké zranění';
        lines.push(`Na tréninku se zranil ${p.firstName} ${p.lastName} (do ${formatShortDate(p.injuredUntil)})`);
      }
    }
    for (const p of squad) p.morale = clamp(p.morale - 0.5, 0, 100);
  }
  t.lastWeek = { date: state.date, lines };
}
