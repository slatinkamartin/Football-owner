import { addDays, dayOfWeek } from './calendar';
import { characterById, characters, diminish, meetCharacterMut, weeklyCharacterRequest } from './characters';
import { resolveEvent } from './events';
import { ownMatchesSince } from './facts';
import { changeSponsorRelation, sponsorRelation } from './finplus';
import { huntOf, huntTargets, personalPitchMut, scoutTripMut } from './hunt';
import { addOwnerXp, hasUnlock, XP } from './ownerlevel';
import { delegationOf } from './people';
import { squadOf } from './players';
import { activeProjects, projectAgendaProgress, weeklyProjects } from './projects';
import type { Rng } from './rng';
import { SLOT_LABEL, contracts } from './sponsors';
import { coachOf, goalTarget, ownPosition, type ActionResult } from './staff';
import { computeTable } from './standings';
import { changeCity, changeUltras, cityOf, cityPermit, ultrasOf } from './surroundings';
import { enforceTraining, weeklyTraining } from './training';
import type { GameState, SponsorSlot } from './types';
import { clamp, competitionOf, transferWindow } from './world';

/**
 * v0.29 (W2): Měsíční priority majitele (nahrazují týdenní agendu V1).
 *
 * 1. den měsíce (a hned v nové hře) si majitel vybere 2–3 oblasti (od 3. úrovně majitele 4),
 * kterým se v měsíci věnuje. Konkrétní akce (AGENDA_ACTIONS) podle nich provádějí ředitelé a vedení
 * samo, rozložené do týdnů: každá priorita jednou týdně (1. priorita v pondělí, 2. v úterý…),
 * cíl vybírá engine z dat (sponzor s končící smlouvou, hráč z lovu, projekt s otevřeným krokem…).
 * Majitel během měsíce nemusí nic klikat.
 *
 * Bez výběru zvolí priority vedení samo podle situace s polovičním účinkem (každá priorita jen
 * každý druhý týden) – to je bývalá rutina A3. Priority lze během měsíce změnit: první výběr
 * a jedna změna jsou zdarma, každá další změna „spálí“ týden (7 dní bez práce na prioritách).
 *
 * Na konci měsíce vzniká shrnutí (lastMonthSummary – karta konce měsíce). Osobní schůzka
 * s postavou (kontakty) je mimo priority: jedna týdně zdarma (personalMeeting).
 *
 * Staré uložené hry s týdenní agendou (week/used/history) se při prvním dni převedou:
 * nevyužitá týdenní agenda se zahodí, zachová se jen nastavení rutiny a vylepšené nabídky.
 */

export type AgendaIcon = 'trener' | 'trenink' | 'sponzor' | 'skauting' | 'radnice' | 'kotel' | 'media' | 'prestup' | 'postava' | 'projekt';

export interface AgendaActionDef {
  id: AgendaIcon;
  title: string;
  icon: AgendaIcon;
  detail: string;
  effectHint: string;
}

/** Jednotlivé akce, které vedení provádí podle priorit. */
export const AGENDA_ACTIONS: AgendaActionDef[] = [
  { id: 'trener', title: 'Porada s trenérem', icon: 'trener', detail: 'Probrat tým, podporu a směr s hlavním trenérem.', effectHint: 'Důvěra trenéra až +5, případně morálka nebo minuty mladých' },
  { id: 'trenink', title: 'Návštěva tréninku', icon: 'trenink', detail: 'Přijít se podívat na trénink, mluvit s hráči.', effectHint: 'Morálka týmu +2, vztah s kapitánem +3, trenér dodrží váš plán tréninku' },
  { id: 'sponzor', title: 'Oběd se sponzorem', icon: 'sponzor', detail: 'Udržovat vztahy s partnery klubu.', effectHint: 'Vztah se sponzorem +6, lepší nabídka na volné místo' },
  { id: 'skauting', title: 'Skautská cesta za hráčem', icon: 'skauting', detail: 'Vidět cíl lovu naživo.', effectHint: 'Přesnější odhad hodnocení hráče (chyba −35 %)' },
  { id: 'radnice', title: 'Jednání na radnici', icon: 'radnice', detail: 'Schůzka s vedením města.', effectHint: 'Vztah s městem +5 (povolení staveb, dotace)' },
  { id: 'kotel', title: 'Setkání s kotlem', icon: 'kotel', detail: 'Vyslechnout předáka kotle a fanklub.', effectHint: 'Vztah s kotlem +6, může ukončit bojkot' },
  { id: 'media', title: 'Rozhovor pro média', icon: 'media', detail: 'Rozhovor pro noviny nebo televizi.', effectHint: 'Pověst u médií +3, podle tónu i fanoušci nebo trenér' },
  { id: 'prestup', title: 'Osobní jednání o přestupu', icon: 'prestup', detail: 'Osobně přesvědčit hráče a jeho agenta.', effectHint: 'Vztah s agentem +8, cena −10 % na 3 týdny, konkurence zchladne' },
  { id: 'postava', title: 'Schůzka s postavou', icon: 'postava', detail: 'Domluvit schůzku s někým z okolí klubu.', effectHint: 'Podle tématu: vztah, nálada, příspěvky, povolení' },
  { id: 'projekt', title: 'Krok projektu', icon: 'projekt', detail: 'Osobně posunout strategický projekt.', effectHint: 'Krok strategického projektu splněn' },
];

// ---------- priority ----------

export type PriorityId = 'kabina' | 'sponzori' | 'prestupy' | 'radnice' | 'fanousci' | 'media' | 'projekty' | 'mladez';

export interface PriorityDef {
  id: PriorityId;
  title: string;
  icon: AgendaIcon;
  /** Co vedení v rámci priority dělá. */
  detail: string;
  /** Akce agendy, které priorita používá (kvůli krokům projektů a nápovědě). */
  actions: AgendaIcon[];
}

export const PRIORITIES: PriorityDef[] = [
  { id: 'kabina', title: 'Trenér a kabina', icon: 'trener', detail: 'Porady s trenérem a návštěvy tréninku: důvěra trenéra, morálka, plán tréninku.', actions: ['trener', 'trenink'] },
  { id: 'sponzori', title: 'Sponzoři', icon: 'sponzor', detail: 'Obědy s partnery (přednostně s končící smlouvou nebo slabým vztahem), lepší nabídky.', actions: ['sponzor'] },
  { id: 'prestupy', title: 'Skauting a přestupy', icon: 'skauting', detail: 'Skautské cesty za cíli lovu, v okně osobní jednání; bez cílů ředitel hledá tipy.', actions: ['skauting', 'prestup'] },
  { id: 'radnice', title: 'Radnice a stadion', icon: 'radnice', detail: 'Jednání s městem: povolení staveb, dotace, urychlení stavby.', actions: ['radnice'] },
  { id: 'fanousci', title: 'Fanoušci a kotel', icon: 'kotel', detail: 'Setkání s kotlem a fanklubem: vztah s kotlem, konec bojkotu.', actions: ['kotel'] },
  { id: 'media', title: 'Média', icon: 'media', detail: 'Rozhovory pro noviny a televizi: pověst u médií, podle situace podpora trenéra.', actions: ['media'] },
  { id: 'projekty', title: 'Projekty', icon: 'projekt', detail: 'Posun strategických projektů s otevřeným krokem.', actions: ['projekt'] },
  { id: 'mladez', title: 'Mládež', icon: 'trenink', detail: 'Šance pro mladé u trenéra a návštěvy tréninku s akademií.', actions: ['trenink', 'trener'] },
];

const PDEF = new Map(PRIORITIES.map((p) => [p.id, p]));
export const priorityTitle = (id: string): string => PDEF.get(id as PriorityId)?.title ?? id;

export interface AgendaUse {
  slot: number;
  actionId: string;
  target?: string;
  result?: string;
  date?: string;
  /** Doplněno rutinou vedení (poloviční účinek). */
  routine?: boolean;
  /** Priorita, ze které akce vzešla. */
  priority?: PriorityId;
}

export interface WeekSnapshot {
  trener: number;
  reditel: number;
  fanMood: number;
  kotel: number;
  mesto: number;
  media: number;
  balance: number;
  morale: number;
  sponzor: number;
  position?: number;
}

export interface MonthSummary {
  /** YYYY-MM */
  month: string;
  title: string;
  lines: string[];
  deltas: { label: string; value: number }[];
  priorities: PriorityId[];
  by: 'majitel' | 'vedeni';
}

export interface AgendaState {
  /** YYYY-MM aktuálního měsíce (chybí ve starých uložených hrách s týdenní agendou). */
  month?: string;
  priorities?: PriorityId[];
  /** Kdo priority tohoto měsíce zvolil. */
  by?: 'majitel' | 'vedeni';
  /** Kolikrát majitel tento měsíc své priority změnil (1. výběr a 1 změna zdarma, další spálí týden). */
  changes?: number;
  /** Po další změně: do tohoto data (bez něj) vedení na prioritách nepracuje. */
  burnUntil?: string;
  /** Ponechat priority majitele i na další měsíc (jinak je v novém měsíci navrhne vedení). */
  keep?: boolean;
  /** Akce provedené tento měsíc. */
  log?: AgendaUse[];
  snapshot?: WeekSnapshot;
  /** Týden (pondělí), kdy každá priorita naposledy proběhla. */
  ran?: Partial<Record<PriorityId, string>>;
  /** Cíl lovu, který má vedení přednostně skautovat. */
  focus?: string;
  /** Poslední cíl sponzorské priority (pro střídání partnerů). */
  lastSponsor?: string;
  /** Týden (pondělí) poslední osobní schůzky s postavou. */
  meetWeek?: string;
  /** A3: drobná rozhodnutí vyřizuje vedení samo. */
  auto?: boolean;
  /** Sponzorské nabídky už vylepšené obědem (každá jen jednou). */
  boosted?: string[];
  /** Kolik drobností vedení vyřídilo tento měsíc. */
  routineCount?: number;
  /** Uzavřené měsíce (nejnovější první, nejvýš 6). */
  months?: { month: string; summary: MonthSummary }[];
  /** @deprecated V1 týdenní agenda (staré uložené hry); při převodu se zahodí. */
  week?: string;
  /** @deprecated V1 */
  used?: AgendaUse[];
  /** @deprecated V1 */
  history?: unknown[];
}

/** Pondělí týdne, do kterého patří datum. */
export function weekStartOf(date: string): string {
  const d = dayOfWeek(date);
  return addDays(date, d === 0 ? -6 : 1 - d);
}

export const monthOf = (date: string): string => date.slice(0, 7);

const MONTH_NAMES = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
export function monthLabel(month: string): string {
  const m = Number(month.slice(5, 7));
  return `${MONTH_NAMES[m - 1] ?? month} ${month.slice(0, 4)}`;
}

/** Kolik priorit si majitel může vybrat (od 3. úrovně majitele 4). */
export function agendaSlots(state: GameState): number {
  if (state.owner.ousted || state.gameOver) return 0;
  return hasUnlock(state, 'slot4') ? 4 : 3;
}
export const maxPriorities = agendaSlots;
export const MIN_PRIORITIES = 2;

function moraleAvg(state: GameState): number {
  const s = squadOf(state, state.owner.clubId);
  return s.length ? s.reduce((a, p) => a + p.morale, 0) / s.length : 50;
}

function ownPos(state: GameState): number | undefined {
  const comp = competitionOf(state, state.owner.clubId);
  if (!comp) return undefined;
  const t = computeTable(comp, state);
  const i = t.findIndex((r) => r.clubId === state.owner.clubId);
  return i >= 0 && t[i].played > 0 ? i + 1 : undefined;
}

export function snapshot(state: GameState): WeekSnapshot {
  const club = state.clubs[state.owner.clubId];
  return {
    trener: state.owner.trust.trener,
    reditel: state.owner.trust.reditel,
    fanMood: club.fanMood,
    kotel: ultrasOf(state).relation,
    mesto: cityOf(state).relation,
    media: state.owner.media,
    balance: club.finance.balance,
    morale: moraleAvg(state),
    sponzor: sponsorRelation(state, 'generalni'),
    position: ownPos(state),
  };
}

// ---------- doporučení priorit z dat (vedení i rádce) ----------

export interface PriorityAdvice {
  id: PriorityId;
  title: string;
  reason: string;
  score: number;
}

function huntPool(state: GameState) {
  return huntTargets(state).filter((t) => t.trips < 3 && (!t.foreign || hasUnlock(state, 'zahranici')));
}

function openProjectStep(state: GameState) {
  for (const p of activeProjects(state)) {
    const step = p.steps.find((s) => !s.done && s.text.includes('z priorit'));
    if (step) return { p, step };
  }
  return undefined;
}

/** Ohodnocení všech oblastí podle situace klubu (seřazené od nejdůležitější). Nemění stav. */
export function priorityAdvice(state: GameState): PriorityAdvice[] {
  const club = state.clubs[state.owner.clubId];
  const out: PriorityAdvice[] = [];
  const add = (id: PriorityId, score: number, reason: string) => out.push({ id, title: priorityTitle(id), reason, score });
  const month = Number(state.date.slice(5, 7));

  const trust = state.owner.trust.trener;
  const morale = moraleAvg(state);
  if (trust < 50) add('kabina', 80 - trust / 2, `Důvěra trenéra je jen ${Math.round(trust)}.`);
  else if (morale < 50) add('kabina', 65 - morale / 2, `Morálka týmu je ${Math.round(morale)}.`);
  else {
    const last = ownMatchesSince(state, addDays(state.date, -35)).slice(-3);
    const losing = last.length === 3 && last.every((m) => m.outcome === 'P');
    const unhappy = squadOf(state, state.owner.clubId).filter((p) => p.morale < 35).length;
    if (losing) add('kabina', 62, 'Tři porážky v řadě – trenér a kabina potřebují podporu.');
    else if (unhappy >= 3) add('kabina', 55, `${unhappy} hráči jsou nespokojení (morálka pod 35).`);
    else if (trust > 70) add('kabina', 6, `Důvěra trenéra je vysoká (${Math.round(trust)}), víc z porad nevytěžíte.`);
    else add('kabina', 32, 'Dobrý vztah s trenérem a kabinou drží výkon i plán tréninku.');
  }

  const gen = contracts(state).find((c) => c.slot === 'generalni');
  const rel = sponsorRelation(state, 'generalni');
  const ending = contracts(state).find((c) => c.untilSeason <= state.season);
  if (!contracts(state).length) add('sponzori', 10, 'Klub zatím nemá smluvní sponzory.');
  else if (ending) add('sponzori', 68, `Smlouva s ${ending.name} (${SLOT_LABEL[ending.slot]}) končí s koncem sezóny.`);
  else if (rel < 50 && gen) add('sponzori', 60 - rel / 4, `Vztah s ${gen.name} je jen ${Math.round(rel)}.`);
  else if ((state.sponsorOffers ?? []).length) add('sponzori', 50, 'Na stole jsou sponzorské nabídky – obědy je vylepší.');
  else add('sponzori', 26, 'Udržet partnery spokojené.');

  const win = transferWindow(state.date);
  const pool = huntPool(state);
  const rivalT = huntTargets(state).find((t) => !t.foreign && t.rival && t.rival.strength >= 50);
  if (win && rivalT) add('prestupy', 70, `Okno je otevřené a o ${rivalT.name} stojí i ${rivalT.rival!.name} (${rivalT.rival!.strength} %).`);
  else if (win) add('prestupy', pool.length ? 60 : 52, pool.length ? `Okno je otevřené, ${pool.length} ${pool.length === 1 ? 'cíl lovu čeká' : 'cílů lovu čeká'} na skauty.` : 'Okno je otevřené a lov nemá cíle – ředitel najde tipy.');
  else if (month === 6 || month === 12) add('prestupy', 48, 'Blíží se přestupní okno – skauti si mají cíle prověřit předem.');
  else add('prestupy', pool.length ? 24 : 12, pool.length ? 'Průběžné skautování cílů lovu.' : 'Mimo okno je skauting méně důležitý.');

  const city = cityOf(state);
  const building = (state.bigProjects ?? []).some((p) => p.end > state.date);
  if (city.relation < 40) add('radnice', 62 - city.relation / 3, `Vztah s městem je ${Math.round(city.relation)}: povolení staveb a dotace jsou v ohrožení.`);
  else if (building) add('radnice', 55, 'Běží stavba – dobrý vztah s městem urychlí povolení.');
  else add('radnice', 16, 'Vztah s městem je v pořádku.');

  const u = ultrasOf(state);
  if (u.boycottUntil && u.boycottUntil >= state.date) add('fanousci', 88, 'Kotel bojkotuje zápasy. Setkání ho může ukončit.');
  else if (u.relation < 45) add('fanousci', 76 - u.relation / 2, `Vztah s kotlem je ${Math.round(u.relation)}: hrozí bojkot a pokuty.`);
  else if (club.fanMood < 45) add('fanousci', 50, `Nálada fanoušků je ${Math.round(club.fanMood)}.`);
  else add('fanousci', 20, 'Fanoušci jsou zatím spokojení.');

  if (state.owner.media < 40) add('media', 54 - state.owner.media / 2, `Pověst u médií je ${Math.round(state.owner.media)}.`);
  else add('media', 15, 'Pověst u médií je v pořádku.');

  const open = openProjectStep(state);
  if (open) add('projekty', 46 + open.p.progress * 20, `${open.p.title}: ${open.step.text}.`);

  const youthProject = activeProjects(state).some((p) => p.id === 'mladi' || p.id === 'akademie');
  add('mladez', youthProject ? 47 : 18, youthProject ? 'Běží projekt mladých – trenér jim má dát prostor.' : 'Odchovanci zvyšují hodnotu kádru.');

  return out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/** Návrh vedení: nejdůležitější oblasti (3, nejvýš kolik smí majitel). */
export function proposedPriorities(state: GameState, n = 3): PriorityId[] {
  return priorityAdvice(state).slice(0, Math.max(MIN_PRIORITIES, Math.min(n, agendaSlots(state) || 3))).map((a) => a.id);
}

// ---------- stav a převod starých her ----------

function freshMonth(state: GameState, ag: AgendaState): void {
  const keepOwn = ag.keep && ag.by === 'majitel' && ag.priorities?.length;
  ag.month = monthOf(state.date);
  ag.priorities = keepOwn ? ag.priorities!.slice(0, agendaSlots(state) || 3) : proposedPriorities(state);
  ag.by = keepOwn ? 'majitel' : 'vedeni';
  ag.changes = 0;
  ag.log = [];
  ag.routineCount = 0;
  ag.snapshot = snapshot(state);
}

/** Stav priorit (mutuje: založí, převede starou týdenní agendu, uzavře minulý měsíc). */
export function agendaOf(state: GameState): AgendaState {
  if (!state.agenda) state.agenda = {};
  const ag = state.agenda;
  if (!ag.month) {
    // Stará uložená hra (V1 týdenní agenda) nebo nová hra: nevyužitá týdenní agenda se zahodí.
    delete ag.week;
    delete ag.used;
    delete ag.history;
    ag.months ??= [];
    freshMonth(state, ag);
  } else if (ag.month !== monthOf(state.date)) rollMonth(state);
  ag.log ??= [];
  ag.months ??= [];
  return ag;
}

export interface MonthPriorities {
  month: string;
  label: string;
  priorities: PriorityId[];
  by: 'majitel' | 'vedeni';
  max: number;
  min: number;
  keep: boolean;
  /** Akce provedené tento měsíc. */
  log: AgendaUse[];
  /** Kolik akcí udělala každá priorita tento měsíc. */
  counts: Partial<Record<PriorityId, number>>;
  /** Co stojí další nastavení priorit. */
  changeCost: 'zdarma' | 'tyden';
  changeNote: string;
  burnUntil?: string;
}

/** Priority aktuálního měsíce pro UI. Nemění stav (staré hry i chybějící stav dopočítá). */
export function monthPriorities(state: GameState): MonthPriorities {
  const month = monthOf(state.date);
  const ag = state.agenda;
  const cur = ag?.month === month ? ag : undefined;
  const priorities = cur?.priorities ?? (ag?.keep && ag.by === 'majitel' && ag.priorities?.length ? ag.priorities : proposedPriorities(state));
  const by = cur?.by ?? (ag?.keep && ag.by === 'majitel' ? 'majitel' : 'vedeni');
  const log = cur?.log ?? [];
  const counts: Partial<Record<PriorityId, number>> = {};
  for (const u of log) if (u.priority && u.actionId !== 'nic') counts[u.priority] = (counts[u.priority] ?? 0) + 1;
  const changes = cur?.changes ?? 0;
  const free = by === 'vedeni' || changes < 1;
  return {
    month,
    label: monthLabel(month),
    priorities,
    by,
    max: agendaSlots(state),
    min: MIN_PRIORITIES,
    keep: !!ag?.keep,
    log,
    counts,
    changeCost: free ? 'zdarma' : 'tyden',
    changeNote: by === 'vedeni' ? 'Výběr je zdarma. Vaše priority mají plný účinek (vedení samo jen poloviční).' : changes < 1 ? 'Jedna změna v měsíci je zdarma.' : 'Další změna tento měsíc spálí týden: 7 dní vedení na prioritách nepracuje.',
    burnUntil: cur?.burnUntil && cur.burnUntil > state.date ? cur.burnUntil : undefined,
  };
}

/** Majitel nastaví priority měsíce (2–3, od 3. úrovně až 4). */
export function setMonthPriorities(prev: GameState, ids: string[], opts: { keep?: boolean } = {}): ActionResult {
  if (prev.owner.ousted || prev.gameOver) return { state: prev, ok: false, message: 'Odvolaný majitel priority neurčuje.' };
  const uniq = [...new Set(ids)].filter((id): id is PriorityId => PDEF.has(id as PriorityId));
  const max = agendaSlots(prev);
  if (uniq.length < MIN_PRIORITIES) return { state: prev, ok: false, message: `Vyberte aspoň ${MIN_PRIORITIES} oblasti.` };
  if (uniq.length > max) return { state: prev, ok: false, message: `Najednou zvládnete nejvýš ${max} priority.` };
  const state = structuredClone(prev);
  const ag = agendaOf(state);
  const same = ag.by === 'majitel' && ag.priorities?.length === uniq.length && uniq.every((x) => ag.priorities!.includes(x));
  if (opts.keep !== undefined) ag.keep = opts.keep;
  if (same) {
    if (opts.keep === undefined || opts.keep === !!prev.agenda?.keep) return { state: prev, ok: false, message: 'Priority se nezměnily.' };
    return { state, ok: true, message: ag.keep ? 'Priority platí i pro další měsíce.' : 'Příští měsíc priority navrhne vedení, vy je jen potvrdíte nebo upravíte.' };
  }
  let burned = '';
  if (ag.by === 'majitel') {
    ag.changes = (ag.changes ?? 0) + 1;
    if (ag.changes >= 2) {
      ag.burnUntil = addDays(state.date, 7);
      burned = ' Vedení přestavuje plán: 7 dní se na prioritách nepracuje.';
      ag.log = [...(ag.log ?? []), { slot: 0, actionId: 'nic', result: `Změna priorit uprostřed měsíce: týden bez práce vedení (do ${ag.burnUntil}).`, date: state.date }];
    }
  } else ag.changes = 0;
  ag.priorities = uniq;
  ag.by = 'majitel';
  return { state, ok: true, message: `Priority na ${monthLabel(ag.month!)}: ${uniq.map(priorityTitle).join(', ')}. Vedení se jim bude věnovat každý týden.${burned}` };
}

/** Přednostní cíl lovu pro skautskou prioritu (karta lovu). Bez ceny. */
export function focusHuntTarget(prev: GameState, id: string | undefined): ActionResult {
  const state = structuredClone(prev);
  const ag = agendaOf(state);
  if (!id || ag.focus === id) {
    delete ag.focus;
    return { state, ok: true, message: 'Skauti jedou podle vlastního výběru.' };
  }
  const t = huntTargets(prev).find((x) => x.id === id || x.playerId === id);
  if (!t) return { state: prev, ok: false, message: 'Hráč není mezi cíli lovu.' };
  ag.focus = t.id;
  const on = monthPriorities(state).priorities.includes('prestupy');
  return { state, ok: true, message: `${t.name} je teď první na seznamu skautů.${on ? '' : ' Skauti vyjedou, až bude mezi prioritami „Skauting a přestupy“.'}` };
}

// ---------- provádění akcí ----------

function applyAction(state: GameState, id: AgendaIcon, target: string | undefined, power: number): { ok: boolean; text: string } {
  const club = state.clubs[state.owner.clubId];
  switch (id) {
    case 'trener':
      return meetCharacterMut(state, 'trener', target ?? 'podpora');
    case 'trenink': {
      const b = moraleAvg(state);
      for (const p of squadOf(state, club.id)) p.morale = clamp(p.morale + 2 * power, 0, 100);
      const ch = characters(state).find((c) => c.role === 'kapitan');
      if (ch?.playerId) {
        state.characters ??= { log: {}, rel: {}, used: {} };
        state.characters.rel[`kapitan:${ch.playerId}`] = clamp(ch.relation + 3, -100, 100);
      }
      const enforced = enforceTraining(state);
      return { ok: true, text: `Návštěva tréninku: morálka týmu ${Math.round(b)} → ${Math.round(moraleAvg(state))}${ch ? `, vztah s kapitánem +3` : ''}.${enforced ? ` ${enforced}` : ''}` };
    }
    case 'sponzor': {
      const slot = (target as SponsorSlot) || 'generalni';
      const b = Math.round(sponsorRelation(state, slot));
      changeSponsorRelation(state, slot, diminish(b, Math.round(6 * power)));
      let extra = '';
      const ag = state.agenda ?? agendaOf(state);
      const offers = (state.sponsorOffers ?? []).filter((o) => o.expires > state.date && !(ag.boosted ?? []).includes(o.id));
      if (offers.length && power >= 1) {
        const factor = hasUnlock(state, 'sponzori') ? 1.12 : 1.05;
        const best = [...offers].sort((a, b2) => b2.annual - a.annual)[0];
        best.annual = Math.round((best.annual * factor) / 50_000) * 50_000;
        ag.boosted = [...(ag.boosted ?? []), best.id].slice(-30);
        extra = ` Obchodní kontakty zlepšily nabídku ${best.name} (${SLOT_LABEL[best.slot]}) o ${Math.round((factor - 1) * 100)} %.`;
      }
      return { ok: true, text: `Oběd se sponzorem (${SLOT_LABEL[slot]}): vztah ${b} → ${Math.round(sponsorRelation(state, slot))}.${extra}` };
    }
    case 'skauting':
      return target ? scoutTripMut(state, target) : { ok: false, text: 'Vyberte hráče.' };
    case 'radnice': {
      const c = cityOf(state);
      const b = Math.round(c.relation);
      changeCity(state, diminish(b, Math.round((c.stance === 'skeptik' ? 3 : 5) * power)));
      const permit = cityPermit(state);
      return { ok: true, text: `Jednání na radnici: vztah s městem ${b} → ${Math.round(cityOf(state).relation)}. ${permit ? 'Povolení velké stavby zatím ne.' : 'Město velkou stavbu povolí.'}` };
    }
    case 'kotel': {
      if (power < 1) {
        const b = Math.round(ultrasOf(state).relation);
        changeUltras(state, diminish(b, 3));
        return { ok: true, text: `Vedoucí fanouškovské komunikace se sešel s kotlem: vztah ${b} → ${Math.round(ultrasOf(state).relation)}.` };
      }
      return meetCharacterMut(state, 'kotel', 'dialog');
    }
    case 'media': {
      const b = Math.round(state.owner.media);
      const tone = target ?? 'klid';
      state.owner.media = clamp(state.owner.media + diminish(b, Math.round((tone === 'klid' ? 5 : 3) * power)), 0, 100);
      let extra = '';
      if (tone === 'ambice' && power >= 1) {
        club.fanMood = clamp(club.fanMood + 3, 0, 100);
        state.owner.trust.trener = clamp(state.owner.trust.trener - 2, 0, 100);
        extra = ' Fanoušci nadšení (+3), trenér cítí tlak (−2).';
      }
      if (tone === 'trener' && power >= 1) {
        state.owner.trust.trener = clamp(state.owner.trust.trener + 3, 0, 100);
        extra = ' Trenér ocenil veřejnou podporu (důvěra +3).';
      }
      return { ok: true, text: `Rozhovor pro média: pověst u médií ${b} → ${Math.round(state.owner.media)}.${extra}` };
    }
    case 'prestup':
      return target ? personalPitchMut(state, target) : { ok: false, text: 'Vyberte hráče.' };
    case 'postava': {
      if (!target) return { ok: false, text: 'Vyberte postavu.' };
      const [cid, topic] = target.split('|');
      return meetCharacterMut(state, cid, topic);
    }
    case 'projekt': {
      const p = activeProjects(state).find((x) => x.id === target);
      return p ? { ok: true, text: `Vedení posunulo projekt ${p.title}.` } : { ok: false, text: 'Projekt neběží.' };
    }
  }
}

/** Konkrétní akce priority v daném týdnu (cíl z dat). undefined = není co dělat. */
export function planForPriority(state: GameState, id: PriorityId, weekIdx: number): { action: AgendaIcon; target?: string; note?: string } | undefined {
  const ag = state.agenda;
  switch (id) {
    case 'kabina': {
      const trust = state.owner.trust.trener;
      if (!characterById(state, 'trener')) return { action: 'trenink' };
      if (trust < 55 || weekIdx % 2 === 0) return { action: 'trener', target: trust < 70 ? 'podpora' : 'kabina' };
      return { action: 'trenink' };
    }
    case 'sponzori': {
      const list = contracts(state);
      if (!list.length) return undefined;
      const scored = list
        .map((c) => ({ slot: c.slot, score: (c.untilSeason <= state.season ? -100 : 0) + sponsorRelation(state, c.slot) + (c.slot === 'generalni' ? -8 : 0) + (ag?.lastSponsor === c.slot && list.length > 1 ? 25 : 0) }))
        .sort((a, b) => a.score - b.score);
      return { action: 'sponzor', target: scored[0].slot };
    }
    case 'prestupy': {
      const win = transferWindow(state.date);
      const cooled = huntOf(state).cooled ?? {};
      if (win) {
        const r = huntTargets(state).find((t) => !t.foreign && t.rival && t.rival.strength >= 40 && !(cooled[t.playerId] && cooled[t.playerId] >= state.date));
        if (r && weekIdx % 2 === 1) return { action: 'prestup', target: r.playerId };
      }
      const pool = huntPool(state);
      const pick = pool.find((t) => t.id === ag?.focus) ?? [...pool].sort((a, b) => a.trips - b.trips || Number(b.fitsPlan) - Number(a.fitsPlan) || b.hi - a.hi)[0];
      if (pick) return { action: 'skauting', target: pick.id };
      if (characterById(state, 'reditel')) return { action: 'postava', target: 'reditel|trh', note: 'Lov nemá cíle – ředitel prošel trh.' };
      return undefined;
    }
    case 'radnice': {
      const running = (state.bigProjects ?? []).find((p) => p.end > state.date && !state.characters?.used?.[`povoleni:${p.id}`]);
      if (running && cityOf(state).relation > 40 && characterById(state, 'starosta')) return { action: 'postava', target: 'starosta|stavba' };
      return { action: 'radnice' };
    }
    case 'fanousci':
      return { action: 'kotel' };
    case 'media': {
      const tone = state.owner.trust.trener < 45 ? 'trener' : state.clubs[state.owner.clubId].fanMood < 45 && weekIdx % 2 === 1 ? 'ambice' : 'klid';
      return { action: 'media', target: tone };
    }
    case 'projekty': {
      const open = openProjectStep(state);
      return open ? { action: 'projekt', target: open.p.id } : undefined;
    }
    case 'mladez': {
      const coach = coachOf(state, state.owner.clubId);
      if (coach && !coach.youthFocus && characterById(state, 'trener')) return { action: 'trener', target: 'mladi' };
      return { action: 'trenink' };
    }
  }
}

// ---------- strop vztahů z priorit (kalibrace) ----------

/** Měkký strop: nad něj vztahy a důvěru posunou jen výsledky a sliby, ne priority ani schůzky. */
export const PRIORITY_CEILING = 78;

/** Kolik z navrhovaného zisku priorita skutečně dá: zisk se s rostoucí hodnotou zmenšuje a končí na stropu. */
export function softGain(before: number, gain: number, ceiling = PRIORITY_CEILING): number {
  if (gain <= 0) return gain;
  if (before >= ceiling) return 0;
  const room = ceiling - before;
  const factor = Math.max(0.25, Math.min(1, room / (ceiling - 30)));
  return Math.min(room, gain * factor);
}

interface RelSnap { trener: number; reditel: number; media: number; city: number; kotel: number; sponsors: Record<string, number> }

function relSnap(state: GameState): RelSnap {
  return {
    trener: state.owner.trust.trener,
    reditel: state.owner.trust.reditel,
    media: state.owner.media,
    city: cityOf(state).relation,
    kotel: ultrasOf(state).relation,
    sponsors: { ...(state.sponsorRelations ?? {}) },
  };
}

/** Po akci priority/schůzce srazí zisky vztahů podle softGain. Vrací poznámku, když strop něco ubral. */
function capRelations(state: GameState, b: RelSnap): string {
  const notes: string[] = [];
  const fix = (label: string, before: number, after: number, set: (v: number) => void) => {
    if (after <= before) return;
    const allowed = Math.round((before + softGain(before, after - before)) * 10) / 10;
    if (allowed < after - 0.05) {
      set(allowed);
      notes.push(`${label} ${Math.round(before)} → ${Math.round(allowed)}`);
    }
  };
  fix('důvěra trenéra', b.trener, state.owner.trust.trener, (v) => (state.owner.trust.trener = v));
  fix('důvěra ředitele', b.reditel, state.owner.trust.reditel, (v) => (state.owner.trust.reditel = v));
  fix('pověst u médií', b.media, state.owner.media, (v) => (state.owner.media = v));
  fix('vztah s městem', b.city, cityOf(state).relation, (v) => changeCity(state, v - cityOf(state).relation));
  fix('vztah s kotlem', b.kotel, ultrasOf(state).relation, (v) => changeUltras(state, v - ultrasOf(state).relation));
  for (const [slot, after] of Object.entries(state.sponsorRelations ?? {})) {
    fix(`vztah se sponzorem (${SLOT_LABEL[slot as SponsorSlot] ?? slot})`, b.sponsors[slot] ?? 50, after, (v) => changeSponsorRelation(state, slot as SponsorSlot, v - sponsorRelation(state, slot as SponsorSlot)));
  }
  return notes.length ? ` Skutečný posun: ${notes.join(', ')} (nad ~${PRIORITY_CEILING} pomohou už jen výsledky).` : '';
}

/** Provede jednu priority (mutuje stav). Vrací záznam akce. */
function runPriority(state: GameState, ag: AgendaState, id: PriorityId, weekIdx: number, half: boolean): AgendaUse | undefined {
  const plan = planForPriority(state, id, weekIdx);
  if (!plan) return { slot: 0, actionId: 'nic', priority: id, date: state.date, routine: half, result: `${priorityTitle(id)}: tento týden nebylo co dělat.` };
  const power = half && (plan.action === 'kotel' || plan.action === 'media' || plan.action === 'sponzor' || plan.action === 'radnice') ? 0.5 : 1;
  const before = relSnap(state);
  const r = applyAction(state, plan.action, plan.target, power);
  if (!r.ok) return { slot: 0, actionId: 'nic', priority: id, date: state.date, routine: half, result: `${priorityTitle(id)}: ${r.text}` };
  r.text += capRelations(state, before);
  if (plan.action === 'sponzor') ag.lastSponsor = plan.target;
  const moved = projectAgendaProgress(state, plan.action, plan.target);
  let text = `${plan.note ? `${plan.note} ` : ''}${r.text}`;
  if (moved.length) text += ` Projekt: ${moved.join(', ')} (krok splněn).`;
  if (!half) addOwnerXp(state, XP.agenda);
  return { slot: 0, actionId: plan.action, target: plan.target, priority: id, date: state.date, routine: half, result: text };
}

/** Den v týdnu 1–7 (pondělí = 1, neděle = 7). */
const dow7 = (date: string) => dayOfWeek(date) || 7;

/** Denní krok priorit: každá priorita jednou týdně, i-tá od i-tého dne v týdnu. */
export function runPrioritiesToday(state: GameState): AgendaUse[] {
  if (state.owner.ousted || state.gameOver) return [];
  const ag = agendaOf(state);
  if (ag.burnUntil && state.date < ag.burnUntil) return [];
  const week = weekStartOf(state.date);
  const weekIdx = Math.floor((Number(state.date.slice(8, 10)) - 1) / 7);
  const ran = (ag.ran ??= {});
  const prios = (ag.priorities ?? []).slice(0, agendaSlots(state));
  const half = ag.by !== 'majitel';
  const done: AgendaUse[] = [];
  prios.forEach((id, i) => {
    if (ran[id] === week || dow7(state.date) < Math.min(i + 1, 5)) return;
    if (Object.values(ran).filter((w) => w === week).length >= agendaSlots(state)) return;
    ran[id] = week;
    // Vedení samo: poloviční účinek = každá priorita jen každý druhý týden (střídavě).
    if (half && (weekIdx + i) % 2 === 1) return;
    const u = runPriority(state, ag, id, weekIdx, half);
    if (u) {
      ag.log = [...(ag.log ?? []), u];
      done.push(u);
    }
  });
  return done;
}

// ---------- osobní schůzka s postavou (kontakty) ----------

export interface MeetingView {
  free: boolean;
  /** Od kdy je další schůzka volná (pondělí). */
  nextFree?: string;
  note: string;
}

/** Osobní schůzka s postavou: jedna týdně zdarma, mimo priority. */
export function meetingView(state: GameState): MeetingView {
  if (state.owner.ousted || state.gameOver) return { free: false, note: 'Odvolaný majitel schůzky nedomlouvá.' };
  const week = weekStartOf(state.date);
  const used = state.agenda?.meetWeek === week;
  return used
    ? { free: false, nextFree: addDays(week, 7), note: 'Osobní schůzku jste tento týden už měli. Další domluvíte od pondělí.' }
    : { free: true, note: 'Jedna osobní schůzka týdně je zdarma a nemění priority měsíce.' };
}

export function personalMeeting(prev: GameState, characterId: string, topic?: string): ActionResult {
  const v = meetingView(prev);
  if (!v.free) return { state: prev, ok: false, message: v.note };
  const state = structuredClone(prev);
  const ag = agendaOf(state);
  const before = relSnap(state);
  const r = meetCharacterMut(state, characterId, topic);
  if (!r.ok) return { state: prev, ok: false, message: r.text };
  r.text += capRelations(state, before);
  ag.meetWeek = weekStartOf(state.date);
  addOwnerXp(state, XP.agenda);
  ag.log = [...(ag.log ?? []), { slot: 0, actionId: 'postava', target: `${characterId}|${topic ?? ''}`, result: `Osobní schůzka: ${r.text}`, date: state.date }];
  return { state, ok: true, message: r.text };
}

// ---------- A3: rutina podřízeným ----------

/** Drobná rozhodnutí, která asistenti a ředitelé vyřídí sami výchozí volbou. */
export const ROUTINE_TEMPLATES = new Set(['noc', 'regenerace', 'pyro', 'travnik', 'asistent', 'specialista', 'charita', 'vyjezd', 'navstevnost', 'zadost-volno', 'zadost-minuty', 'rozhovor', 'tiskovka', 'soustredeni', 'char-kotel', 'char-starosta']);

export interface RoutineView {
  auto: boolean;
  items: { label: string; by: string; on: boolean }[];
  /** Vyřízeno vedením tento měsíc (drobnosti + akce priorit navržených vedením). */
  handledThisWeek: number;
}

export function routineView(state: GameState): RoutineView {
  const d = delegationOf(state.clubs[state.owner.clubId]);
  const auto = !!state.agenda?.auto;
  const mp = monthPriorities(state);
  const cur = state.agenda?.month === mp.month ? state.agenda : undefined;
  return {
    auto,
    items: [
      { label: 'Drobná rozhodnutí (noční život, trávník, charita, žádosti o volno…) výchozí volbou', by: 'asistenti a ředitelé', on: auto },
      { label: 'Priority měsíce, když je nevyberete (poloviční účinek)', by: 'vedení klubu', on: mp.by === 'vedeni' },
      { label: d.director === 'vysoka' ? 'Nákupy, prodeje a smlouvy hráčů' : d.director === 'stredni' ? 'Smlouvy a doplnění kádru' : 'Jen nouzové doplnění kádru', by: 'sportovní ředitel', on: d.director !== 'nizka' },
      { label: 'Podpis sponzorů na volná místa', by: 'obchodní ředitel', on: d.commercial },
      { label: 'Schválení návrhu rozpočtu', by: 'finanční ředitel', on: d.finance },
    ],
    handledThisWeek: (cur?.routineCount ?? 0) + mp.log.filter((u) => u.routine && u.actionId !== 'nic').length,
  };
}

export function setRoutine(prev: GameState, on: boolean): ActionResult {
  const state = structuredClone(prev);
  agendaOf(state).auto = on;
  return { state, ok: true, message: on ? 'Drobnosti vyřídí vedení samo.' : 'Všechna rozhodnutí zůstávají na vás.' };
}

function autoResolveMinor(state: GameState): void {
  const ag = state.agenda;
  if (!ag?.auto) return;
  for (const e of state.events.filter((x) => x.date === state.date && ROUTINE_TEMPLATES.has(x.template) && !x.storyId)) {
    const r = resolveEvent(state, e.id, e.defaultOption, true);
    if (r.ok) {
      Object.assign(state, r.state);
      state.agenda!.routineCount = (state.agenda!.routineCount ?? 0) + 1;
    }
  }
}

// ---------- shrnutí měsíce ----------

const DELTA_LABELS: [keyof WeekSnapshot, string][] = [
  ['trener', 'Důvěra trenéra'],
  ['reditel', 'Důvěra ředitele'],
  ['morale', 'Morálka týmu'],
  ['fanMood', 'Nálada fanoušků'],
  ['kotel', 'Vztah s kotlem'],
  ['mesto', 'Vztah s městem'],
  ['sponzor', 'Vztah s hlavním sponzorem'],
  ['media', 'Pověst u médií'],
];

const plural = (n: number, one: string, few: string, many: string) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);

function buildMonthSummary(state: GameState, ag: AgendaState, endDate: string): MonthSummary {
  const month = ag.month!;
  const now = snapshot(state);
  const from = ag.snapshot;
  const prios = ag.priorities ?? [];
  const by = ag.by ?? 'vedeni';
  const log = ag.log ?? [];
  const lines: string[] = [];
  lines.push(`Priority: ${prios.map(priorityTitle).join(', ') || 'žádné'} (${by === 'majitel' ? 'vybrali jste' : 'vybralo vedení, poloviční účinek'}).`);
  const matches = ownMatchesSince(state, addDays(`${month}-01`, -1)).filter((m) => m.date <= endDate);
  if (matches.length) {
    const w = matches.filter((m) => m.outcome === 'V').length;
    const d = matches.filter((m) => m.outcome === 'R').length;
    const l = matches.length - w - d;
    lines.push(`Zápasy: ${w} ${plural(w, 'výhra', 'výhry', 'výher')}, ${d} ${plural(d, 'remíza', 'remízy', 'remíz')}, ${l} ${plural(l, 'prohra', 'prohry', 'proher')}.`);
  }
  for (const id of prios) {
    const items = log.filter((u) => u.priority === id && u.actionId !== 'nic');
    if (!items.length) continue;
    lines.push(`${priorityTitle(id)} (${items.length}×): ${items[items.length - 1].result ?? ''}`);
  }
  const meets = log.filter((u) => u.actionId === 'postava' && !u.priority).length;
  if (meets) lines.push(`Osobní schůzky: ${meets}.`);
  if (log.some((u) => u.actionId === 'nic' && !u.priority)) lines.push('Změna priorit uprostřed měsíce stála týden práce vedení.');
  const rc = ag.routineCount ?? 0;
  if (rc) lines.push(`Vedení vyřídilo ${rc} ${plural(rc, 'drobnost', 'drobnosti', 'drobností')} za vás.`);
  const deltas: { label: string; value: number }[] = [];
  if (from) {
    for (const [k, label] of DELTA_LABELS) {
      const v = Math.round((now[k] as number) - (from[k] as number));
      if (v !== 0) deltas.push({ label, value: v });
    }
    const money = now.balance - from.balance;
    if (Math.abs(money) >= 10_000) deltas.push({ label: 'Peníze klubu (Kč)', value: Math.round(money / 10_000) * 10_000 });
    if (from.position && now.position && from.position !== now.position) deltas.push({ label: 'Pozice v tabulce', value: from.position - now.position });
  }
  const label = monthLabel(month);
  return { month, title: `Konec měsíce: ${label.charAt(0).toUpperCase()}${label.slice(1)}`, lines, deltas, priorities: prios, by };
}

/** Výkon klubu proti očekávání (−32…+32): pozice proti cíli sezóny a forma posledních zápasů. */
export function performanceVsExpectation(state: GameState): number {
  let perf = 0;
  const own = ownPosition(state);
  if (own && own.played >= 4) perf += clamp((goalTarget(state.owner.seasonGoal, own.comp) - own.position) * 3, -20, 20);
  const recent = ownMatchesSince(state, addDays(state.date, -45)).slice(-5);
  if (recent.length >= 2) {
    const ppg = recent.reduce((a, m) => a + (m.outcome === 'V' ? 3 : m.outcome === 'R' ? 1 : 0), 0) / recent.length;
    perf += clamp((ppg - 1.4) * 10, -12, 12);
  }
  return perf;
}

/** „Zasloužená“ úroveň vztahů podle výsledků (základ 55–57 ± výkon proti očekávání). */
export function deservedRelations(state: GameState): { trener: number; reditel: number; kotel: number; mesto: number; sponzor: number } {
  const perf = performanceVsExpectation(state);
  const fan = state.clubs[state.owner.clubId]?.fanMood ?? 50;
  return {
    trener: clamp(57 + perf, 25, 92),
    reditel: clamp(57 + perf * 0.7, 30, 88),
    kotel: clamp(55 + perf * 0.6 + (fan - 50) * 0.2, 20, 90),
    mesto: clamp(55 + perf * 0.3, 30, 85),
    sponzor: clamp(57 + perf * 0.4, 30, 88),
  };
}

/** Podíl rozdílu k zasloužené úrovni, o který se vztahy každý měsíc vrátí. */
export const MONTHLY_REVERSION = 0.12;

/** 1. den měsíce: důvěra a vztahy se mírně vrací k úrovni, kterou si klub výsledky zaslouží. */
export function monthlyRelationReversion(state: GameState): void {
  if (state.gameOver || state.owner.ousted) return;
  const d = deservedRelations(state);
  const k = MONTHLY_REVERSION;
  const toward = (cur: number, target: number) => clamp(cur + (target - cur) * k, 0, 100);
  state.owner.trust.trener = toward(state.owner.trust.trener, d.trener);
  state.owner.trust.reditel = toward(state.owner.trust.reditel, d.reditel);
  const u = (state.ultras ??= ultrasOf(state));
  u.relation = toward(u.relation, d.kotel);
  const c = (state.city ??= cityOf(state));
  c.relation = toward(c.relation, d.mesto);
  if (state.sponsorRelations) {
    const rel = { ...state.sponsorRelations };
    for (const k2 of Object.keys(rel)) rel[k2 as SponsorSlot] = toward(rel[k2 as SponsorSlot]!, d.sponzor);
    state.sponsorRelations = rel;
  }
}

function rollMonth(state: GameState): void {
  const ag = state.agenda!;
  monthlyRelationReversion(state);
  const end = addDays(`${monthOf(state.date)}-01`, -1);
  const summary = buildMonthSummary(state, ag, end);
  ag.months = [{ month: ag.month!, summary }, ...(ag.months ?? [])].slice(0, 6);
  delete ag.burnUntil;
  freshMonth(state, ag);
}

/** Shrnutí měsíce: rozpracovaný aktuální, nebo uzavřený podle YYYY-MM. Nemění stav. */
export function monthSummary(state: GameState, month?: string): MonthSummary {
  const m = month ?? monthOf(state.date);
  const past = state.agenda?.months?.find((h) => h.month === m);
  if (past) return past.summary;
  const ag = state.agenda?.month === m ? state.agenda : { month: m, priorities: monthPriorities(state).priorities, by: 'vedeni' as const, log: [] };
  return buildMonthSummary(state, ag, state.date);
}

/** Shrnutí právě uzavřeného měsíce (karta konce měsíce). */
export function lastMonthSummary(state: GameState): MonthSummary | undefined {
  return state.agenda?.months?.[0]?.summary;
}

/**
 * Denní háček (engine/game.ts processDay): v pondělí trénink a projekty; 1. den měsíce uzavře
 * minulý měsíc (shrnutí, nové priority); každý den provede priority, které mají ten den na řadě;
 * ve středu případný požadavek postavy; s rutinou vyřídí drobnosti.
 */
export function dailyAgenda(state: GameState, rng?: Rng): void {
  if (state.gameOver) return;
  if (dayOfWeek(state.date) === 1) {
    weeklyTraining(state, rng);
    weeklyProjects(state);
  }
  agendaOf(state);
  runPrioritiesToday(state);
  if (dayOfWeek(state.date) === 3) weeklyCharacterRequest(state);
  autoResolveMinor(state);
}
