import { addDays } from './calendar';
import { allFixtures, CUP_FINALIST_PRIZE, CUP_ROUNDS } from './competitions';
import { annualCosts, bonusPerPoint, book } from './finance';
import { isRival } from './league';
import { squadOf } from './players';
import type { ActionResult } from './staff';
import { coachOf } from './staff';
import { computeTable } from './standings';
import type { CoachStyle, Cup, Fixture, GameEvent, GameState, MatchPlan } from './types';
import { clamp, clubLabel, competitionOf, hash01, tierOf } from './world';

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
  const rival = isRival(state, opp);
  if (rival) out.push({ key: rival.kind === 'derby' ? 'derby' : 'soupeř', label: rival.kind === 'derby' ? `derby s ${clubLabel(state, opp)}` : `souboj s přímým soupeřem` });
  if (cup) {
    if (cup.kind === 'pohar') out.push({ key: 'pohar', label: `pohár: ${cup.rounds[f.round - 1]?.name ?? ''}` });
    else out.push({ key: 'zachrana', label: 'baráž o soutěž' });
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
  const rounds = Math.max(...comp.fixtures.map((x) => x.round));
  if (f.round > rounds - 3) out.push({ key: 'zaver', label: 'závěr sezóny' });
  return out;
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
  const none = { bonus: 0, ticketFactor: 1, homeEdge: 0 };
  if (!plan || plan.fixtureId !== f.id) return none;
  const home = f.homeId === state.owner.clubId;
  const accepted = plan.coachAccepted !== false;
  let bonus = 0;
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

export function setHalftime(prev: GameState, choice: NonNullable<MatchPlan['halftime']>): ActionResult {
  const next = nextOwnFixture(prev);
  if (!next) return { state: prev, ok: false, message: 'Žádný zápas.' };
  const state = structuredClone(prev);
  const plan: MatchPlan = state.matchPlan?.fixtureId === next.fixture.id ? state.matchPlan : { fixtureId: next.fixture.id };
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
  maybePressConference(state, f, stakes, gf, ga);
}

// ---------- Tisková konference ----------

function maybePressConference(state: GameState, f: Fixture, stakes: Stake[], gf: number, ga: number): void {
  if (state.events.some((e) => e.template === 'tiskovka-zapas') || state.owner.ousted) return;
  // Nejvýš jedna tisková konference za dva týdny.
  const last = state.eventLog?.['tiskovka-zapas'];
  if (last && addDays(last, 14) > state.date) return;
  const own = state.owner.clubId;
  const red = f.result?.detail?.events.find((e) => e.clubId === own && (e.type === 'cervena' || e.type === 'druha-zluta'));
  const controversy = gf + 1 === ga && hash01(`${f.id}-sporne`) < 0.2;
  const big = Math.abs(gf - ga) >= 4;
  const derby = stakes.some((s) => s.key === 'derby');
  if (!red && !controversy && !big && !derby) return;
  const verdict = gf > ga ? 'výhře' : gf < ga ? 'prohře' : 'remíze';
  const score = `${clubLabel(state, f.homeId)} – ${clubLabel(state, f.awayId)} ${f.result!.homeGoals}:${f.result!.awayGoals}`;
  const appeal = red ? Math.max(30_000, Math.round((annualCosts(state.clubs[own], tierOf(state, own)) * 0.0008) / 10_000) * 10_000) : 0;
  const options: GameEvent['options'] = [
    { id: 'chvala', label: 'Pochválit tým', hint: 'Morálka +3, média +1.' },
    { id: 'kritika', label: 'Kritizovat výkon', hint: 'Morálka −4, důvěra trenéra −2, média +2 (tvrdý majitel).' },
    { id: 'trener', label: 'Podpořit trenéra', hint: 'Důvěra trenéra +4.' },
  ];
  if (controversy || red || gf < ga) options.push({ id: 'rozhodci', label: 'Ohradit se proti rozhodčímu', hint: 'Fanoušci +3, vztah se svazem −4, asi 50% riziko pokuty.' });
  if (red) options.push({ id: 'odvolani', label: `Odvolat se proti trestu (${mil(appeal)})`, hint: 'Asi 40% šance, že se trest zkrátí o zápas.' });
  state.events.push({
    id: `e${++state.nextId}`,
    template: 'tiskovka-zapas',
    date: state.date,
    expires: addDays(state.date, 4),
    title: `Tisková konference po ${verdict}: ${score}`,
    text: controversy ? 'V závěru nebyl uznán gól, který podle záznamu platit měl. Novináři čekají na vaši reakci.' : red ? 'Vyloučení ovlivnilo zápas. Novináři se ptají na disciplínu i na sudí.' : big ? 'Výrazný výsledek, novináři chtějí slyšet majitele.' : 'Zápas, na který se čekalo. Novináři chtějí slyšet majitele.',
    options,
    defaultOption: gf >= ga ? 'chvala' : 'trener',
    playerId: red?.playerId,
    amount: appeal || undefined,
  });
  state.eventLog ??= {};
  state.eventLog['tiskovka-zapas'] = state.date;
}

/** Vyřízení tiskové konference (volá se ze situací k rozhodnutí). */
export function resolvePress(state: GameState, e: GameEvent, option: string, deps: { media: (s: GameState, d: number) => void; league: (s: GameState, d: number) => void; fine: (s: GameState, base: number, note: string) => number }): string {
  const own = state.owner.clubId;
  const team = (d: number) => squadOf(state, own).forEach((p) => (p.morale = clamp(p.morale + d, 0, 100)));
  if (option === 'chvala') {
    team(3);
    deps.media(state, 1);
    return 'Hráči slyšeli pochvalu, kabina je spokojená.';
  }
  if (option === 'kritika') {
    team(-4);
    state.owner.trust.trener = clamp(state.owner.trust.trener - 2, 0, 100);
    deps.media(state, 2);
    return 'Tvrdá slova se nesla médii. Hráči jsou dotčení.';
  }
  if (option === 'trener') {
    state.owner.trust.trener = clamp(state.owner.trust.trener + 4, 0, 100);
    return 'Trenér ocenil podporu.';
  }
  if (option === 'rozhodci') {
    state.clubs[own].fanMood = clamp(state.clubs[own].fanMood + 3, 0, 100);
    deps.league(state, -4);
    if (hash01(`${e.id}-pokuta`) < 0.5) {
      const amount = deps.fine(state, 150_000, 'Pokuta za výroky o rozhodčím');
      return `Fanoušci tleskají, svaz udělil pokutu ${mil(amount)}.`;
    }
    return 'Fanoušci tleskají, svaz tentokrát přimhouřil oko.';
  }
  if (option === 'odvolani') {
    book(state, own, 'ostatni', -(e.amount ?? 0), 'Odvolání proti trestu');
    const p = e.playerId ? state.players[e.playerId] : undefined;
    if (p && p.suspension > 0 && hash01(`${e.id}-odvolani`) < 0.4) {
      p.suspension -= 1;
      return `Odvolání uspělo, ${p.firstName} ${p.lastName} má trest kratší o zápas.`;
    }
    return 'Odvolání neuspělo.';
  }
  return '';
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
      const pens = f.result.penalties ? ` (pen. ${home ? f.result.penalties[0] : f.result.penalties[1]}:${home ? f.result.penalties[1] : f.result.penalties[0]})` : '';
      const won = gf > ga || (!!f.result.penalties && (home ? f.result.penalties[0] > f.result.penalties[1] : f.result.penalties[1] > f.result.penalties[0]));
      if (!won) out = true;
      return { name: r.name, date: r.date, prize, status: 'odehrano' as const, text: `${home ? 'doma' : 'venku'} s ${clubLabel(state, home ? f.awayId : f.homeId)} ${gf}:${ga}${pens}${won ? ', postup' : ', konec'}` };
    }
    if (f) return { name: r.name, date: r.date, prize, status: 'dalsi' as const, text: `${f.homeId === own ? 'doma' : 'venku'} s ${clubLabel(state, f.homeId === own ? f.awayId : f.homeId)}` };
    if (!alive && cup.fixtures.some((x) => x.homeId === own || x.awayId === own)) {
      out = true;
      return { name: r.name, date: r.date, prize, status: 'vypadli' as const, text: '–' };
    }
    if (i === cup.rounds.length - 1) return { name: r.name, date: r.date, prize, status: 'ceka' as const, text: `vítěz ${mil(prize)}, finalista ${mil(CUP_FINALIST_PRIZE)}` };
    return { name: r.name, date: r.date, prize, status: alive ? ('ceka' as const) : ('nehraje' as const), text: alive ? 'los až po předchozím kole' : '–' };
  });
}

