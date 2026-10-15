import { finalStandings } from './competitions';
import { playerAge } from './players';
import type { Rng } from './rng';
import { playerValue } from './transfers';
import type { GameState } from './types';
import { addNews, clamp, competitionOf, FREE } from './world';

/**
 * Vývoj hráčů probíhá průběžně po měsících: mladí rostou k potenciálu (rychleji, když hrají
 * a mají dobrého trenéra), hráči kolem třicítky stagnují, starší pomalu ztrácejí.
 */
export function expectedYearlyChange(age: number): number {
  if (age <= 20) return 3;
  if (age <= 23) return 2;
  if (age <= 27) return 0.6;
  if (age <= 29) return 0;
  if (age <= 31) return -1;
  if (age <= 33) return -2;
  return -3.5;
}

function monthsIntoSeason(date: string): number {
  const m = Number(date.slice(5, 7));
  return m >= 7 ? m - 7 : m + 5;
}

export function monthlyDevelopment(state: GameState, rng: Rng): void {
  const boosted = new Set(
    Object.values(state.staff)
      .filter((s) => s.role === 'trener' && s.clubId !== FREE && (s.youthFocus || s.ability >= 70))
      .map((s) => s.clubId),
  );
  const months = Math.max(1, monthsIntoSeason(state.date));
  for (const p of Object.values(state.players)) {
    const age = playerAge(p, state.season);
    let yearly = expectedYearlyChange(age);
    if (yearly > 0) {
      // Mladý hráč se rozvíjí hlavně v zápasech.
      const share = Math.min(1, p.minutes / (months * 300));
      yearly *= 0.6 + 0.8 * share;
      if (boosted.has(p.clubId)) yearly *= 1.2;
      // Tréninkové centrum: úroveň 2 je běžná, každá úroveň navíc přidá 10 %.
      yearly *= 0.8 + 0.1 * (state.clubs[p.clubId]?.facilities?.training ?? 2);
      if (p.overall >= p.potential) yearly = 0;
    }
    if (yearly !== 0 && rng.chance(Math.min(1, Math.abs(yearly) / 12))) {
      p.overall = clamp(p.overall + Math.sign(yearly), 15, yearly > 0 ? p.potential : 99);
    }
    // Morálka se pomalu vrací k normálu.
    p.morale = clamp(p.morale + (60 - p.morale) * 0.1, 0, 100);
  }
}

/** Měsíční záznam hodnocení a hodnoty pro hráče klubu majitele (graf vývoje v kartě hráče). */
export function recordTrend(state: GameState): void {
  for (const p of Object.values(state.players)) {
    if (p.clubId !== state.owner.clubId) continue;
    p.trend = [...(p.trend ?? []), { date: state.date, overall: p.overall, value: playerValue(state, p) }].slice(-36);
  }
}

/** Nespokojení hráči klubu majitele se ozvou (nejvýš jednou za dva měsíce). */
export function moraleNews(state: GameState): void {
  const squad = Object.values(state.players).filter((p) => p.clubId === state.owner.clubId);
  const median = [...squad].sort((a, b) => b.overall - a.overall)[Math.floor(squad.length / 2)]?.overall ?? 0;
  for (const p of squad) {
    if (p.morale >= 25 || p.overall < median) continue;
    if (p.complainedAt && p.complainedAt > shiftMonths(state.date, -2)) continue;
    p.complainedAt = state.date;
    addNews(state, {
      kind: 'varovani',
      title: `${p.firstName} ${p.lastName} je nespokojený`,
      text: 'Málo hraje a zvažuje odchod. Smlouvu teď neprodlouží a nabídky z jiných klubů vítá.',
      playerId: p.id,
    });
  }
}

function shiftMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** Konec sezóny: zapsat sezónu do kariéry každého hráče, který hrál nebo má klub. */
export function recordCareers(state: GameState): void {
  const compName = new Map<string, string>();
  for (const comp of Object.values(state.competitions)) for (const id of comp.clubIds) compName.set(id, comp.name);
  for (const p of Object.values(state.players)) {
    if (p.clubId === FREE && p.apps === 0) continue;
    p.career = [
      ...p.career,
      {
        season: state.season,
        club: p.clubId === FREE ? 'bez klubu' : state.clubs[p.clubId].shortName,
        competition: compName.get(p.clubId) ?? '',
        apps: p.apps,
        goals: p.goals,
        assists: p.assists,
        minutes: p.minutes,
        avgRating: p.ratingCount ? Math.round((p.ratingSum / p.ratingCount) * 100) / 100 : undefined,
        overall: p.overall,
        value: playerValue(state, p),
      },
    ].slice(-20);
  }
}

/** Pozice klubu majitele po zápase (pro graf průběhu sezóny). */
export function recordTimeline(state: GameState, round: number): void {
  const comp = competitionOf(state, state.owner.clubId);
  if (!comp) return;
  const table = finalStandings(comp, state);
  const i = table.findIndex((r) => r.clubId === state.owner.clubId);
  if (i < 0) return;
  state.timeline = [...state.timeline.filter((t) => t.round !== round), { round, date: state.date, position: i + 1, points: table[i].points }];
}
