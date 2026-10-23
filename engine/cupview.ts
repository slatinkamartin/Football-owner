import { CUP_FINALIST_PRIZE, CUP_ROUNDS, finalStandings } from './competitions';
import {
  EURO_CLUBS,
  EURO_VIEW,
  EUROPE_LABEL,
  europeBestLabel,
  europeRun,
  europeStrength,
  euroExpectedGoals,
  euroKoRound,
  leaguePhaseChance,
  leaguePhaseRank,
  tieAggregate,
  type EuroClub,
  type EuroMatch,
  type EuroRun,
} from './europe';
import { playersByClub, squadOf } from './players';
import { createRng, type Rng } from './rng';
import { clubStrength } from './staff';
import type { EuropeCompetition, Fixture, GameState } from './types';
import { clamp, competitionOf, hash01, tierOf } from './world';

/**
 * V3: pohledy na poháry pro rozhraní – cesta domácím pohárem, pavouk, evropská cesta (předkola s padáky,
 * tabulka ligové fáze 36 týmů, jarní pavouk), šance na fáze (levná simulace s cache po dnech),
 * prémie, štítek do hlavičky, los, pohárová historie a data pro kartu sezóny. Jen čtení stavu
 * (výjimka: recordCupHistory, háček v processDay).
 */

const seasonLabel = (s: number) => `${s}/${String(s + 1).slice(2)}`;
const isOwnFixture = (f: Fixture, id: string) => f.homeId === id || f.awayId === id;

/** Vítěz pohárového zápasu (při remíze rozhodly penalty zapsané do výsledku). */
export function cupFixtureWinner(f: Fixture): string | undefined {
  const r = f.result;
  if (!r) return undefined;
  if (r.homeGoals !== r.awayGoals) return r.homeGoals > r.awayGoals ? f.homeId : f.awayId;
  if (r.penalties) return r.penalties[0] > r.penalties[1] ? f.homeId : f.awayId;
  return undefined;
}

function fixtureScore(f: Fixture): string | undefined {
  const r = f.result;
  if (!r) return undefined;
  return `${r.homeGoals}:${r.awayGoals}${r.penalties ? ` (pen. ${r.penalties[0]}:${r.penalties[1]})` : ''}`;
}

// ---------- Domácí pohár: cesta ----------

export type CupStepStatus = 'postup' | 'vyrazeni' | 'dalsi' | 'volno' | 'ceka' | 'mimo';

export interface CupStepView {
  index: number;
  name: string;
  date: string;
  /** Prémie za postup přes kolo (u finále za vítězství). */
  prize: number;
  status: CupStepStatus;
  fixtureId?: string;
  opponentId?: string;
  home?: boolean;
  /** Skóre z pohledu domácích (jak se píše u zápasu). */
  score?: string;
  /** Skóre z pohledu klubu majitele (vaše góly první). */
  ownScore?: string;
  /** Šance, že klub toto kolo bude hrát (0–1), z odhadu stageChances. */
  chance?: number;
  /** Výsledek je čerstvý (posledních 7 dní) – pro animaci postupu či vyřazení. */
  fresh?: boolean;
}

export interface CupPathView {
  cupName: string;
  steps: CupStepView[];
  participates: boolean;
  alive: boolean;
  champion: boolean;
  eliminated: boolean;
  winnerId?: string;
  lostTo?: string;
  next?: CupStepView;
  /** Vydělané prémie v poháru. */
  earned: number;
  /** Odměna za další krok. */
  nextReward?: { label: string; amount: number };
  /** Zbývající možné prémie (při postupu až do konce). */
  potential: number;
  /** Šance na vítězství v poháru (0–1). */
  winChance?: number;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

/** Cesta poháru bez odhadu šancí (levné, použitelné i v háčku). */
function cupSteps(state: GameState): Omit<CupPathView, 'winChance'> | null {
  const cup = state.cups.pohar;
  if (!cup) return null;
  const id = state.owner.clubId;
  const participates = cup.alive.includes(id) || cup.fixtures.some((f) => isOwnFixture(f, id));
  const last = cup.rounds.length - 1;
  let out = !participates;
  let earned = 0;
  let lostTo: string | undefined;
  const steps: CupStepView[] = cup.rounds.map((r, i) => {
    const base: CupStepView = { index: i, name: r.name, date: r.date, prize: CUP_ROUNDS[i]?.prize ?? 0, status: 'mimo' };
    if (out) return base;
    const f = cup.fixtures.find((x) => x.round === i + 1 && isOwnFixture(x, id));
    if (f) {
      const home = f.homeId === id;
      const step: CupStepView = { ...base, date: f.date, fixtureId: f.id, opponentId: home ? f.awayId : f.homeId, home };
      if (f.result) {
        const winner = cupFixtureWinner(f) ?? (cup.alive.includes(id) ? id : step.opponentId);
        const won = winner === id;
        const fresh = daysBetween(f.date, state.date) <= 7;
        if (won) earned += step.prize;
        else {
          out = true;
          lostTo = step.opponentId;
          if (i === last) earned += CUP_FINALIST_PRIZE;
        }
        const r = f.result;
        const own = home ? [r.homeGoals, r.awayGoals] : [r.awayGoals, r.homeGoals];
        const pens = r.penalties ? (home ? r.penalties : [r.penalties[1], r.penalties[0]]) : undefined;
        const ownScore = `${own[0]}:${own[1]}${pens ? ` (pen. ${pens[0]}:${pens[1]})` : ''}`;
        return { ...step, status: won ? 'postup' : 'vyrazeni', score: fixtureScore(f), ownScore, fresh };
      }
      return { ...step, status: 'dalsi' };
    }
    if (!cup.alive.includes(id)) {
      // Volný los: klub kolo vynechal a hrál až v dalším.
      if (cup.fixtures.some((x) => x.round > i + 1 && isOwnFixture(x, id))) return { ...base, status: 'volno' };
      out = true;
      return base;
    }
    if (cup.fixtures.some((x) => x.round === i + 1)) return { ...base, status: 'volno' };
    return { ...base, status: 'ceka' };
  });
  const alive = cup.alive.includes(id) && !cup.winner;
  const next = steps.find((s) => s.status === 'dalsi' || s.status === 'ceka');
  const champion = cup.winner === id;
  const remaining = steps.filter((s) => s.status === 'dalsi' || s.status === 'ceka');
  return {
    cupName: cup.name,
    steps,
    participates,
    alive,
    champion,
    eliminated: participates && !champion && !cup.alive.includes(id),
    winnerId: cup.winner,
    lostTo,
    next: alive ? next : undefined,
    earned,
    nextReward: alive && next ? { label: next.index === last ? 'Vítězství v poháru' : `Postup přes ${next.name.toLowerCase()}`, amount: next.prize } : undefined,
    potential: alive ? remaining.reduce((a, s) => a + s.prize, 0) : 0,
  };
}

/** C2: cesta pohárem – pruh kol, výsledky, příští soupeř, prémie a šance. */
export function cupPathView(state: GameState): CupPathView | null {
  const base = cupSteps(state);
  if (!base) return null;
  const ch = stageChances(state).cup;
  const steps = base.steps.map((s) => ({ ...s, chance: ch[s.index]?.p }));
  return { ...base, steps, next: base.next ? steps[base.next.index] : undefined, winChance: ch[base.steps.length]?.p };
}

// ---------- Domácí pohár: pavouk ----------

export interface BracketMatch {
  id: string;
  date: string;
  homeId: string;
  awayId: string;
  score?: string;
  winnerId?: string;
  own: boolean;
}

export interface BracketRound {
  index: number;
  name: string;
  date: string;
  drawn: boolean;
  matches: BracketMatch[];
  /** Počet zápasů v kole (i u nevylosovaného). */
  slots: number;
  /** Možní soupeři klubu majitele v tomto kole (u příštího nevylosovaného kola). */
  possible?: { id: string; p: number }[];
}

export interface CupBracketView {
  cupName: string;
  rounds: BracketRound[];
  /** Kolo, na které se má pavouk zaměřit (poslední s klubem majitele). */
  focus: number;
  ownId: string;
  winnerId?: string;
}

/** C1: pavouk domácího poháru (každé kolo se losuje znovu, proto sloupce kol). */
export function cupBracket(state: GameState): CupBracketView | null {
  const cup = state.cups.pohar;
  if (!cup) return null;
  const id = state.owner.clubId;
  const nextOpp = stageChances(state).nextCupOpponents;
  let focus = 0;
  const rounds: BracketRound[] = cup.rounds.map((r, i) => {
    const fixtures = cup.fixtures.filter((f) => f.round === i + 1);
    const matches = fixtures
      .map((f) => ({ id: f.id, date: f.date, homeId: f.homeId, awayId: f.awayId, score: fixtureScore(f), winnerId: cupFixtureWinner(f), own: isOwnFixture(f, id) }))
      .sort((a, b) => Number(b.own) - Number(a.own));
    if (matches.some((m) => m.own)) focus = i;
    const drawn = fixtures.length > 0;
    return {
      index: i,
      name: r.name,
      date: r.date,
      drawn,
      matches,
      slots: drawn ? fixtures.length : Math.max(1, 32 >> i),
      possible: !drawn && i === cup.nextRound && nextOpp.length ? nextOpp : undefined,
    };
  });
  return { cupName: cup.name, rounds, focus, ownId: id, winnerId: cup.winner };
}

// ---------- Šance na fáze (simulace s cache) ----------

export interface StageChance {
  key: string;
  label: string;
  p: number;
}

export interface StageChances {
  /** Šance hrát kolo i (index 0 … počet kol − 1) a na konci vítězství (index = počet kol). */
  cup: StageChance[];
  /** Evropa: ligová fáze, jaro a kola jara podle toho, kde klub je. */
  europe: StageChance[];
  /** Odhad konečného umístění v ligové fázi (36 týmů). */
  league?: { top8: number; top24: number; likely: number; best: number; worst: number };
  /** Možní soupeři v příštím kole poháru (podmíněně při postupu), seřazeno podle šance. */
  nextCupOpponents: { id: string; p: number }[];
}

const CUP_ITER = 400;
const EURO_ITER = 400;
const cache = new Map<string, StageChances>();

function chanceKey(state: GameState): string {
  const cup = state.cups.pohar;
  const run = europeRun(state);
  const cupDone = cup ? cup.fixtures.filter((f) => f.result).length : 0;
  const euDone = run ? run.matches.filter((m) => m.result).length : 0;
  return `${state.season}|${state.date}|${state.owner.clubId}|${cup?.fixtures.length ?? 0}|${cupDone}|${run?.matches.length ?? 0}|${euDone}`;
}

/** C7: šance na každou fázi poháru a Evropy. Simulace běží jednou za den (cache), přepočet po zápase. */
export function stageChances(state: GameState): StageChances {
  const key = chanceKey(state);
  const hit = cache.get(key);
  if (hit) return hit;
  const rng = createRng(Math.floor(hash01(key) * 2 ** 31) + 7);
  const cupSim = simulateCup(state, rng);
  const euro = simulateEurope(state, rng);
  const value: StageChances = { cup: cupSim.stages, nextCupOpponents: cupSim.nextOpp, europe: euro.stages, league: euro.league };
  if (cache.size > 12) cache.delete(cache.keys().next().value!);
  cache.set(key, value);
  return value;
}

/** Šance domácích na postup v pohárovém zápase podle síly (domácí prostředí mírně pomáhá). */
function cupWinP(home: number, away: number): number {
  return 1 / (1 + Math.exp(-(home - away + 2) / 8));
}

function simulateCup(state: GameState, rng: Rng): { stages: StageChance[]; nextOpp: { id: string; p: number }[] } {
  const cup = state.cups.pohar;
  const steps = cupSteps(state);
  if (!cup || !steps) return { stages: [], nextOpp: [] };
  const id = state.owner.clubId;
  const R = cup.rounds.length;
  const stages: StageChance[] = cup.rounds.map((r, i) => ({ key: `kolo-${i}`, label: r.name, p: 0 }));
  stages.push({ key: 'vitez', label: 'Vítěz poháru', p: steps.champion ? 1 : 0 });
  // Odehraná kola: jistota.
  steps.steps.forEach((s, i) => {
    if (s.status === 'postup' || s.status === 'vyrazeni' || s.status === 'volno' || s.status === 'dalsi') stages[i].p = 1;
  });
  if (!steps.alive) return { stages, nextOpp: [] };
  const squads = playersByClub(state);
  const strength = new Map<string, number>();
  const tier = new Map<string, number>();
  for (const c of cup.alive) {
    strength.set(c, clubStrength(state, c, squads));
    tier.set(c, tierOf(state, c));
  }
  const cur = cup.nextRound; // poslední vylosované kolo (1 … R)
  const curFixtures = cup.fixtures.filter((f) => f.round === cur && !f.result);
  const reach = new Array(R + 1).fill(0);
  const opp = new Map<string, number>();
  let ownAdvanced = 0;
  for (let it = 0; it < CUP_ITER; it++) {
    let alive = [...cup.alive];
    let pairs: [string, string][] = curFixtures.map((f) => [f.homeId, f.awayId]);
    let round = cur;
    if (!pairs.length) break;
    for (;;) {
      const losers = new Set<string>();
      for (const [h, a] of pairs) losers.add(rng.chance(cupWinP(strength.get(h) ?? 50, strength.get(a) ?? 50)) ? a : h);
      alive = alive.filter((c) => !losers.has(c));
      if (losers.has(id)) break;
      if (round >= R) {
        reach[R]++;
        break;
      }
      // Los dalšího kola: domácí prostředí má klub z nižší soutěže (finále bez výhody).
      const teams = [...alive];
      for (let i = teams.length - 1; i > 0; i--) {
        const j = Math.floor(rng.next() * (i + 1));
        [teams[i], teams[j]] = [teams[j], teams[i]];
      }
      pairs = [];
      for (let i = 0; i + 1 < teams.length; i += 2) {
        let [h, a] = [teams[i], teams[i + 1]];
        if (round + 1 < R && (tier.get(a) ?? 4) > (tier.get(h) ?? 4)) [h, a] = [a, h];
        pairs.push([h, a]);
      }
      round++;
      reach[round - 1]++;
      if (round === cur + 1) {
        ownAdvanced++;
        const pair = pairs.find((p) => p.includes(id));
        const o = pair ? (pair[0] === id ? pair[1] : pair[0]) : undefined;
        if (o) opp.set(o, (opp.get(o) ?? 0) + 1);
      }
    }
  }
  for (let i = cur; i < R; i++) stages[i].p = reach[i] / CUP_ITER;
  stages[R].p = reach[R] / CUP_ITER;
  const nextOpp = [...opp.entries()].map(([c, n]) => ({ id: c, p: n / Math.max(1, ownAdvanced) })).sort((a, b) => b.p - a.p);
  return { stages, nextOpp };
}

/** Výhra dvojzápasu / finále: góly podle síly, při shodě penalty mírně pro silnější. */
function koTieWin(rng: Rng, s: number, opp: number, firstHome: boolean, single: boolean, carried?: { own: number; opp: number }): boolean {
  let own = carried?.own ?? 0;
  let against = carried?.opp ?? 0;
  const legs: { home: boolean; neutral: boolean }[] = single ? [{ home: false, neutral: true }] : carried ? [{ home: !firstHome, neutral: false }] : [{ home: firstHome, neutral: false }, { home: !firstHome, neutral: false }];
  for (const leg of legs) {
    const [a, b] = euroExpectedGoals(s, opp, leg.home, leg.neutral);
    own += rng.poisson(a);
    against += rng.poisson(b);
  }
  if (own !== against) return own > against;
  return rng.chance(0.5 + clamp((s - opp) * 0.02, -0.2, 0.2));
}

const levelPools = new Map<string, EuroClub[]>();
function poolOf(levels: readonly number[]): EuroClub[] {
  const k = levels.join(',');
  let pool = levelPools.get(k);
  if (!pool) {
    pool = EURO_CLUBS.filter((c) => levels.includes(c.level));
    levelPools.set(k, pool);
  }
  return pool;
}

const KO_KEYS = ['playoff', 'osmifinale', 'ctvrtfinale', 'semifinale', 'finale'];

function simulateEurope(state: GameState, rng: Rng): { stages: StageChance[]; league?: StageChances['league'] } {
  const run = europeRun(state);
  if (!run || run.phase === 'konec') return { stages: [] };
  const s = europeStrength(state, run.clubId);
  const NEXT = EURO_VIEW.NEXT;
  const leagueBy: Record<string, number> = {};
  const ko = [0, 0, 0, 0, 0];
  let spring = 0;
  let top8 = 0;
  let winner = 0;
  let leagueRuns = 0;
  const ranks: number[] = [];
  const ties = run.matches.filter((m) => m.tie === run.nextTie - 1);
  for (let it = 0; it < EURO_ITER; it++) {
    let lc: EuropeCompetition | undefined = run.phase === 'predkola' ? undefined : run.leagueComp;
    let rank: number | undefined;
    let koStart = -1;
    let carried: { own: number; opp: number } | undefined;
    if (run.phase === 'predkola') {
      let c: EuropeCompetition | undefined = run.comp;
      let p = leaguePhaseChance(s, run.comp);
      const leg1 = ties.find((m) => m.leg === 1 && m.result);
      if (leg1) {
        const logit = Math.log(p / (1 - p)) + 0.9 * (leg1.result!.own - leg1.result!.opp);
        p = 1 / (1 + Math.exp(-logit));
      }
      let slot = run.nextTie;
      while (c) {
        if (rng.chance(p)) {
          lc = c;
          break;
        }
        const n: EuropeCompetition | undefined = NEXT[c];
        if (!n || slot > 2) break;
        c = n;
        slot++;
        p = leaguePhaseChance(s, c);
      }
      if (lc) leagueBy[lc] = (leagueBy[lc] ?? 0) + 1;
    }
    if (lc && (run.phase === 'predkola' || run.phase === 'liga')) {
      let pts = run.phase === 'liga' ? run.points : 0;
      let gd = run.phase === 'liga' ? run.gf - run.ga : 0;
      const pots = EURO_VIEW.LEAGUE_POTS[lc];
      const fixtures: { rating: number; home: boolean }[] =
        run.phase === 'liga'
          ? run.matches.filter((m) => m.tie === undefined && !m.result).map((m) => ({ rating: m.opponent.rating, home: m.home }))
          : pots.map((lvl, i) => ({ rating: rng.pick(poolOf([lvl])).rating, home: i % 2 === 0 }));
      for (const f of fixtures) {
        const [a, b] = euroExpectedGoals(s, f.rating, f.home);
        const g1 = rng.poisson(a);
        const g2 = rng.poisson(b);
        pts += g1 > g2 ? 3 : g1 === g2 ? 1 : 0;
        gd += g1 - g2;
      }
      rank = leaguePhaseRank(lc, pts, gd);
      ranks.push(rank);
      leagueRuns++;
      if (rank <= 24) {
        spring++;
        if (rank <= 8) top8++;
        koStart = rank <= 8 ? 1 : 0;
      }
    }
    if (run.phase === 'jaro') {
      lc = run.comp;
      const current = ties[0];
      koStart = current ? euroKoRound(current) : 0;
      const leg1 = ties.find((m) => m.leg === 1 && m.result);
      if (leg1) carried = { own: leg1.result!.own, opp: leg1.result!.opp };
    }
    if (lc && koStart >= 0) {
      for (let r = koStart; r <= 4; r++) {
        ko[r]++;
        const known = r === koStart && run.phase === 'jaro' ? ties[0] : undefined;
        const oppRating = known ? known.opponent.rating : rng.pick(poolOf(EURO_VIEW.KO_LEVELS[lc][r])).rating;
        const firstHome = known ? !!run.matches.find((m) => m.tie === known.tie && m.leg === 1)?.home : r === 0 ? false : rng.chance(0.5);
        const won = koTieWin(rng, s, oppRating, firstHome, r === 4, known ? carried : undefined);
        if (!won) break;
        if (r === 4) winner++;
      }
    }
  }
  const N = EURO_ITER;
  const stages: StageChance[] = [];
  if (run.phase === 'predkola') {
    for (let c: EuropeCompetition | undefined = run.comp; c; c = NEXT[c]) {
      stages.push({ key: `liga-${c}`, label: `Ligová fáze: ${EUROPE_LABEL[c]}`, p: (leagueBy[c] ?? 0) / N });
    }
  }
  if (run.phase !== 'jaro') {
    stages.push({ key: 'jaro', label: 'Postup do jara', p: spring / N });
    stages.push({ key: 'top8', label: 'Přímo do osmifinále (top 8)', p: top8 / N });
  }
  const koLabels = ['Play-off o osmifinále', 'Osmifinále', 'Čtvrtfinále', 'Semifinále', 'Finále'];
  for (let r = 1; r <= 4; r++) {
    if (run.phase === 'jaro' && ties[0] && euroKoRound(ties[0]) >= r) continue;
    stages.push({ key: KO_KEYS[r], label: koLabels[r], p: ko[r] / N });
  }
  stages.push({ key: 'vitez', label: `Vítěz: ${EUROPE_LABEL[run.leagueComp ?? run.comp]}`, p: winner / N });
  let league: StageChances['league'];
  if (ranks.length && leagueRuns) {
    const sorted = [...ranks].sort((a, b) => a - b);
    const q = (x: number) => sorted[Math.min(sorted.length - 1, Math.floor(x * sorted.length))];
    league = { top8: top8 / leagueRuns, top24: spring / leagueRuns, likely: q(0.5), best: q(0.15), worst: q(0.85) };
  }
  return { stages, league };
}

// ---------- Evropa ----------

export interface EuroLegView {
  id: string;
  date: string;
  home: boolean;
  neutral?: boolean;
  /** Skóre z pohledu domácích. */
  score?: string;
  /** Výsledek pro vás: V, R, P. */
  outcome?: 'V' | 'R' | 'P';
}

export interface EuroTieView {
  tie: number;
  comp: EuropeCompetition;
  stage: string;
  opponent: { name: string; country: string; rating: number };
  legs: EuroLegView[];
  aggregate?: string;
  status: 'postup' | 'vyrazeni' | 'hraje';
  /** Co následuje při vyřazení (padák do nižší soutěže). */
  parachute?: string;
  fresh?: boolean;
}

export interface EuroTableRow {
  pos: number;
  name: string;
  country: string;
  own: boolean;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
  zone: 'osmifinale' | 'playoff' | 'vyrazeni';
}

export interface EuroOpponentCard {
  id: string;
  name: string;
  country: string;
  rating: number;
  pot: number;
  date: string;
  home: boolean;
  /** Vaše šance: výhra, remíza, prohra (0–1). */
  odds: { win: number; draw: number; loss: number };
  strength: string;
  score?: string;
  outcome?: 'V' | 'R' | 'P';
  /** Pozice soupeře v tabulce. */
  pos?: number;
}

export interface EuroSpringRound {
  index: number;
  name: string;
  status: 'postup' | 'vyrazeni' | 'hraje' | 'ceka' | 'mimo';
  opponent?: { name: string; country: string; rating: number };
  legs: EuroLegView[];
  aggregate?: string;
  /** Prémie UEFA za postup přes kolo (u finále za vítězství). */
  prize: number;
  /** Možní soupeři (úroveň podle kola). */
  possible: string[];
  fresh?: boolean;
}

export interface EuropeView {
  season: number;
  entry: EuropeCompetition;
  comp: EuropeCompetition;
  compLabel: string;
  phase: EuroRun['phase'];
  best: string;
  strength: number;
  /** Řetěz soutěží s padáky (LM → EL → KL). */
  chain: { comp: EuropeCompetition; label: string; state: 'postup' | 'vyrazeni' | 'hraje' | 'padak' | 'mimo' }[];
  qualifying: EuroTieView[];
  league?: {
    comp: EuropeCompetition;
    played: number;
    total: number;
    points: number;
    gf: number;
    ga: number;
    pos: number;
    table: EuroTableRow[];
    opponents: EuroOpponentCard[];
    estimate?: StageChances['league'];
    final: boolean;
  };
  spring?: { comp: EuropeCompetition; rounds: EuroSpringRound[] };
  chances: StageChance[];
}

function legOf(m: EuroMatch): EuroLegView {
  const r = m.result;
  return {
    id: m.id,
    date: m.date,
    home: m.home,
    neutral: m.neutral,
    score: r ? (m.home ? `${r.own}:${r.opp}` : `${r.opp}:${r.own}`) : undefined,
    outcome: r ? (r.own > r.opp ? 'V' : r.own < r.opp ? 'P' : 'R') : undefined,
  };
}

function tieView(state: GameState, run: EuroRun, tie: number): EuroTieView {
  const ms = run.matches.filter((m) => m.tie === tie).sort((a, b) => (a.date < b.date ? -1 : 1));
  const done = ms.every((m) => m.result);
  const agg = tieAggregate(run, tie);
  const won = agg.own > agg.opp || (agg.own === agg.opp && !!agg.pens && agg.pens[0] > agg.pens[1]);
  const last = ms[ms.length - 1];
  return {
    tie,
    comp: ms[0].comp,
    stage: ms[0].stage,
    opponent: ms[0].opponent,
    legs: ms.map(legOf),
    aggregate: ms.some((m) => m.result) ? `${agg.own}:${agg.opp}${agg.pens ? `, pen. ${agg.pens[0]}:${agg.pens[1]}` : ''}` : undefined,
    status: done ? (won ? 'postup' : 'vyrazeni') : 'hraje',
    fresh: done && daysBetween(last.date, state.date) <= 7,
  };
}

const isQualifying = (run: EuroRun, m: EuroMatch) => m.tie !== undefined && m.date < `${run.season}-09-01`;

function poisPmf(l: number, k: number): number {
  let p = Math.exp(-l);
  for (let i = 1; i <= k; i++) p *= l / i;
  return p;
}

/** Pravděpodobnost výhry, remízy a prohry z očekávaných gólů. */
export function matchOdds(own: number, opp: number, home: boolean, neutral = false): { win: number; draw: number; loss: number } {
  const [a, b] = euroExpectedGoals(own, opp, home, neutral);
  let win = 0;
  let draw = 0;
  for (let i = 0; i <= 10; i++) {
    for (let j = 0; j <= 10; j++) {
      const p = poisPmf(a, i) * poisPmf(b, j);
      if (i > j) win += p;
      else if (i === j) draw += p;
    }
  }
  return { win, draw, loss: Math.max(0, 1 - win - draw) };
}

function strengthText(diff: number): string {
  if (diff > 6) return 'výrazně silnější';
  if (diff > 2) return 'silnější';
  if (diff >= -2) return 'vyrovnaný';
  if (diff >= -6) return 'slabší';
  return 'výrazně slabší';
}

const zoneOf = (pos: number): EuroTableRow['zone'] => (pos <= 8 ? 'osmifinale' : pos <= 24 ? 'playoff' : 'vyrazeni');

/** C4: tabulka ligové fáze. Výsledky ostatních týmů se dopočítají deterministicky podle síly (hra je nesimuluje). */
function leagueTable(state: GameState, run: EuroRun, s: number): EuroTableRow[] {
  const lc = run.leagueComp!;
  const league = run.matches.filter((m) => m.tie === undefined);
  const played = league.filter((m) => m.result).length;
  const oppNames = new Set(league.map((m) => m.opponent.name));
  const levels = [...new Set(EURO_VIEW.LEAGUE_POTS[lc])];
  const others = EURO_CLUBS.filter((c) => levels.includes(c.level) && !oppNames.has(c.name))
    .map((c) => ({ c, k: hash01(`${run.season}|${lc}|${c.name}`) }))
    .sort((a, b) => a.k - b.k)
    .slice(0, 35 - league.length)
    .map((x) => x.c);
  const teams = [...league.map((m) => ({ name: m.opponent.name, country: m.opponent.country, rating: m.opponent.rating, vs: m })), ...others.map((c) => ({ name: c.name, country: c.country, rating: c.rating, vs: undefined as EuroMatch | undefined }))];
  const avg = (teams.reduce((a, t) => a + t.rating, 0) + s) / (teams.length + 1);
  const rows: EuroTableRow[] = teams.map((t) => {
    const row: EuroTableRow = { pos: 0, name: t.name, country: t.country, own: false, played, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0, zone: 'vyrazeni' };
    const add = (gf: number, ga: number) => {
      row.gf += gf;
      row.ga += ga;
      if (gf > ga) {
        row.won++;
        row.points += 3;
      } else if (gf === ga) {
        row.drawn++;
        row.points++;
      } else row.lost++;
    };
    let n = played;
    if (t.vs?.result) {
      add(t.vs.result.opp, t.vs.result.own);
      n--;
    }
    const r = createRng(Math.floor(hash01(`${run.season}|${t.name}|${lc}|liga`) * 2 ** 31));
    for (let k = 0; k < n; k++) {
      const opp = avg + r.normal(0, 4);
      const [a, b] = euroExpectedGoals(t.rating, opp, k % 2 === 0);
      add(Math.min(6, r.poisson(a)), Math.min(6, r.poisson(b)));
    }
    return row;
  });
  const ownRow: EuroTableRow = { pos: 0, name: state.clubs[run.clubId].shortName, country: 'Česko', own: true, played, won: 0, drawn: 0, lost: 0, gf: run.gf, ga: run.ga, points: run.points, zone: 'vyrazeni' };
  for (const m of league) {
    if (!m.result) continue;
    if (m.result.own > m.result.opp) ownRow.won++;
    else if (m.result.own === m.result.opp) ownRow.drawn++;
    else ownRow.lost++;
  }
  const cmp = (a: EuroTableRow, b: EuroTableRow) => b.points - a.points || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf || (a.own ? -1 : b.own ? 1 : a.name.localeCompare(b.name, 'cs'));
  const table = [...rows].sort(cmp);
  let ownIndex = [...rows, ownRow].sort(cmp).indexOf(ownRow);
  // Po poslední kole platí pořadí, podle kterého hra rozhodla o postupu.
  if (played === league.length && played > 0 && run.rank) {
    ownIndex = run.rank - 1;
    for (let i = 0; i < ownIndex; i++) {
      if (table[i].points < ownRow.points || (table[i].points === ownRow.points && table[i].gf - table[i].ga < ownRow.gf - ownRow.ga)) {
        table[i].points = ownRow.points;
        table[i].ga = Math.min(table[i].ga, table[i].gf - (ownRow.gf - ownRow.ga));
      }
    }
    for (let i = ownIndex; i < table.length; i++) {
      if (table[i].points > ownRow.points) table[i].points = ownRow.points;
      if (table[i].points === ownRow.points && table[i].gf - table[i].ga > ownRow.gf - ownRow.ga) table[i].ga = table[i].gf - (ownRow.gf - ownRow.ga) + 1;
    }
  }
  table.splice(ownIndex, 0, ownRow);
  table.forEach((r, i) => {
    r.pos = i + 1;
    r.zone = zoneOf(i + 1);
  });
  return table;
}

function possibleNames(levels: readonly number[], count = 4): string[] {
  return [...poolOf(levels)].sort((a, b) => b.rating - a.rating).slice(0, count).map((c) => c.name);
}

/** C3–C5: evropská cesta klubu majitele (předkola s padáky, tabulka ligové fáze, karty soupeřů, jarní pavouk). */
export function europeView(state: GameState): EuropeView | null {
  const run = europeRun(state);
  const entry = state.europe?.season === state.season ? state.europe.entries.find((e) => e.clubId === state.owner.clubId) : undefined;
  if (!run || !entry) return null;
  const s = europeStrength(state, run.clubId);
  const chances = stageChances(state);
  const NEXT = EURO_VIEW.NEXT;
  const qualTies = [...new Set(run.matches.filter((m) => isQualifying(run, m)).map((m) => m.tie!))].sort((a, b) => a - b);
  const qualifying = qualTies.map((t) => {
    const v = tieView(state, run, t);
    const next = NEXT[v.comp];
    const slotOk = t + 1 <= 2;
    v.parachute =
      v.status === 'postup'
        ? `Postup do ligové fáze: ${EUROPE_LABEL[v.comp]}`
        : next && slotOk
          ? v.status === 'vyrazeni'
            ? `Padák: play-off ${EURO_VIEW.COMP_GEN[next]}`
            : `Při vyřazení padák: play-off ${EURO_VIEW.COMP_GEN[next]}`
          : v.status === 'vyrazeni'
            ? 'Konec evropské sezóny'
            : 'Při vyřazení konec v Evropě (nižší soutěž už není)';
    return v;
  });
  const chain: EuropeView['chain'] = [];
  for (let c: EuropeCompetition | undefined = entry.entry; c; c = NEXT[c]) {
    const tie = qualifying.find((q) => q.comp === c);
    const st: EuropeView['chain'][number]['state'] = tie ? (tie.status === 'hraje' ? 'hraje' : tie.status) : run.leagueComp || run.phase === 'konec' ? 'mimo' : 'padak';
    chain.push({ comp: c, label: EUROPE_LABEL[c], state: st });
  }
  let league: EuropeView['league'];
  if (run.leagueComp) {
    const lc = run.leagueComp;
    const matches = run.matches.filter((m) => m.tie === undefined);
    const table = leagueTable(state, run, s);
    const levels = [...new Set(EURO_VIEW.LEAGUE_POTS[lc])].sort((a, b) => a - b);
    const posOf = new Map(table.map((r) => [r.name, r.pos]));
    const own = table.find((r) => r.own)!;
    const played = matches.filter((m) => m.result).length;
    league = {
      comp: lc,
      played,
      total: matches.length,
      points: run.points,
      gf: run.gf,
      ga: run.ga,
      pos: own.pos,
      table,
      final: played === matches.length,
      estimate: played < matches.length ? chances.league : undefined,
      opponents: matches.map((m) => {
        const lvl = EURO_CLUBS.find((c) => c.name === m.opponent.name)?.level ?? 4;
        const leg = legOf(m);
        return {
          id: m.id,
          name: m.opponent.name,
          country: m.opponent.country,
          rating: m.opponent.rating,
          pot: Math.max(1, levels.indexOf(lvl) + 1),
          date: m.date,
          home: m.home,
          odds: matchOdds(s, m.opponent.rating, m.home),
          strength: strengthText(m.opponent.rating - s),
          score: leg.score,
          outcome: leg.outcome,
          pos: posOf.get(m.opponent.name),
        };
      }),
    };
  }
  let spring: EuropeView['spring'];
  if (run.leagueComp) {
    const lc = run.leagueComp;
    const koTies = [...new Set(run.matches.filter((m) => m.tie !== undefined && !isQualifying(run, m)).map((m) => m.tie!))];
    const byRound = new Map<number, EuroTieView>();
    for (const t of koTies) {
      const first = run.matches.find((m) => m.tie === t)!;
      byRound.set(euroKoRound(first), tieView(state, run, t));
    }
    const start = koTies.length ? Math.min(...byRound.keys()) : undefined;
    let out = run.phase === 'konec' && !koTies.length;
    const names = ['Play-off o osmifinále', 'Osmifinále', 'Čtvrtfinále', 'Semifinále', 'Finále'];
    const rounds: EuroSpringRound[] = names.map((name, r) => {
      const tv = byRound.get(r);
      const base: EuroSpringRound = { index: r, name, status: 'ceka', legs: [], prize: EURO_VIEW.KO_PRIZE[lc][r], possible: possibleNames(EURO_VIEW.KO_LEVELS[lc][r]) };
      if (tv) {
        if (tv.status === 'vyrazeni') out = true;
        return { ...base, status: tv.status, opponent: tv.opponent, legs: tv.legs, aggregate: r === 4 ? undefined : tv.aggregate, fresh: tv.fresh };
      }
      if (out || (start !== undefined && r < start)) return { ...base, status: 'mimo' };
      return base;
    });
    spring = { comp: lc, rounds };
  }
  return {
    season: run.season,
    entry: entry.entry,
    comp: run.comp,
    compLabel: EUROPE_LABEL[run.comp],
    phase: run.phase,
    best: run.best,
    strength: Math.round(s * 10) / 10,
    chain,
    qualifying,
    league,
    spring,
    chances: chances.europe,
  };
}

// ---------- Prémie (C6) ----------

export interface PrizeView {
  cup?: { earned: number; next?: { label: string; amount: number }; potential: number };
  europe?: { earned: number; gate: number; next?: { label: string; amount: number }[] };
  total: number;
}

/** C6: vydělané prémie v poháru a v Evropě a odměna za další krok. */
export function prizeView(state: GameState): PrizeView {
  const path = cupSteps(state);
  const out: PrizeView = { total: 0 };
  if (path?.participates) {
    out.cup = { earned: path.earned, next: path.nextReward, potential: path.potential };
    out.total += path.earned;
  }
  const run = europeRun(state);
  if (run) {
    const since = `${run.season}-07-01`;
    const tx = state.clubs[run.clubId].finance.transactions.filter((t) => t.date >= since);
    const earned = tx.filter((t) => t.category === 'evropa').reduce((a, t) => a + t.amount, 0);
    const gate = tx.filter((t) => t.category === 'vstupne' && t.note.startsWith('Evropský večer')).reduce((a, t) => a + t.amount, 0);
    const next: { label: string; amount: number }[] = [];
    const lc = run.leagueComp ?? run.comp;
    if (run.phase === 'predkola') next.push({ label: `Ligová fáze ${EURO_VIEW.COMP_GEN[run.comp]} (základ, vyplácí se říjen až leden)`, amount: EURO_VIEW.LEAGUE_PHASE[run.comp] });
    if (run.phase === 'liga') {
      next.push({ label: 'Výhra v ligové fázi', amount: EURO_VIEW.PRIZE_WIN[lc] });
      next.push({ label: 'Remíza v ligové fázi', amount: EURO_VIEW.PRIZE_DRAW[lc] });
    }
    if (run.phase === 'jaro') {
      const cur = run.matches.filter((m) => m.tie === run.nextTie - 1)[0];
      const r = cur ? euroKoRound(cur) : 0;
      next.push({ label: r === 4 ? 'Vítězství ve finále' : `Postup do ${EURO_VIEW.KO_ROUNDS_GEN[r + 1]}`, amount: EURO_VIEW.KO_PRIZE[lc][r] });
    }
    out.europe = { earned, gate, next: next.length ? next : undefined };
    out.total += earned + gate;
  }
  return out;
}

// ---------- Štítek do hlavičky (C9) ----------

export interface CupBadgePart {
  kind: 'pohar' | 'evropa';
  text: string;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
  /** Ve hře (živá soutěž). */
  live: boolean;
}

/** Části štítku: domácí pohár a Evropa. */
export function cupBadgeParts(state: GameState): CupBadgePart[] {
  const parts: CupBadgePart[] = [];
  const run = europeRun(state);
  if (run) {
    const short = { LM: 'LM', EL: 'EL', KL: 'KL' }[run.comp];
    if (run.phase === 'predkola') parts.push({ kind: 'evropa', text: `${short}: předkola`, tone: 'warn', live: true });
    else if (run.phase === 'liga') parts.push({ kind: 'evropa', text: `${short}: ${run.points} b.${run.rank ? `, ~${run.rank}. místo` : ''}`, tone: run.rank && run.rank <= 24 ? 'good' : 'warn', live: true });
    else if (run.phase === 'jaro') parts.push({ kind: 'evropa', text: `${short}: ${run.best.split(' ').slice(0, run.best.startsWith('play-off') ? 3 : 1).join(' ')}`, tone: 'good', live: true });
    else if (run.leagueComp || run.best.startsWith('vítěz')) parts.push({ kind: 'evropa', text: `${short}: ${run.best.startsWith('vítěz') ? 'vítěz!' : 'konec'}`, tone: run.best.startsWith('vítěz') ? 'good' : 'neutral', live: false });
  }
  const path = cupSteps(state);
  if (path?.participates) {
    if (path.champion) parts.push({ kind: 'pohar', text: 'Pohár: vítěz!', tone: 'good', live: false });
    else if (path.alive && path.next) parts.push({ kind: 'pohar', text: `Pohár: ${path.next.name.toLowerCase()}`, tone: path.next.index >= 3 ? 'good' : 'neutral', live: true });
    else if (path.eliminated) {
      const lost = path.steps.find((s) => s.status === 'vyrazeni');
      if (lost && lost.index >= 3) parts.push({ kind: 'pohar', text: `Pohár: ${lost.name.toLowerCase()}`, tone: 'neutral', live: false });
    }
  }
  return parts;
}

/** C9: krátký text do hlavičky (např. „Pohár: osmifinále · EL: 7 b., ~14. místo“), nebo null. */
export function cupBadge(state: GameState): string | null {
  const parts = cupBadgeParts(state);
  return parts.length ? parts.map((p) => p.text).join(' · ') : null;
}

// ---------- Los (C8) ----------

export interface DrawPreviewView {
  key: string;
  title: string;
  note: string;
  pots: { label: string; clubs: { id?: string; name: string; detail?: string; p?: number }[] }[];
}

/** C8: koše a možní soupeři před losem příštího kola (domácí pohár i Evropa). */
export function drawPreview(state: GameState): DrawPreviewView[] {
  const out: DrawPreviewView[] = [];
  const cup = state.cups.pohar;
  const path = cupSteps(state);
  if (cup && path?.alive && path.next?.status === 'dalsi' && path.next.index < cup.rounds.length - 1) {
    const opps = stageChances(state).nextCupOpponents;
    const byTier = new Map<number, { id: string; name: string; p: number }[]>();
    for (const o of opps) {
      const t = tierOf(state, o.id);
      const list = byTier.get(t) ?? [];
      list.push({ id: o.id, name: state.clubs[o.id]?.shortName ?? o.id, p: o.p });
      byTier.set(t, list);
    }
    const nextRound = cup.rounds[path.next.index + 1];
    out.push({
      key: 'pohar',
      title: `Pohár: možní soupeři v kole ${nextRound.name.toLowerCase()}`,
      note: `Los proběhne hned po kole ${path.next.name.toLowerCase()} (pokud postoupíte). Domácí prostředí má klub z nižší soutěže. Procenta jsou šance, že na vás klub připadne.`,
      pots: [...byTier.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([t, clubs]) => ({
          label: Object.values(state.competitions).find((c) => c.tier === t)?.name ?? `${t}. úroveň`,
          clubs: clubs.slice(0, 8),
        })),
    });
  }
  const run = europeRun(state);
  if (run && run.phase !== 'konec') {
    const club = (c: EuroClub) => ({ name: c.name, detail: `${c.country}, síla ${c.rating}` });
    if (run.phase === 'predkola') {
      const lc = run.comp;
      const pots = EURO_VIEW.LEAGUE_POTS[lc];
      const levels = [...new Set(pots)].sort((a, b) => a - b);
      out.push({
        key: 'liga',
        title: `Los ligové fáze ${EURO_VIEW.COMP_GEN[lc]} (při postupu)`,
        note: `Vylosujete ${pots.length} soupeřů: ${levels.map((l, i) => `${pots.filter((x) => x === l).length} z koše ${i + 1}`).join(', ')}. Polovinu zápasů hrajete doma.`,
        pots: levels.map((l, i) => ({ label: `Koš ${i + 1}`, clubs: [...poolOf([l])].sort((a, b) => b.rating - a.rating).slice(0, 8).map(club) })),
      });
    } else {
      const lc = run.leagueComp ?? run.comp;
      let rounds: number[] = [];
      if (run.phase === 'liga') rounds = [0, 1];
      else {
        const cur = run.matches.filter((m) => m.tie === run.nextTie - 1)[0];
        const r = cur ? euroKoRound(cur) : 0;
        if (r < 4) rounds = [r + 1];
      }
      if (rounds.length) {
        out.push({
          key: 'jaro',
          title: run.phase === 'liga' ? 'Možní soupeři na jaře' : `Možní soupeři: ${['play-off o osmifinále', 'osmifinále', 'čtvrtfinále', 'semifinále', 'finále'][rounds[0]]}`,
          note: run.phase === 'liga' ? '9.–24. místo hraje play-off o osmifinále, prvních 8 jde rovnou do osmifinále.' : 'Los proběhne hned po rozhodnutí dvojzápasu.',
          pots: rounds.map((r) => ({
            label: ['Play-off o osmifinále', 'Osmifinále', 'Čtvrtfinále', 'Semifinále', 'Finále'][r],
            clubs: [...poolOf(EURO_VIEW.KO_LEVELS[lc][r])].filter((c) => !run.matches.some((m) => m.opponent.name === c.name)).sort((a, b) => b.rating - a.rating).slice(0, 8).map(club),
          })),
        });
      }
    }
  }
  return out;
}

// ---------- Pohárová historie (C11) ----------

export interface CupHistoryEntry {
  season: number;
  clubId: string;
  /** Index posledního odehraného kola (0 = 1. kolo). */
  round: number;
  /** Kam klub došel (např. „osmifinále“, „vítěz“). */
  best: string;
  result: 'vitez' | 'finale' | 'vyrazen' | 'hraje';
  lostTo?: string;
}

/** Háček v processDay: po pohárovém zápase klubu majitele zapíše postup do historie. */
export function recordCupHistory(state: GameState): void {
  const cup = state.cups.pohar;
  const id = state.owner.clubId;
  if (!cup || !cup.fixtures.some((f) => f.date === state.date && f.result && isOwnFixture(f, id))) return;
  const path = cupSteps(state);
  if (!path) return;
  const played = path.steps.filter((s) => s.status === 'postup' || s.status === 'vyrazeni');
  if (!played.length) return;
  const last = played[played.length - 1];
  const final = last.index === path.steps.length - 1;
  const result: CupHistoryEntry['result'] = path.champion ? 'vitez' : last.status === 'vyrazeni' ? (final ? 'finale' : 'vyrazen') : 'hraje';
  const entry: CupHistoryEntry = {
    season: state.season,
    clubId: id,
    round: last.index,
    best: result === 'vitez' ? 'vítěz' : result === 'finale' ? 'finále' : last.status === 'postup' ? (path.steps[last.index + 1]?.name.toLowerCase() ?? last.name.toLowerCase()) : last.name.toLowerCase(),
    result,
    lostTo: path.lostTo ? state.clubs[path.lostTo]?.shortName : undefined,
  };
  const list = (state.cupHistory ?? []).filter((e) => !(e.season === entry.season && e.clubId === id));
  state.cupHistory = [...list, entry].slice(-30);
}

export interface CupHistoryRow {
  season: number;
  label: string;
  cup?: { text: string; tone: 'good' | 'neutral' | 'bad'; current: boolean };
  europe?: { text: string; tone: 'good' | 'neutral' | 'bad'; current: boolean };
}

/** C11: pohárová historie klubu majitele (domácí pohár a Evropa po sezónách, nejnovější první). */
export function cupHistory(state: GameState): CupHistoryRow[] {
  const id = state.owner.clubId;
  const rows = new Map<number, CupHistoryRow>();
  const row = (season: number) => {
    let r = rows.get(season);
    if (!r) {
      r = { season, label: seasonLabel(season) };
      rows.set(season, r);
    }
    return r;
  };
  for (const h of state.history) if (h.cupWinner === id) row(h.season).cup = { text: 'vítěz poháru', tone: 'good', current: false };
  for (const e of state.cupHistory ?? []) {
    if (e.clubId !== id || e.season === state.season) continue;
    row(e.season).cup = { text: e.result === 'vitez' ? 'vítěz poháru' : e.result === 'finale' ? `finále${e.lostTo ? ` (${e.lostTo})` : ''}` : `${e.best}${e.lostTo ? ` (vyřadil ${e.lostTo})` : ''}`, tone: e.result === 'vitez' ? 'good' : e.round >= 3 ? 'neutral' : 'bad', current: false };
  }
  for (const e of state.europeHistory ?? []) {
    if (e.clubId !== id || e.season === state.season) continue;
    const label = europeBestLabel(e);
    row(e.season).europe = { text: `${EUROPE_LABEL[e.entry]}: ${label}`, tone: label.startsWith('vítěz') || e.result !== 'predkola' ? 'good' : 'bad', current: false };
  }
  // Rozehraná sezóna.
  const path = cupSteps(state);
  if (path?.participates) {
    const played = path.steps.filter((s) => s.status === 'postup' || s.status === 'vyrazeni');
    const last = played[played.length - 1];
    const text = path.champion ? 'vítěz poháru' : path.alive ? (path.next ? `ve hře: ${path.next.name.toLowerCase()}` : 've hře') : last ? `${last.name.toLowerCase()}${path.lostTo ? ` (vyřadil ${state.clubs[path.lostTo]?.shortName})` : ''}` : 'bez zápasu';
    row(state.season).cup = { text, tone: path.champion ? 'good' : path.alive ? 'neutral' : 'bad', current: true };
  }
  const run = europeRun(state);
  if (run) row(state.season).europe = { text: `${EUROPE_LABEL[run.leagueComp ?? run.comp]}: ${run.phase === 'konec' ? run.best : `ve hře (${run.best})`}`, tone: run.leagueComp ? 'good' : run.phase === 'konec' ? 'bad' : 'neutral', current: true };
  return [...rows.values()].sort((a, b) => b.season - a.season);
}

// ---------- Karta sezóny (D1) ----------

export interface SeasonCardData {
  season: number;
  label: string;
  clubName: string;
  shortName: string;
  colors: [string, string];
  competition: string;
  position?: number;
  points?: number;
  goalText?: string;
  goalMet?: boolean;
  cup: string;
  europe?: string;
  bestPlayer?: string;
  topScorer?: string;
  record?: string;
  trophies: string[];
  ownerGrade?: string;
  /** Sezóna je uzavřená (výroční zpráva). */
  done: boolean;
}

/** Nejvyšší výhra klubu majitele v aktuální sezóně (liga, pohár, Evropa). */
function biggestWin(state: GameState): string | undefined {
  const id = state.owner.clubId;
  let best: { diff: number; gf: number; text: string } | undefined;
  const consider = (gf: number, ga: number, text: string) => {
    const diff = gf - ga;
    if (diff > 0 && (!best || diff > best.diff || (diff === best.diff && gf > best.gf))) best = { diff, gf, text };
  };
  const lists = [...Object.values(state.competitions).map((c) => c.fixtures), ...Object.values(state.cups).map((c) => c.fixtures)];
  for (const list of lists) {
    for (const f of list) {
      if (!f.result || !isOwnFixture(f, id)) continue;
      const home = f.homeId === id;
      consider(home ? f.result.homeGoals : f.result.awayGoals, home ? f.result.awayGoals : f.result.homeGoals, `${state.clubs[f.homeId]?.shortName} – ${state.clubs[f.awayId]?.shortName} ${f.result.homeGoals}:${f.result.awayGoals}`);
    }
  }
  const run = europeRun(state);
  for (const m of run?.matches ?? []) {
    if (!m.result) continue;
    const own = state.clubs[id].shortName;
    consider(m.result.own, m.result.opp, m.home ? `${own} – ${m.opponent.name} ${m.result.own}:${m.result.opp}` : `${m.opponent.name} – ${own} ${m.result.opp}:${m.result.own}`);
  }
  return best ? `Nejvyšší výhra: ${best.text}` : undefined;
}

/** D1: data pro kartu sezóny ke sdílení (z výroční zprávy, nebo průběžně z rozehrané sezóny). */
export function seasonCardData(state: GameState, season?: number): SeasonCardData {
  const club = state.clubs[state.owner.clubId];
  const s = season ?? state.season;
  const report = (state.seasonReports ?? []).find((r) => r.season === s);
  const rows = cupHistory(state);
  const row = rows.find((r) => r.season === s);
  const comp = competitionOf(state, club.id);
  const base: SeasonCardData = {
    season: s,
    label: seasonLabel(s),
    clubName: club.name,
    shortName: club.shortName,
    colors: club.colors,
    competition: report?.competition ?? comp?.name ?? '',
    cup: row?.cup?.text ?? 'bez poháru',
    europe: row?.europe?.text,
    trophies: report ? report.trophies : (state.trophies ?? []).filter((t) => t.season === s && (!t.clubId || t.clubId === club.id) && t.kind !== 'vyzva').map((t) => t.text),
    done: !!report,
  };
  if (report) {
    const hist = state.history.find((h) => h.season === s);
    return {
      ...base,
      position: report.position,
      points: hist?.ownerClub.points,
      goalText: report.goalText,
      goalMet: report.goalMet,
      bestPlayer: report.bestPlayer ? `${report.bestPlayer.name} (${report.bestPlayer.rating.toFixed(1).replace('.', ',')})` : undefined,
      topScorer: report.topScorer ? `${report.topScorer.name} (${report.topScorer.goals} gólů)` : undefined,
      record: s === state.season ? biggestWin(state) : undefined,
      ownerGrade: report.ownerGrade,
    };
  }
  const table = comp ? finalStandings(comp, state) : [];
  const idx = table.findIndex((r) => r.clubId === club.id);
  const squad = squadOf(state, club.id);
  const rated = squad.filter((p) => p.ratingCount >= 5).sort((a, b) => b.ratingSum / b.ratingCount - a.ratingSum / a.ratingCount)[0];
  const scorer = [...squad].sort((a, b) => b.goals - a.goals)[0];
  return {
    ...base,
    position: idx >= 0 && table[idx].played > 0 ? idx + 1 : undefined,
    points: idx >= 0 ? table[idx].points : undefined,
    bestPlayer: rated ? `${rated.firstName} ${rated.lastName} (${(rated.ratingSum / rated.ratingCount).toFixed(1).replace('.', ',')})` : undefined,
    topScorer: scorer && scorer.goals > 0 ? `${scorer.firstName} ${scorer.lastName} (${scorer.goals} gólů)` : undefined,
    record: biggestWin(state),
  };
}

