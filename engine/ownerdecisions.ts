import { addDays, dayOfWeek } from './calendar';
import { allFixtures } from './competitions';
import { teamChemistry } from './chemistry'; // W4: týmová chemie
import { europeRun } from './europe';
import { annualCosts, book } from './finance';
import { media } from './grey';
import { hasProgram, programAnnual, programOneOff } from './investments';
import { addOwnerXp } from './ownerlevel';
import { satisfy } from './ownership';
import { playerAge, squadOf } from './players';
import { decisionBudgetLeft, decisionsLastWeek } from './situations';
import { contracts, sponsorMarket, SLOT_SHARE } from './sponsors';
import { candidates, coachOf, directorOf, fireStaff, goalLabel, goalTarget, GOALS, hireStaff, isInterested, ownPosition, severance, type ActionResult } from './staff';
import { changeCity, changeUltras } from './surroundings';
import type { FinanceCategory, GameEvent, GameState, Player, SalesPolicy, ScoutRegion, SeasonGoal } from './types';
import { addNews, clamp, hash01, plural, tierOf } from './world';
import type { Rng } from './rng';

/**
 * W5: Strategická rozhodnutí majitele. Vzácná rozhodnutí s jasným dopadem do dat:
 * 1. vize klubu na 3 roky, 2. priorita soutěží, 4. bilanční schůzka po sezóně, 5. platová hierarchie,
 * 6. názvová práva stadionu, 7. dividenda vs. reinvestice (rozšíření valné hromady v events.ts),
 * 8. partnerský klub v zahraničí, 9. ženský tým a komunitní program.
 *
 * Rozhodnutí jsou situace (GameEvent) se šablonami `majitel-*` (events.ts je načte z ownerDecisionTemplates).
 * Plánuje je dailyOwnerDecisions: běžná rozhodnutí jen v pondělí v týdnu bez jiného rozhodnutí (týdenní limit
 * situations.ts), za sezónu nejvýš OWNER_DECISIONS_PER_SEASON. Bilanční schůzka je velké sezónní rozhodnutí
 * (mimo týdenní limit, jednou za sezónu). Všechna nová pole stavu jsou nepovinná: stará uložená hra
 * dostane vizi do schránky při nejbližší příležitosti.
 */

// ---------- Typy a stav ----------

export type VisionKind = 'vyvazena' | 'akademie' | 'prodejni' | 'uspech';
export type PriorityKind = 'vyvazene' | 'liga' | 'pohar' | 'evropa';
export type ReviewChoice = 'prodlouzit' | 'cile' | 'vymena';

export interface ClubVision {
  kind: VisionKind;
  since: string;
  /** Do kdy vize platí (3 sezóny). */
  until: string;
  season: number;
  /** Trenér, se kterým byla vize domluvená (po výměně trenéra přijde nové potvrzení). */
  coachId?: string;
  /** Akademie na začátku vize. */
  academy: number;
  /** Cíl prodejů za 3 roky (prodejní klub). */
  salesTarget: number;
}

export interface ReviewGoals {
  /** Sezóna, pro kterou cíle platí. */
  season: number;
  position: number;
  /** Kolik hráčů do 21 let má mít aspoň 10 zápasů. */
  youth: number;
  /** Provozní výsledek sezóny aspoň nula. */
  finance: boolean;
  applied?: boolean;
  result?: { position: boolean; youth: boolean; finance: boolean };
}

export interface SeasonSnapshot {
  season: number;
  position?: number;
  teams?: number;
  goalTarget?: number;
  youth: number;
  operating: number;
}

export interface OwnerDecisionsState {
  vision?: ClubVision;
  visionHistory?: { kind: VisionKind; since: string; until: string; progress: number }[];
  /** Nová hra: volba vize jako součást prvních kroků (ne situace), do termínu; pak platí vyvážená. */
  visionPick?: { deadline: string };
  /** Coach id, pro kterého už přišlo potvrzení vize. */
  visionCoachAsked?: string;
  priority?: { kind: PriorityKind; season: number; since: string; spring?: boolean };
  review?: { season: number; choice: ReviewChoice; date: string };
  goals?: ReviewGoals;
  snapshot?: SeasonSnapshot;
  wageRule?: { kind: 'strop' | 'vyjimka'; multiple: number; since: string; starId?: string; starName?: string };
  naming?: { company: string; annual: number; years: number; since: string; untilSeason: number; boughtBack?: string };
  profit?: { season: number; choice: string; amount: number }[];
  partner?: { name: string; country: string; region: ScoutRegion; since: string; youth: boolean; extraAnnual: number; stints: string[]; stintSeason?: number; riskSeason?: number; ended?: string };
  community?: { since: string; women: boolean; annual: number; partner: string; partnerAnnual: number; results: { season: number; position: number; league: string }[]; ended?: string };
  /** Kdy byla která nabídka naposledy předložena. */
  offered: Record<string, string>;
  season: number;
  count: number;
  /** Den posledního velkého sezónního rozhodnutí mimo týdenní limit (nejvýš jedno za měsíc). */
  lastSeasonal?: string;
}

/** Bilanční schůzka: den nabídky a termín (před valnou hromadou 20. 6.). */
export const REVIEW_DAY = '06-10';
const REVIEW_EXPIRES = '06-19';
/** Nejvýš tolik strategických rozhodnutí za sezónu. */
export const OWNER_DECISIONS_PER_SEASON = 6;
/** Pro kalibraci (zzsim): vypnutí plánování nových rozhodnutí. */
export const OWNER_DECISIONS_CONFIG = { enabled: true };
const PREFIX = 'majitel-';
const OPTIONAL_CHANCE = 0.3;
/** Volitelné nabídky (názvová práva, partner, komunita) nejvýš jednou za tolik dní. */
const OPTIONAL_GAP = 70;

const own = (s: GameState) => s.clubs[s.owner.clubId];
const month = (s: GameState) => Number(s.date.slice(5, 7));
const mil = (v: number) => `${(Math.abs(v) / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč`;
const kc = (v: number) => (Math.abs(v) >= 1_000_000 ? mil(v) : `${Math.round(Math.abs(v) / 1000).toLocaleString('cs-CZ')} tis. Kč`);
const roundTo = (v: number, step: number) => Math.max(step, Math.round(v / step) * step);
const pName = (p: Player) => `${p.firstName} ${p.lastName}`;
const fmtDay = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return `${d}. ${m}. ${y}`; };

export function ownerDecisionsOf(state: GameState): OwnerDecisionsState {
  const od = (state.ownerDecisions ??= { offered: {}, season: state.season, count: 0 });
  od.offered ??= {};
  if (od.season !== state.season) {
    od.season = state.season;
    od.count = 0;
  }
  return od;
}

// ---------- 1. Vize klubu ----------

export const VISION_LABEL: Record<VisionKind, string> = {
  vyvazena: 'Vyvážená cesta',
  akademie: 'Akademie a odchovanci',
  prodejni: 'Prodejní klub',
  uspech: 'Okamžitý úspěch',
};
const VISION_SALES: Record<VisionKind, SalesPolicy | undefined> = { vyvazena: undefined, akademie: 'dobra', prodejni: 'prodejni', uspech: 'drzet' };
/** Projekty, které vedení při dané vizi nabízí přednostně (engine/projects.ts). */
const VISION_PROJECTS: Record<VisionKind, string[]> = { vyvazena: [], akademie: ['akademie', 'mladi'], prodejni: ['finance', 'sponzori'], uspech: ['evropa', 'postup', 'vyprodano'] };

export function visionOf(state: GameState): ClubVision | undefined {
  const v = state.ownerDecisions?.vision;
  return v && v.until > state.date ? v : undefined;
}

/** Projekty preferované vizí (pro řazení nabídky projektů). */
export function visionProjectBias(state: GameState, projectId: string): number {
  const v = visionOf(state);
  return v && VISION_PROJECTS[v.kind].includes(projectId) ? 1 : 0;
}

/** Nejvyšší věk posil, které kupuje sportovní ředitel (podle vize). */
export function visionMaxAge(state: GameState, fallback: number): number {
  const v = visionOf(state);
  if (!v) return fallback;
  if (v.kind === 'akademie') return Math.min(fallback, 24);
  if (v.kind === 'prodejni') return Math.min(fallback, 26);
  return fallback;
}

function salesSince(state: GameState, from: string): number {
  const id = state.owner.clubId;
  return (state.transferLog ?? []).filter((x) => x.fromId === id && x.toId !== id && x.kind !== 'hostovani' && x.date >= from).reduce((a, x) => a + x.fee, 0);
}

function youthRegulars(state: GameState, apps = 10): Player[] {
  return squadOf(state, state.owner.clubId).filter((p) => playerAge(p, state.season) <= 21 && p.apps >= apps);
}

const NOT_OPERATING: FinanceCategory[] = ['prestupy', 'investice', 'dane', 'uver', 'vklad'];
function operatingResult(state: GameState): number {
  const season = own(state).finance.season;
  return Object.entries(season).filter(([k]) => !NOT_OPERATING.includes(k as FinanceCategory)).reduce((a, [, v]) => a + (v ?? 0), 0);
}

export interface VisionProgress {
  progress: number;
  lines: { text: string; ok: boolean }[];
}

/** Postup plnění vize 0–100 a jednotlivé cíle vedení (pro Klub › Majitel a hodnocení majitele). */
export function visionProgress(state: GameState): VisionProgress | undefined {
  const v = visionOf(state);
  if (!v) return undefined;
  const pos = ownPosition(state);
  const target = pos ? goalTarget(state.owner.seasonGoal, pos.comp) : undefined;
  const lines: { text: string; ok: boolean }[] = [];
  let score = 50;
  const results = pos && target && pos.played >= 5 ? clamp(60 + (target - pos.position) * 8, 0, 100) : 50;
  if (pos && target && pos.played > 0) lines.push({ text: `Umístění: ${pos.position}. místo (cíl sezóny do ${target}.)`, ok: pos.position <= target });
  if (v.kind === 'akademie') {
    const squad = squadOf(state, state.owner.clubId);
    const total = squad.reduce((a, p) => a + p.minutes, 0);
    const youth = squad.filter((p) => playerAge(p, state.season) <= 21).reduce((a, p) => a + p.minutes, 0);
    const share = total > 0 ? youth / total : 0;
    const academy = own(state).facilities.academy;
    lines.push({ text: `Minuty hráčů do 21 let: ${Math.round(share * 100)} % (cíl 15 %)`, ok: share >= 0.15 });
    lines.push({ text: `Akademie na úrovni ${academy} (na začátku vize ${v.academy}, cíl ${Math.min(5, v.academy + 1)})`, ok: academy >= Math.min(5, v.academy + 1) });
    score = clamp((share / 0.15) * 60, 0, 70) + (academy > v.academy || academy >= 5 ? 30 : 0);
    if (total === 0) score = 50;
  } else if (v.kind === 'prodejni') {
    const sales = salesSince(state, v.since);
    const elapsed = clamp((Date.parse(state.date) - Date.parse(v.since)) / (Date.parse(v.until) - Date.parse(v.since)), 0.15, 1);
    const ages = squadOf(state, state.owner.clubId).map((p) => playerAge(p, state.season));
    const avg = ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : 26;
    lines.push({ text: `Prodeje od začátku vize: ${mil(sales)} z ${mil(v.salesTarget)}`, ok: sales >= v.salesTarget });
    lines.push({ text: `Průměrný věk kádru ${avg.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} (cíl do 26)`, ok: avg <= 26 });
    // První měsíce vize (před prvním oknem prodejů) se prodeje hodnotí neutrálně.
    const salesPart = elapsed < 0.2 && sales < v.salesTarget * 0.2 ? 35 : clamp((sales / Math.max(1, v.salesTarget * elapsed)) * 70, 0, 75);
    score = salesPart + (avg <= 26 ? 25 : avg <= 27 ? 10 : 0);
  } else if (v.kind === 'uspech') {
    const trophies = (state.trophies ?? []).filter((t) => t.season >= v.season && ['titul', 'pohar', 'postup', 'evropa'].includes(t.kind)).length;
    lines.push({ text: `Trofeje od začátku vize: ${trophies}`, ok: trophies > 0 });
    score = results + (trophies ? 15 : 0);
  } else {
    const op = operatingResult(state);
    lines.push({ text: `Provozní výsledek sezóny: ${op >= 0 ? '+' : '−'}${mil(op)}`, ok: op >= 0 });
    score = results * 0.6 + (op >= 0 ? 40 : clamp(40 + (op / Math.max(1, annualCosts(own(state), tierOf(state, own(state).id)))) * 200, 0, 40));
  }
  return { progress: Math.round(clamp(score, 0, 100)), lines };
}

/** Úprava hodnocení majitele z jeho strategie (vize, reinvestice zisku), jen klub majitele. */
export function ownerDecisionsRatingBonus(state: GameState, clubId: string): number {
  if (clubId !== state.owner.clubId || !state.ownerDecisions) return 0;
  let bonus = 0;
  const vp = visionProgress(state);
  if (vp) bonus += clamp(Math.round((vp.progress - 50) / (visionOf(state)!.kind === 'vyvazena' ? 25 : 12)), -4, 4);
  const last = state.ownerDecisions.profit?.find((x) => x.season === state.season - 1 || x.season === state.season);
  if (last?.choice === 'reinvest') bonus += 2;
  if (last?.choice === 'pul') bonus -= 1;
  return bonus;
}

function setVision(state: GameState, kind: VisionKind): string {
  const od = ownerDecisionsOf(state);
  const club = own(state);
  const prev = visionOf(state);
  if (prev && prev.kind !== kind) {
    od.visionHistory = [...(od.visionHistory ?? []), { kind: prev.kind, since: prev.since, until: state.date, progress: visionProgress(state)?.progress ?? 50 }].slice(-6);
  }
  const keep = prev && prev.kind === kind;
  // Vize platí tři sezóny (potvrzení po výměně trenéra termín nemění).
  const until = keep ? prev!.until : `${state.season + 3}-06-30`;
  od.vision = keep
    ? { ...prev!, coachId: coachOf(state, club.id)?.id }
    : { kind, since: state.date, until, season: state.season, coachId: coachOf(state, club.id)?.id, academy: club.facilities.academy, salesTarget: roundTo(annualCosts(club, tierOf(state, club.id)) * 0.6, 1_000_000) };
  od.visionCoachAsked = coachOf(state, club.id)?.id;
  const sales = VISION_SALES[kind];
  if (sales) club.policy.salesPolicy = sales;
  if (keep) return `Vize „${VISION_LABEL[kind]}“ platí dál, nový trenér ji podpořil.`;
  const effects: Record<VisionKind, string> = {
    vyvazena: 'Vedení hodnotí plnění cíle sezóny a zdravé finance.',
    akademie: 'Sportovní ředitel kupuje hráče do 24 let a mladí dostanou minuty. Fanoušci jsou trpělivější.',
    prodejni: `Ředitel prodává hráče za dobrou cenu (politika Prodejní klub) a kupuje do 26 let. Cíl prodejů za 3 roky: ${mil(od.vision.salesTarget)}.`,
    uspech: 'Ředitel drží kádr pohromadě a fanoušci čekají výsledky hned.',
  };
  return `Vize klubu do ${until.slice(0, 4)}: ${VISION_LABEL[kind]}. ${effects[kind]}`;
}

/** Měsíčně: očekávání fanoušků podle vize; po třech letech vyhodnocení. */
function monthlyVision(state: GameState): void {
  const od = state.ownerDecisions;
  const v = od?.vision;
  if (!od || !v) return;
  const club = own(state);
  if (v.until <= state.date) {
    if (!od.visionHistory?.some((h) => h.since === v.since)) {
      // Vyhodnocení se počítá z posledního stavu (vize už neplatí, proto se postup spočítá dočasně).
      const until = v.until;
      v.until = addDays(state.date, 1);
      const p = visionProgress(state)?.progress ?? 50;
      v.until = until;
      od.visionHistory = [...(od.visionHistory ?? []), { kind: v.kind, since: v.since, until: v.until, progress: p }].slice(-6);
      if (p >= 60) {
        addOwnerXp(state, 30);
        club.reputation = clamp(club.reputation + 1, 0, 100);
      } else if (p < 40) club.fanMood = clamp(club.fanMood - 3, 0, 100);
      addNews(state, { kind: p >= 60 ? 'sezona' : 'info', title: `Vize „${VISION_LABEL[v.kind]}“ skončila: splněno na ${p} %`, text: p >= 60 ? 'Vedení i fanoušci oceňují, že klub šel jasnou cestou. Pověst klubu +1.' : p < 40 ? 'Plán se nepovedlo naplnit, fanoušci jsou zklamaní.' : 'Plán se podařil napůl.' });
    }
    return;
  }
  const vp = visionProgress(state);
  if (!vp) return;
  let delta = 0;
  if (v.kind === 'uspech') delta = vp.progress >= 60 ? 0.5 : vp.progress < 45 ? -0.5 : 0;
  if (v.kind === 'akademie') delta = vp.progress >= 50 ? 0.3 : 0;
  if (v.kind === 'prodejni') delta = -0.2;
  if (delta) club.fanMood = clamp(club.fanMood + delta, 0, 100);
}

// ---------- 2. Priorita soutěží ----------

export const PRIORITY_LABEL: Record<PriorityKind, string> = { vyvazene: 'Vyváženě', liga: 'Liga', pohar: 'Domácí pohár', evropa: 'Evropské poháry' };
const PRIORITY_EDGE = 0.6;
const ROTATION_EDGE = -0.9;

export function priorityOf(state: GameState): PriorityKind {
  const p = state.ownerDecisions?.priority;
  return p && p.season === state.season ? p.kind : 'vyvazene';
}

/** Body síly navíc podle priority soutěží (jen klub majitele): priorita +, ostatní soutěže − (rotace). */
export function competitionPriorityEdge(state: GameState, kind: 'liga' | 'pohar' | 'evropa'): number {
  const p = priorityOf(state);
  if (p === 'vyvazene') return 0;
  if (p === kind) return PRIORITY_EDGE;
  // Liga je vždy hlavní soutěž: při prioritě Evropy nebo poháru trenér v lize šetří opory jen mírně.
  return kind === 'liga' ? ROTATION_EDGE / 2 : ROTATION_EDGE;
}

/** Den po zápase v méně prioritní soutěži: opory si odpočinuly (kondice +). */
function restAfterRotation(state: GameState): void {
  const p = priorityOf(state);
  if (p === 'vyvazene') return;
  const id = state.owner.clubId;
  const y = addDays(state.date, -1);
  let kind: 'liga' | 'pohar' | 'evropa' | undefined;
  for (const x of allFixtures(state)) {
    if (x.fixture.date !== y || !x.fixture.result || (x.fixture.homeId !== id && x.fixture.awayId !== id)) continue;
    kind = x.cup ? 'pohar' : 'liga';
  }
  if (!kind && europeRun(state)?.matches.some((m) => m.date === y)) kind = 'evropa';
  if (!kind || kind === p) return;
  const core = [...squadOf(state, id)].sort((a, b) => b.overall - a.overall).slice(0, 6);
  for (const pl of core) pl.fitness = Math.min(100, pl.fitness + 10);
}

// ---------- 4. Bilanční schůzka ----------

function snapshotSeason(state: GameState): void {
  const od = ownerDecisionsOf(state);
  const pos = ownPosition(state);
  od.snapshot = {
    season: state.season,
    position: pos?.position,
    teams: pos?.comp.clubIds.length,
    goalTarget: pos ? goalTarget(state.owner.seasonGoal, pos.comp) : undefined,
    youth: youthRegulars(state).length,
    operating: operatingResult(state),
  };
  const g = od.goals;
  if (g && g.season === state.season && !g.result) {
    g.result = { position: pos ? pos.position <= g.position : false, youth: od.snapshot.youth >= g.youth, finance: !g.finance || od.snapshot.operating >= 0 };
    const met = Object.values(g.result).filter(Boolean).length;
    const delta = met === 3 ? 6 : met === 2 ? 2 : met === 1 ? -3 : -6;
    state.owner.trust.trener = clamp(state.owner.trust.trener + delta, 0, 100);
    state.owner.trust.reditel = clamp(state.owner.trust.reditel + delta, 0, 100);
    addNews(state, { kind: met >= 2 ? 'sezona' : 'varovani', title: `Cíle z bilanční schůzky: splněno ${met} ze 3`, text: `Umístění ${g.result.position ? 'splněno' : 'nesplněno'}, mladí ${g.result.youth ? 'splněno' : 'nesplněno'}, finance ${g.result.finance ? 'splněno' : 'nesplněno'}. Důvěra vedení ${delta > 0 ? '+' : ''}${delta}.` });
  }
}

function reviewNumbers(state: GameState) {
  const club = own(state);
  const snap = state.ownerDecisions?.snapshot?.season === state.season ? state.ownerDecisions.snapshot : undefined;
  const position = snap?.position ?? ownPosition(state)?.position ?? 8;
  const teams = snap?.teams ?? 16;
  const goalPos = Math.max(1, Math.min(position - 1, Math.round(position * 0.8)));
  const youth = Math.max(1, Math.min(4, (snap?.youth ?? 0) + 1));
  const coach = coachOf(state, club.id);
  const director = directorOf(state, club.id);
  const bothOut = state.owner.trust.reditel < 40 && !!director;
  const pick = (role: 'trener' | 'reditel') => candidates(state, role).find((c) => isInterested(c, club, state));
  const newCoach = pick('trener');
  const newDirector = bothOut ? pick('reditel') : undefined;
  const cost = (coach && !coach.interim ? severance(state, coach) : 0) + (bothOut && director && !director.interim ? severance(state, director) : 0);
  return { position, teams, goalPos, youth, coach, director, bothOut, newCoach, newDirector, cost, snap };
}

function reviewText(state: GameState): string {
  const n = reviewNumbers(state);
  const g = state.ownerDecisions?.goals;
  const goals = g && g.season === state.season && g.result ? ` Loňské cíle: umístění ${g.result.position ? '✔' : '✘'}, mladí ${g.result.youth ? '✔' : '✘'}, finance ${g.result.finance ? '✔' : '✘'}.` : '';
  const coach = n.coach ? `${n.coach.firstName} ${n.coach.lastName} (smlouva do ${n.coach.contractUntil}, důvěra ${Math.round(state.owner.trust.trener)})` : 'bez stálého trenéra';
  const op = n.snap ? ` Provozní výsledek ${n.snap.operating >= 0 ? '+' : '−'}${mil(n.snap.operating)}, hráčů do 21 let s 10+ zápasy: ${n.snap.youth}.` : '';
  return `Sezóna skončila na ${n.position}. místě${n.snap?.goalTarget ? ` (cíl do ${n.snap.goalTarget}.)` : ''}.${op}${goals} Trenér: ${coach}. Jak dál?`;
}

function resolveReview(state: GameState, option: string): string {
  const od = ownerDecisionsOf(state);
  const n = reviewNumbers(state);
  const club = own(state);
  od.review = { season: state.season, choice: option as ReviewChoice, date: state.date };
  if (option === 'cile') {
    od.goals = { season: state.season + 1, position: n.goalPos, youth: n.youth, finance: true };
    state.owner.trust.trener = clamp(state.owner.trust.trener - 4, 0, 100);
    for (const p of squadOf(state, club.id)) p.morale = clamp(p.morale + 3, 0, 100);
    return `Nové cíle na příští sezónu: do ${n.goalPos}. místa, aspoň ${plural(n.youth, 'hráč', 'hráči', 'hráčů')} do 21 let s 10 zápasy a provoz bez ztráty. Cíl sezóny se nastaví o stupeň výš.`;
  }
  if (option === 'vymena') {
    const out: string[] = [];
    for (const role of n.bothOut ? (['trener', 'reditel'] as const) : (['trener'] as const)) {
      const r = fireStaff(state, role);
      if (r.ok) Object.assign(state, r.state);
      const next = role === 'trener' ? n.newCoach : n.newDirector;
      if (next && state.staff[next.id]?.clubId === '') {
        const h = hireStaff(state, next.id, 2);
        if (h.ok) {
          Object.assign(state, h.state);
          out.push(h.message);
          continue;
        }
      }
      out.push(r.message);
    }
    od.goals = undefined;
    return `${out.join(' ')} Nové vedení začíná s důvěrou 60.`;
  }
  // Pokračovat: končící smlouvy trenéra a ředitele se prodlouží o rok, důvěra roste.
  for (const s of [n.coach, n.director]) if (s && s.contractUntil <= state.season + 1) state.staff[s.id].contractUntil = state.season + 2;
  state.owner.trust.trener = clamp(state.owner.trust.trener + 6, 0, 100);
  state.owner.trust.reditel = clamp(state.owner.trust.reditel + 6, 0, 100);
  od.goals = undefined;
  return 'Vedení pokračuje. Trenér i ředitel cítí podporu (důvěra +6), končící smlouvy se prodloužily o rok.';
}

/** Začátek sezóny: vyšší cíle z bilanční schůzky posunou cíl sezóny o stupeň výš. */
function applyReviewGoals(state: GameState): void {
  const g = state.ownerDecisions?.goals;
  if (!g || g.season !== state.season || g.applied) return;
  g.applied = true;
  const i = GOALS.indexOf(state.owner.seasonGoal);
  if (i > 0) state.owner.seasonGoal = GOALS[i - 1] as SeasonGoal;
  const pos = ownPosition(state);
  addNews(state, { kind: 'info', title: `Cíle z bilanční schůzky: ${pos ? goalLabel(state.owner.seasonGoal, pos.comp) : 'výš'}`, text: `Do ${g.position}. místa, ${plural(g.youth, 'hráč', 'hráči', 'hráčů')} do 21 let s 10 zápasy, provoz bez ztráty. Postup najdete v Klub › Majitel.` });
}

// ---------- 5. Platová hierarchie ----------

export const WAGE_CAP_MULTIPLE = 3;

function wageStats(state: GameState, exclude?: string) {
  const squad = squadOf(state, state.owner.clubId).filter((p) => !p.loan);
  const others = squad.filter((p) => p.id !== exclude);
  const avg = others.length ? others.reduce((a, p) => a + p.wage, 0) / others.length : 0;
  const star = [...squad].sort((a, b) => b.wage - a.wage)[0];
  return { avg, star, ratio: star && avg > 0 ? star.wage / avg : 0 };
}

/** Strop nejvyššího platu podle pravidla majitele (undefined = bez stropu). */
export function wageCap(state: GameState, playerId?: string): number | undefined {
  const rule = state.ownerDecisions?.wageRule;
  if (!rule || (rule.kind === 'vyjimka' && playerId && rule.starId === playerId)) return undefined;
  const { avg } = wageStats(state, playerId);
  return Math.round((avg * rule.multiple) / 1000) * 1000;
}

/** Důvod, proč smlouva nad strop nejde podepsat (pro prodloužení smluv). */
export function wageCapBlock(state: GameState, p: Player, wage: number): string | undefined {
  const cap = wageCap(state, p.id);
  if (cap === undefined || wage <= cap) return undefined;
  return `Platový strop klubu: nejvýš ${cap.toLocaleString('cs-CZ')} Kč měsíčně (${WAGE_CAP_MULTIPLE}× průměru kádru). Pravidlo změníte v Klub › Majitel.`;
}

export function cancelWageRule(prev: GameState): ActionResult {
  if (!prev.ownerDecisions?.wageRule) return { state: prev, ok: false, message: 'Žádné platové pravidlo neplatí.' };
  const state = structuredClone(prev);
  state.ownerDecisions!.wageRule = undefined;
  state.ownerDecisions!.offered['platy'] = state.date;
  return { state, ok: true, message: 'Platové pravidlo zrušeno. O platech zase rozhoduje sportovní ředitel podle mzdového rozpočtu.' };
}

/** Týmová chemie a nálada v kabině (W4, engine/chemistry.ts) pro texty o platech. */
function chemistryLine(state: GameState): string {
  const c = teamChemistry(state);
  const mood = c.parts.find((p) => p.key === 'nalada');
  return `Týmová chemie ${c.value} (${c.label.toLowerCase()})${mood ? `, spokojenost v kabině ${mood.value}` : ''}.`;
}

function wageTrigger(state: GameState): boolean {
  if (state.ownerDecisions?.wageRule) return false;
  const { ratio, star } = wageStats(state, wageStats(state).star?.id);
  return !!star && ratio >= WAGE_CAP_MULTIPLE + 0.3;
}

// ---------- 6. Názvová práva stadionu ----------

const NAMING_COMPANIES = ['Kalinor Energy', 'Bystřina Pojišťovna', 'Datavel', 'Moravex Stavby', 'Lumora Logistics', 'Severon Group', 'Vranka Agro', 'Tritonix Systems', 'Brodecká Banka', 'Ostrava Steelworks Plus'];

function namingNumbers(state: GameState) {
  const club = own(state);
  const company = NAMING_COMPANIES[Math.floor(hash01(`${state.seed}-${state.season}-nazev`) * NAMING_COMPANIES.length)];
  const capFactor = clamp(club.stadium.capacity / 10_000, 0.5, 1.6);
  const annual = roundTo(sponsorMarket(state) * SLOT_SHARE.stadion * (1.2 + 0.3 * capFactor), 50_000);
  return { company, annual, short: roundTo(annual * 0.85, 50_000) };
}

export function stadiumNameDeal(state: GameState) {
  const c = contracts(state).find((x) => x.slot === 'stadion');
  if (!c) return undefined;
  const remaining = Math.max(1, c.untilSeason - state.season + 1);
  const club = own(state);
  return { contract: c, remaining, buyBack: roundTo(c.annual * remaining * 0.6, 50_000), original: club.stadium.originalName };
}

/** Odkoupení názvu stadionu zpět: klub zaplatí partnerovi odstupné, stadion dostane původní jméno. */
export function buyBackStadiumName(prev: GameState): ActionResult {
  const deal = stadiumNameDeal(prev);
  if (!deal || !deal.original) return { state: prev, ok: false, message: 'Stadion nemá prodaný název.' };
  if (prev.owner.ousted) return { state: prev, ok: false, message: 'Klub teď řídí představenstvo.' };
  if (own(prev).finance.balance < deal.buyBack) return { state: prev, ok: false, message: `Odkup stojí ${mil(deal.buyBack)}, tolik klub nemá.` };
  const state = structuredClone(prev);
  const club = own(state);
  book(state, club.id, 'komercni', -deal.buyBack, `Odkup názvu stadionu od ${deal.contract.name}`);
  club.sponsors = (club.sponsors ?? []).filter((c) => c.slot !== 'stadion');
  club.stadium.name = deal.original!;
  club.fanMood = clamp(club.fanMood + 4, 0, 100);
  changeUltras(state, 6);
  const od = ownerDecisionsOf(state);
  if (od.naming) od.naming.boughtBack = state.date;
  od.offered['nazev'] = state.date;
  const message = `Stadion se znovu jmenuje ${deal.original}. Odkup stál ${mil(deal.buyBack)}. Fanoušci +4, kotel +6.`;
  addNews(state, { kind: 'info', title: 'Klub odkoupil název stadionu', text: message });
  return { state, ok: true, message };
}

// ---------- 7. Dividenda vs. reinvestice (rozšíření valné hromady) ----------

/** Volba reinvestice zisku pro valnou hromadu (events.ts). */
export function reinvestOption(_state: GameState, profit: number): { id: string; label: string; hint: string } {
  return { id: 'reinvest', label: `Reinvestovat zisk (${mil(profit)})`, hint: `Rozpočet přestupů +${mil(profit * 0.6)}, zázemí a stav stadionu +${mil(profit * 0.4)} · fanoušci +3, média +2, hodnocení majitele +2 · investor nespokojený` };
}

/** Reinvestice zisku: část do rozpočtu přestupů, část do zázemí (stav stadionu). */
export function reinvestProfit(state: GameState, profit: number): string {
  const club = own(state);
  const transfers = Math.round(profit * 0.6);
  const infra = Math.round(profit * 0.4);
  club.policy.transferBudget += transfers;
  book(state, club.id, 'investice', -infra, 'Reinvestice zisku do zázemí');
  club.facilities.condition = clamp((club.facilities.condition ?? 80) + clamp(infra / Math.max(1, annualCosts(club, tierOf(state, club.id))) * 200, 3, 15), 0, 100);
  club.fanMood = clamp(club.fanMood + 3, 0, 100);
  media(state, 2);
  satisfy(state, 4, ['patriot', 'mesto']);
  satisfy(state, -6, ['investor', 'spekulant']);
  noteProfit(state, 'reinvest', profit);
  return `Zisk ${mil(profit)} zůstává ve hře: rozpočet přestupů +${mil(transfers)}, do zázemí ${mil(infra)}. Fanoušci i média oceňují, že peníze jdou do klubu.`;
}

/** Zápis rozhodnutí o zisku (dividenda) s dopadem na fanoušky a média. */
export function noteProfit(state: GameState, choice: string, amount: number): void {
  const od = ownerDecisionsOf(state);
  od.profit = [...(od.profit ?? []).filter((x) => x.season !== state.season), { season: state.season, choice, amount }].slice(-6);
  if (choice === 'pul' && amount > 0) {
    own(state).fanMood = clamp(own(state).fanMood - 2, 0, 100);
    media(state, -2);
  }
}

// ---------- 8. Partnerský klub v zahraničí ----------

/** Vymyšlené partnerské kluby ze skutečných zemí (žádné jednání skutečných lidí). */
const PARTNERS: { region: ScoutRegion; name: string; country: string }[] = [
  { region: 'okoli', name: 'MFK Tatran Dolné Vrbovce', country: 'Slovensko' },
  { region: 'okoli', name: 'KS Orzeł Wierzbno', country: 'Polsko' },
  { region: 'balkan', name: 'FK Rudar Krasnica', country: 'Srbsko' },
  { region: 'balkan', name: 'NK Slaven Podgorje', country: 'Chorvatsko' },
  { region: 'sever', name: 'IF Fjällby', country: 'Švédsko' },
  { region: 'sever', name: 'Nordvik FK', country: 'Norsko' },
  { region: 'afrika', name: 'Kumasi Rising Stars', country: 'Ghana' },
  { region: 'afrika', name: 'Étoile de Ndiassane', country: 'Senegal' },
  { region: 'amerika', name: 'Club Atlético San Ramón', country: 'Argentina' },
  { region: 'amerika', name: 'EC Vale Verde', country: 'Brazílie' },
];

function partnerNumbers(state: GameState) {
  const nets = state.foreign?.networks ?? [];
  const pool = PARTNERS.filter((p) => !nets.includes(p.region));
  const list = pool.length ? pool : PARTNERS;
  const p = list[Math.floor(hash01(`${state.seed}-${state.season}-partner-w5`) * list.length)];
  const annual = programAnnual(state, 'partner');
  const entry = roundTo(programOneOff(state, 'partner') * 0.5, 50_000);
  return { ...p, annual, entry, extra: roundTo(annual * 0.3, 50_000) };
}

export const REGION_LABEL_SHORT: Record<ScoutRegion, string> = { okoli: 'Slovensko a Polsko', balkan: 'Balkán', sever: 'Skandinávie', afrika: 'Afrika', amerika: 'Jižní Amerika', velke: 'velké ligy' };

function monthlyPartner(state: GameState): void {
  const p = state.ownerDecisions?.partner;
  if (!p || p.ended) return;
  if (!hasProgram(state, 'partner')) {
    p.ended = state.date;
    p.stints = [];
    return;
  }
  if (!p.youth) return;
  const m = month(state);
  book(state, state.owner.clubId, 'programy', -p.extraAnnual / 12, `Hostování mladých u partnera (${p.name})`);
  if (m === 8 && p.stintSeason !== state.season) {
    p.stintSeason = state.season;
    const picks = squadOf(state, state.owner.clubId)
      .filter((x) => playerAge(x, state.season) <= 21 && x.overall < x.potential && !x.loan)
      .sort((a, b) => a.apps - b.apps || b.potential - a.potential || a.id.localeCompare(b.id))
      .slice(0, 2);
    p.stints = picks.map((x) => x.id);
    if (picks.length) addNews(state, { kind: 'info', title: `Mladí na hostování u partnera ${p.name}`, text: `${picks.map(pName).join(', ')} budou do jara střídavě hrát za partnera (${p.country}). Zůstávají registrovaní u vás a rostou rychleji.` });
  }
  if (m >= 9 || m <= 5) {
    for (const id of p.stints) {
      const x = state.players[id];
      if (x && x.clubId === state.owner.clubId && x.overall < x.potential && hash01(`${state.seed}-${state.date}-${id}-stint`) < 0.3) x.overall += 1;
    }
  }
  if (m === 11 && p.riskSeason !== state.season) {
    p.riskSeason = state.season;
    if (hash01(`${state.seed}-${state.season}-partner-risk`) < 0.15) {
      const club = own(state);
      club.reputation = clamp(club.reputation - 1, 0, 100);
      club.fanMood = clamp(club.fanMood - 1, 0, 100);
      for (const id of p.stints) if (state.players[id]) state.players[id].morale = clamp(state.players[id].morale - 8, 0, 100);
      addNews(state, { kind: 'varovani', title: `Potíže u partnera ${p.name}`, text: 'Média píší o slabém zázemí a nevyplacených prémiích v partnerském klubu. Hostování mladých tím trpí a pověst klubu −1.' });
    }
  }
  if (m === 6) p.stints = [];
}

// ---------- 9. Ženský tým a komunitní program ----------

const COMMUNITY_PARTNERS = ['Pekárny Zlatý klas', 'Regio Teplo', 'Vltavská mlékárna', 'Hornický spolek Stavby', 'Lékárny Modrý kříž'];

function communityNumbers(state: GameState) {
  const women = programAnnual(state, 'zeny');
  const annual = roundTo(women * 0.25, 50_000);
  const partner = COMMUNITY_PARTNERS[Math.floor(hash01(`${state.seed}-${state.season}-komunita`) * COMMUNITY_PARTNERS.length)];
  return { women, annual, partner, partnerFull: roundTo(annual * 0.5 + women * 0.1, 50_000), partnerSmall: roundTo(annual * 0.5, 50_000) };
}

function monthlyCommunity(state: GameState): void {
  const c = state.ownerDecisions?.community;
  if (!c || c.ended) return;
  const id = state.owner.clubId;
  book(state, id, 'programy', -c.annual / 12, 'Komunitní program');
  book(state, id, 'komercni', c.partnerAnnual / 12, `Partner komunitního programu${c.women ? ' a ženského týmu' : ''}: ${c.partner}`);
  changeCity(state, 0.15);
  // Nábor dětí: nejmladší hráči rostou o něco rychleji.
  for (const p of squadOf(state, id)) if (playerAge(p, state.season) <= 19 && p.overall < p.potential && hash01(`${state.seed}-${state.date}-${p.id}-komunita`) < 0.04) p.overall += 1;
}

/** Konec sezóny: výsledek ženského týmu (jednoduchá zpráva) a pověst značky. */
function seasonCommunity(state: GameState): void {
  const c = state.ownerDecisions?.community;
  if (!c || c.ended || c.results.some((r) => r.season === state.season)) return;
  const club = own(state);
  if (!c.women || !hasProgram(state, 'zeny')) {
    club.reputation = clamp(club.reputation + 0.3, 0, 100);
    return;
  }
  const years = Math.max(0, state.season - Number(c.since.slice(0, 4)));
  const league = tierOf(state, club.id) === 1 ? '1. liga žen' : '2. liga žen';
  const position = clamp(Math.round(8 - years * 1.2 - (tierOf(state, club.id) === 1 ? 1.5 : 0) + hash01(`${state.seed}-${state.season}-zeny`) * 4 - 1), 1, 10);
  c.results = [...c.results, { season: state.season, position, league }].slice(-8);
  club.reputation = clamp(club.reputation + (position <= 3 ? 0.8 : 0.4), 0, 100);
  if (position <= 3) club.fanMood = clamp(club.fanMood + 1, 0, 100);
  addNews(state, { kind: 'info', title: `Ženský tým skončil ${position}. (${league})`, text: position === 1 ? 'Ženy vyhrály soutěž! Město i sponzoři slaví s nimi.' : position <= 3 ? 'Medailové umístění. Značka klubu roste.' : 'Ženský tým sbírá zkušenosti, zájem dívek o fotbal v regionu roste.' });
}

// ---------- Šablony situací ----------

interface OwnerTemplate {
  create: (s: GameState) => Omit<GameEvent, 'id' | 'template' | 'date' | 'expires'> | null;
  resolve: (s: GameState, e: GameEvent, option: string) => string;
}

const num = (e: GameEvent, k: string) => Number(e.data?.[k] ?? 0);
const str = (e: GameEvent, k: string) => String(e.data?.[k] ?? '');

function defs(): Record<string, OwnerTemplate> {
  return {
    vize: {
      create: (s) => {
        const od = ownerDecisionsOf(s);
        const cur = visionOf(s);
        const coach = coachOf(s, s.owner.clubId);
        const reason = !od.vision ? 'start' : cur && coach && cur.coachId !== coach.id ? 'trener' : 'obdobi';
        const intro = {
          start: 'Vedení chce znát vaši vizi klubu na příští tři roky. Podle ní nastaví cíle, přestupovou politiku ředitele a nabídku projektů. Když nerozhodnete, platí vyvážená cesta.',
          trener: `Klub vede nový trenér${coach ? ` ${coach.firstName} ${coach.lastName}` : ''}. Vedení se ptá, jestli platí vize „${cur ? VISION_LABEL[cur.kind] : ''}“, nebo ji měníte.`,
          obdobi: `Tříletá vize${od.vision ? ` „${VISION_LABEL[od.vision.kind]}“` : ''} skončila. Jakou cestou má klub jít další tři roky?`,
        }[reason];
        return {
          title: 'Vize klubu na 3 roky',
          text: intro,
          defaultOption: cur?.kind ?? 'vyvazena',
          data: { reason },
          options: visionChoices(s),
        };
      },
      resolve: (s, _e, o) => setVision(s, (['vyvazena', 'akademie', 'prodejni', 'uspech'] as VisionKind[]).includes(o as VisionKind) ? (o as VisionKind) : 'vyvazena'),
    },

    priorita: {
      create: (s) => {
        const run = europeRun(s);
        const europe = !!run && run.phase !== 'konec';
        const spring = !!run && run.phase === 'jaro';
        const cur = priorityOf(s);
        const options = [
          { id: 'vyvazene', label: PRIORITY_LABEL.vyvazene, hint: 'Trenér nasazuje nejsilnější sestavu všude · bez bonusu i postihu' },
          { id: 'liga', label: 'Liga na prvním místě', hint: `Liga +${PRIORITY_EDGE.toLocaleString('cs-CZ')} síly · pohár${europe ? ' a Evropa' : ''} ${ROTATION_EDGE.toLocaleString('cs-CZ')} (rotace) · opory po pohárových zápasech odpočaté (kondice +10)` },
          { id: 'pohar', label: 'Domácí pohár', hint: `Pohár +${PRIORITY_EDGE.toLocaleString('cs-CZ')} síly · liga ${(ROTATION_EDGE / 2).toLocaleString('cs-CZ')}${europe ? `, Evropa ${ROTATION_EDGE.toLocaleString('cs-CZ')}` : ''} · opory po ostatních zápasech odpočaté` },
          ...(europe ? [{ id: 'evropa', label: 'Evropské poháry', hint: `Evropa +${PRIORITY_EDGE.toLocaleString('cs-CZ')} síly · liga ${(ROTATION_EDGE / 2).toLocaleString('cs-CZ')}, pohár ${ROTATION_EDGE.toLocaleString('cs-CZ')} · opory po domácích zápasech odpočaté` }] : []),
        ];
        return {
          title: spring ? 'Jarní Evropa: priorita soutěží' : 'Priorita soutěží v sezóně',
          text: spring
            ? `Klub hraje na jaře ${run!.best}. Trenér se ptá, kam dát síly: tři soutěže najednou znamenají rotaci sestavy.`
            : 'Trenér se ptá, na kterou soutěž dát v sezóně důraz. Podle priority bude rotovat sestavu: v hlavní soutěži nastoupí opory, jinde dostanou prostor náhradníci.',
          defaultOption: options.some((o) => o.id === cur) ? cur : 'vyvazene',
          data: { spring: spring ? 1 : 0 },
          options,
        };
      },
      resolve: (s, e, o) => {
        const od = ownerDecisionsOf(s);
        const kind = (['vyvazene', 'liga', 'pohar', 'evropa'] as PriorityKind[]).includes(o as PriorityKind) ? (o as PriorityKind) : 'vyvazene';
        od.priority = { kind, season: s.season, since: s.date, spring: num(e, 'spring') === 1 || undefined };
        return kind === 'vyvazene' ? 'Trenér hraje všude v nejsilnější sestavě.' : `Priorita: ${PRIORITY_LABEL[kind]}. Trenér podle ní rotuje sestavu.`;
      },
    },

    bilance: {
      create: (s) => {
        const n = reviewNumbers(s);
        const swap = n.bothOut ? 'Vyměnit trenéra i sportovního ředitele' : 'Vyměnit trenéra';
        const who = [n.newCoach && `trenér ${n.newCoach.firstName} ${n.newCoach.lastName} (${n.newCoach.ability})`, n.newDirector && `ředitel ${n.newDirector.firstName} ${n.newDirector.lastName} (${n.newDirector.ability})`].filter(Boolean).join(', ');
        return {
          title: 'Bilanční schůzka po sezóně',
          text: reviewText(s),
          defaultOption: 'prodlouzit',
          options: [
            { id: 'prodlouzit', label: 'Pokračovat a podpořit vedení', hint: 'Končící smlouvy trenéra a ředitele +1 rok · důvěra obou +6 · cíl sezóny podle síly kádru' },
            { id: 'cile', label: 'Dát nové, vyšší cíle', hint: `Cíl sezóny o stupeň výš · do ${n.goalPos}. místa, ${plural(n.youth, 'hráč', 'hráči', 'hráčů')} do 21 let s 10+ zápasy, provoz bez ztráty · morálka týmu +3, důvěra trenéra −4 · splnění ±6 důvěry` },
            { id: 'vymena', label: swap, hint: `Odstupné ${kc(n.cost)}${who ? ` · nastoupí ${who}` : ' · klub dosadí zastupujícího'} · nové vedení s důvěrou 60` },
          ],
        };
      },
      resolve: (s, _e, o) => resolveReview(s, o),
    },

    platy: {
      create: (s) => {
        const { star, avg, ratio } = wageStats(s, wageStats(s).star?.id);
        if (!star || ratio < WAGE_CAP_MULTIPLE) return null;
        const cap = Math.round((avg * WAGE_CAP_MULTIPLE) / 1000) * 1000;
        return {
          title: 'Platová hierarchie v kabině',
          text: `${pName(star)} bere ${star.wage.toLocaleString('cs-CZ')} Kč měsíčně, ${ratio.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })}× víc než průměr kádru (${Math.round(avg).toLocaleString('cs-CZ')} Kč). Ekonomický ředitel navrhuje pravidlo: nejvyšší plat nejvýš ${WAGE_CAP_MULTIPLE}× průměru. Skupina hráčů A-týmu rozdíly v platech vnímá. ${chemistryLine(s)}`,
          playerId: star.id,
          defaultOption: 'nechat',
          data: { star: star.id, starName: pName(star), cap },
          options: [
            { id: 'strop', label: `Platový strop ${WAGE_CAP_MULTIPLE}× průměru`, hint: `Nové a prodloužené smlouvy nejvýš ${cap.toLocaleString('cs-CZ')} Kč/měsíc · ${pName(star)} morálka −10 · ostatní opory +3 · spokojenost v kabině (chemie) +4 až +8 · nižší mzdové náklady do budoucna` },
            { id: 'vyjimka', label: `Výjimka pro hvězdu, strop pro ostatní`, hint: `${pName(star)} morálka +6 · ostatní opory −3, platová propast dál ubírá chemii · ostatní nejvýš ${cap.toLocaleString('cs-CZ')} Kč/měsíc` },
            { id: 'nechat', label: 'Bez pravidla', hint: 'Nic se nemění, o platech rozhoduje ředitel podle mzdového rozpočtu' },
          ],
        };
      },
      resolve: (s, e, o) => {
        const od = ownerDecisionsOf(s);
        const starId = str(e, 'star');
        const core = [...squadOf(s, s.owner.clubId)].sort((a, b) => b.overall - a.overall).slice(0, 8).filter((p) => p.id !== starId);
        const star = s.players[starId];
        if (o === 'strop') {
          od.wageRule = { kind: 'strop', multiple: WAGE_CAP_MULTIPLE, since: s.date };
          if (star) star.morale = clamp(star.morale - 10, 0, 100);
          for (const p of core) p.morale = clamp(p.morale + 3, 0, 100);
          return `Platí strop: nejvyšší plat nejvýš ${WAGE_CAP_MULTIPLE}× průměru kádru. ${str(e, 'starName')} to nese nelibě, v kabině se ulevilo.`;
        }
        if (o === 'vyjimka') {
          od.wageRule = { kind: 'vyjimka', multiple: WAGE_CAP_MULTIPLE, since: s.date, starId, starName: str(e, 'starName') };
          if (star) star.morale = clamp(star.morale + 6, 0, 100);
          for (const p of core) p.morale = clamp(p.morale - 3, 0, 100);
          return `${str(e, 'starName')} má výjimku, pro ostatní platí strop ${WAGE_CAP_MULTIPLE}× průměru. Část kabiny to vnímá jako nespravedlnost.`;
        }
        return 'Bez platového pravidla. Ředitel jedná o smlouvách jako dosud.';
      },
    },

    nazev: {
      create: (s) => {
        const n = namingNumbers(s);
        const club = own(s);
        return {
          title: 'Názvová práva stadionu',
          text: `Firma ${n.company} nabízí ${kc(n.annual)} ročně za přejmenování stadionu ${club.stadium.name} na „${n.company} Arena“ (smlouva na 5 let; nebo kratší na 3 roky za ${kc(n.short)} ročně). Kotel a pamětníci klubu jsou proti: stadion má své jméno desítky let.`,
          defaultOption: 'odmitnout',
          data: { company: n.company, annual: n.annual, short: n.short },
          options: [
            { id: 'dlouha', label: 'Prodat název na 5 let', hint: `+${kc(n.annual)} ročně (celkem ${mil(n.annual * 5)}) · stadion „${n.company} Arena“ · fanoušci −6, kotel −8 · odkup zpět kdykoli za 60 % zbytku smlouvy` },
            { id: 'kratka', label: 'Prodat název na 3 roky', hint: `+${kc(n.short)} ročně (celkem ${mil(n.short * 3)}) · stadion „${n.company} Arena“ · fanoušci −6, kotel −8` },
            { id: 'odmitnout', label: 'Zachovat tradiční název', hint: 'Kotel +3, peníze nepřijdou' },
          ],
        };
      },
      resolve: (s, e, o) => {
        const club = own(s);
        if (o !== 'dlouha' && o !== 'kratka') {
          changeUltras(s, 3);
          return `Stadion se dál jmenuje ${club.stadium.name}. Kotel to oceňuje.`;
        }
        const years = o === 'dlouha' ? 5 : 3;
        const annual = num(e, o === 'dlouha' ? 'annual' : 'short');
        const company = str(e, 'company');
        club.sponsors = [...(club.sponsors ?? []).filter((c) => c.slot !== 'stadion'), { slot: 'stadion', name: company, annual, untilSeason: s.season + years - 1 }];
        s.sponsorOffers = (s.sponsorOffers ?? []).filter((x) => x.slot !== 'stadion');
        club.stadium.originalName ??= club.stadium.name;
        club.stadium.name = `${company} Arena`;
        club.fanMood = clamp(club.fanMood - 6, 0, 100);
        changeUltras(s, -8);
        ownerDecisionsOf(s).naming = { company, annual, years, since: s.date, untilSeason: s.season + years - 1 };
        return `Stadion se jmenuje ${club.stadium.name}. Ročně přijde ${kc(annual)} do roku ${s.season + years}. Odkoupit zpět ho můžete v Klub › Majitel.`;
      },
    },

    partner: {
      create: (s) => {
        const n = partnerNumbers(s);
        return {
          title: 'Partnerský klub v zahraničí',
          text: `${n.name} (${n.country}) nabízí partnerství: vaši skauti by měli zázemí v regionu ${REGION_LABEL_SHORT[n.region]} a mladí hráči by mohli střídavě hrát u partnera. Vstup ${kc(n.entry)}, ročně ${kc(n.annual)}. Riziko: o podmínkách v klubu se ví málo.`,
          defaultOption: 'odmitnout',
          data: { name: n.name, country: n.country, region: n.region, annual: n.annual, entry: n.entry, extra: n.extra },
          options: [
            { id: 'plne', label: 'Partnerství i s hostováním mladých', hint: `Vstup −${kc(n.entry)}, ročně −${kc(n.annual + n.extra)} · skautská síť ${REGION_LABEL_SHORT[n.region]} zdarma, přesnější odhady a levnější odstupné · 2 mladí ročně rostou rychleji · riziko špatných podmínek (pověst −1)` },
            { id: 'skauting', label: 'Jen skautská spolupráce', hint: `Vstup −${kc(n.entry)}, ročně −${kc(n.annual)} · skautská síť ${REGION_LABEL_SHORT[n.region]} zdarma, přesnější odhady` },
            { id: 'odmitnout', label: 'Odmítnout', hint: 'Nic se nemění' },
          ],
        };
      },
      resolve: (s, e, o) => {
        if (o !== 'plne' && o !== 'skauting') return 'Partnerství jste odmítli.';
        if (hasProgram(s, 'partner')) return 'Klub už partnera v zahraničí má.';
        const region = str(e, 'region') as ScoutRegion;
        s.programs = [...(s.programs ?? []), { kind: 'partner', since: s.date, region, partnerId: `partner-${region}` }];
        s.foreign ??= { networks: [], targets: [] };
        s.foreign.networks = s.foreign.networks.filter((r) => r !== region);
        book(s, s.owner.clubId, 'investice', -num(e, 'entry'), `Vstup do partnerství: ${str(e, 'name')}`);
        ownerDecisionsOf(s).partner = { name: str(e, 'name'), country: str(e, 'country'), region, since: s.date, youth: o === 'plne', extraAnnual: o === 'plne' ? num(e, 'extra') : 0, stints: [] };
        return `Partnerství s klubem ${str(e, 'name')} podepsáno. Skauti mají síť v regionu ${REGION_LABEL_SHORT[region]}${o === 'plne' ? ', mladí půjdou v létě na hostování' : ''}. Partnerství ukončíte v Penězích › Investice (programy).`;
      },
    },

    komunita: {
      create: (s) => {
        const n = communityNumbers(s);
        return {
          title: 'Ženský tým a komunitní program',
          text: `Město a krajský svaz navrhují, aby klub založil ženský tým a komunitní program (školy, nábor dětí, turnaje). Ženský tým stojí ${kc(n.women)} ročně (třetinu pokryje sponzor ženského fotbalu), komunitní program ${kc(n.annual)} ročně. Firma ${n.partner} by se stala partnerem programu.`,
          defaultOption: 'ne',
          data: { women: n.women, annual: n.annual, partner: n.partner, full: n.partnerFull, small: n.partnerSmall },
          options: [
            { id: 'plny', label: 'Ženský tým i komunitní program', hint: `Náklady −${kc(n.women + n.annual)}/rok · nový partner ${n.partner} +${kc(n.partnerFull)}/rok, sponzor ženského fotbalu · město +6, fanoušci +3 · pověst +0,4 až 0,8 za sezónu · nábor dětí` },
            { id: 'komunita', label: 'Jen komunitní program', hint: `Náklady −${kc(n.annual)}/rok · partner ${n.partner} +${kc(n.partnerSmall)}/rok · město +4, fanoušci +1 · nábor dětí` },
            { id: 'ne', label: 'Zatím ne', hint: 'Město −1' },
          ],
        };
      },
      resolve: (s, e, o) => {
        const club = own(s);
        if (o !== 'plny' && o !== 'komunita') {
          changeCity(s, -1);
          return 'Klub zatím do ženského fotbalu ani komunity neinvestuje.';
        }
        const women = o === 'plny';
        if (women && !hasProgram(s, 'zeny')) s.programs = [...(s.programs ?? []), { kind: 'zeny', since: s.date }];
        changeCity(s, women ? 6 : 4);
        club.fanMood = clamp(club.fanMood + (women ? 3 : 1), 0, 100);
        satisfy(s, women ? 4 : 2, ['mesto', 'patriot']);
        ownerDecisionsOf(s).community = { since: s.date, women, annual: num(e, 'annual'), partner: str(e, 'partner'), partnerAnnual: num(e, women ? 'full' : 'small'), results: [] };
        return women ? `Klub zakládá ženský tým a komunitní program. Partnerem je ${str(e, 'partner')}.` : `Komunitní program startuje s partnerem ${str(e, 'partner')}.`;
      },
    },
  };
}

/** Šablony situací pro engine/events.ts (náhodně se nevybírají, plánuje je dailyOwnerDecisions). */
export function ownerDecisionTemplates() {
  const out: Record<string, { weight: (s: GameState) => number; create: (s: GameState, rng: Rng) => Omit<GameEvent, 'id' | 'template' | 'date' | 'expires'> | null; resolve: (s: GameState, e: GameEvent, option: string) => string }> = {};
  for (const [id, t] of Object.entries(defs())) out[PREFIX + id] = { weight: () => 0, create: (s) => t.create(s), resolve: (s, e, o) => t.resolve(s, e, o) };
  return out;
}

/** Ukončí komunitní program (z Klub › Majitel). */
export function stopCommunity(prev: GameState): ActionResult {
  const c = prev.ownerDecisions?.community;
  if (!c || c.ended) return { state: prev, ok: false, message: 'Komunitní program neběží.' };
  const state = structuredClone(prev);
  state.ownerDecisions!.community!.ended = state.date;
  changeCity(state, -5);
  own(state).fanMood = clamp(own(state).fanMood - 2, 0, 100);
  const message = 'Komunitní program končí. Město to nese nelibě (−5).';
  addNews(state, { kind: 'varovani', title: message });
  return { state, ok: true, message };
}

// ---------- Plánování ----------

type Create = (state: GameState, rng: Rng, template: string, expires?: string) => void;

function offer(state: GameState, create: Create, id: string, expires?: string): boolean {
  const before = state.events.length;
  // RNG se šablonami nepoužívá (čísla jsou z hash01), stačí deterministická atrapa.
  create(state, undefined as unknown as Rng, PREFIX + id, expires);
  if (state.events.length <= before) return false;
  const od = ownerDecisionsOf(state);
  od.offered[id] = state.date;
  od.count += 1;
  return true;
}

const recently = (state: GameState, id: string, days: number) => {
  const last = state.ownerDecisions?.offered[id];
  return !!last && addDays(last, days) > state.date;
};
const open = (state: GameState, id: string) => state.events.some((e) => e.template === PREFIX + id);

/**
 * Nová hra: vize klubu je součást prvních kroků (položka schránky jako rozpočet nebo projekty, ne další situace
 * v týdenním limitu). Do termínu ji majitel zvolí v Klub › Majitel, jinak platí vyvážená cesta.
 */
export function startOwnerDecisions(state: GameState, _create?: Create): void {
  if (!OWNER_DECISIONS_CONFIG.enabled) return;
  ownerDecisionsOf(state).visionPick = { deadline: addDays(state.date, 21) };
}

/** Čekající volba vize z prvních kroků (pro schránku a kartu). */
export function visionPickPending(state: GameState): { deadline: string } | undefined {
  const od = state.ownerDecisions;
  return od?.visionPick && !visionOf(state) && !state.owner.ousted ? od.visionPick : undefined;
}

export interface VisionChoice {
  id: VisionKind;
  label: string;
  hint: string;
}

/** Volby vize s dopady (stejné jako v situaci). */
export function visionChoices(state: GameState): VisionChoice[] {
  const salesTarget = roundTo(annualCosts(own(state), tierOf(state, state.owner.clubId)) * 0.6, 1_000_000);
  return [
    { id: 'vyvazena', label: VISION_LABEL.vyvazena, hint: 'Cíle podle síly kádru a zdravé finance · bez změny přestupové politiky · hodnocení majitele ±2 podle plnění' },
    { id: 'akademie', label: VISION_LABEL.akademie, hint: 'Ředitel kupuje hráče do 24 let · cíl: 15 % minut pro hráče do 21 let, akademie o stupeň výš · projekty Akademie a Mladí přednostně · fanoušci trpěliví (+0,3/měsíc) · hodnocení ±4' },
    { id: 'prodejni', label: VISION_LABEL.prodejni, hint: `Politika ředitele „Prodejní klub“, nákupy do 26 let · cíl: prodeje za ${mil(salesTarget)} za 3 roky · fanoušci −0,2/měsíc · hodnocení ±4` },
    { id: 'uspech', label: VISION_LABEL.uspech, hint: 'Ředitel drží kádr („Držet kádr“) · cíl: lepší umístění než cíl sezóny, trofeje · projekty Evropa a Postup přednostně · fanoušci ±0,5/měsíc podle výsledků · hodnocení ±4' },
  ];
}

/** Volba vize z prvních kroků (Klub › Majitel). */
export function chooseVision(prev: GameState, kind: VisionKind): ActionResult {
  if (!visionPickPending(prev)) return { state: prev, ok: false, message: 'Vize klubu už je stanovená.' };
  const state = structuredClone(prev);
  const message = setVision(state, kind);
  state.ownerDecisions!.visionPick = undefined;
  state.ownerDecisions!.offered['vize'] = state.date;
  addNews(state, { kind: 'info', title: `Vize klubu: ${VISION_LABEL[kind]}`, text: message });
  return { state, ok: true, message };
}

function visionDue(state: GameState): boolean {
  const od = state.ownerDecisions;
  if (open(state, 'vize') || recently(state, 'vize', 60)) return false;
  if (!od?.vision) return !od?.visionPick;
  if (od.vision.until <= state.date) return month(state) >= 7 && month(state) <= 9;
  const coach = coachOf(state, state.owner.clubId);
  return !!coach && !coach.interim && coach.id !== od.vision.coachId && coach.id !== od.visionCoachAsked;
}

function priorityDue(state: GameState): boolean {
  if (open(state, 'priorita')) return false;
  const p = state.ownerDecisions?.priority;
  const m = month(state);
  if ((m === 7 || m === 8) && (!p || p.season !== state.season)) return true;
  const run = europeRun(state);
  return (m === 1 || m === 2) && state.date.slice(5) < '02-14' && run?.phase === 'jaro' && !(p?.season === state.season && p.spring);
}

/**
 * Denně (po situacích z dat): efekty strategických rozhodnutí a plánování nových.
 * Běžná rozhodnutí vznikají jen v pondělí, v týdnu bez jiného rozhodnutí a do limitu za sezónu.
 */
export function dailyOwnerDecisions(state: GameState, create: Create): void {
  if (state.gameOver) return;
  const md = state.date.slice(5);
  const od = state.ownerDecisions;
  if (od) {
    if (md === '07-01') applyReviewGoals(state);
    restAfterRotation(state);
    if (state.date.endsWith('-01')) {
      monthlyVision(state);
      monthlyPartner(state);
      monthlyCommunity(state);
    }
    if (md === '06-19') seasonCommunity(state);
    // První kroky: bez volby vize do termínu platí vyvážená cesta.
    if (od.visionPick && (visionOf(state) || state.date >= od.visionPick.deadline)) {
      if (!visionOf(state)) {
        const message = setVision(state, 'vyvazena');
        addNews(state, { kind: 'info', title: 'Vize klubu: bez volby platí vyvážená cesta', text: message });
      }
      od.visionPick = undefined;
    }
  }
  // Ligová sezóna (včetně nadstavby) je dohraná koncem května; čísla sezóny se zapíší 10. 6.
  if (md === REVIEW_DAY) snapshotSeason(state);
  if (!OWNER_DECISIONS_CONFIG.enabled || state.owner.ousted) return;
  // 4. Bilanční schůzka: velké sezónní rozhodnutí (mimo týdenní limit, nejvýš jedno za měsíc).
  // 10.–19. 6.: po dohrání ligy, před valnou hromadou (20. 6.), aby obě rozhodnutí nepadla na stejné dny.
  if (md === REVIEW_DAY) {
    const o = ownerDecisionsOf(state);
    const last = o.lastSeasonal;
    if ((!last || last.slice(0, 7) !== state.date.slice(0, 7)) && !open(state, 'bilance') && offer(state, create, 'bilance', `${state.date.slice(0, 4)}-${REVIEW_EXPIRES}`)) o.lastSeasonal = state.date;
    return;
  }
  if (dayOfWeek(state.date) !== 1) return;
  if (state.events.length >= 3 || (od && od.count >= OWNER_DECISIONS_PER_SEASON)) return;
  if (decisionBudgetLeft(state) <= 0 || decisionsLastWeek(state) >= 1) return;
  if (md > '06-10' && md < '07-06') return;
  if (visionDue(state) && offer(state, create, 'vize')) return;
  if (priorityDue(state) && offer(state, create, 'priorita')) return;
  if (!recently(state, 'platy', 365) && !open(state, 'platy') && wageTrigger(state) && offer(state, create, 'platy')) return;
  // Volitelné nabídky: vzácně a s odstupem.
  const lastOptional = Math.max(...['nazev', 'partner', 'komunita'].map((k) => (od?.offered[k] ? Date.parse(od.offered[k]) : 0)));
  if (lastOptional && Date.parse(addDays(state.date, -OPTIONAL_GAP)) < lastOptional) return;
  if (hash01(`${state.seed}-${state.date}-majitel`) >= OPTIONAL_CHANCE) return;
  const m = month(state);
  const club = own(state);
  const tier = tierOf(state, club.id);
  const eligible: string[] = [];
  if (m >= 9 && m <= 11 && tier <= 2 && club.stadium.capacity >= 2500 && !contracts(state).some((c) => c.slot === 'stadion') && !recently(state, 'nazev', 730) && !(od?.naming?.boughtBack && addDays(od.naming.boughtBack, 730) > state.date)) eligible.push('nazev');
  if ((m >= 10 || m <= 3) && tier <= 2 && !hasProgram(state, 'partner') && !recently(state, 'partner', 730)) eligible.push('partner');
  if ((m >= 9 || m <= 4) && !hasProgram(state, 'zeny') && !(od?.community && !od.community.ended) && !recently(state, 'komunita', 730)) eligible.push('komunita');
  if (!eligible.length) return;
  offer(state, create, eligible[Math.floor(hash01(`${state.seed}-${state.date}-majitel-vyber`) * eligible.length)]);
}

// ---------- Přehled pro UI ----------

export interface StrategyLine {
  id: string;
  title: string;
  value: string;
  detail?: string;
  next: string;
}

/** Přehled „Strategická rozhodnutí“ pro Klub › Majitel: co platí a kdy přijde další rozhodnutí. */
export function strategyOverview(state: GameState): StrategyLine[] {
  const od = state.ownerDecisions;
  const v = visionOf(state);
  const out: StrategyLine[] = [];
  const pending = (id: string) => state.events.find((e) => e.template === PREFIX + id);
  const wait = (id: string, fallback: string) => (pending(id) ? 'Čeká ve schránce rozhodnutí' : fallback);
  out.push({
    id: 'vize',
    title: 'Vize klubu',
    value: v ? VISION_LABEL[v.kind] : 'Nestanovena',
    detail: v ? `Od ${fmtDay(v.since)} do 30. 6. ${v.until.slice(0, 4)}` : undefined,
    next: visionPickPending(state) ? `Vyberte vizi výše (do ${fmtDay(visionPickPending(state)!.deadline)}, jinak vyvážená)` : wait('vize', v ? `Nová vize v létě ${v.until.slice(0, 4)} nebo po výměně trenéra` : 'Brzy (vedení se zeptá)'),
  });
  const p = od?.priority?.season === state.season ? od.priority : undefined;
  out.push({ id: 'priorita', title: 'Priorita soutěží', value: p ? PRIORITY_LABEL[p.kind] : 'Vyváženě (výchozí)', next: wait('priorita', 'Na začátku sezóny a při postupu do jarní Evropy') });
  const g = od?.goals;
  out.push({
    id: 'bilance',
    title: 'Bilanční schůzka',
    value: od?.review ? { prodlouzit: 'Pokračovat s vedením', cile: 'Nové, vyšší cíle', vymena: 'Výměna vedení' }[od.review.choice] : 'Zatím neproběhla',
    detail: g && !g.result ? `Cíle ${g.season}/${String(g.season + 1).slice(2)}: do ${g.position}. místa, ${g.youth} mladí s 10+ zápasy, provoz bez ztráty` : undefined,
    next: wait('bilance', `Po dohrání ligy (10. 6. ${state.season + 1}, rozhodnout do 19. 6.)`),
  });
  const rule = od?.wageRule;
  out.push({ id: 'platy', title: 'Platová hierarchie', value: rule ? (rule.kind === 'strop' ? `Strop ${rule.multiple}× průměru` : `Výjimka: ${rule.starName ?? 'hvězda'}, ostatní strop ${rule.multiple}×`) : 'Bez pravidla', detail: chemistryLine(state), next: wait('platy', 'Když nejvyšší plat přeroste 3× průměr kádru') });
  const deal = stadiumNameDeal(state);
  out.push({ id: 'nazev', title: 'Název stadionu', value: own(state).stadium.name, detail: deal ? `${deal.contract.name}: ${kc(deal.contract.annual)} ročně do ${deal.contract.untilSeason + 1}` : undefined, next: wait('nazev', deal ? 'Smlouva běží' : 'Nabídka může přijít na podzim') });
  const last = od?.profit?.[od.profit.length - 1];
  out.push({ id: 'zisk', title: 'Zisk sezóny', value: last ? ({ reinvest: 'Reinvestice', nic: 'Ponechán v klubu', ctvrt: 'Dividenda 25 %', pul: 'Dividenda 50 %', rezervy: 'Dividenda z rezerv' } as Record<string, string>)[last.choice] ?? last.choice : 'Zatím nerozhodnuto', detail: last ? `Sezóna ${last.season}/${String(last.season + 1).slice(2)}: ${mil(last.amount)}` : undefined, next: state.events.some((e) => e.template === 'valna') ? 'Čeká ve schránce rozhodnutí' : 'Na valné hromadě po sezóně (20. 6.)' });
  const pr = od?.partner && !od.partner.ended ? od.partner : undefined;
  out.push({ id: 'partner', title: 'Partnerský klub', value: pr ? `${pr.name} (${pr.country})` : hasProgram(state, 'partner') ? 'Partner z programu investic' : 'Žádný', detail: pr ? `Skauti: ${REGION_LABEL_SHORT[pr.region]}${pr.youth ? `, hostování mladých${pr.stints.length ? `: ${pr.stints.map((id) => (state.players[id] ? pName(state.players[id]) : '')).filter(Boolean).join(', ')}` : ''}` : ''}` : undefined, next: wait('partner', pr || hasProgram(state, 'partner') ? 'Běží' : 'Nabídka může přijít v zimě') });
  const c = od?.community && !od.community.ended ? od.community : undefined;
  const res = c?.results[c.results.length - 1];
  out.push({ id: 'komunita', title: 'Ženský tým a komunita', value: c ? (c.women ? 'Ženský tým i komunitní program' : 'Komunitní program') : hasProgram(state, 'zeny') ? 'Ženský tým (program)' : 'Neběží', detail: c ? `Partner ${c.partner} (${kc(c.partnerAnnual)}/rok)${res ? ` · ženy loni ${res.position}. (${res.league})` : ''}` : undefined, next: wait('komunita', c || hasProgram(state, 'zeny') ? 'Běží' : 'Nabídka může přijít během sezóny') });
  return out;
}

/** Kolik strategických rozhodnutí přišlo v této sezóně (pro UI). */
export function ownerDecisionsThisSeason(state: GameState): { count: number; limit: number } {
  return { count: state.ownerDecisions?.season === state.season ? state.ownerDecisions.count : 0, limit: OWNER_DECISIONS_PER_SEASON };
}
