import { forecastSeason, operatingActual } from './budget';
import { addDays } from './calendar';
import { annualCosts, balanceSheet, book } from './finance';
import { startBigProject } from './investments';
import { satisfy } from './ownership';
import { playerAge, squadOf } from './players';
import type { Rng } from './rng';
import { strictnessFactor } from './settings';
import type { ActionResult } from './staff';
import { changeCity } from './surroundings';
import { contracts } from './sponsors';
import type { BudgetPlan, GameEvent, GameState, SponsorSlot } from './types';
import { addNews, clamp, competitionOf, tierOf } from './world';

/**
 * Finance, které se hrají: vedlejší cíle sezóny, scénáře „co když“, rating hospodaření,
 * finanční fair play svazu, sponzoři s aktivacemi a finanční šoky jako situace k rozhodnutí.
 */

const mil = (v: number) => `${(v / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč`;
const own = (s: GameState) => s.clubs[s.owner.clubId];
const roundM = (v: number, step = 50_000) => Math.max(step, Math.round(v / step) * step);

// ---------- Vedlejší cíle sezóny ----------

export type SideGoalKind = 'navsteva' | 'odchovanci' | 'zisk' | 'domaci' | 'goly' | 'pohar';
export type SideGoalGiver = 'sponzor' | 'mesto' | 'akcionari' | 'fanousci' | 'media';

export interface SideGoal {
  kind: SideGoalKind;
  giver: SideGoalGiver;
  label: string;
  target: number;
  reward: number;
  /** Co splnění přinese (krátce, pro výběr). */
  effect?: string;
  /** Vedení tento cíl doporučuje (vybere se sám, když majitel nevybere). */
  recommended?: boolean;
  done?: 'splneno' | 'nesplneno';
}

export interface SideGoalsState {
  season: number;
  /** Vybrané cíle (podle nich se na konci sezóny vyhodnocuje). */
  goals: SideGoal[];
  /** Nabídka cílů na začátku sezóny; dokud majitel nevybere, nic se nevyhodnocuje. */
  offer?: SideGoal[];
  /** Do tohoto data je třeba vybrat, jinak se vyberou doporučené. */
  pickBy?: string;
}

const GIVER_LABEL: Record<SideGoalGiver, string> = { sponzor: 'Generální partner', mesto: 'Město', akcionari: 'Akcionáři', fanousci: 'Fanoušci', media: 'Média' };
export { GIVER_LABEL };

/** Kolik cílů lze vybrat. */
export const SIDE_GOALS_MIN = 2;
export const SIDE_GOALS_MAX = 3;
/** Kolik dní má majitel na výběr. */
export const SIDE_GOALS_PICK_DAYS = 21;

/** Pořadí klubu podle pověsti v soutěži: 0 = favorit, 1 = outsider. */
function strengthRank(state: GameState): number {
  const comp = competitionOf(state, state.owner.clubId);
  if (!comp || comp.clubIds.length < 2) return 0.5;
  const sorted = [...comp.clubIds].sort((a, b) => state.clubs[b].reputation - state.clubs[a].reputation);
  return sorted.indexOf(state.owner.clubId) / (sorted.length - 1);
}

function leagueFixtures(state: GameState) {
  const ownId = state.owner.clubId;
  return competitionOf(state, ownId)?.fixtures.filter((f) => f.homeId === ownId || f.awayId === ownId) ?? [];
}

const CUP_ROUND_NAME = ['', '1. kolo', '2. kolo', 'osmifinále', 'čtvrtfinále', 'semifinále', 'finále'];

/** Nabídka 5–6 cílů pro aktuální sezónu (doporučené jsou označené). */
export function sideGoalOffer(state: GameState): SideGoal[] {
  const club = own(state);
  const tier = tierOf(state, club.id);
  const costs = annualCosts(club, tier);
  const rank = strengthRank(state);
  const homeAvg = Math.round((Math.min(club.stadium.capacity, 150 * Math.pow(1.06, club.reputation) * (tier === 1 ? 1 : tier === 2 ? 0.55 : 0.45)) * 1.05) / 100) * 100;
  const matches = leagueFixtures(state).length || 30;
  const homeGames = Math.max(1, Math.round(matches / 2));
  const homePoints = Math.max(5, Math.round(homeGames * (2.1 - 1.1 * rank)));
  const goals = Math.max(10, Math.round(matches * (1.85 - 0.8 * rank)));
  const goals1: SideGoal[] = [
    { kind: 'navsteva', giver: 'sponzor', label: `Průměrná návštěva doma aspoň ${homeAvg.toLocaleString('cs-CZ')} diváků`, target: homeAvg, reward: roundM(costs * 0.012), effect: 'bonus a lepší vztah s generálním partnerem' },
    { kind: 'odchovanci', giver: 'mesto', label: 'Hráči do 21 let odehrají aspoň 1 500 minut', target: 1500, reward: roundM(costs * 0.008), effect: 'příspěvek města na mládež a lepší vztah s městem' },
    { kind: 'domaci', giver: 'fanousci', label: `Doma získat aspoň ${homePoints} bodů v lize`, target: homePoints, reward: 0, effect: 'lepší nálada fanoušků' },
    { kind: 'goly', giver: 'media', label: `Vstřelit v lize aspoň ${goals} gólů`, target: goals, reward: roundM(costs * 0.005), effect: 'lepší pověst u médií a bonus od televize' },
  ];
  const cup = state.cups.pohar;
  if (cup && !cup.winner && cup.alive.includes(club.id)) {
    const target = tier === 1 && rank < 0.35 ? 5 : tier === 1 ? 4 : tier === 2 ? 3 : 2;
    goals1.push({ kind: 'pohar', giver: 'sponzor', label: `V poháru dojít aspoň do kola: ${CUP_ROUND_NAME[target]}`, target, reward: roundM(costs * 0.006), effect: 'bonus generálního partnera' });
  }
  if (state.shareholders.length > 0) {
    goals1.push({ kind: 'zisk', giver: 'akcionari', label: 'Provozní výsledek sezóny aspoň nula', target: 0, reward: 0, effect: 'spokojenější spolumajitelé' });
  }
  // Doporučené: tři, které se klubu nejvíc hodí (favorit góly a body doma, menší klub mládež a návštěva).
  const prefer: SideGoalKind[] = state.shareholders.length > 0 ? ['navsteva', 'zisk'] : ['navsteva'];
  prefer.push(rank < 0.4 ? 'domaci' : 'odchovanci');
  if (prefer.length < SIDE_GOALS_MAX) prefer.push(rank < 0.4 ? 'goly' : 'domaci');
  for (const g of goals1) g.recommended = prefer.includes(g.kind);
  return goals1;
}

/** Začátek sezóny: nabídka vedlejších cílů, ze které majitel vybere 2–3. */
export function createSideGoals(state: GameState): void {
  state.sideGoals = { season: state.season, goals: [], offer: sideGoalOffer(state), pickBy: addDays(state.date, SIDE_GOALS_PICK_DAYS) };
  addNews(state, {
    kind: 'info',
    title: 'Vyberte vedlejší cíle sezóny',
    text: `Sponzor, město, fanoušci i média nabízejí vedlejší cíle. Ve Financích vyberte ${SIDE_GOALS_MIN} až ${SIDE_GOALS_MAX}. Když do ${formatIso(state.sideGoals.pickBy!)} nevyberete, vyberou se doporučené.`,
  });
}

const formatIso = (iso: string) => iso.split('-').reverse().map((x, i) => (i < 2 ? String(Number(x)) : x)).join('. ');

/** Čeká se na výběr vedlejších cílů? */
export function sideGoalsPending(state: GameState): { offer: SideGoal[]; pickBy?: string; min: number; max: number } | undefined {
  const sg = state.sideGoals;
  if (!sg || sg.season !== state.season || !sg.offer?.length || sg.goals.length) return undefined;
  return { offer: sg.offer, pickBy: sg.pickBy, min: SIDE_GOALS_MIN, max: Math.min(SIDE_GOALS_MAX, sg.offer.length) };
}

function applyPick(state: GameState, kinds: SideGoalKind[]): void {
  const sg = state.sideGoals!;
  sg.goals = sg.offer!.filter((g) => kinds.includes(g.kind)).map((g) => ({ ...g }));
  sg.offer = undefined;
  sg.pickBy = undefined;
}

/** Majitel vybírá vedlejší cíle sezóny (2–3 z nabídky). */
export function pickSideGoals(prev: GameState, kinds: SideGoalKind[]): ActionResult {
  const pending = sideGoalsPending(prev);
  if (!pending) return { state: prev, ok: false, message: 'Vedlejší cíle už jsou pro tuto sezónu vybrané.' };
  const unique = [...new Set(kinds)].filter((k) => pending.offer.some((g) => g.kind === k));
  if (unique.length < pending.min || unique.length > pending.max) return { state: prev, ok: false, message: `Vyberte ${pending.min} až ${pending.max} cíle.` };
  const state = structuredClone(prev);
  applyPick(state, unique);
  return { state, ok: true, message: `Vybrané vedlejší cíle: ${state.sideGoals!.goals.map((g) => GIVER_LABEL[g.giver]).join(', ')}.` };
}

/** Denně: po termínu se vyberou doporučené cíle (se zprávou). */
export function sideGoalsTick(state: GameState): void {
  const pending = sideGoalsPending(state);
  if (!pending || (pending.pickBy && state.date < pending.pickBy)) return;
  autoPick(state);
}

function autoPick(state: GameState): void {
  const pending = sideGoalsPending(state);
  if (!pending) return;
  let kinds = pending.offer.filter((g) => g.recommended).map((g) => g.kind).slice(0, pending.max);
  if (kinds.length < pending.min) kinds = [...kinds, ...pending.offer.filter((g) => !kinds.includes(g.kind)).map((g) => g.kind)].slice(0, pending.min);
  applyPick(state, kinds);
  addNews(state, {
    kind: 'info',
    title: 'Vedlejší cíle sezóny vybrány podle doporučení',
    text: `Výběr jste nestihli, vedení vybralo doporučené: ${state.sideGoals!.goals.map((g) => g.label).join(' · ')}.`,
  });
}

/** Průběžné plnění (0–1) a text. */
export function sideGoalProgress(state: GameState, g: SideGoal): { value: number; text: string; ratio: number } {
  const ownId = state.owner.clubId;
  if (g.kind === 'navsteva') {
    const comp = competitionOf(state, ownId);
    const home = comp?.fixtures.filter((f) => f.homeId === ownId && f.result) ?? [];
    const avg = home.length ? home.reduce((a, f) => a + f.result!.attendance, 0) / home.length : 0;
    return { value: avg, text: home.length ? `zatím ${Math.round(avg).toLocaleString('cs-CZ')} v průměru` : 'zatím žádný domácí zápas', ratio: avg / g.target };
  }
  if (g.kind === 'odchovanci') {
    const minutes = squadOf(state, ownId).filter((p) => playerAge(p, state.season) <= 21).reduce((a, p) => a + p.minutes, 0);
    return { value: minutes, text: `zatím ${minutes.toLocaleString('cs-CZ')} minut`, ratio: minutes / g.target };
  }
  if (g.kind === 'domaci') {
    const home = leagueFixtures(state).filter((f) => f.homeId === ownId && f.result);
    const pts = home.reduce((a, f) => a + (f.result!.homeGoals > f.result!.awayGoals ? 3 : f.result!.homeGoals === f.result!.awayGoals ? 1 : 0), 0);
    return { value: pts, text: `zatím ${pts} bodů z ${home.length} zápasů`, ratio: pts / g.target };
  }
  if (g.kind === 'goly') {
    const played = leagueFixtures(state).filter((f) => f.result);
    const goals = played.reduce((a, f) => a + (f.homeId === ownId ? f.result!.homeGoals : f.result!.awayGoals), 0);
    return { value: goals, text: `zatím ${goals} gólů z ${played.length} zápasů`, ratio: goals / g.target };
  }
  if (g.kind === 'pohar') {
    const cup = state.cups.pohar;
    const mine = cup?.fixtures.filter((f) => f.homeId === ownId || f.awayId === ownId) ?? [];
    const reached = mine.reduce((a, f) => Math.max(a, f.round), 0);
    const out = !!cup && !cup.alive.includes(ownId);
    return { value: reached, text: reached ? `${out ? 'vypadli jsme v kole' : 'hrajeme kolo'}: ${CUP_ROUND_NAME[reached] ?? reached}` : 'pohár ještě nezačal', ratio: reached / g.target };
  }
  const plan = forecastSeason(state);
  return { value: plan.result, text: `výhled ${mil(plan.result)} (zatím ${mil(operatingActual(state))})`, ratio: plan.result >= 0 ? 1 : 0.5 };
}

/** Konec sezóny: vyhodnocení vedlejších cílů. */
export function settleSideGoals(state: GameState): void {
  const sg = state.sideGoals;
  if (!sg || sg.season !== state.season) return;
  if (!sg.goals.length) autoPick(state);
  const ownId = state.owner.clubId;
  const lines: string[] = [];
  for (const g of sg.goals) {
    const ok = g.kind === 'zisk' ? operatingActual(state) >= 0 : sideGoalProgress(state, g).value >= g.target;
    g.done = ok ? 'splneno' : 'nesplneno';
    if (g.giver === 'sponzor') {
      if (ok) book(state, ownId, 'komercni', g.reward, g.kind === 'pohar' ? 'Bonus generálního partnera za pohár' : 'Bonus generálního partnera za návštěvnost');
      changeSponsorRelation(state, 'generalni', ok ? 10 : -6);
    }
    if (g.giver === 'mesto') {
      if (ok) book(state, ownId, 'ostatni', g.reward, 'Příspěvek města na mládež');
      satisfy(state, ok ? 5 : -3, ['mesto', 'patriot']);
      changeCity(state, ok ? 5 : -2);
    }
    if (g.giver === 'fanousci') {
      const club = own(state);
      club.fanMood = clamp(club.fanMood + (ok ? 6 : -3), 0, 100);
    }
    if (g.giver === 'media') {
      if (ok && g.reward) book(state, ownId, 'komercni', g.reward, 'Bonus od televize za útočný fotbal');
      state.owner.media = clamp(state.owner.media + (ok ? 5 : -2), 0, 100);
    }
    if (g.giver === 'akcionari') satisfy(state, ok ? 6 : -5, ['investor', 'spekulant']);
    lines.push(`${GIVER_LABEL[g.giver]}: ${g.label} ${ok ? 'splněno' : 'nesplněno'}${ok && g.reward ? ` (+${mil(g.reward)})` : ''}`);
  }
  addNews(state, { kind: 'sezona', title: `Vedlejší cíle sezóny: splněno ${sg.goals.filter((g) => g.done === 'splneno').length} ze ${sg.goals.length}`, text: lines.join(' · ') });
}

// ---------- Scénáře „co když“ ----------

export type ScenarioKind = 'prodej' | 'mzdy' | 'stadion' | 'krize';
export const SCENARIO_LABEL: Record<ScenarioKind, string> = {
  prodej: 'Prodej nejlepšího hráče',
  mzdy: 'Mzdový strop o 20 % vyšší',
  stadion: 'Zahájit stavbu nového stadionu',
  krize: 'Krize: nálada fanoušků −25',
};

export interface Scenario {
  kind: ScenarioKind;
  label: string;
  note: string;
  plan?: BudgetPlan;
  blocked?: string;
}

/** Výhled sezóny v alternativní situaci (nic se neukládá). */
export function scenarioPlans(state: GameState): Scenario[] {
  const out: Scenario[] = [];
  const ownId = state.owner.clubId;
  {
    const s = structuredClone(state);
    const star = squadOf(s, ownId).sort((a, b) => b.overall - a.overall)[0];
    if (star) {
      const price = Math.round(estimateSale(s, star.id));
      delete s.players[star.id];
      book(s, ownId, 'prestupy', price, `Scénář: prodej ${star.firstName} ${star.lastName}`);
      out.push({ kind: 'prodej', label: SCENARIO_LABEL.prodej, note: `${star.firstName} ${star.lastName} odejde asi za ${mil(price)}. Kádr bude slabší.`, plan: forecastSeason(s) });
    }
  }
  {
    const s = structuredClone(state);
    own(s).policy.wageMultiplier = Math.min(2, own(s).policy.wageMultiplier * 1.2);
    out.push({ kind: 'mzdy', label: SCENARIO_LABEL.mzdy, note: 'Počítá se s využitím celého vyššího stropu (silnější kádr, vyšší náklady).', plan: forecastSeason(s) });
  }
  {
    const r = startBigProject(state, 'stadion');
    out.push(r.ok ? { kind: 'stadion', label: SCENARIO_LABEL.stadion, note: 'Splátky stavby v této sezóně, bez investičního úvěru.', plan: forecastSeason(r.state) } : { kind: 'stadion', label: SCENARIO_LABEL.stadion, note: '', blocked: r.message });
  }
  {
    const s = structuredClone(state);
    own(s).fanMood = Math.max(0, own(s).fanMood - 25);
    out.push({ kind: 'krize', label: SCENARIO_LABEL.krize, note: 'Méně diváků, menší fanshop a útrata na stadionu.', plan: forecastSeason(s) });
  }
  return out;
}

function estimateSale(state: GameState, playerId: string): number {
  const p = state.players[playerId];
  // Stejný výpočet jako tržní hodnota v přestupech (bez importu, aby nevznikl kruh).
  const tier = tierOf(state, p.clubId);
  const factor = tier === 1 ? 1 : tier === 2 ? 0.4 : 0.2;
  const age = state.season - p.birthYear;
  const base = p.overall <= 76 ? 11_000_000 * Math.pow(5, (p.overall - 80) / 10) : 11_000_000 * Math.pow(5, -0.4) * Math.pow(2.2, (p.overall - 76) / 10);
  const ageF = age <= 21 ? 1.6 : age <= 24 ? 1.35 : age <= 27 ? 1.1 : age <= 29 ? 0.85 : 0.55;
  return base * ageF * 25 * factor * 1.1;
}

// ---------- Rating hospodaření ----------

export type Grade = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export function financialRating(state: GameState): { grade: Grade; score: number; reasons: string[] } {
  const club = own(state);
  const costs = annualCosts(club, tierOf(state, club.id));
  const sheet = balanceSheet(state);
  const plan = forecastSeason(state);
  const debt = state.loans.reduce((a, l) => a + l.remaining, 0);
  const reasons: string[] = [];
  let score = 50;
  const equity = (sheet.equity + sheet.ownerLoan) / Math.max(1, costs);
  score += clamp(equity * 30, -30, 25);
  reasons.push(`vlastní kapitál ${equity >= 0 ? '' : 'záporný, '}${Math.round(equity * 100)} % ročních nákladů`);
  const margin = plan.result / Math.max(1, costs);
  score += clamp(margin * 80, -25, 15);
  reasons.push(`provozní výsledek ${mil(plan.result)}`);
  const lev = debt / Math.max(1, costs);
  score -= clamp(lev * 25, 0, 20);
  if (debt) reasons.push(`úvěry ${mil(debt)}`);
  const liquidity = plan.cashMin / Math.max(1, costs / 12);
  score += clamp(liquidity * 3, -15, 10);
  reasons.push(`nejnižší zůstatek ${mil(plan.cashMin)}`);
  const grade: Grade = score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : score >= 20 ? 'E' : 'F';
  return { grade, score: Math.round(score), reasons };
}

/** Úrok banky podle ratingu (bez ratingu běžný). */
export function rateAdjustment(state: GameState): number {
  const g = state.rating?.grade;
  return g === 'A' ? -0.015 : g === 'B' ? -0.005 : g === 'D' ? 0.01 : g === 'E' ? 0.025 : g === 'F' ? 0.05 : 0;
}

/** Konec sezóny: vysvědčení hospodaření. */
export function seasonRating(state: GameState): void {
  const r = financialRating(state);
  state.rating = { season: state.season, grade: r.grade, score: r.score };
  satisfy(state, { A: 6, B: 3, C: 0, D: -3, E: -6, F: -10 }[r.grade], ['investor', 'spekulant', 'mesto']);
  addNews(state, { kind: 'sezona', title: `Finanční vysvědčení sezóny: ${r.grade}`, text: `${r.reasons.join(', ')}. Rating určuje úrok bank${r.grade === 'F' ? '; s F banka nepůjčí' : ''} a spokojenost akcionářů.` });
}

// ---------- Finanční fair play ----------

export interface FfpStatus {
  /** Součet provozních výsledků za tři sezóny (včetně výhledu té aktuální). */
  total: number;
  /** Započtené vklady majitele (polovina). */
  deposits: number;
  limit: number;
  ok: boolean;
  /** Fair play platí jen v profesionálních soutěžích (1. a 2. liga). */
  applies: boolean;
  strikes: number;
  restricted: boolean;
}

/** Čistá půjčka majitele v této sezóně (stejně jako ownerLentThisSeason ve financing.ts; kvůli cyklickým importům zvlášť). */
function lentThisSeason(state: GameState): number {
  return state.ownerLent?.season === state.season ? Math.max(0, state.ownerLent.amount) : 0;
}

export function ffpStatus(state: GameState): FfpStatus {
  const club = own(state);
  const costs = annualCosts(club, tierOf(state, club.id));
  const hist = (state.opHistory ?? []).filter((h) => h.season >= state.season - 2 && h.season < state.season);
  const current = forecastSeason(state).result;
  const total = hist.reduce((a, h) => a + h.result, 0) + current;
  // Vklady i půjčky majitele se počítají napůl (půjčka je taky peníze majitele v klubu).
  const deposits = (hist.reduce((a, h) => a + h.deposits, 0) + (club.finance.season.vklad ?? 0) + lentThisSeason(state)) * 0.5;
  const limit = -costs * 0.5 / strictnessFactor(state);
  const applies = tierOf(state, club.id) <= 2;
  return { total, deposits, limit, ok: !applies || total + deposits >= limit, strikes: state.ffp?.strikes ?? 0, restricted: state.ffp?.restrictedSeason === state.season, applies };
}

/** Konec sezóny: zápis výsledku a kontrola fair play. */
export function seasonFfp(state: GameState): void {
  const club = own(state);
  state.opHistory = [...(state.opHistory ?? []), { season: state.season, result: operatingActual(state), deposits: (club.finance.season.vklad ?? 0) + lentThisSeason(state) }].slice(-5);
  const hist = state.opHistory.filter((h) => h.season > state.season - 3);
  const costs = annualCosts(club, tierOf(state, club.id));
  const total = hist.reduce((a, h) => a + h.result + h.deposits * 0.5, 0);
  const limit = -costs * 0.5 / strictnessFactor(state);
  state.ffp ??= { strikes: 0 };
  if (total >= limit || tierOf(state, club.id) > 2) {
    state.ffp.strikes = Math.max(0, state.ffp.strikes - 1);
    return;
  }
  state.ffp.strikes += 1;
  if (state.ffp.strikes === 1) {
    addNews(state, { kind: 'varovani', title: 'Fair play: napomenutí od svazu', text: `Ztráty za tři sezóny (${mil(total)}) přesáhly limit ${mil(limit)}. Příště hrozí omezení přestupů.` });
  } else if (state.ffp.strikes === 2) {
    state.ffp.restrictedSeason = state.season + 1;
    addNews(state, { kind: 'varovani', title: 'Fair play: omezení přestupů', text: 'Příští sezónu smí klub přivést nejvýš 2 nové hráče za odstupné nebo ze zahraničí.' });
  } else {
    state.ffp.restrictedSeason = state.season + 1;
    const fine = Math.round((costs * 0.02 * strictnessFactor(state)) / 100_000) * 100_000;
    book(state, club.id, 'ostatni', -fine, 'Pokuta svazu: finanční fair play');
    addNews(state, { kind: 'varovani', title: `Fair play: pokuta ${mil(fine)} a omezení přestupů`, text: 'Svaz opakovaně trestá ztráty nad limit.' });
  }
}

/** Smí klub kvůli fair play koupit dalšího hráče? (při omezení nejvýš 2 za sezónu) */
export function ffpBlocksSigning(state: GameState): string | undefined {
  if (state.ffp?.restrictedSeason !== state.season) return undefined;
  const signed = state.market.history.filter((h) => h.toId === state.owner.clubId && h.fee > 0 && h.date >= `${state.season}-07-01`).length;
  return signed >= 2 ? 'Fair play: klub letos smí přivést nejvýš 2 hráče za odstupné.' : undefined;
}

// ---------- Vztahy se sponzory ----------

export function sponsorRelation(state: GameState, slot: SponsorSlot): number {
  return state.sponsorRelations?.[slot] ?? 50;
}

export function changeSponsorRelation(state: GameState, slot: SponsorSlot, delta: number): void {
  state.sponsorRelations = { ...(state.sponsorRelations ?? {}), [slot]: clamp(sponsorRelation(state, slot) + delta, 0, 100) };
}

/** Násobek nabídek při prodlužování podle vztahu (0,9–1,1). */
export function sponsorRelationFactor(state: GameState, slot: SponsorSlot): number {
  return 0.9 + sponsorRelation(state, slot) / 500;
}

// ---------- Situace: sponzoři a šoky ----------

interface Template {
  weight: (state: GameState) => number;
  create: (state: GameState, rng: Rng) => Omit<GameEvent, 'id' | 'template' | 'date' | 'expires'> | null;
  resolve: (state: GameState, event: GameEvent, option: string) => string;
}

export const FINANCE_COOLDOWN: Record<string, number> = { 'sponzor-akce': 90, 'sponzor-rukav': 365, 'sok-energie': 365, 'sok-tv': 730, 'sok-krach': 400, 'sok-refinancovani': 365, 'sok-sbirka': 365 };

export function financeTemplates(h: { teamMorale: (s: GameState, d: number) => void; media: (s: GameState, d: number) => void }): Record<string, Template> {
  const costs = (s: GameState) => annualCosts(own(s), tierOf(s, s.owner.clubId));
  return {
    'sponzor-akce': {
      weight: (s) => (contracts(s).some((c) => c.slot === 'generalni') && squadOf(s, s.owner.clubId).length >= 18 ? 0.6 : 0),
      create: (s) => {
        const c = contracts(s).find((x) => x.slot === 'generalni')!;
        return {
          title: `${c.name} chce tři hráče na firemní akci`,
          text: 'Generální partner pořádá den pro zaměstnance a chce, aby přišly hvězdy týmu. Je to uprostřed přípravy na zápas.',
          amount: roundM(c.annual * 0.03),
          defaultOption: 'poslat',
          options: [
            { id: 'poslat', label: 'Poslat tři opory', hint: 'Vztah se sponzorem +10, bonus, kondice tří hráčů −10, morálka −2.' },
            { id: 'nahradnici', label: 'Poslat náhradníky', hint: 'Vztah se sponzorem +3.' },
            { id: 'odmitnout', label: 'Odmítnout', hint: 'Vztah se sponzorem −10 (horší nabídka při prodloužení).' },
          ],
        };
      },
      resolve: (s, e, o) => {
        if (o === 'poslat') {
          for (const p of squadOf(s, s.owner.clubId).sort((a, b) => b.overall - a.overall).slice(0, 3)) {
            p.fitness = Math.max(60, p.fitness - 10);
            p.morale = clamp(p.morale - 2, 0, 100);
          }
          changeSponsorRelation(s, 'generalni', 10);
          book(s, s.owner.clubId, 'komercni', e.amount ?? 0, 'Bonus generálního partnera za firemní akci');
          return 'Sponzor je nadšený, hráči trochu unavení.';
        }
        if (o === 'nahradnici') {
          changeSponsorRelation(s, 'generalni', 3);
          return 'Sponzor bral, co dostal.';
        }
        changeSponsorRelation(s, 'generalni', -10);
        return 'Sponzor je zklamaný.';
      },
    },
    'sponzor-rukav': {
      weight: (s) => (contracts(s).length >= 2 ? 0.25 : 0),
      create: (s) => {
        const amount = roundM(costs(s) * 0.01);
        return {
          title: 'Sázková kancelář chce logo na rukáv dresu',
          text: 'Nabídka na jednu sezónu. Část fanoušků reklamu na sázení na dresu nesnáší.',
          amount,
          defaultOption: 'odmitnout',
          options: [
            { id: 'prijmout', label: `Přijmout (${mil(amount)})`, hint: 'Peníze hned, nálada fanoušků −3, patrioti −3.' },
            { id: 'odmitnout', label: 'Odmítnout', hint: 'Bez dopadu.' },
          ],
        };
      },
      resolve: (s, e, o) => {
        if (o === 'prijmout') {
          book(s, s.owner.clubId, 'komercni', e.amount ?? 0, 'Logo na rukávu dresu');
          own(s).fanMood = clamp(own(s).fanMood - 3, 0, 100);
          satisfy(s, -3, ['patriot']);
          return 'Logo je na rukávu, část fanoušků protestuje.';
        }
        return 'Dres zůstává čistý.';
      },
    },
    'sok-energie': {
      weight: (s) => ([10, 11, 12, 1].includes(Number(s.date.slice(5, 7))) ? 0.35 : 0),
      create: (s) => {
        const amount = roundM(costs(s) * 0.015);
        return {
          title: 'Ceny energií vyskočily',
          text: `Dodavatel zdražuje: vytápění trávníku, osvětlení a provoz vyjdou do konce sezóny asi o ${mil(amount)} dráž.`,
          amount,
          defaultOption: 'zaplatit',
          options: [
            { id: 'zaplatit', label: 'Zaplatit', hint: `−${mil(amount)}.` },
            { id: 'usporny', label: 'Úsporný režim stadionu', hint: `−${mil(amount * 0.4)}, ale údržba přejde na úspornou (víc zranění, horší trávník).` },
          ],
        };
      },
      resolve: (s, e, o) => {
        if (o === 'usporny') {
          book(s, s.owner.clubId, 'provoz', -Math.round((e.amount ?? 0) * 0.4), 'Dražší energie (úsporný režim)');
          own(s).policy.maintenance = 'nizka';
          return 'Stadion jede v úsporném režimu.';
        }
        book(s, s.owner.clubId, 'provoz', -(e.amount ?? 0), 'Dražší energie');
        return 'Zaplaceno.';
      },
    },
    'sok-tv': {
      weight: () => 0.15,
      create: (s, rng) => {
        const up = rng.next() < 0.6;
        const amount = roundM(costs(s) * (up ? 0.02 : 0.012));
        return {
          title: up ? 'Liga vyjednala lepší televizní smlouvu' : 'Televize krátí platby lize',
          text: up ? `Klub letos dostane navíc asi ${mil(amount)}.` : `Klub letos přijde asi o ${mil(amount)}.`,
          amount: up ? amount : -amount,
          defaultOption: up ? 'ponechat' : 'prijmout',
          options: up
            ? [
                { id: 'ponechat', label: 'Peníze nechat klubu', hint: `+${mil(amount)}.` },
                { id: 'premie', label: 'Polovinu rozdělit hráčům jako prémii', hint: `+${mil(amount / 2)}, morálka týmu +5.` },
              ]
            : [{ id: 'prijmout', label: 'Vzít na vědomí', hint: `−${mil(amount)}.` }],
        };
      },
      resolve: (s, e, o) => {
        const amount = e.amount ?? 0;
        if (amount < 0) {
          book(s, s.owner.clubId, 'tv', amount, 'Nižší platba za TV práva');
          return 'Klub dostane méně.';
        }
        if (o === 'premie') {
          book(s, s.owner.clubId, 'tv', amount, 'Vyšší platba za TV práva');
          book(s, s.owner.clubId, 'platy', -amount / 2, 'Prémie hráčům z TV peněz');
          h.teamMorale(s, 5);
          return 'Hráči ocenili prémii.';
        }
        book(s, s.owner.clubId, 'tv', amount, 'Vyšší platba za TV práva');
        return 'Peníze zůstávají klubu.';
      },
    },
    'sok-krach': {
      weight: (s) => (contracts(s).filter((c) => c.slot !== 'generalni').length >= 2 ? 0.12 : 0),
      create: (s) => {
        const c = contracts(s).filter((x) => x.slot !== 'generalni' && x.slot !== 'stadion').sort((a, b) => b.annual - a.annual)[0];
        if (!c) return null;
        return {
          title: `Sponzor ${c.name} zkrachoval`,
          text: `Smlouva za ${mil(c.annual)} ročně končí. Místo je volné, obchodní oddělení může hledat náhradu.`,
          amount: c.annual,
          defaultOption: 'hledat',
          options: [
            { id: 'hledat', label: 'Hledat nového sponzora', hint: 'Nabídky přijdou v příštích týdnech (Finance › Příjmy).' },
            { id: 'vymahat', label: 'Vymáhat aspoň část peněz soudně', hint: `Náklady na právníky ${mil(c.annual * 0.05)}, asi 50% šance získat ${mil(c.annual * 0.3)}.` },
          ],
        };
      },
      resolve: (s, e, o) => {
        const club = own(s);
        const c = contracts(s).filter((x) => x.slot !== 'generalni' && x.slot !== 'stadion').sort((a, b) => b.annual - a.annual)[0];
        if (c) club.sponsors = (club.sponsors ?? []).filter((x) => x !== c);
        if (o === 'vymahat') {
          book(s, s.owner.clubId, 'ostatni', -Math.round((e.amount ?? 0) * 0.05), 'Právníci: vymáhání od sponzora');
          if (Number(e.id.replace(/\D/g, '')) % 2 === 0) {
            book(s, s.owner.clubId, 'komercni', Math.round((e.amount ?? 0) * 0.3), 'Vymožené peníze od sponzora');
            return 'Soud část peněz přiznal.';
          }
          return 'Vymáhání neuspělo.';
        }
        return 'Obchodní oddělení hledá náhradu.';
      },
    },
    'sok-refinancovani': {
      weight: (s) => (s.loans.some((l) => l.rate >= 0.06) && (s.rating?.grade ?? 'C') <= 'B' ? 0.5 : s.loans.some((l) => l.rate >= 0.06) ? 0.15 : 0),
      create: (s) => {
        const loan = s.loans.find((l) => l.rate >= 0.06)!;
        return {
          title: 'Banka nabízí refinancování úvěru',
          text: `Úvěr ${mil(loan.remaining)} s úrokem ${Math.round(loan.rate * 1000) / 10} % lze převést na ${Math.round((loan.rate - 0.015) * 1000) / 10} % za poplatek ${mil(loan.remaining * 0.01)}.`,
          amount: loan.remaining,
          defaultOption: 'ne',
          options: [
            { id: 'ano', label: 'Refinancovat', hint: 'Nižší splátky do konce úvěru.' },
            { id: 'ne', label: 'Nechat jak je', hint: 'Bez změny.' },
          ],
        };
      },
      resolve: (s, _e, o) => {
        const loan = s.loans.find((l) => l.rate >= 0.06);
        if (o !== 'ano' || !loan) return 'Bez změny.';
        book(s, s.owner.clubId, 'uver', -Math.round(loan.remaining * 0.01), 'Poplatek za refinancování');
        loan.rate -= 0.015;
        const r = loan.rate / 12;
        loan.payment = Math.round((loan.remaining * r) / (1 - Math.pow(1 + r, -loan.monthsLeft)));
        return 'Úvěr je levnější.';
      },
    },
    'sok-sbirka': {
      weight: (s) => (own(s).finance.balance < 0 && own(s).fanMood >= 45 ? 1.5 : 0),
      create: (s) => {
        const amount = roundM(costs(s) * 0.01);
        return {
          title: 'Fanoušci chtějí uspořádat sbírku pro klub',
          text: `Fanklub ví o finančních problémech a nabízí sbírku, která by mohla vynést asi ${mil(amount)}.`,
          amount,
          defaultOption: 'prijmout',
          options: [
            { id: 'prijmout', label: 'Přijmout s díky', hint: `+${mil(amount)}, nálada fanoušků +3, média −2 (klub je na tom špatně).` },
            { id: 'odmitnout', label: 'Odmítnout, klub si poradí', hint: 'Média +2.' },
          ],
        };
      },
      resolve: (s, e, o) => {
        if (o === 'prijmout') {
          book(s, s.owner.clubId, 'ostatni', e.amount ?? 0, 'Sbírka fanoušků');
          own(s).fanMood = clamp(own(s).fanMood + 3, 0, 100);
          h.media(s, -2);
          return 'Fanoušci se složili na svůj klub.';
        }
        h.media(s, 2);
        return 'Klub sbírku odmítl.';
      },
    },
  };
}

export function scenarioSummary(state: GameState): { base: BudgetPlan; scenarios: Scenario[] } {
  return { base: forecastSeason(state), scenarios: scenarioPlans(state) };
}

