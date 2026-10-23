import { formBonus } from './players';
import type { Rng } from './rng';
import type { CoachStyle, MatchDetail, MatchEvent, MatchPlayerLine, MatchResult, Player, Position, TeamMatchStats } from './types';

/**
 * Zápas se simuluje po minutách: týmy si podle síly vytvářejí střely s xG, gól padne podle xG.
 * Fauly přinášejí karty, hráči se zraní, trenér střídá. Výsledek a statistiky tak k sobě sedí.
 * Kalibrace: průměrně asi 12–13 střel a 1,4 xG na tým, 2,8 gólu a 4 žluté karty na zápas.
 */

export const FORMATIONS: Record<CoachStyle, { name: string; shape: Record<Position, number> }> = {
  utocny: { name: '4-3-3', shape: { GK: 1, DF: 4, MF: 3, FW: 3 } },
  vyvazeny: { name: '4-4-2', shape: { GK: 1, DF: 4, MF: 4, FW: 2 } },
  defenzivni: { name: '5-3-2', shape: { GK: 1, DF: 5, MF: 3, FW: 2 } },
};

const SHOTS_PER_MATCH = 12.5;
/** Vliv rozdílu síly zvlášť na počet střel a na jejich kvalitu (dohromady asi 0,03 na bod v počtu gólů). */
const STRENGTH_FACTOR = 0.015;
/** Domácí výhoda vyjádřená v bodech síly týmu. */
const HOME_EDGE = 6;
const MAX_SUBS = 5;
const BENCH_SIZE = 7;

export interface MatchSide {
  id: string;
  players: Player[];
  /** Vliv trenéra na sílu týmu. */
  bonus?: number;
  style?: CoachStyle;
  youthFocus?: boolean;
  /** Násobek rizika zranění (zázemí, stav trávníku). */
  injuryRisk?: number;
  /** Násobek délky zranění (kvalita regenerace a medicíny). */
  recovery?: number;
}

export interface MatchOptions {
  date: string;
  season: number;
  /** Uložit podrobnosti (sestavy, statistiky, události). */
  detail?: boolean;
  /** Domácí výhoda v bodech síly (podle diváků a nálady fanoušků). */
  homeEdge?: number;
  /** Jak moc rozhoduje rozdíl v síle (nastavení náhody; 1 = běžně). */
  decisive?: number;
  /** Změna od 46. minuty (rozhodnutí o poločase). */
  halftime?: { home?: { style?: CoachStyle; bonus?: number }; away?: { style?: CoachStyle; bonus?: number } };
  /** Další body zlomu (velký zápas): změna platí od minuty `minute + 1`, nasazení a styl stran, posun domácího prostředí. */
  changes?: { minute: number; home?: { style?: CoachStyle; bonus?: number }; away?: { style?: CoachStyle; bonus?: number }; homeEdge?: number }[];
}

export function isAvailable(p: Player, date: string): boolean {
  return !(p.injuredUntil && p.injuredUntil >= date) && p.suspension <= 0;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Výkon hráče v zápase: kvalita upravená kondicí, morálkou a formou. */
export function effective(p: Player): number {
  // Cizinec, který se teprve zabydluje, hraje pod svou úroveň.
  return p.overall * (1 - (p.adapt ?? 0)) * (0.85 + 0.15 * (p.fitness / 100)) * (0.96 + 0.08 * ((p.morale ?? 60) / 100)) + formBonus(p);
}

/** Sestava, jakou by postavil trenér: podle formace, kvality, kondice a jeho přístupu k mladým. */
export function selectLineup(
  players: Player[],
  style: CoachStyle,
  youthFocus: boolean,
  date: string,
  season: number,
  rng?: Rng,
): { xi: Player[]; bench: Player[]; formation: string } {
  const formation = FORMATIONS[style];
  // Trenér hráče podobné kvality obměňuje podle tréninku a formy (malá náhoda).
  const jitter = new Map(players.map((p) => [p.id, rng ? rng.normal(0, 2) : 0]));
  const score = (p: Player) => effective(p) + (youthFocus && season - p.birthYear <= 21 ? 3 : 0) + jitter.get(p.id)!;
  const available = players.filter((p) => isAvailable(p, date)).sort((a, b) => score(b) - score(a));
  const xi: Player[] = [];
  for (const pos of Object.keys(formation.shape) as Position[]) {
    xi.push(...available.filter((p) => p.position === pos).slice(0, formation.shape[pos]));
  }
  // Chybějící místa doplní nejlepší zbývající hráči z pole (brankář jen v nouzi).
  const rest = () => available.filter((p) => !xi.includes(p));
  while (xi.length < 11 && rest().length) {
    const pick = rest().find((p) => p.position !== 'GK') ?? rest()[0];
    xi.push(pick);
  }
  const remaining = rest();
  const bench: Player[] = [];
  const gk = remaining.find((p) => p.position === 'GK');
  if (gk) bench.push(gk);
  for (const p of remaining) {
    if (bench.length >= BENCH_SIZE) break;
    if (!bench.includes(p)) bench.push(p);
  }
  return { xi, bench, formation: formation.name };
}

/** Síla týmu pro předzápasové odhady: průměr nejlepší možné sestavy. */
export function lineupStrength(xi: Player[]): number {
  if (!xi.length) return 20;
  return xi.reduce((s, p) => s + effective(p), 0) / xi.length - (11 - xi.length) * 4;
}

function weightedPick<T>(rng: Rng, items: T[], weight: (x: T) => number): T | undefined {
  const weights = items.map(weight);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return items[0];
  let r = rng.next() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

const SHOT_WEIGHT: Record<Position, number> = { GK: 0, DF: 0.7, MF: 2.2, FW: 5 };
const ASSIST_WEIGHT: Record<Position, number> = { GK: 0.05, DF: 1.2, MF: 3, FW: 2 };
const FOUL_WEIGHT: Record<Position, number> = { GK: 0.2, DF: 3, MF: 2, FW: 1 };

interface PlayerLog {
  p: Player;
  started: boolean;
  on: number;
  off?: number;
  goals: number;
  assists: number;
  yellow: number;
  red: boolean;
  shotsOnTarget: number;
}

interface SideState {
  side: MatchSide;
  style: CoachStyle;
  formation: string;
  onPitch: Player[];
  bench: Player[];
  logs: Map<string, PlayerLog>;
  subs: number;
  stats: Omit<TeamMatchStats, 'lineup' | 'bench' | 'formation'>;
  goals: number;
  strength: number;
}

export function simulateMatch(rng: Rng, home: MatchSide, away: MatchSide, attendance: number, opts?: MatchOptions): MatchResult {
  const date = opts?.date ?? '2026-08-01';
  let homeEdge = opts?.homeEdge ?? HOME_EDGE;
  const startEdge = homeEdge;
  const season = opts?.season ?? Number(date.slice(0, 4));
  const events: MatchEvent[] = [];
  const scorers: MatchResult['scorers'] = [];

  // Hráči, kteří tento zápas pykají, si trest odpykají.
  const serving = [...home.players, ...away.players].filter((p) => p.suspension > 0);

  const makeSide = (side: MatchSide): SideState => {
    const style = side.style ?? 'vyvazeny';
    const { xi, bench, formation } = selectLineup(side.players, style, side.youthFocus ?? false, date, season, rng);
    const logs = new Map<string, PlayerLog>();
    for (const p of xi) logs.set(p.id, { p, started: true, on: 0, goals: 0, assists: 0, yellow: 0, red: false, shotsOnTarget: 0 });
    return {
      side,
      style,
      formation,
      onPitch: [...xi],
      bench: [...bench],
      logs,
      subs: 0,
      stats: { xg: 0, shots: 0, onTarget: 0, possession: 50, corners: 0, fouls: 0, offsides: 0, yellows: 0, reds: 0, saves: 0 },
      goals: 0,
      strength: 0,
    };
  };
  const H = makeSide(home);
  const A = makeSide(away);
  const recompute = (s: SideState) => {
    s.strength = lineupStrength(s.onPitch) + (s.side.bonus ?? 0);
  };
  recompute(H);
  recompute(A);

  const styleShots: Record<CoachStyle, number> = { utocny: 1.12, vyvazeny: 1, defenzivni: 0.88 };
  const styleConcede: Record<CoachStyle, number> = { utocny: 1.06, vyvazeny: 1, defenzivni: 0.9 };
  const length = 90 + rng.int(2, 5);

  const substitute = (s: SideState, out: Player, minute: number, reason: 'zraneni' | 'takticke') => {
    if (s.subs >= MAX_SUBS || !s.bench.length) return false;
    const replacement =
      s.bench.find((b) => b.position === out.position) ?? (out.position === 'GK' ? s.bench[0] : s.bench.find((b) => b.position !== 'GK')) ?? s.bench[0];
    s.bench = s.bench.filter((b) => b !== replacement);
    s.onPitch = s.onPitch.map((p) => (p === out ? replacement : p));
    s.logs.get(out.id)!.off = minute;
    s.logs.set(replacement.id, { p: replacement, started: false, on: minute, goals: 0, assists: 0, yellow: 0, red: false, shotsOnTarget: 0 });
    s.subs += 1;
    events.push({ minute, type: 'stridani', clubId: s.side.id, playerId: out.id, otherId: replacement.id, note: reason === 'zraneni' ? 'zranění' : undefined });
    recompute(s);
    return true;
  };

  const missedPenalty = (s: SideState, p: Player, minute: number, note: string) => {
    s.stats.pensMissed = (s.stats.pensMissed ?? 0) + 1;
    events.push({ minute: Math.min(minute, 90), type: 'penalta-mimo', clubId: s.side.id, playerId: p.id, note });
  };

  const sendOff = (s: SideState, p: Player, minute: number) => {
    s.onPitch = s.onPitch.filter((x) => x !== p);
    s.logs.get(p.id)!.off = minute;
    recompute(s);
  };

  for (let minute = 1; minute <= length; minute++) {
    if (minute === 46 && opts?.halftime) {
      for (const [s, change] of [[H, opts.halftime.home], [A, opts.halftime.away]] as const) {
        if (!change) continue;
        if (change.style) s.style = change.style;
        if (change.bonus) s.side = { ...s.side, bonus: (s.side.bonus ?? 0) + change.bonus };
        recompute(s);
      }
    }
    for (const c of opts?.changes ?? []) {
      if (minute !== c.minute + 1) continue;
      for (const [s, change] of [[H, c.home], [A, c.away]] as const) {
        if (!change) continue;
        if (change.style) s.style = change.style;
        if (change.bonus) s.side = { ...s.side, bonus: (s.side.bonus ?? 0) + change.bonus };
        recompute(s);
      }
      if (c.homeEdge) homeEdge += c.homeEdge;
    }
    for (const [s, o, isHome] of [[H, A, true], [A, H, false]] as const) {
      if (!s.onPitch.length) continue;
      const diff = (s.strength - o.strength) * (opts?.decisive ?? 1) + (isHome ? homeEdge / 2 : -homeEdge / 2);
      const edge = Math.exp(diff * STRENGTH_FACTOR);
      const manDiff = s.onPitch.length - o.onPitch.length;
      const numbers = manDiff < 0 ? 0.7 : manDiff > 0 ? 1.25 : 1;

      // Střela
      if (rng.chance((SHOTS_PER_MATCH / 90) * edge * styleShots[s.style] * styleConcede[o.style] * numbers)) {
        const penalty = rng.chance(0.025);
        const big = !penalty && rng.chance(0.12);
        const xg = penalty ? 0.76 : Math.min(0.9, Math.max(0.01, (big ? 0.18 + rng.next() * 0.27 : 0.02 + rng.next() * 0.065) * edge));
        const outfield = s.onPitch.filter((p) => p.position !== 'GK');
        const shooter = penalty
          ? [...outfield].sort((a, b) => b.overall - a.overall)[0]
          : weightedPick(rng, outfield, (p) => SHOT_WEIGHT[p.position] * (p.overall / 60));
        if (!shooter) continue;
        s.stats.shots += 1;
        s.stats.xg += xg;
        const log = s.logs.get(shooter.id)!;
        if (rng.chance(xg)) {
          s.goals += 1;
          s.stats.onTarget += 1;
          log.goals += 1;
          log.shotsOnTarget += 1;
          let assistId: string | undefined;
          if (!penalty && rng.chance(0.75)) {
            const helper = weightedPick(rng, s.onPitch.filter((p) => p !== shooter), (p) => ASSIST_WEIGHT[p.position]);
            if (helper) {
              assistId = helper.id;
              s.logs.get(helper.id)!.assists += 1;
            }
          }
          scorers.push({ playerId: shooter.id, clubId: s.side.id, minute: Math.min(minute, 90), assistId, penalty: penalty || undefined });
          events.push({ minute: Math.min(minute, 90), type: 'gol', clubId: s.side.id, playerId: shooter.id, otherId: assistId, note: penalty ? 'z penalty' : undefined });
        } else if (rng.chance(0.3)) {
          s.stats.onTarget += 1;
          o.stats.saves += 1;
          log.shotsOnTarget += 1;
          if (penalty) missedPenalty(s, shooter, minute, 'chytil brankář');
        } else {
          // V4: neproměněná penalta se zapíše jako událost (bez další náhody, simulace se nemění).
          if (penalty) missedPenalty(s, shooter, minute, 'mimo branku');
          if (rng.chance(0.6)) s.stats.corners += 1;
        }
      }

      if (rng.chance(2 / 90)) s.stats.offsides += 1;
      if (rng.chance((1.8 / 90) * edge)) s.stats.corners += 1;

      // Faul a karty
      if (rng.chance(12 / 90)) {
        s.stats.fouls += 1;
        const culprit = weightedPick(rng, s.onPitch, (p) => FOUL_WEIGHT[p.position]);
        if (culprit) {
          const log = s.logs.get(culprit.id)!;
          if (rng.chance(0.0015)) {
            log.red = true;
            s.stats.reds += 1;
            events.push({ minute: Math.min(minute, 90), type: 'cervena', clubId: s.side.id, playerId: culprit.id });
            sendOff(s, culprit, minute);
          } else if (rng.chance(log.yellow ? 0.06 : 0.17)) {
            log.yellow += 1;
            s.stats.yellows += 1;
            if (log.yellow >= 2) {
              log.red = true;
              s.stats.reds += 1;
              events.push({ minute: Math.min(minute, 90), type: 'druha-zluta', clubId: s.side.id, playerId: culprit.id });
              sendOff(s, culprit, minute);
            } else {
              events.push({ minute: Math.min(minute, 90), type: 'zluta', clubId: s.side.id, playerId: culprit.id });
            }
          }
        }
      }

      // Zranění
      if (rng.chance((0.11 / 90) * (s.side.injuryRisk ?? 1))) {
        const hurt = rng.pick(s.onPitch);
        if (hurt) {
          const r = rng.next();
          const baseDays = r < 0.6 ? rng.int(5, 14) : r < 0.9 ? rng.int(15, 45) : rng.int(50, 120);
          const days = Math.max(3, Math.round(baseDays * (s.side.recovery ?? 1)));
          hurt.injuredUntil = addDays(date, days);
          hurt.injury = days <= 14 ? 'lehké zranění' : days <= 45 ? 'svalové zranění' : 'vážné zranění';
          events.push({ minute: Math.min(minute, 90), type: 'zraneni', clubId: s.side.id, playerId: hurt.id, note: `${hurt.injury}, asi ${Math.round(days / 7)} týd.` });
          if (!substitute(s, hurt, minute, 'zraneni')) sendOff(s, hurt, minute);
        }
      }

      // Taktická střídání: unavení hráči, prohrávající tým přidá útočníka.
      if (minute === 60 || minute === 70 || minute === 80) {
        const want = minute === 60 ? 2 : minute === 70 ? 1 : 2;
        for (let i = 0; i < want && s.subs < MAX_SUBS && s.bench.some((b) => b.position !== 'GK'); i++) {
          const losing = s.goals < o.goals;
          const candidates = s.onPitch
            .filter((p) => p.position !== 'GK' && s.logs.get(p.id)!.started)
            .sort((a, b) => a.fitness - b.fitness || a.overall - b.overall);
          let out = candidates[0];
          if (losing && minute >= 70) out = candidates.find((p) => p.position === 'DF' || p.position === 'MF') ?? out;
          if (!out) break;
          if (losing && minute >= 70) {
            const fw = s.bench.find((b) => b.position === 'FW');
            if (fw) s.bench = [fw, ...s.bench.filter((b) => b !== fw)];
          }
          substitute(s, out, minute, 'takticke');
        }
      }
    }
  }

  const possessionHome = Math.max(30, Math.min(70, Math.round(50 + (H.strength - A.strength) * 0.6 + (H.style === 'utocny' ? 3 : H.style === 'defenzivni' ? -4 : 0) - (A.style === 'utocny' ? 3 : A.style === 'defenzivni' ? -4 : 0) + rng.normal(0, 3))));
  H.stats.possession = possessionHome;
  A.stats.possession = 100 - possessionHome;

  // Známky, statistiky hráčů, únava a tresty.
  const finish = (s: SideState, o: SideState): MatchPlayerLine[] => {
    const result = s.goals > o.goals ? 0.35 : s.goals < o.goals ? -0.3 : 0;
    const lines: MatchPlayerLine[] = [];
    for (const log of s.logs.values()) {
      const p = log.p;
      const minutes = Math.max(1, Math.min(90, (log.off ?? 90) - log.on));
      let rating: number | undefined;
      if (minutes >= 20 || log.started) {
        const defensive = p.position === 'GK' || p.position === 'DF';
        rating =
          6.55 +
          rng.normal(0, 0.35) +
          log.goals * 1.0 +
          log.assists * 0.6 +
          log.shotsOnTarget * 0.1 +
          result +
          (defensive ? (o.goals === 0 ? 0.5 : -0.15 * o.goals) : 0) +
          (p.position === 'GK' ? s.stats.saves * 0.15 : 0) -
          (log.yellow ? 0.3 : 0) -
          (log.red ? 1.5 : 0) +
          (p.overall - 60) * 0.01;
        rating = Math.round(Math.max(3, Math.min(10, rating)) * 10) / 10;
        p.ratingSum += rating;
        p.ratingCount += 1;
        p.recent = [...(p.recent ?? []), rating].slice(-5);
      }
      // Morálka: hrát je radost, výhra potěší, prohra zamrzí.
      p.morale = Math.max(0, Math.min(100, (p.morale ?? 60) + (log.started ? 1.5 : 0.5) + (result > 0 ? 2 : result < 0 ? -2 : 0)));
      p.apps += 1;
      if (log.started) p.starts += 1;
      p.minutes += minutes;
      p.goals += log.goals;
      p.assists += log.assists;
      p.fitness = Math.max(0, p.fitness - (minutes / 90) * 22);
      if (log.red) {
        p.reds += 1;
        p.suspension += log.yellow >= 2 ? 1 : 2;
      } else if (log.yellow) {
        p.yellows += 1;
        if (p.yellows % 4 === 0) p.suspension += 1;
      }
      lines.push({ id: p.id, name: `${p.firstName} ${p.lastName}`, position: p.position, minutes, rating, started: log.started });
    }
    // Hráči, kteří by chtěli hrát a nedostali šanci, ztrácejí morálku.
    const sorted = [...s.side.players].sort((a, b) => b.overall - a.overall);
    const median = sorted[Math.floor(sorted.length / 2)]?.overall ?? 0;
    for (const p of s.side.players) {
      if (s.logs.has(p.id) || !isAvailable(p, date) || p.overall < median) continue;
      p.morale = Math.max(0, (p.morale ?? 60) - 3);
    }
    return lines;
  };
  const homeLines = finish(H, A);
  const awayLines = finish(A, H);
  for (const p of serving) p.suspension = Math.max(0, p.suspension - 1);

  const result: MatchResult = { homeGoals: H.goals, awayGoals: A.goals, attendance, scorers };
  if (opts?.detail) {
    const order: Record<Position, number> = { GK: 0, DF: 1, MF: 2, FW: 3 };
    const team = (s: SideState, lines: MatchPlayerLine[]): TeamMatchStats => ({
      formation: s.formation,
      lineup: lines.filter((l) => l.started).sort((a, b) => order[a.position] - order[b.position]),
      bench: [
        ...lines.filter((l) => !l.started),
        ...s.bench.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, position: p.position, minutes: 0, started: false })),
      ],
      ...s.stats,
      xg: Math.round(s.stats.xg * 100) / 100,
    });
    const all = [...homeLines, ...awayLines].filter((l) => l.rating !== undefined);
    const detail: MatchDetail = {
      home: team(H, homeLines),
      away: team(A, awayLines),
      events: events.sort((a, b) => a.minute - b.minute),
      potm: all.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0]?.id,
      homeEdge: Math.round(startEdge * 10) / 10,
    };
    result.detail = detail;
  }
  return result;
}
