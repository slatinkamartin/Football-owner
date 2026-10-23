import { addDays } from './calendar';
import { allFixtures, CUP_FINALIST_PRIZE, CUP_ROUNDS } from './competitions';
import { annualCosts, bonusPerPoint, book } from './finance';
import { isRival } from './league';
import { squadOf, teamStrength } from './players';
import type { ActionResult } from './staff';
import { coachOf } from './staff';
import { computeTable } from './standings';
import type { CoachStyle, Cup, Fixture, GameEvent, GameState, MatchPlan } from './types';
import { clamp, clubLabel, competitionOf, hash01, tierOf } from './world';
import { resolvePressConference } from './press';
import { trainingMatchBonus } from './training'; // V1

/**
 * Zápasový den majitele: o co v zápase jde (sázka), příprava s trenérem a zásahy majitele,
 * rozhodnutí o poločase při živém přenosu, tisková konference po výjimečném zápase,
 * zátěž kalendáře a cesta pohárem.
 */

const mil = (v: number) => `${(v / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč`;

// ---------- Příští zápas a sázka ----------

export interface OwnFixture {
  fixture: Fixture;
  name: string;
  cup?: Cup;
  home: boolean;
  opponentId: string;
}

export function nextOwnFixture(state: GameState): OwnFixture | undefined {
  const own = state.owner.clubId;
  const next = allFixtures(state)
    .filter((x) => !x.fixture.result && x.fixture.date > state.date && (x.fixture.homeId === own || x.fixture.awayId === own))
    .sort((a, b) => (a.fixture.date < b.fixture.date ? -1 : 1))[0];
  if (!next) return undefined;
  const home = next.fixture.homeId === own;
  return { fixture: next.fixture, name: next.name, cup: next.cup, home, opponentId: home ? next.fixture.awayId : next.fixture.homeId };
}

export interface Stake {
  key: 'derby' | 'soupeř' | 'titul' | 'zachrana' | 'pohar' | 'zaver';
  label: string;
}

/** O co v zápase jde. Prázdné = běžný zápas. */
export function matchStakes(state: GameState, f: Fixture, cup?: Cup): Stake[] {
  const own = state.owner.clubId;
  const opp = f.homeId === own ? f.awayId : f.homeId;
  const out: Stake[] = [];
  // Sázka jen u zápasů, které opravdu rozhodují: derby, čelo tabulky, záchrana, pohár od čtvrtfinále.
  const rival = isRival(state, opp);
  if (rival?.kind === 'derby') out.push({ key: 'derby', label: `derby: ${clubLabel(state, opp)}` });
  if (cup) {
    if (cup.kind === 'pohar') {
      if (f.round >= 4) out.push({ key: 'pohar', label: `pohár: ${cup.rounds[f.round - 1]?.name ?? ''}` });
    } else out.push({ key: 'zachrana', label: 'baráž o soutěž' });
    return out;
  }
  const comp = competitionOf(state, own);
  if (!comp) return out;
  const table = computeTable(comp, state);
  const pos = (id: string) => table.findIndex((r) => r.clubId === id) + 1;
  const played = table.find((r) => r.clubId === own)?.played ?? 0;
  const n = table.length;
  if (played >= 10) {
    if (pos(own) <= 3 && pos(opp) <= 3) out.push({ key: 'titul', label: 'souboj o čelo tabulky' });
    if (pos(own) > n - 4 && pos(opp) > n - 4) out.push({ key: 'zachrana', label: 'šestibodový zápas o záchranu' });
  }
  return out;
}

// ---------- Informace o soupeři ----------

export interface OpponentScout {
  position?: number;
  points?: number;
  ownPosition?: number;
  form: ('V' | 'R' | 'P')[];
  strength: number;
  ownStrength: number;
  scorers: { id: string; name: string; goals: number }[];
  injured: number;
  meetings: { date: string; text: string }[];
}

/** Co majitel ví o soupeři: tabulka, forma, síla sestavy, střelci, absence a vzájemné zápasy. */
export function opponentScout(state: GameState, oppId: string): OpponentScout {
  const own = state.owner.clubId;
  const comp = competitionOf(state, own);
  const table = comp && comp.clubIds.includes(oppId) ? computeTable(comp, state) : [];
  const row = table.find((r) => r.clubId === oppId);
  const ownRow = table.find((r) => r.clubId === own);
  const goals = new Map<string, number>();
  const meetings: { date: string; text: string }[] = [];
  for (const { fixture: f } of allFixtures(state)) {
    if (!f.result) continue;
    for (const s of f.result.scorers) if (s.clubId === oppId) goals.set(s.playerId, (goals.get(s.playerId) ?? 0) + 1);
    if ((f.homeId === own && f.awayId === oppId) || (f.homeId === oppId && f.awayId === own)) {
      meetings.push({ date: f.date, text: `${clubLabel(state, f.homeId)} – ${clubLabel(state, f.awayId)} ${f.result.homeGoals}:${f.result.awayGoals}` });
    }
  }
  const scorers = [...goals.entries()]
    .filter(([id]) => state.players[id]?.clubId === oppId)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, n]) => ({ id, name: `${state.players[id].firstName} ${state.players[id].lastName}`, goals: n }));
  const squad = squadOf(state, oppId);
  const fit = (list: typeof squad) => list.filter((p) => !p.injuredUntil || p.injuredUntil < state.date);
  return {
    position: row ? table.indexOf(row) + 1 : undefined,
    points: row?.points,
    ownPosition: ownRow ? table.indexOf(ownRow) + 1 : undefined,
    form: row?.form ?? [],
    strength: Math.round(teamStrength(fit(squad))),
    ownStrength: Math.round(teamStrength(fit(squadOf(state, own)))),
    scorers,
    injured: squad.length - fit(squad).length,
    meetings: meetings.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 3),
  };
}

// ---------- Příprava na zápas ----------

const APPROACH_STYLE: Record<NonNullable<MatchPlan['approach']>, CoachStyle> = { utok: 'utocny', vyvazene: 'vyvazeny', beton: 'defenzivni' };
export const APPROACH_LABEL: Record<NonNullable<MatchPlan['approach']>, string> = { utok: 'útočně', vyvazene: 'vyváženě', beton: 'zabetonovat' };

/** Prémie navíc za výhru (zhruba za tři výhry v běžném systému prémií). */
export function matchBonusAmount(state: GameState): number {
  return Math.max(50_000, Math.round((bonusPerPoint(state.clubs[state.owner.clubId]) * 9) / 50_000) * 50_000);
}

export function choreoCost(state: GameState): number {
  const club = state.clubs[state.owner.clubId];
  return Math.max(30_000, Math.round((annualCosts(club, tierOf(state, club.id)) * 0.002) / 10_000) * 10_000);
}

/** Šance, že trenér doporučení majitele přijme (důvěra a ego). */
export function coachAcceptChance(state: GameState): number {
  const coach = coachOf(state, state.owner.clubId);
  if (!coach) return 1;
  return clamp(state.owner.trust.trener / 100 - (coach.ego - 10) / 40 + 0.2, 0.15, 0.95);
}

export function setMatchPlan(prev: GameState, patch: Omit<Partial<MatchPlan>, 'fixtureId'>): ActionResult {
  const next = nextOwnFixture(prev);
  if (!next) return { state: prev, ok: false, message: 'Žádný zápas není na programu.' };
  if (prev.owner.ousted) return { state: prev, ok: false, message: 'Klub teď řídí představenstvo.' };
  const state = structuredClone(prev);
  const plan: MatchPlan = state.matchPlan?.fixtureId === next.fixture.id ? state.matchPlan : { fixtureId: next.fixture.id };
  Object.assign(plan, patch);
  // Doporučení k taktice a rotaci trenér přijme, nebo ne (rozhodne se hned, ať to majitel ví).
  if ((patch.approach && patch.approach !== 'vyvazene') || patch.rotate) {
    plan.coachAccepted = hash01(`${next.fixture.id}-${patch.approach ?? ''}-${patch.rotate ?? ''}`) < coachAcceptChance(state);
  }
  state.matchPlan = plan;
  let message = 'Plán na zápas uložen.';
  if (patch.approach || patch.rotate !== undefined) message = plan.coachAccepted === false ? 'Trenér vaše doporučení odmítl, postaví tým po svém.' : 'Trenér doporučení přijal. Když to nevyjde, padá to i na vás.';
  if (patch.visit) message = 'Před zápasem zajdete do kabiny.';
  if (patch.bonus) message = `Hráči dostanou za výhru navíc ${mil(patch.bonus)}.`;
  if (patch.fanAction === 'levne') message = 'Vstupné na zápas bude poloviční: přijde víc lidí.';
  if (patch.fanAction === 'choreo') message = `Klub zaplatí choreo kotle (${mil(choreoCost(state))}).`;
  return { state, ok: true, message };
}

export function dismissMatchPlan(prev: GameState, fixtureId: string): GameState {
  const state = structuredClone(prev);
  state.planDismissed = [...(state.planDismissed ?? []), fixtureId].slice(-10);
  return state;
}

/** Zápas se sázkou v příštích dnech, ke kterému se majitele hra zeptá na přípravu. */
export function pendingPrematch(state: GameState): (OwnFixture & { stakes: Stake[] }) | undefined {
  const next = nextOwnFixture(state);
  if (!next || state.owner.ousted) return undefined;
  if (next.fixture.date > addDays(state.date, 3)) return undefined;
  // Dialog zmizí, až ho majitel potvrdí (plán se dá měnit, dokud je otevřený).
  if (state.planDismissed?.includes(next.fixture.id)) return undefined;
  const stakes = matchStakes(state, next.fixture, next.cup);
  return stakes.length ? { ...next, stakes } : undefined;
}

export interface PlanEffect {
  style?: CoachStyle;
  bonus: number;
  ticketFactor: number;
  homeEdge: number;
}

/** Jak plán majitele ovlivní jeho stranu v zápase. */
export function planEffect(state: GameState, f: Fixture): PlanEffect {
  const plan = state.matchPlan;
  const none = { bonus: trainingMatchBonus(state, f), ticketFactor: 1, homeEdge: 0 }; // V1: plán tréninku
  if (!plan || plan.fixtureId !== f.id) return none;
  const home = f.homeId === state.owner.clubId;
  const accepted = plan.coachAccepted !== false;
  let bonus = trainingMatchBonus(state, f); // V1
  if (plan.bonus) bonus += 1;
  if (plan.visit) bonus += state.owner.trust.trener >= 50 ? 0.5 : -0.5;
  if (plan.rotate && accepted) bonus -= 1.5;
  return {
    style: plan.approach && accepted ? APPROACH_STYLE[plan.approach] : undefined,
    bonus,
    ticketFactor: home && plan.fanAction === 'levne' ? 0.5 : 1,
    homeEdge: home ? (plan.fanAction === 'choreo' ? 1 : plan.fanAction === 'levne' ? 0.6 : 0) : 0,
  };
}

/** Rozhodnutí o poločase (živý přenos): změna stylu a nasazení od 46. minuty. */
export function halftimeAdjust(state: GameState, f: Fixture): { style?: CoachStyle; bonus?: number } | undefined {
  const plan = state.matchPlan;
  if (!plan || plan.fixtureId !== f.id || !plan.halftime || plan.halftime === 'drzet') return undefined;
  const accepted = hash01(`${f.id}-pulka-${plan.halftime}`) < coachAcceptChance(state) + 0.15;
  if (!accepted) return undefined;
  return plan.halftime === 'riskovat' ? { style: 'utocny', bonus: 0.6 } : { style: 'defenzivni', bonus: 0.3 };
}

export function setHalftime(prev: GameState, choice: NonNullable<MatchPlan['halftime']>, fixtureId?: string): ActionResult {
  // V4: fixtureId = konkrétní zápas (např. evropský), jinak příští domácí.
  const id = fixtureId ?? nextOwnFixture(prev)?.fixture.id;
  if (!id) return { state: prev, ok: false, message: 'Žádný zápas.' };
  const state = structuredClone(prev);
  const plan: MatchPlan = state.matchPlan?.fixtureId === id ? state.matchPlan : { fixtureId: id };
  plan.halftime = choice;
  state.matchPlan = plan;
  return { state, ok: true, message: '' };
}

/**
 * Po vlastním zápase: prémie, důvěra trenéra podle přijatého doporučení, větší vliv zápasů se sázkou
 * na fanoušky a média, regenerace po rotaci a případná tisková konference.
 */
export function afterOwnMatch(state: GameState, f: Fixture, cup?: Cup): void {
  const own = state.owner.clubId;
  const r = f.result;
  if (!r) return;
  const home = f.homeId === own;
  const gf = home ? r.homeGoals : r.awayGoals;
  const ga = home ? r.awayGoals : r.homeGoals;
  const won = gf > ga || (!!r.penalties && (home ? r.penalties[0] > r.penalties[1] : r.penalties[1] > r.penalties[0]));
  const lost = !won && gf < ga;
  const club = state.clubs[own];
  const plan = state.matchPlan?.fixtureId === f.id ? state.matchPlan : undefined;
  const stakes = matchStakes(state, f, cup);
  if (plan) {
    if (plan.bonus && won) book(state, own, 'platy', -plan.bonus, `Mimořádná prémie za výhru: ${clubLabel(state, f.homeId)} – ${clubLabel(state, f.awayId)}`);
    if (plan.fanAction === 'choreo') book(state, own, 'ostatni', -choreoCost(state), 'Choreo kotle');
    if (plan.fanAction) club.fanMood = clamp(club.fanMood + 2, 0, 100);
    if ((plan.approach && plan.approach !== 'vyvazene') || plan.rotate) {
      if (plan.coachAccepted) state.owner.trust.trener = clamp(state.owner.trust.trener + (won ? 2 : lost ? -3 : 0), 0, 100);
    }
    if (plan.visit) state.owner.trust.trener = clamp(state.owner.trust.trener + (state.owner.trust.trener >= 50 ? 1 : -3), 0, 100);
    if (plan.rotate && plan.coachAccepted !== false) {
      for (const p of squadOf(state, own).sort((a, b) => b.overall - a.overall).slice(0, 6)) p.fitness = Math.min(100, p.fitness + 12);
    }
    state.matchPlan = undefined;
  }
  // Zápasy se sázkou: výsledek má dvojnásobný vliv na fanoušky a média.
  if (stakes.length && !cup) {
    const extra = won ? (stakes.some((s) => s.key === 'derby') ? 3 : 1.5) : lost ? -1.5 : 0;
    club.fanMood = clamp(club.fanMood + extra, 0, 100);
    state.owner.media = clamp(state.owner.media + extra / 2, 0, 100);
  }
}

// ---------- Tisková konference ----------
// Tiskovku po zápase vytváří engine/press.ts (dailyPress, otázky z fakt zápasu). Zde jen vyřízení
// pro šablonu situace „tiskovka-zapas“ v engine/events.ts.

/** Vyřízení tiskové konference (volá se ze situací k rozhodnutí). */
export function resolvePress(state: GameState, e: GameEvent, option: string, _deps?: unknown): string {
  return resolvePressConference(state, e, option);
}

// ---------- Zátěž ----------

export interface Workload {
  /** Vlastní zápasy za posledních 7 a příštích 14 dní. */
  recent: number;
  upcoming: number;
  fitness: number;
  injured: number;
  level: 'nizka' | 'stredni' | 'vysoka';
  advice: string;
}

export function workload(state: GameState): Workload {
  const own = state.owner.clubId;
  const mine = allFixtures(state).filter((x) => x.fixture.homeId === own || x.fixture.awayId === own).map((x) => x.fixture.date);
  const recent = mine.filter((d) => d <= state.date && d > addDays(state.date, -7)).length;
  const upcoming = mine.filter((d) => d > state.date && d <= addDays(state.date, 14)).length;
  const core = squadOf(state, own).sort((a, b) => b.overall - a.overall).slice(0, 16);
  const fitness = core.length ? core.reduce((a, p) => a + p.fitness, 0) / core.length : 100;
  const injured = squadOf(state, own).filter((p) => p.injuredUntil && p.injuredUntil >= state.date).length;
  const load = upcoming + recent;
  const level = load >= 6 || fitness < 82 ? 'vysoka' : load >= 4 || fitness < 90 ? 'stredni' : 'nizka';
  const advice =
    level === 'vysoka'
      ? 'Nahuštěný program: doporučte trenérovi rotaci u méně důležitého zápasu, jinak hrozí zranění.'
      : level === 'stredni'
        ? 'Běžná zátěž, hlídejte kondici opor.'
        : 'Klidný program, tým je odpočatý.';
  return { recent, upcoming, fitness: Math.round(fitness), injured, level, advice };
}

// ---------- Cesta pohárem ----------

export interface CupStep {
  name: string;
  date: string;
  prize: number;
  status: 'odehrano' | 'dalsi' | 'ceka' | 'vypadli' | 'nehraje';
  text: string;
}

export function cupPath(state: GameState): CupStep[] {
  const cup = state.cups.pohar;
  const own = state.owner.clubId;
  if (!cup) return [];
  const alive = cup.alive.includes(own);
  let out = false;
  return cup.rounds.map((r, i) => {
    const f = cup.fixtures.find((x) => x.round === i + 1 && (x.homeId === own || x.awayId === own));
    const prize = CUP_ROUNDS[i]?.prize ?? 0;
    if (out) return { name: r.name, date: r.date, prize, status: 'vypadli' as const, text: '–' };
    if (f?.result) {
      const home = f.homeId === own;
      const gf = home ? f.result.homeGoals : f.result.awayGoals;
      const ga = home ? f.result.awayGoals : f.result.homeGoals;
      const won = gf > ga || (!!f.result.penalties && (home ? f.result.penalties[0] > f.result.penalties[1] : f.result.penalties[1] > f.result.penalties[0]));
      if (!won) out = true;
      return { name: r.name, date: r.date, prize, status: 'odehrano' as const, text: `${home ? 'doma' : 'venku'}: ${clubLabel(state, f.homeId)} – ${clubLabel(state, f.awayId)} ${f.result.homeGoals}:${f.result.awayGoals}${f.result.penalties ? ` (pen. ${f.result.penalties[0]}:${f.result.penalties[1]})` : ''}${won ? ', postup' : ', konec'}` };
    }
    if (f) return { name: r.name, date: r.date, prize, status: 'dalsi' as const, text: `${f.homeId === own ? 'doma' : 'venku'}: ${clubLabel(state, f.homeId)} – ${clubLabel(state, f.awayId)}` };
    if (!alive && cup.fixtures.some((x) => x.homeId === own || x.awayId === own)) {
      out = true;
      return { name: r.name, date: r.date, prize, status: 'vypadli' as const, text: '–' };
    }
    if (i === cup.rounds.length - 1) return { name: r.name, date: r.date, prize, status: 'ceka' as const, text: `vítěz ${mil(prize)}, finalista ${mil(CUP_FINALIST_PRIZE)}` };
    return { name: r.name, date: r.date, prize, status: alive ? ('ceka' as const) : ('nehraje' as const), text: alive ? 'los až po předchozím kole' : '–' };
  });
}

