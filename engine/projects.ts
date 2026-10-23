import { book } from './finance';
import { changeSponsorRelation, sponsorRelation } from './finplus';
import { addOwnerXp, hasUnlock, XP } from './ownerlevel';
import { effectiveCapacity } from './facilities';
import { playerAge, squadOf } from './players';
import { contracts } from './sponsors';
import type { ActionResult } from './staff';
import { computeTable } from './standings';
import { addTrophy, cityOf, ultrasOf } from './surroundings';
import type { GameState } from './types';
import { addNews, clamp, competitionOf, hash01, tierOf } from './world';

/**
 * V1 (A6): Strategické projekty. Na začátku sezóny (i hned v nové hře) vedení nabídne asi 6 projektů,
 * majitel vybere 1–3. Kroky se plní výsledky (data klubu) i akcemi agendy, postup je vidět,
 * splnění přinese odměnu (pověst, odkaz, peníze, XP majitele). Nesplnění v termínu trochu bolí.
 */

export interface ActiveProject {
  id: string;
  /** Sezóna výběru. */
  season: number;
  deadline: string;
  done: boolean[];
  /** Kolik kroků agendy už proběhlo. */
  agenda: number;
  /** Cílové hodnoty určené při výběru. */
  data: Record<string, number>;
  status: 'bezi' | 'splneno' | 'neuspech';
  finished?: string;
}

export interface StrategyState {
  /** Sezóna, ve které majitel vybral projekty. */
  picked?: number;
  active: ActiveProject[];
}

interface StepDef {
  text: (s: GameState, p: ActiveProject) => string;
  check: (s: GameState, p: ActiveProject) => boolean;
}

interface ProjectDef {
  id: string;
  title: string;
  detail: string;
  seasons: 1 | 2;
  /** Akce agendy, které se počítají jako krok projektu (vždy i „projekt“ s cílem na projekt). */
  actions: string[];
  agendaNeed: number;
  eligible: (s: GameState) => boolean;
  init: (s: GameState) => Record<string, number>;
  steps: StepDef[];
  rewardText: (s: GameState) => string;
  reward: (s: GameState, mult: number) => void;
}

const own = (s: GameState) => s.clubs[s.owner.clubId];
const fmt = (v: number) => `${Math.round(v).toLocaleString('cs-CZ')} Kč`;

function scaleMoney(s: GameState, base: number): number {
  const tier = tierOf(s, s.owner.clubId);
  const f = tier === 1 ? 1 : tier === 2 ? 0.4 : 0.2;
  return Math.round((base * f) / 50_000) * 50_000;
}

function homeAttendance(s: GameState): { avg: number; games: number; cap: number } {
  const comp = competitionOf(s, s.owner.clubId);
  const games = (comp?.fixtures ?? []).filter((f) => f.homeId === s.owner.clubId && f.result);
  const cap = effectiveCapacity(s, own(s));
  return { avg: games.length ? games.reduce((a, f) => a + (f.result?.attendance ?? 0), 0) / games.length : 0, games: games.length, cap };
}

function position(s: GameState): { pos: number; played: number; teams: number } | undefined {
  const comp = competitionOf(s, s.owner.clubId);
  if (!comp) return undefined;
  const t = computeTable(comp, s);
  const i = t.findIndex((r) => r.clubId === s.owner.clubId);
  return i < 0 ? undefined : { pos: i + 1, played: t[i].played, teams: t.length };
}

function youth(s: GameState) {
  return squadOf(s, s.owner.clubId).filter((p) => playerAge(p, s.season) <= 21);
}

const agendaStep = (label: string): StepDef => ({
  text: (_s, p) => `${label} (${Math.min(p.agenda, p.data.agendaNeed ?? 2)}/${p.data.agendaNeed ?? 2} z agendy)`,
  check: (_s, p) => p.agenda >= (p.data.agendaNeed ?? 2),
});

export const PROJECT_DEFS: ProjectDef[] = [
  {
    id: 'akademie', title: 'Akademie mezi nejlepšími', detail: 'Lepší akademie a odchovanci v prvním týmu.', seasons: 2, actions: ['trenink'], agendaNeed: 2,
    eligible: (s) => own(s).facilities.academy < 5,
    init: (s) => ({ academy: Math.min(5, own(s).facilities.academy + 1), agendaNeed: 2 }),
    steps: [
      { text: (_s, p) => `Akademie na úrovni ${p.data.academy} (Stadion → zázemí)`, check: (s, p) => own(s).facilities.academy >= p.data.academy },
      { text: () => 'Hráč do 21 let s aspoň 5 starty v sezóně', check: (s) => youth(s).some((x) => x.apps >= 5) },
      agendaStep('Návštěvy tréninku a akademie'),
    ],
    rewardText: () => 'Pověst klubu +2, odkaz +5, XP majitele',
    reward: (s) => {
      own(s).reputation = clamp(own(s).reputation + 2, 0, 100);
      addTrophy(s, 'vyzva', 'Projekt: akademie mezi nejlepšími');
    },
  },
  {
    id: 'vyprodano', title: 'Vyprodaný stadion', detail: 'Plné tribuny a nadšení fanoušci.', seasons: 1, actions: ['kotel', 'media'], agendaNeed: 2,
    eligible: () => true,
    init: () => ({ agendaNeed: 2 }),
    steps: [
      { text: (s) => { const a = homeAttendance(s); return `Průměrná návštěva ligy aspoň 85 % kapacity (teď ${a.cap ? Math.round((a.avg / a.cap) * 100) : 0} %, min. 3 zápasy)`; }, check: (s) => { const a = homeAttendance(s); return a.games >= 3 && a.avg >= a.cap * 0.85; } },
      { text: () => 'Nálada fanoušků aspoň 70', check: (s) => own(s).fanMood >= 70 },
      agendaStep('Setkání s kotlem nebo rozhovory pro média'),
    ],
    rewardText: (s) => `Nálada fanoušků +5, prodej dresů navíc ${fmt(scaleMoney(s, 1_500_000))}`,
    reward: (s, m) => {
      own(s).fanMood = clamp(own(s).fanMood + 5, 0, 100);
      book(s, s.owner.clubId, 'fanshop', scaleMoney(s, 1_500_000) * m, 'Projekt vyprodaný stadion: prodej dresů');
    },
  },
  {
    id: 'evropa', title: 'Evropa do 2 let', detail: 'Dostat klub do evropských pohárů.', seasons: 2, actions: ['trener', 'skauting'], agendaNeed: 3,
    eligible: (s) => tierOf(s, s.owner.clubId) === 1,
    init: () => ({ agendaNeed: 3 }),
    steps: [
      { text: () => 'Klub v první čtyřce po aspoň 10 kolech', check: (s) => { const p = position(s); return !!p && p.played >= 10 && p.pos <= 4; } },
      { text: () => 'Účast v evropských pohárech', check: (s, p) => !!s.europe?.entries.some((e) => e.clubId === s.owner.clubId && e.season > p.season) },
      agendaStep('Porady s trenérem a skautské cesty'),
    ],
    rewardText: (s) => `Pověst klubu +3, odkaz +5, bonus ${fmt(scaleMoney(s, 5_000_000))}`,
    reward: (s, m) => {
      own(s).reputation = clamp(own(s).reputation + 3, 0, 100);
      book(s, s.owner.clubId, 'komercni', scaleMoney(s, 5_000_000) * m, 'Projekt Evropa: bonus partnerů');
      addTrophy(s, 'vyzva', 'Projekt: Evropa do 2 let');
    },
  },
  {
    id: 'postup', title: 'Postup do 2 let', detail: 'Vybojovat postup do vyšší soutěže.', seasons: 2, actions: ['trener', 'skauting'], agendaNeed: 3,
    eligible: (s) => tierOf(s, s.owner.clubId) > 1,
    init: (s) => ({ agendaNeed: 3, tier: tierOf(s, s.owner.clubId) }),
    steps: [
      { text: () => 'Klub v první trojce po aspoň 10 kolech', check: (s) => { const p = position(s); return !!p && p.played >= 10 && p.pos <= 3; } },
      { text: () => 'Postup do vyšší soutěže', check: (s, p) => tierOf(s, s.owner.clubId) < (p.data.tier ?? 99) },
      agendaStep('Porady s trenérem a skautské cesty'),
    ],
    rewardText: (s) => `Pověst klubu +3, bonus ${fmt(scaleMoney(s, 3_000_000))}`,
    reward: (s, m) => {
      own(s).reputation = clamp(own(s).reputation + 3, 0, 100);
      book(s, s.owner.clubId, 'komercni', scaleMoney(s, 3_000_000) * m, 'Projekt postup: bonus partnerů');
    },
  },
  {
    id: 'finance', title: 'Zdravé finance', detail: 'Klub bez dluhů a krize, s rezervou na účtu.', seasons: 1, actions: ['sponzor'], agendaNeed: 2,
    eligible: () => true,
    init: (s) => ({ agendaNeed: 2, reserve: Math.max(0, scaleMoney(s, 10_000_000)) }),
    steps: [
      { text: (_s, p) => `Na účtu aspoň ${fmt(p.data.reserve)} na začátku měsíce (3×)`, check: (s, p) => (own(s).finance.balanceHistory ?? []).filter((b) => b.date.slice(0, 4) >= String(p.season) && b.balance >= p.data.reserve).length >= 3 },
      { text: () => 'Klub není v krizovém režimu', check: (s) => !s.crisis && own(s).finance.balance > 0 },
      agendaStep('Obědy se sponzory'),
    ],
    rewardText: () => 'Spokojenost spolumajitelů +8, pověst u svazu +3',
    reward: (s) => {
      for (const sh of s.shareholders) sh.satisfaction = clamp(sh.satisfaction + 8, 0, 100);
      s.owner.league = clamp(s.owner.league + 3, 0, 100);
    },
  },
  {
    id: 'mladi', title: 'Rozvoj mladých', detail: 'Minuty a růst pro hráče do 21 let.', seasons: 1, actions: ['trenink'], agendaNeed: 2,
    eligible: (s) => youth(s).length >= 2,
    init: (s) => ({ agendaNeed: 2, best: Math.max(0, ...youth(s).map((p) => p.overall)) + 3 }),
    steps: [
      { text: (s) => `Hráči do 21 let odehrají 2 000 minut (teď ${youth(s).reduce((a, p) => a + p.minutes, 0)})`, check: (s) => youth(s).reduce((a, p) => a + p.minutes, 0) >= 2000 },
      { text: (_s, p) => `Hráč do 21 let s hodnocením aspoň ${p.data.best}`, check: (s, p) => youth(s).some((x) => x.overall >= p.data.best) },
      agendaStep('Návštěvy tréninku'),
    ],
    rewardText: () => 'Pověst klubu +1, morálka mladých +10, XP majitele',
    reward: (s) => {
      own(s).reputation = clamp(own(s).reputation + 1, 0, 100);
      for (const p of youth(s)) p.morale = clamp(p.morale + 10, 0, 100);
    },
  },
  {
    id: 'fanousci', title: 'Fanouškovská základna', detail: 'Kotel i rodiny na straně klubu.', seasons: 1, actions: ['kotel', 'media'], agendaNeed: 3,
    eligible: () => true,
    init: () => ({ agendaNeed: 3 }),
    steps: [
      { text: (s) => `Nálada fanoušků aspoň 75 (teď ${Math.round(own(s).fanMood)})`, check: (s) => own(s).fanMood >= 75 },
      { text: (s) => `Vztah s kotlem aspoň 70 (teď ${Math.round(ultrasOf(s).relation)})`, check: (s) => ultrasOf(s).relation >= 70 },
      agendaStep('Setkání s kotlem a rozhovory pro média'),
    ],
    rewardText: () => 'Pověst u médií +4, vztah se sponzory +5',
    reward: (s) => {
      s.owner.media = clamp(s.owner.media + 4, 0, 100);
      for (const c of contracts(s)) changeSponsorRelation(s, c.slot, 5);
    },
  },
  {
    id: 'mesto', title: 'Partnerství s městem', detail: 'Radnice jako spojenec klubu.', seasons: 1, actions: ['radnice'], agendaNeed: 2,
    eligible: (s) => cityOf(s).relation < 80,
    init: () => ({ agendaNeed: 2 }),
    steps: [
      { text: (s) => `Vztah s městem aspoň 70 (teď ${Math.round(cityOf(s).relation)})`, check: (s) => cityOf(s).relation >= 70 },
      { text: () => 'Klub má komunitní rozpočet', check: (s) => (own(s).policy.community ?? 0) > 0 },
      agendaStep('Jednání na radnici'),
    ],
    rewardText: (s) => `Příspěvek města ${fmt(scaleMoney(s, 2_000_000))}`,
    reward: (s, m) => book(s, s.owner.clubId, 'ostatni', scaleMoney(s, 2_000_000) * m, 'Projekt partnerství s městem: příspěvek'),
  },
  {
    id: 'sponzori', title: 'Silní partneři', detail: 'Spokojený generální partner a obsazená hlavní místa.', seasons: 1, actions: ['sponzor'], agendaNeed: 2,
    eligible: () => true,
    init: () => ({ agendaNeed: 2 }),
    steps: [
      { text: (s) => `Vztah s generálním partnerem aspoň 75 (teď ${Math.round(sponsorRelation(s, 'generalni'))})`, check: (s) => sponsorRelation(s, 'generalni') >= 75 },
      { text: () => 'Obsazená místa generální, dres a stadion', check: (s) => ['generalni', 'dres', 'stadion'].every((slot) => contracts(s).some((c) => c.slot === slot && c.untilSeason >= s.season)) },
      agendaStep('Obědy se sponzory'),
    ],
    rewardText: (s) => `Bonus partnerů ${fmt(scaleMoney(s, 2_500_000))}`,
    reward: (s, m) => book(s, s.owner.clubId, 'komercni', scaleMoney(s, 2_500_000) * m, 'Projekt silní partneři: bonus'),
  },
];

const DEF = new Map(PROJECT_DEFS.map((d) => [d.id, d]));

export function strategyOf(state: GameState): StrategyState {
  state.strategy ??= { active: [] };
  state.strategy.active ??= [];
  return state.strategy;
}

export interface ProjectOffer {
  id: string;
  title: string;
  detail: string;
  seasons: number;
  steps: string[];
  reward: string;
}

/** Nabídka projektů pro tuto sezónu (prázdná, když už majitel vybral). */
export function projectOffers(state: GameState): ProjectOffer[] {
  if (state.strategy?.picked === state.season || state.owner.ousted) return [];
  const running = new Set((state.strategy?.active ?? []).filter((p) => p.status === 'bezi').map((p) => p.id));
  const list = PROJECT_DEFS.filter((d) => d.eligible(state) && !running.has(d.id))
    .sort((a, b) => hash01(`${state.seed}-${state.season}-${a.id}`) - hash01(`${state.seed}-${state.season}-${b.id}`))
    .slice(0, 6);
  return list.map((d) => {
    const fake: ActiveProject = { id: d.id, season: state.season, deadline: '', done: [], agenda: 0, data: d.init(state), status: 'bezi' };
    return { id: d.id, title: d.title, detail: d.detail, seasons: d.seasons, steps: d.steps.map((st) => st.text(state, fake)), reward: d.rewardText(state) };
  });
}

/** Výběr 1–3 projektů z nabídky. */
export function pickProjects(prev: GameState, ids: string[]): ActionResult {
  const offers = projectOffers(prev);
  if (!offers.length) return { state: prev, ok: false, message: 'Projekty pro tuto sezónu už jsou vybrané.' };
  const uniq = [...new Set(ids)].filter((id) => offers.some((o) => o.id === id));
  const running = (prev.strategy?.active ?? []).filter((p) => p.status === 'bezi').length;
  if (!uniq.length) return { state: prev, ok: false, message: 'Vyberte aspoň jeden projekt.' };
  if (uniq.length > 3 || uniq.length + running > 4) return { state: prev, ok: false, message: 'Najednou zvládnete nejvýš 3 nové projekty (a 4 běžící).' };
  const state = structuredClone(prev);
  const st = strategyOf(state);
  for (const id of uniq) {
    const d = DEF.get(id)!;
    st.active.push({ id, season: state.season, deadline: `${state.season + d.seasons}-06-15`, done: d.steps.map(() => false), agenda: 0, data: d.init(state), status: 'bezi' });
  }
  st.picked = state.season;
  updateProjects(state, false);
  return { state, ok: true, message: `Strategické projekty: ${uniq.map((id) => DEF.get(id)!.title).join(', ')}.` };
}

export interface ProjectView {
  id: string;
  title: string;
  steps: { text: string; done: boolean }[];
  progress: number;
  reward: string;
  deadline: string;
  status: ActiveProject['status'];
}

export function activeProjects(state: GameState, includeFinished = false): ProjectView[] {
  return (state.strategy?.active ?? [])
    .filter((p) => includeFinished || p.status === 'bezi')
    .map((p) => {
      const d = DEF.get(p.id);
      if (!d) return undefined;
      const steps = d.steps.map((st, i) => ({ text: st.text(state, p), done: p.done[i] || p.status === 'splneno' }));
      return { id: p.id, title: d.title, steps, progress: steps.filter((x) => x.done).length / steps.length, reward: d.rewardText(state), deadline: p.deadline, status: p.status };
    })
    .filter((x): x is ProjectView => !!x);
}

/** Akce agendy posune projekty, které ji počítají (nebo akce „projekt“ cílená na projekt). Vrací názvy posunutých. */
export function projectAgendaProgress(state: GameState, actionId: string, target?: string): string[] {
  const moved: string[] = [];
  for (const p of state.strategy?.active ?? []) {
    if (p.status !== 'bezi') continue;
    const d = DEF.get(p.id);
    if (!d) continue;
    const hit = (actionId === 'projekt' && target === p.id) || d.actions.includes(actionId);
    if (hit && p.agenda < (p.data.agendaNeed ?? d.agendaNeed)) {
      p.agenda++;
      moved.push(d.title);
    }
  }
  return moved;
}

/** Vyhodnotí kroky, odmění splněné a uzavře propadlé projekty. */
export function updateProjects(state: GameState, announce = true): void {
  for (const p of state.strategy?.active ?? []) {
    if (p.status !== 'bezi') continue;
    const d = DEF.get(p.id);
    if (!d) continue;
    d.steps.forEach((st, i) => {
      if (!p.done[i] && st.check(state, p)) p.done[i] = true;
    });
    if (p.done.every(Boolean)) {
      p.status = 'splneno';
      p.finished = state.date;
      const mult = hasUnlock(state, 'legenda') ? 1.5 : 1;
      d.reward(state, mult);
      addOwnerXp(state, XP.project * mult);
      if (announce) addNews(state, { kind: 'sezona', title: `Projekt splněn: ${d.title}`, text: `Odměna: ${d.rewardText(state)}.` });
    } else if (state.date > p.deadline) {
      p.status = 'neuspech';
      p.finished = state.date;
      state.owner.media = clamp(state.owner.media - 2, 0, 100);
      if (announce) addNews(state, { kind: 'varovani', title: `Projekt nesplněn: ${d.title}`, text: 'Termín vypršel. Média si všimla (pověst −2).' });
    }
  }
  // Uzavřené projekty se drží rok kvůli historii.
  if (state.strategy) state.strategy.active = state.strategy.active.filter((p) => p.status === 'bezi' || (p.finished ?? '') >= `${state.season - 1}-07-01`);
}

/** Pondělí: průběžné vyhodnocení projektů. */
export function weeklyProjects(state: GameState): void {
  if (!state.strategy?.active.length) return;
  updateProjects(state, true);
}
