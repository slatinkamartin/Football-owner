import { finalStandings } from './competitions';
import { playersByClub } from './players';
import { createRng, type Rng } from './rng';
import { clubStrength, coachOf, generateStaff, goalTarget, staffLevelForReputation } from './staff';
import { computeTable } from './standings';
import type { Competition, GameState, Player } from './types';
import { addNews, competitionOf, FREE, hash01 } from './world';

/**
 * Liga kolem majitele: rivalové a povahy soupeřů, výhled sezóny (šance na cíl),
 * zpravodaj kola a poznámky k vývoji tabulky.
 */

// ---------- Rivalové ----------

export interface Rival {
  id: string;
  kind: 'derby' | 'soupeř';
  label: string;
}

/** Derby (stejné město) a přímý soupeř (nejbližší pověstí ve stejné soutěži). Nejvýš dva. */
export function rivalsOf(state: GameState, clubId = state.owner.clubId): Rival[] {
  const comp = competitionOf(state, clubId);
  const club = state.clubs[clubId];
  if (!comp || !club) return [];
  const others = comp.clubIds.filter((id) => id !== clubId && !state.clubs[id].reserveOf);
  const derby = others.filter((id) => state.clubs[id].city === club.city).sort((a, b) => state.clubs[b].reputation - state.clubs[a].reputation);
  const out: Rival[] = derby.slice(0, 2).map((id) => ({ id, kind: 'derby', label: 'derby' }));
  if (out.length < 2) {
    const near = others.filter((id) => !derby.includes(id)).sort((a, b) => Math.abs(state.clubs[a].reputation - club.reputation) - Math.abs(state.clubs[b].reputation - club.reputation))[0];
    if (near) out.push({ id: near, kind: 'soupeř', label: 'přímý soupeř' });
  }
  return out;
}

export function isRival(state: GameState, clubId: string): Rival | undefined {
  return rivalsOf(state).find((r) => r.id === clubId);
}

// ---------- Povahy soupeřů ----------

export type OwnerType = 'rozhazovacny' | 'setril' | 'nervozni' | 'akademie';
export const OWNER_TYPE_LABEL: Record<OwnerType, { label: string; hint: string }> = {
  rozhazovacny: { label: 'rozhazovačný majitel', hint: 'utrácí za posily víc, než klub vydělá' },
  setril: { label: 'šetřílek', hint: 'v krizi prodává opory levně' },
  nervozni: { label: 'nervózní majitel', hint: 'po sérii proher vyhodí trenéra' },
  akademie: { label: 'sází na akademii', hint: 'víc a lepších odchovanců' },
};

export function ownerTypeOf(clubId: string): OwnerType {
  const types: OwnerType[] = ['rozhazovacny', 'setril', 'nervozni', 'akademie'];
  return types[Math.floor(hash01(`majitel-${clubId}`) * types.length)];
}

/** Nálada klubu podle formy: krize, šňůra, nebo nic zvláštního. */
const momentCache = { key: '', map: new Map<string, 'krize' | 'snura'>() };

export function clubMoment(state: GameState, clubId: string): 'krize' | 'snura' | undefined {
  // Počítá se jednou za den pro všechny kluby (volá se často, např. u cen hráčů).
  const key = `${state.seed}-${state.date}-${state.nextId}`;
  if (momentCache.key !== key) {
    momentCache.key = key;
    momentCache.map = new Map();
    for (const comp of Object.values(state.competitions)) {
      for (const row of computeTable(comp, state)) {
        if (row.form.length < 4) continue;
        const losses = row.form.filter((f) => f === 'P').length;
        const wins = row.form.filter((f) => f === 'V').length;
        if (losses >= 4) momentCache.map.set(row.clubId, 'krize');
        else if (wins >= 4) momentCache.map.set(row.clubId, 'snura');
      }
    }
  }
  return momentCache.map.get(clubId);
}

/** Šetřílek v krizi prodává levněji (sleva na požadované odstupné). */
export function crisisDiscount(state: GameState, clubId: string): number {
  return ownerTypeOf(clubId) === 'setril' && clubMoment(state, clubId) === 'krize' ? 0.82 : 1;
}

/** Jednou týdně: nervózní majitelé soupeřů vyhazují trenéry po sérii proher. */
export function weeklyRivalOwners(state: GameState, rng: Rng): void {
  const own = state.owner.clubId;
  const comp = competitionOf(state, own);
  for (const c of Object.values(state.competitions)) {
    for (const clubId of c.clubIds) {
      if (clubId === own || ownerTypeOf(clubId) !== 'nervozni') continue;
      const row = computeTable(c, state).find((r) => r.clubId === clubId);
      if (!row || row.form.slice(-4).join('') !== 'PPPP') continue;
      const coach = coachOf(state, clubId);
      if (!coach || rng.next() > 0.6) continue;
      const club = state.clubs[clubId];
      coach.clubId = FREE;
      const fresh = generateStaff(rng, state, 'trener', staffLevelForReputation(club.reputation) + rng.int(-6, 6), clubId);
      state.staff[fresh.id] = fresh;
      club.staff.coachId = fresh.id;
      if (c === comp) addNews(state, { kind: 'info', title: `${club.shortName} vyhodil trenéra`, text: `Po čtyřech prohrách v řadě nervózní majitel sáhl ke změně. Nový trenér ${fresh.firstName} ${fresh.lastName}.` });
    }
  }
}

// ---------- Výhled sezóny ----------

export interface Outlook {
  clubId: string;
  avgPosition: number;
  title: number;
  europe: number;
  promote: number;
  playoff: number;
  relegate: number;
  /** Šance splnit cíl sezóny (jen klub majitele). */
  goal?: number;
}

const cache = new Map<string, Outlook[]>();

/**
 * Šance klubů na titul, Evropu, postup, baráž a sestup: 300 simulací zbytku sezóny podle síly
 * sestav a trenérů. Výsledek se pamatuje pro daný den a soutěž.
 */
export function seasonOutlook(state: GameState, comp: Competition = competitionOf(state, state.owner.clubId)!, runs = 300): Outlook[] {
  if (!comp) return [];
  const key = `${state.seed}-${state.date}-${comp.id}-${state.nextId}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const squads = playersByClub(state);
  const strength = new Map(comp.clubIds.map((id) => [id, clubStrength(state, id, squads)]));
  const base = finalStandings(comp, state);
  const pts0 = new Map(base.map((r) => [r.clubId, r.points]));
  const gd0 = new Map(base.map((r) => [r.clubId, r.goalsFor - r.goalsAgainst]));
  const left = comp.fixtures.filter((f) => !f.result);
  const n = comp.clubIds.length;
  const counts = new Map(comp.clubIds.map((id) => [id, { pos: 0, title: 0, europe: 0, promote: 0, playoff: 0, relegate: 0, goal: 0 }]));
  const rng = createRng(Math.floor(hash01(key) * 2 ** 31));
  const lowerPlayoff = Object.values(state.competitions).find((c) => c.playoff?.vs === comp.id)?.playoff;
  const target = comp.clubIds.includes(state.owner.clubId) ? goalTarget(state.owner.seasonGoal, comp) : 0;
  for (let r = 0; r < runs; r++) {
    const pts = new Map(pts0);
    for (const f of left) {
      const d = ((strength.get(f.homeId) ?? 50) - (strength.get(f.awayId) ?? 50) + 4) * 0.11;
      const home = 0.74 / (1 + Math.exp(-d));
      const x = rng.next();
      if (x < home) pts.set(f.homeId, pts.get(f.homeId)! + 3);
      else if (x < home + 0.26) {
        pts.set(f.homeId, pts.get(f.homeId)! + 1);
        pts.set(f.awayId, pts.get(f.awayId)! + 1);
      } else pts.set(f.awayId, pts.get(f.awayId)! + 3);
    }
    const order = [...comp.clubIds].sort((a, b) => pts.get(b)! - pts.get(a)! || gd0.get(b)! - gd0.get(a)! || rng.next() - 0.5);
    order.forEach((id, i) => {
      const c = counts.get(id)!;
      const pos = i + 1;
      c.pos += pos;
      if (pos === 1) c.title++;
      if (comp.tier === 1 && pos <= 4) c.europe++;
      if (pos <= comp.promote) c.promote++;
      if (comp.playoff?.upper.includes(pos) || lowerPlayoff?.lower.includes(pos)) c.playoff++;
      if (pos > n - comp.relegate) c.relegate++;
      if (id === state.owner.clubId && pos <= target) c.goal++;
    });
  }
  const out = comp.clubIds.map((id) => {
    const c = counts.get(id)!;
    return {
      clubId: id,
      avgPosition: c.pos / runs,
      title: c.title / runs,
      europe: c.europe / runs,
      promote: c.promote / runs,
      playoff: c.playoff / runs,
      relegate: c.relegate / runs,
      goal: id === state.owner.clubId ? c.goal / runs : undefined,
    };
  });
  cache.clear();
  cache.set(key, out);
  return out;
}

/** Šance klubu majitele splnit cíl sezóny (0–1). */
export function goalChance(state: GameState): number | undefined {
  return seasonOutlook(state).find((o) => o.clubId === state.owner.clubId)?.goal;
}

// ---------- Zpravodaj kola ----------

export interface RoundReport {
  round: number;
  date: string;
  competitionId: string;
  /** Překvapení kola: slabší tým porazil výrazně silnější. */
  surprise?: string;
  topScorer?: { playerId: string; goals: number };
  /** Sestava kola: nejlepší známky podle pozic. */
  team: { playerId: string; clubId: string; rating: number }[];
  /** Kdo se v tabulce nejvíc posunul. */
  movers: { clubId: string; change: number }[];
}

/** Po dohrání ligového kola soutěže majitele: zpravodaj. Hráči majitele v sestavě kola dostanou chválu. */
export function makeRoundReport(state: GameState, comp: Competition, round: number, before: Map<string, number>): RoundReport | undefined {
  const fixtures = comp.fixtures.filter((f) => f.round === round && f.result);
  if (!fixtures.length) return undefined;
  const squads = playersByClub(state);
  let surprise: string | undefined;
  let gap = 4;
  const goals = new Map<string, number>();
  const ratings: { playerId: string; clubId: string; rating: number; position: Player['position'] }[] = [];
  for (const f of fixtures) {
    const r = f.result!;
    const sh = clubStrength(state, f.homeId, squads);
    const sa = clubStrength(state, f.awayId, squads);
    const winner = r.homeGoals > r.awayGoals ? f.homeId : r.awayGoals > r.homeGoals ? f.awayId : undefined;
    if (winner) {
      const diff = winner === f.homeId ? sa - sh - 3 : sh - sa + 3;
      if (diff > gap) {
        gap = diff;
        surprise = `${state.clubs[winner].shortName} porazil ${state.clubs[winner === f.homeId ? f.awayId : f.homeId].shortName} ${Math.max(r.homeGoals, r.awayGoals)}:${Math.min(r.homeGoals, r.awayGoals)}`;
      }
    }
    for (const s of r.scorers) goals.set(s.playerId, (goals.get(s.playerId) ?? 0) + 1);
    for (const side of [r.detail?.home, r.detail?.away]) {
      if (!side) continue;
      const clubId = side === r.detail?.home ? f.homeId : f.awayId;
      for (const l of side.lineup) if (l.rating !== undefined && l.minutes >= 60) ratings.push({ playerId: l.id, clubId, rating: l.rating, position: l.position });
    }
  }
  const top = [...goals.entries()].sort((a, b) => b[1] - a[1])[0];
  const shape: Record<Player['position'], number> = { GK: 1, DF: 4, MF: 4, FW: 2 };
  const team = (Object.keys(shape) as Player['position'][]).flatMap((pos) =>
    ratings.filter((x) => x.position === pos).sort((a, b) => b.rating - a.rating).slice(0, shape[pos]).map(({ playerId, clubId, rating }) => ({ playerId, clubId, rating })),
  );
  const after = finalStandings(comp, state);
  const movers = after
    .map((r, i) => ({ clubId: r.clubId, change: (before.get(r.clubId) ?? i + 1) - (i + 1) }))
    .filter((m) => m.change !== 0)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 3);
  return { round, date: state.date, competitionId: comp.id, surprise, topScorer: top && top[1] >= 2 ? { playerId: top[0], goals: top[1] } : undefined, team, movers };
}

/** Uloží zpravodaj a pochválí hráče majitele v sestavě kola (morálka, zájem kupců). */
export function publishRoundReport(state: GameState, report: RoundReport): void {
  state.roundReports = [report, ...(state.roundReports ?? []).filter((r) => !(r.round === report.round && r.competitionId === report.competitionId))].slice(0, 6);
  const ours = report.team.filter((t) => t.clubId === state.owner.clubId);
  for (const t of ours) {
    const p = state.players[t.playerId];
    if (!p) continue;
    p.morale = Math.min(100, p.morale + 3);
    p.spotlight = (p.spotlight ?? 0) + 1;
  }
  if (ours.length) {
    addNews(state, {
      kind: 'info',
      title: `Sestava ${report.round}. kola: ${ours.map((t) => `${state.players[t.playerId]?.firstName} ${state.players[t.playerId]?.lastName}`).join(', ')}`,
      text: 'Pochvala zvedá morálku a o hráče se víc zajímají kupci.',
      playerId: ours[0].playerId,
    });
  }
}

// ---------- Poznámky k vývoji tabulky ----------

/** Zapíše zlomový okamžik (nový trenér, prodej opory, zranění kapitána) k nejbližšímu kolu. */
export function noteTimeline(state: GameState, text: string): void {
  const comp = competitionOf(state, state.owner.clubId);
  if (!comp) return;
  const played = computeTable(comp, state).find((r) => r.clubId === state.owner.clubId)?.played ?? 0;
  state.timelineNotes = [...(state.timelineNotes ?? []).filter((n) => n.season === state.season), { season: state.season, round: played + 1, text }].slice(-20);
}

/** Pozice rivalů po kole (pro graf vývoje tabulky). */
export function rivalPositions(state: GameState): Record<string, number> {
  const comp = competitionOf(state, state.owner.clubId);
  if (!comp) return {};
  const table = finalStandings(comp, state);
  const out: Record<string, number> = {};
  for (const r of rivalsOf(state)) {
    const i = table.findIndex((x) => x.clubId === r.id);
    if (i >= 0) out[r.id] = i + 1;
  }
  return out;
}
