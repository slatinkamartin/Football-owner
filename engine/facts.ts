import { allFixtures } from './competitions';
import { playerAge, squadOf } from './players';
import { computeTable } from './standings';
import type { Fixture, GameState, Player } from './types';
import { clubLabel, competitionOf } from './world';

/**
 * Fakta ze skutečného dění: poslední zápas klubu majitele a sezóna (série, sucha střelců, chyby,
 * minuty mladých, tabulka). Z nich vznikají situace, diskuze fanoušků, příspěvky i otázky novinářů,
 * aby se vždy opíraly o to, co se ve hře opravdu stalo.
 */

const playerName = (p: Pick<Player, 'firstName' | 'lastName'>) => `${p.firstName} ${p.lastName}`;

export type Outcome = 'V' | 'R' | 'P';

export interface OwnMatchFacts {
  fixtureId: string;
  date: string;
  competition: string;
  home: boolean;
  opponentId: string;
  opponentName: string;
  gf: number;
  ga: number;
  outcome: Outcome;
  /** Skóre ve tvaru „domácí – hosté 2:1“. */
  scoreline: string;
  scorers: { playerId: string; name: string; minute: number; penalty: boolean }[];
  oppScorers: { minute: number }[];
  /** Červené karty vlastních hráčů. */
  reds: { playerId: string; name: string; minute: number }[];
  injuries: { playerId: string; name: string; note?: string }[];
  /** Vlastní hráč střídaný do 35. minuty (mimo zranění). */
  earlySub?: { playerId: string; name: string; minute: number };
  /** Gól v 85. minutě a později, který rozhodl nebo vyrovnal. */
  lateDecider?: { own: boolean; minute: number };
  /** Otočka: prohrávali a vyhráli (nebo naopak). */
  comeback?: 'nase' | 'jejich';
  hattrick?: { playerId: string; name: string };
  xgFor?: number;
  xgAgainst?: number;
  /** Hráč zápasu z vlastního klubu. */
  potm?: { playerId: string; name: string };
  /** Nejhorší známka vlastního hráče (pro kritiku), jen když je opravdu slabá. */
  worst?: { playerId: string; name: string; rating: number; position: string };
  /** Odchovanec mezi střelci. */
  academyScorer?: { playerId: string; name: string };
}

function ownFixtures(state: GameState): { f: Fixture; name: string }[] {
  const own = state.owner.clubId;
  return allFixtures(state)
    .filter((x) => x.fixture.result && (x.fixture.homeId === own || x.fixture.awayId === own))
    .map((x) => ({ f: x.fixture, name: x.name }))
    .sort((a, b) => (a.f.date < b.f.date ? -1 : 1));
}

function outcomeOf(gf: number, ga: number, pens?: [number, number], home?: boolean): Outcome {
  if (gf > ga) return 'V';
  if (gf < ga) return 'P';
  if (pens) return (home ? pens[0] > pens[1] : pens[1] > pens[0]) ? 'V' : 'P';
  return 'R';
}

/** Fakta o konkrétním odehraném zápase klubu majitele. */
export function matchFacts(state: GameState, f: Fixture, competition = ''): OwnMatchFacts | undefined {
  const r = f.result;
  if (!r) return undefined;
  const own = state.owner.clubId;
  const home = f.homeId === own;
  const opp = home ? f.awayId : f.homeId;
  const gf = home ? r.homeGoals : r.awayGoals;
  const ga = home ? r.awayGoals : r.homeGoals;
  const name = (id: string) => (state.players[id] ? playerName(state.players[id]) : '');
  const scorers = r.scorers.filter((s) => s.clubId === own).map((s) => ({ playerId: s.playerId, name: name(s.playerId), minute: s.minute, penalty: !!s.penalty }));
  const oppScorers = r.scorers.filter((s) => s.clubId !== own).map((s) => ({ minute: s.minute }));
  const events = r.detail?.events ?? [];
  const reds = events.filter((e) => e.clubId === own && (e.type === 'cervena' || e.type === 'druha-zluta')).map((e) => ({ playerId: e.playerId, name: name(e.playerId), minute: e.minute }));
  const injuries = events.filter((e) => e.clubId === own && e.type === 'zraneni').map((e) => ({ playerId: e.playerId, name: name(e.playerId), note: e.note }));
  const early = events.find((e) => e.clubId === own && e.type === 'stridani' && e.minute <= 35 && e.note !== 'zranění');
  // Průběh skóre: otočka a rozhodující gól v závěru.
  const timeline = [...r.scorers].sort((a, b) => a.minute - b.minute);
  let o = 0;
  let t = 0;
  let wasBehind = false;
  let wasAhead = false;
  for (const s of timeline) {
    if (s.clubId === own) o++;
    else t++;
    if (o < t) wasBehind = true;
    if (o > t) wasAhead = true;
  }
  const outcome = outcomeOf(gf, ga, r.penalties, home);
  const last = timeline[timeline.length - 1];
  const lateDecider = last && last.minute >= 85 && Math.abs(gf - ga) <= 1 ? { own: last.clubId === own, minute: last.minute } : undefined;
  const counts = new Map<string, number>();
  for (const s of scorers) counts.set(s.playerId, (counts.get(s.playerId) ?? 0) + 1);
  const hat = [...counts.entries()].find(([, n]) => n >= 3);
  const side = home ? r.detail?.home : r.detail?.away;
  const otherSide = home ? r.detail?.away : r.detail?.home;
  const rated = (side?.lineup ?? []).filter((l) => l.rating !== undefined && l.minutes >= 45).sort((a, b) => (a.rating ?? 0) - (b.rating ?? 0));
  const worst = rated[0] && (rated[0].rating ?? 10) <= 5.4 ? { playerId: rated[0].id, name: rated[0].name, rating: rated[0].rating!, position: rated[0].position } : undefined;
  const potmId = r.detail?.potm && state.players[r.detail.potm]?.clubId === own ? r.detail.potm : undefined;
  const academy = scorers.find((s) => state.players[s.playerId]?.academy);
  return {
    fixtureId: f.id,
    date: f.date,
    competition,
    home,
    opponentId: opp,
    opponentName: clubLabel(state, opp),
    gf,
    ga,
    outcome,
    scoreline: `${clubLabel(state, f.homeId)} – ${clubLabel(state, f.awayId)} ${r.homeGoals}:${r.awayGoals}`,
    scorers,
    oppScorers,
    reds,
    injuries,
    earlySub: early ? { playerId: early.playerId, name: name(early.playerId), minute: early.minute } : undefined,
    lateDecider,
    comeback: outcome === 'V' && wasBehind ? 'nase' : outcome === 'P' && wasAhead ? 'jejich' : undefined,
    hattrick: hat ? { playerId: hat[0], name: name(hat[0]) } : undefined,
    xgFor: side?.xg,
    xgAgainst: otherSide?.xg,
    potm: potmId ? { playerId: potmId, name: name(potmId) } : undefined,
    worst,
    academyScorer: academy ? { playerId: academy.playerId, name: academy.name } : undefined,
  };
}

/** Poslední odehraný zápas klubu majitele. */
export function lastOwnMatch(state: GameState): OwnMatchFacts | undefined {
  const list = ownFixtures(state);
  const last = list[list.length - 1];
  return last ? matchFacts(state, last.f, last.name) : undefined;
}

/** Zápas klubu majitele odehraný právě dnes nebo včera (pro reakce den po zápase). */
export function freshOwnMatch(state: GameState, maxDaysAgo = 1): OwnMatchFacts | undefined {
  const m = lastOwnMatch(state);
  if (!m) return undefined;
  const days = Math.round((new Date(`${state.date}T00:00:00Z`).getTime() - new Date(`${m.date}T00:00:00Z`).getTime()) / 86_400_000);
  return days <= maxDaysAgo ? m : undefined;
}

export interface SeasonFacts {
  /** Výsledky v sezóně od nejstaršího (všechny soutěže). */
  form: Outcome[];
  /** Aktuální série: např. { kind: 'P', length: 3 }. */
  streak: { kind: Outcome; length: number };
  /** Zápasy bez výhry v řadě. */
  winless: number;
  /** Venkovní zápasy bez výhry v řadě. */
  awayWinless: number;
  /** Skóre posledních 3 zápasů. */
  last3: { gf: number; ga: number };
  position?: number;
  positionBefore?: number;
  teams?: number;
  played: number;
  points?: number;
  /** Útočníci (a hráči s góly) bez gólu v posledních N zápasech, které hráli. */
  droughts: { playerId: string; name: string; games: number; seasonGoals: number }[];
  /** Brankáři se známkou pod 5,5 ve dvou posledních zápasech. */
  shakyKeeper?: { playerId: string; name: string };
  /** Minuty hráčů do 21 let v posledních 5 zápasech. */
  youthMinutes: number;
  /** Nejlepší střelec klubu v sezóně. */
  topScorer?: { playerId: string; name: string; goals: number };
  /** Hráči ve formě s končící smlouvou. */
  expiringStars: { playerId: string; name: string; avg: number }[];
  /** Dlouhodobě zranění opory (14+ dní). */
  longInjuries: { playerId: string; name: string; position: string; until: string }[];
}

/** Fakta o sezóně klubu majitele. */
export function seasonFacts(state: GameState): SeasonFacts {
  const own = state.owner.clubId;
  const list = ownFixtures(state).filter((x) => x.f.date >= `${state.season}-07-01`);
  const facts = list.map((x) => matchFacts(state, x.f, x.name)!).filter(Boolean);
  const form = facts.map((m) => m.outcome);
  let length = 0;
  const kind = form[form.length - 1] ?? 'R';
  for (let i = form.length - 1; i >= 0 && form[i] === kind; i--) length++;
  let winless = 0;
  for (let i = form.length - 1; i >= 0 && form[i] !== 'V'; i--) winless++;
  const away = facts.filter((m) => !m.home);
  let awayWinless = 0;
  for (let i = away.length - 1; i >= 0 && away[i].outcome !== 'V'; i--) awayWinless++;
  const last3 = facts.slice(-3).reduce((a, m) => ({ gf: a.gf + m.gf, ga: a.ga + m.ga }), { gf: 0, ga: 0 });
  const comp = competitionOf(state, own);
  const table = comp ? computeTable(comp, state) : [];
  const row = table.findIndex((r) => r.clubId === own);
  // Pozice před posledním kolem: tabulka bez posledního zápasu klubu (přibližně podle bodů).
  const ownRow = table[row];
  let positionBefore: number | undefined;
  if (ownRow && facts.length) {
    const lastPts = facts[facts.length - 1].outcome === 'V' ? 3 : facts[facts.length - 1].outcome === 'R' ? 1 : 0;
    const before = ownRow.points - lastPts;
    positionBefore = table.filter((r) => r.clubId !== own && r.points > before).length + 1;
  }
  // Sucha střelců: hráči z útoku (nebo s góly v sezóně), kteří v posledních zápasech hráli a nedali gól.
  const squad = squadOf(state, own);
  const goals = new Map<string, number>();
  for (const m of facts) for (const s of m.scorers) goals.set(s.playerId, (goals.get(s.playerId) ?? 0) + 1);
  const played = (m: OwnMatchFacts, id: string) => {
    const f = list.find((x) => x.f.id === m.fixtureId)?.f;
    const side = f && (f.homeId === own ? f.result?.detail?.home : f.result?.detail?.away);
    return !!side && [...side.lineup, ...side.bench].some((l) => l.id === id && l.minutes > 0);
  };
  const droughts: SeasonFacts['droughts'] = [];
  for (const p of squad.filter((p) => p.position === 'FW' || (goals.get(p.id) ?? 0) >= 3)) {
    let games = 0;
    for (let i = facts.length - 1; i >= 0; i--) {
      if (!played(facts[i], p.id)) continue;
      if (facts[i].scorers.some((s) => s.playerId === p.id)) break;
      games++;
    }
    if (games >= 5) droughts.push({ playerId: p.id, name: playerName(p), games, seasonGoals: goals.get(p.id) ?? 0 });
  }
  droughts.sort((a, b) => b.games - a.games);
  // Brankář: dvě slabé známky po sobě.
  let shakyKeeper: SeasonFacts['shakyKeeper'];
  const gk = squad.filter((p) => p.position === 'GK').sort((a, b) => b.apps - a.apps)[0];
  if (gk && gk.recent.length >= 2 && gk.recent.slice(-2).every((x) => x < 5.5)) shakyKeeper = { playerId: gk.id, name: playerName(gk) };
  // Minuty mladých v posledních 5 zápasech.
  let youthMinutes = 0;
  for (const m of facts.slice(-5)) {
    const f = list.find((x) => x.f.id === m.fixtureId)?.f;
    const side = f && (f.homeId === own ? f.result?.detail?.home : f.result?.detail?.away);
    for (const l of [...(side?.lineup ?? []), ...(side?.bench ?? [])]) {
      const p = state.players[l.id];
      if (p && p.clubId === own && playerAge(p, state.season) <= 21) youthMinutes += l.minutes;
    }
  }
  const topId = [...goals.entries()].sort((a, b) => b[1] - a[1])[0];
  const avg = (p: Player) => (p.ratingCount ? p.ratingSum / p.ratingCount : 0);
  const expiringStars = squad
    .filter((p) => p.contractUntil <= state.season + 1 && p.ratingCount >= 5 && avg(p) >= 7)
    .map((p) => ({ playerId: p.id, name: playerName(p), avg: Math.round(avg(p) * 10) / 10 }));
  const core = new Set(squad.sort((a, b) => b.overall - a.overall).slice(0, 11).map((p) => p.id));
  const longInjuries = squad
    .filter((p) => core.has(p.id) && p.injuredUntil && p.injuredUntil > state.date && Math.round((new Date(`${p.injuredUntil}T00:00:00Z`).getTime() - new Date(`${state.date}T00:00:00Z`).getTime()) / 86_400_000) >= 14)
    .map((p) => ({ playerId: p.id, name: playerName(p), position: p.position, until: p.injuredUntil! }));
  return {
    form,
    streak: { kind, length },
    winless,
    awayWinless,
    last3,
    position: row >= 0 ? row + 1 : undefined,
    positionBefore,
    teams: table.length || undefined,
    played: ownRow?.played ?? facts.length,
    points: ownRow?.points,
    droughts,
    shakyKeeper,
    youthMinutes,
    topScorer: topId ? { playerId: topId[0], name: state.players[topId[0]] ? playerName(state.players[topId[0]]) : '', goals: topId[1] } : undefined,
    expiringStars,
    longInjuries,
  };
}

/** Česky skloněné „N zápas(y/ů)“. */
export function matchesWord(n: number): string {
  return `${n} ${n === 1 ? 'zápas' : n < 5 ? 'zápasy' : 'zápasů'}`;
}

// --- R2: výkon hráče od data a poslední venkovní výhra (fórum, komentáře) ---

/** Výkon hráče klubu majitele v zápasech od data (např. posila od příchodu). */
export function playerSpell(state: GameState, playerId: string, since: string): { apps: number; goals: number; minutes: number; avgRating?: number } {
  const own = state.owner.clubId;
  let apps = 0;
  let goals = 0;
  let minutes = 0;
  let sum = 0;
  let rated = 0;
  for (const { f } of ownFixtures(state)) {
    if (f.date < since) continue;
    const r = f.result!;
    const side = f.homeId === own ? r.detail?.home : r.detail?.away;
    const l = [...(side?.lineup ?? []), ...(side?.bench ?? [])].find((x) => x.id === playerId && x.minutes > 0);
    if (!l) continue;
    apps++;
    minutes += l.minutes;
    if (l.rating !== undefined) {
      sum += l.rating;
      rated++;
    }
    goals += r.scorers.filter((s) => s.playerId === playerId && s.clubId === own).length;
  }
  return { apps, goals, minutes, avgRating: rated ? Math.round((sum / rated) * 10) / 10 : undefined };
}

/** Datum poslední venkovní výhry klubu majitele v sezóně (undefined = letos venku nevyhrál). */
export function lastAwayWin(state: GameState): string | undefined {
  const list = ownFixtures(state).filter((x) => x.f.date >= `${state.season}-07-01`);
  for (let i = list.length - 1; i >= 0; i--) {
    const m = matchFacts(state, list[i].f, list[i].name);
    if (m && !m.home && m.outcome === 'V') return m.date;
  }
  return undefined;
}

/** Inkasované góly klubu majitele v posledních N zápasech. */
export function goalsAgainstLast(state: GameState, n: number): number {
  return ownFixtures(state)
    .slice(-n)
    .reduce((a, x) => a + (x.f.homeId === state.owner.clubId ? x.f.result!.awayGoals : x.f.result!.homeGoals), 0);
}

// --- R1: měřítka slibů majitele (engine/situations.ts) ---

/** Odehrané zápasy klubu majitele po datu `after` (bez něj) až do dneška. */
export function ownMatchesSince(state: GameState, after: string): OwnMatchFacts[] {
  return ownFixtures(state)
    .filter((x) => x.f.date > after && x.f.date <= state.date)
    .map((x) => matchFacts(state, x.f, x.name)!)
    .filter(Boolean);
}

/** Odehrané minuty po datu `after`: jednoho hráče (`playerId`), nebo všech vlastních hráčů do `maxAge` let. */
export function minutesSince(state: GameState, after: string, opts: { playerId?: string; maxAge?: number }): number {
  const own = state.owner.clubId;
  let total = 0;
  for (const { f } of ownFixtures(state)) {
    if (f.date <= after || f.date > state.date) continue;
    const side = f.homeId === own ? f.result?.detail?.home : f.result?.detail?.away;
    for (const l of [...(side?.lineup ?? []), ...(side?.bench ?? [])]) {
      if (opts.playerId) {
        if (l.id === opts.playerId) total += l.minutes;
        continue;
      }
      const p = state.players[l.id];
      if (p && p.clubId === own && opts.maxAge !== undefined && playerAge(p, state.season) <= opts.maxAge) total += l.minutes;
    }
  }
  return total;
}
