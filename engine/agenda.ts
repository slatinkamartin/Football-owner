import { addDays, dayOfWeek, formatShortDate } from './calendar';
import { characterById, characterTopics, characters, diminish, meetCharacterMut, weeklyCharacterRequest } from './characters';
import { resolveEvent } from './events';
import { ownMatchesSince } from './facts';
import { changeSponsorRelation, sponsorRelation } from './finplus';
import { huntTargets, personalPitchMut, scoutTripMut } from './hunt';
import { addOwnerXp, hasUnlock, XP } from './ownerlevel';
import { delegationOf } from './people';
import { squadOf } from './players';
import { activeProjects, projectAgendaProgress, weeklyProjects } from './projects';
import type { Rng } from './rng';
import { SLOT_LABEL, contracts } from './sponsors';
import type { ActionResult } from './staff';
import { computeTable } from './standings';
import { changeCity, changeUltras, cityOf, cityPermit, ultrasOf } from './surroundings';
import { enforceTraining, weeklyTraining } from './training';
import type { GameState, SponsorSlot } from './types';
import { clamp, competitionOf } from './world';

/**
 * V1 (A1, A3, A10): Týdenní agenda majitele. Každý týden (pondělí–neděle) má majitel 3 akce
 * (4 od vyšší úrovně pověsti). Každá akce se provede hned a má viditelný dopad na data.
 * Nevyužité akce propadnou; s rutinou podřízeným je doplní vedení jen rutinními kroky (poloviční účinek)
 * a asistenti vyřizují drobná rozhodnutí sami. Na konci týdne vzniká shrnutí (karta konce týdne).
 */

export type AgendaIcon = 'trener' | 'trenink' | 'sponzor' | 'skauting' | 'radnice' | 'kotel' | 'media' | 'prestup' | 'postava' | 'projekt';

export interface AgendaActionDef {
  id: AgendaIcon;
  title: string;
  icon: AgendaIcon;
  detail: string;
  effectHint: string;
}

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

const DEF = new Map(AGENDA_ACTIONS.map((a) => [a.id, a]));

export interface AgendaUse {
  slot: number;
  actionId: string;
  target?: string;
  result?: string;
  date?: string;
  /** Doplněno rutinou vedení. */
  routine?: boolean;
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

export interface WeekSummary {
  week: string;
  title: string;
  lines: string[];
  deltas: { label: string; value: number }[];
}

export interface AgendaState {
  /** Pondělí aktuálního týdne. */
  week: string;
  used: AgendaUse[];
  snapshot?: WeekSnapshot;
  /** A3: rutinu (drobnosti, nevyužité akce) vyřizuje vedení samo. */
  auto?: boolean;
  /** Sponzorské nabídky už vylepšené obědem (každá jen jednou). */
  boosted?: string[];
  /** Kolik drobností vedení vyřídilo tento týden. */
  routineCount?: number;
  /** Uzavřené týdny (nejnovější první, nejvýš 8). */
  history: { week: string; used: AgendaUse[]; summary: WeekSummary }[];
}

export interface AgendaOption {
  id: string;
  title: string;
  icon: AgendaIcon;
  detail: string;
  targets?: { id: string; label: string }[];
  effectHint: string;
  disabledReason?: string;
}

export interface WeekAgenda {
  week: string;
  slots: number;
  used: AgendaUse[];
  options: AgendaOption[];
}

/** Pondělí týdne, do kterého patří datum. */
export function weekStartOf(date: string): string {
  const d = dayOfWeek(date);
  return addDays(date, d === 0 ? -6 : 1 - d);
}

export function agendaSlots(state: GameState): number {
  if (state.owner.ousted || state.gameOver) return 0;
  return hasUnlock(state, 'slot4') ? 4 : 3;
}

function currentUsed(state: GameState): AgendaUse[] {
  const a = state.agenda;
  return a && a.week === weekStartOf(state.date) ? a.used : [];
}

function sponsorTargets(state: GameState): { id: string; label: string }[] {
  const list = contracts(state).map((c) => ({ id: c.slot, label: `${c.name} (${SLOT_LABEL[c.slot]}, vztah ${Math.round(sponsorRelation(state, c.slot))})` }));
  return list.sort((a, b) => (a.id === 'generalni' ? -1 : b.id === 'generalni' ? 1 : 0));
}

function targetsFor(state: GameState, id: AgendaIcon): { id: string; label: string }[] | undefined {
  switch (id) {
    case 'trener':
      return characterTopics(state, 'trener').map((t) => ({ id: t.id, label: t.label }));
    case 'sponzor':
      return sponsorTargets(state);
    case 'skauting':
      return huntTargets(state)
        .filter((t) => t.trips < 3 && (!t.foreign || hasUnlock(state, 'zahranici')))
        .map((t) => ({ id: t.id, label: `${t.name} (${t.clubName}, odhad ${t.lo}–${t.hi})` }));
    case 'media':
      return [
        { id: 'ambice', label: 'Ambiciózní tón (fanoušci +3, trenér −2)' },
        { id: 'klid', label: 'Klidný tón (média +2 navíc)' },
        { id: 'trener', label: 'Podpořit trenéra (důvěra trenéra +3)' },
      ];
    case 'prestup':
      return huntTargets(state)
        .filter((t) => !t.foreign)
        .map((t) => ({ id: t.playerId, label: `${t.name} (${t.clubName})` }));
    case 'postava':
      return characters(state).flatMap((c) =>
        characterTopics(state, c.id)
          .filter((t) => !t.disabledReason)
          .map((t) => ({ id: `${c.id}|${t.id}`, label: `${c.name} – ${t.label}` })),
      );
    case 'projekt':
      return activeProjects(state).map((p) => ({ id: p.id, label: p.title }));
    default:
      return undefined;
  }
}

/** Agenda tohoto týdne: sloty, provedené akce a nabídka akcí. Nemění stav. */
export function weekAgenda(state: GameState): WeekAgenda {
  const used = currentUsed(state);
  const slots = agendaSlots(state);
  const full = used.filter((u) => !u.routine).length >= slots;
  const options: AgendaOption[] = AGENDA_ACTIONS.map((a) => {
    const targets = targetsFor(state, a.id);
    let disabledReason: string | undefined;
    if (state.owner.ousted) disabledReason = 'Odvolaný majitel nemá agendu.';
    else if (full) disabledReason = 'Akce na tento týden jsou vyčerpané.';
    else if (targets && !targets.length) {
      disabledReason =
        a.id === 'skauting' || a.id === 'prestup' ? 'Nemáte žádné cíle lovu (přidejte sledované hráče).'
        : a.id === 'projekt' ? 'Nemáte žádný běžící projekt.'
        : a.id === 'sponzor' ? 'Klub nemá sponzory.'
        : 'Teď není s kým jednat.';
    } else if (a.id === 'trener' && !characterById(state, 'trener')) disabledReason = 'Klub nemá trenéra.';
    else if (!targets && used.some((u) => u.actionId === a.id)) disabledReason = 'Tuto akci jste tento týden už udělali.';
    const free = targets?.filter((t) => !used.some((u) => u.actionId === a.id && u.target === t.id));
    if (!disabledReason && targets && free && !free.length) disabledReason = 'Tento týden už hotovo.';
    return { id: a.id, title: a.title, icon: a.icon, detail: a.detail, targets: free ?? targets, effectHint: a.effectHint, disabledReason };
  });
  return { week: weekStartOf(state.date), slots, used, options };
}

export function agendaOf(state: GameState): AgendaState {
  const week = weekStartOf(state.date);
  if (!state.agenda) state.agenda = { week, used: [], history: [], snapshot: snapshot(state) };
  state.agenda.history ??= [];
  if (state.agenda.week !== week) rollWeek(state);
  return state.agenda;
}

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

/** Provede akci agendy (spotřebuje slot) a vrátí výsledek textem. */
export function planAgendaAction(prev: GameState, actionId: string, target?: string): ActionResult {
  const def = DEF.get(actionId as AgendaIcon);
  if (!def) return { state: prev, ok: false, message: 'Neznámá akce.' };
  const opt = weekAgenda(prev).options.find((o) => o.id === actionId)!;
  if (opt.disabledReason) return { state: prev, ok: false, message: opt.disabledReason };
  if (opt.targets && (!target || !opt.targets.some((t) => t.id === target))) {
    if (opt.targets.length && !target) target = opt.targets[0].id;
    else if (!opt.targets.some((t) => t.id === target)) return { state: prev, ok: false, message: 'Tento cíl teď nejde vybrat.' };
  }
  const state = structuredClone(prev);
  const ag = agendaOf(state);
  const r = applyAction(state, def.id, target, 1);
  if (!r.ok) return { state: prev, ok: false, message: r.text };
  const moved = def.id === 'projekt' ? projectAgendaProgress(state, 'projekt', target) : projectAgendaProgress(state, def.id, target);
  let text = r.text;
  if (moved.length) text += ` Projekt: ${moved.join(', ')} (krok splněn).`;
  addOwnerXp(state, XP.agenda);
  ag.used = [...ag.used, { slot: ag.used.filter((u) => !u.routine).length + 1, actionId: def.id, target, result: text, date: state.date }];
  return { state, ok: true, message: text };
}

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
      return { ok: true, text: `Byli jste na tréninku: morálka týmu ${Math.round(b)} → ${Math.round(moraleAvg(state))}${ch ? `, vztah s kapitánem +3` : ''}.${enforced ? ` ${enforced}` : ''}` };
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
      return p ? { ok: true, text: `Osobně jste posunuli projekt ${p.title}.` } : { ok: false, text: 'Projekt neběží.' };
    }
  }
}

// ---------- A3: rutina podřízeným ----------

/** Drobná rozhodnutí, která asistenti a ředitelé vyřídí sami výchozí volbou. */
export const ROUTINE_TEMPLATES = new Set(['noc', 'regenerace', 'pyro', 'travnik', 'asistent', 'specialista', 'charita', 'vyjezd', 'navstevnost', 'zadost-volno', 'zadost-minuty', 'rozhovor', 'tiskovka', 'soustredeni', 'char-kotel', 'char-starosta']);

export interface RoutineView {
  auto: boolean;
  items: { label: string; by: string; on: boolean }[];
  /** Vyřízeno vedením tento týden (drobnosti + doplněné akce). */
  handledThisWeek: number;
}

export function routineView(state: GameState): RoutineView {
  const d = delegationOf(state.clubs[state.owner.clubId]);
  const auto = !!state.agenda?.auto;
  const cur = state.agenda && state.agenda.week === weekStartOf(state.date) ? state.agenda : undefined;
  return {
    auto,
    items: [
      { label: 'Drobná rozhodnutí (noční život, trávník, charita, žádosti o volno…) výchozí volbou', by: 'asistenti a ředitelé', on: auto },
      { label: 'Nevyužité akce agendy doplnit rutinou (poloviční účinek: kotel, média, sponzor)', by: 'vedení klubu', on: auto },
      { label: d.director === 'vysoka' ? 'Nákupy, prodeje a smlouvy hráčů' : d.director === 'stredni' ? 'Smlouvy a doplnění kádru' : 'Jen nouzové doplnění kádru', by: 'sportovní ředitel', on: d.director !== 'nizka' },
      { label: 'Podpis sponzorů na volná místa', by: 'obchodní ředitel', on: d.commercial },
      { label: 'Schválení návrhu rozpočtu', by: 'finanční ředitel', on: d.finance },
    ],
    handledThisWeek: (cur?.routineCount ?? 0) + (cur?.used.filter((u) => u.routine).length ?? 0),
  };
}

export function setRoutine(prev: GameState, on: boolean): ActionResult {
  const state = structuredClone(prev);
  agendaOf(state).auto = on;
  return { state, ok: true, message: on ? 'Drobnosti a nevyužité akce vyřídí vedení samo.' : 'Všechna rozhodnutí zůstávají na vás.' };
}

function routineFill(state: GameState, ag: AgendaState): void {
  const free = agendaSlots(state) - ag.used.filter((u) => !u.routine).length;
  for (let i = 0; i < Math.min(2, free); i++) {
    const done = new Set(ag.used.map((u) => u.actionId));
    const pick: AgendaIcon | undefined = ultrasOf(state).relation < 60 && !done.has('kotel') ? 'kotel' : !done.has('media') ? 'media' : contracts(state).length && !done.has('sponzor') ? 'sponzor' : undefined;
    if (!pick) break;
    const r = applyAction(state, pick, pick === 'sponzor' ? 'generalni' : pick === 'media' ? 'klid' : undefined, 0.5);
    if (r.ok) ag.used.push({ slot: 0, actionId: pick, target: undefined, result: `Rutina vedení: ${r.text}`, date: state.date, routine: true });
  }
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

// ---------- A10: shrnutí týdne ----------

const DELTA_LABELS: [keyof WeekSnapshot, string, number][] = [
  ['trener', 'Důvěra trenéra', 1],
  ['reditel', 'Důvěra ředitele', 1],
  ['morale', 'Morálka týmu', 1],
  ['fanMood', 'Nálada fanoušků', 1],
  ['kotel', 'Vztah s kotlem', 1],
  ['mesto', 'Vztah s městem', 1],
  ['sponzor', 'Vztah s hlavním sponzorem', 1],
  ['media', 'Pověst u médií', 1],
];

function buildSummary(state: GameState, week: string, used: AgendaUse[], from: WeekSnapshot | undefined, routineCount = 0): WeekSummary {
  const now = snapshot(state);
  const end = addDays(week, 6);
  const lines: string[] = [];
  for (const u of used) if (u.result) lines.push(u.result);
  const matches = ownMatchesSince(state, addDays(week, -1)).filter((m) => m.date <= end);
  for (const m of matches) lines.push(`${m.outcome === 'V' ? 'Výhra' : m.outcome === 'P' ? 'Prohra' : 'Remíza'}: ${m.scoreline} (${m.competition})`);
  const tl = state.training?.lastWeek;
  if (tl && tl.date >= week && tl.date <= addDays(end, 1)) for (const l of tl.lines) lines.push(`Trénink: ${l}`);
  if (routineCount) lines.push(`Vedení vyřídilo ${routineCount} ${routineCount === 1 ? 'drobnost' : routineCount < 5 ? 'drobnosti' : 'drobností'} za vás.`);
  if (!used.length) lines.push('Agenda zůstala nevyužitá.');
  const deltas: { label: string; value: number }[] = [];
  if (from) {
    for (const [k, label] of DELTA_LABELS) {
      const v = Math.round(((now[k] as number) - (from[k] as number)) * 10) / 10;
      if (Math.round(v) !== 0) deltas.push({ label, value: Math.round(v) });
    }
    const money = now.balance - from.balance;
    if (Math.abs(money) >= 10_000) deltas.push({ label: 'Peníze klubu (Kč)', value: Math.round(money / 10_000) * 10_000 });
    if (from.position && now.position && from.position !== now.position) deltas.push({ label: 'Pozice v tabulce', value: from.position - now.position });
  }
  return { week, title: `Týden ${formatShortDate(week)}–${formatShortDate(end)}`, lines, deltas };
}

/** Shrnutí týdne: aktuální (rozpracovaný) týden, nebo uzavřený týden podle pondělí. */
export function weekSummary(state: GameState, weekStart?: string): WeekSummary {
  const cur = weekStartOf(state.date);
  const ws = weekStart ?? cur;
  const past = state.agenda?.history.find((h) => h.week === ws);
  if (past) return past.summary;
  const a = state.agenda && state.agenda.week === ws ? state.agenda : undefined;
  return buildSummary(state, ws, a?.used ?? [], a?.snapshot, a?.routineCount);
}

/** Shrnutí právě uzavřeného týdne (pro kartu konce týdne). */
export function lastWeekSummary(state: GameState): WeekSummary | undefined {
  return state.agenda?.history[0]?.summary;
}

function rollWeek(state: GameState): void {
  const ag = state.agenda!;
  if (ag.auto) routineFill(state, ag);
  const summary = buildSummary(state, ag.week, ag.used, ag.snapshot, ag.routineCount);
  ag.history = [{ week: ag.week, used: ag.used, summary }, ...ag.history].slice(0, 8);
  ag.week = weekStartOf(state.date);
  ag.used = [];
  ag.routineCount = 0;
  ag.snapshot = snapshot(state);
}

/**
 * Denní háček (engine/game.ts processDay): v pondělí uzavře minulý týden (rutina, shrnutí),
 * trénink a projekty; ve středu případný požadavek postavy; s rutinou vyřídí drobnosti.
 */
export function dailyAgenda(state: GameState, rng?: Rng): void {
  if (state.gameOver) return;
  const monday = dayOfWeek(state.date) === 1;
  if (monday) {
    weeklyTraining(state, rng);
    weeklyProjects(state);
  }
  agendaOf(state);
  if (dayOfWeek(state.date) === 3) weeklyCharacterRequest(state);
  autoResolveMinor(state);
}
