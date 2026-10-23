import { addDays, formatShortDate } from './calendar';
import { foreignMarket, foreignView } from './foreign';
import { agentOf, changeAgentRelation, toggleWatch, watchReport } from './market';
import { hasUnlock } from './ownerlevel';
import { playerAge, squadOf } from './players';
import { coachOf, scoutingError, type ActionResult } from './staff';
import { computeTable } from './standings';
import { askingPrice, playerName, playerValue, scouted } from './transfers';
import type { GameState, Player, Position } from './types';
import { clamp, clubLabel, competitionOf, FREE, hash01, transferWindow } from './world';

/**
 * V1 (A7): Přestupy jako lov. Seznam cílů navazuje na sledované hráče (engine/market.ts watchlist)
 * a sledované zahraniční hráče. Skautská cesta majitele (z agendy) zpřesní odhad, osobní jednání
 * zlepší vztah s agentem a srazí cenu, konkurence o hráče roste s blížícím se koncem okna.
 */

export interface HuntState {
  /** Skautské cesty za hráči (id hráče nebo zahraničního cíle). */
  trips: Record<string, { date: string; level: number; season: number }>;
  /** Plán okna: pozice, které chci, a rozpočet. */
  plan?: { positions: Position[]; budget: number; season: number };
  /** Osobní jednání: konkurence zchladla do data. */
  cooled?: Record<string, string>;
}

export interface HuntTarget {
  id: string;
  playerId: string;
  foreign: boolean;
  name: string;
  position: Position;
  age: number;
  clubName: string;
  /** Odhad hodnocení (rozpětí podle skautů). */
  lo: number;
  hi: number;
  potLo: number;
  potHi: number;
  /** Přesnost odhadu ± bodů. */
  error: number;
  price: number;
  trips: number;
  rival?: { clubId: string; name: string; strength: number };
  notes: string[];
  hot: boolean;
  fitsPlan: boolean;
}

const POS_LABEL: Record<Position, string> = { GK: 'brankář', DF: 'obránce', MF: 'záložník', FW: 'útočník' };

export function huntOf(state: GameState): HuntState {
  state.hunt ??= { trips: {} };
  state.hunt.trips ??= {};
  return state.hunt;
}

function tripLevel(state: GameState, id: string): number {
  const t = state.hunt?.trips?.[id];
  return t && t.season === state.season ? t.level : 0;
}

/** Konkurenční klub, který o hráče stojí (deterministicky podle okna); síla roste ke konci okna. */
export function rivalInterest(state: GameState, p: Player, tableIn?: ReturnType<typeof computeTable>): HuntTarget['rival'] {
  const win = transferWindow(state.date);
  const key = `${p.id}-${state.season}-${win ?? 'mimo'}`;
  if (hash01(`lov-${key}`) > 0.4 || p.clubId === state.owner.clubId) return undefined;
  const comp = competitionOf(state, state.owner.clubId);
  if (!comp) return undefined;
  const table = (tableIn ?? computeTable(comp, state)).filter((r) => r.clubId !== state.owner.clubId && r.clubId !== p.clubId);
  if (!table.length) return undefined;
  const pick = table[Math.floor(hash01(`lov-klub-${key}`) * Math.min(6, table.length))];
  let strength = 35 + hash01(`lov-sila-${key}`) * 30;
  if (win) {
    const end = win === 'leto' ? `${state.date.slice(0, 4)}-08-31` : `${state.date.slice(0, 4)}-02-14`;
    const days = Math.max(0, (Date.parse(end) - Date.parse(state.date)) / 86_400_000);
    strength += Math.max(0, 25 - days * 0.6);
  }
  const cooled = state.hunt?.cooled?.[p.id];
  if (cooled && cooled >= state.date) strength -= 30;
  return { clubId: pick.clubId, name: clubLabel(state, pick.clubId), strength: Math.round(clamp(strength, 5, 100)) };
}

/** Seznam cílů lovu: sledovaní domácí hráči a sledovaní hráči v cizině. */
export function huntTargets(state: GameState): HuntTarget[] {
  const plan = state.hunt?.plan && state.hunt.plan.season === state.season ? state.hunt.plan : undefined;
  const out: HuntTarget[] = [];
  const comp = competitionOf(state, state.owner.clubId);
  const table = comp ? computeTable(comp, state) : undefined;
  for (const w of watchReport(state)) {
    const p = w.player;
    const view = scouted(state, p);
    const lvl = tripLevel(state, p.id);
    const err = Math.max(1, Math.round(scoutingError(state) * Math.max(0.15, 1 - 0.35 * lvl)));
    const rival = rivalInterest(state, p, table);
    const notes = [...w.notes];
    if (rival) notes.push(`zájem má i ${rival.name} (${rival.strength} %)`);
    out.push({
      id: p.id,
      playerId: p.id,
      foreign: false,
      name: playerName(p),
      position: p.position,
      age: playerAge(p, state.season),
      clubName: p.clubId === FREE ? 'bez klubu' : clubLabel(state, p.clubId),
      lo: view.overall - err,
      hi: view.overall + err,
      potLo: view.potential - err,
      potHi: view.potential + Math.round(err * 1.5),
      error: err,
      price: p.clubId === FREE ? 0 : askingPrice(state, p),
      trips: lvl,
      rival,
      notes,
      hot: w.hot,
      fitsPlan: !plan || plan.positions.includes(p.position),
    });
  }
  for (const t of foreignMarket(state).targets.filter((x) => x.watching)) {
    const v = foreignView(state, t);
    out.push({
      id: t.id,
      playerId: t.player.id,
      foreign: true,
      name: playerName(t.player),
      position: t.player.position,
      age: playerAge(t.player, state.season),
      clubName: clubLabel(state, t.clubId),
      lo: v.lo,
      hi: v.hi,
      potLo: v.potLo,
      potHi: v.potHi,
      error: Math.round((v.hi - v.lo) / 2),
      price: t.fee,
      trips: tripLevel(state, t.id),
      notes: [`sledováno ${t.watched ?? 0} týd.`],
      hot: false,
      fitsPlan: !plan || plan.positions.includes(t.player.position),
    });
  }
  return out.sort((a, b) => Number(b.fitsPlan) - Number(a.fitsPlan) || Number(b.hot) - Number(a.hot) || b.hi - a.hi);
}

/** Přidat / odebrat hráče ze seznamu lovu (sdílí sledované hráče v Přestupech). */
export function toggleHunt(prev: GameState, playerId: string): ActionResult {
  return toggleWatch(prev, playerId);
}

/** Plán okna: které pozice hledám a kolik chci utratit. */
export function setHuntPlan(prev: GameState, positions: Position[], budget: number): ActionResult {
  const state = structuredClone(prev);
  huntOf(state).plan = { positions: [...new Set(positions)], budget: Math.max(0, Math.round(budget)), season: state.season };
  return { state, ok: true, message: positions.length ? `Plán okna: ${positions.map((p) => POS_LABEL[p]).join(', ')}.` : 'Plán okna je prázdný.' };
}

/** Pozice, kde je kádr nejslabší (návrh plánu okna). */
export function suggestedPositions(state: GameState): Position[] {
  const squad = squadOf(state, state.owner.clubId);
  const need: Record<Position, number> = { GK: 2, DF: 6, MF: 6, FW: 4 };
  const avg = squad.length ? squad.reduce((a, p) => a + p.overall, 0) / squad.length : 0;
  return (Object.keys(need) as Position[])
    .map((pos) => {
      const list = squad.filter((p) => p.position === pos).sort((a, b) => b.overall - a.overall);
      const top = list.slice(0, Math.ceil(need[pos] / 2));
      const q = top.length ? top.reduce((a, p) => a + p.overall, 0) / top.length : 0;
      return { pos, gap: avg - q + (need[pos] - list.length) * 3 };
    })
    .sort((a, b) => b.gap - a.gap)
    .filter((x) => x.gap > 0)
    .slice(0, 2)
    .map((x) => x.pos);
}

/**
 * Skautská cesta majitele za hráčem (z agendy). Mutuje stav, vrací výsledek textem nebo chybu.
 * Domácí hráč: odhad se zpřesní (chyba −35 % za cestu). Zahraniční: od úrovně „zahraniční kontakty“.
 */
export function scoutTripMut(state: GameState, id: string): { ok: boolean; text: string } {
  const h = huntOf(state);
  const foreignT = state.foreign?.targets.find((t) => t.id === id || t.player.id === id);
  if (foreignT) {
    if (!hasUnlock(state, 'zahranici')) return { ok: false, text: 'Na cesty do ciziny zatím nemáte kontakty (odemkne vyšší úroveň majitele).' };
    const before = foreignView(state, foreignT);
    foreignT.watched = (foreignT.watched ?? 0) + 3;
    foreignT.watching = true;
    const after = foreignView(state, foreignT);
    const prev = h.trips[foreignT.id];
    h.trips[foreignT.id] = { date: state.date, level: Math.min(3, (prev && prev.season === state.season ? prev.level : 0) + 1), season: state.season };
    return { ok: true, text: `Skautská cesta – ${playerName(foreignT.player)}: odhad ${before.lo}–${before.hi} → ${after.lo}–${after.hi}.` };
  }
  const p = state.players[id];
  if (!p || p.clubId === state.owner.clubId) return { ok: false, text: 'Hráč není mezi cíli.' };
  const lvl = tripLevel(state, id);
  if (lvl >= 3) return { ok: false, text: `${playerName(p)} už znáte do detailu.` };
  const errBefore = Math.max(1, Math.round(scoutingError(state) * Math.max(0.15, 1 - 0.35 * lvl)));
  h.trips[id] = { date: state.date, level: lvl + 1, season: state.season };
  const v = scouted(state, p);
  const errAfter = Math.max(1, Math.round(scoutingError(state) * Math.max(0.15, 1 - 0.35 * (lvl + 1))));
  if (!(state.watchlist ?? []).includes(id)) state.watchlist = [...(state.watchlist ?? []), id].slice(-20);
  const coach = coachOf(state, state.owner.clubId);
  const fit = v.overall >= Math.round(squadOf(state, state.owner.clubId).reduce((a, x) => a + x.overall, 0) / Math.max(1, squadOf(state, state.owner.clubId).length)) ? 'do sestavy by pasoval' : 'byl by spíš do rotace';
  return { ok: true, text: `Skautská cesta – ${playerName(p)} naživo: hodnocení asi ${v.overall} (přesnost ±${errBefore} → ±${errAfter}), ${fit}${coach ? ` (posudek trenéra ${coach.lastName})` : ''}.` };
}

/** Skautská cesta jako samostatná akce (spotřebuje akci agendy přes planAgendaAction). */
export function scoutTrip(prev: GameState, playerId: string): ActionResult {
  const state = structuredClone(prev);
  const r = scoutTripMut(state, playerId);
  return r.ok ? { state, ok: true, message: r.text } : { state: prev, ok: false, message: r.text };
}

/** Osobní jednání o přestupu (z agendy): agent +8, tip na slevu 10 % na 3 týdny, konkurence zchladne. */
export function personalPitchMut(state: GameState, playerId: string): { ok: boolean; text: string } {
  const p = state.players[playerId];
  if (!p || p.clubId === state.owner.clubId) return { ok: false, text: 'Hráč není mezi cíli.' };
  const agent = agentOf(state, p.id);
  changeAgentRelation(state, p.id, 8);
  const until = addDays(state.date, 21);
  state.tips = [...(state.tips ?? []).filter((t) => t.playerId !== p.id), { playerId: p.id, agentId: agent.id, until }];
  const h = huntOf(state);
  h.cooled = { ...(h.cooled ?? {}), [p.id]: until };
  for (const k of Object.keys(h.cooled)) if (h.cooled[k] < state.date) delete h.cooled[k];
  const value = playerValue(state, p);
  return { ok: true, text: `Osobní jednání – ${playerName(p)} a agent ${agent.name}: vztah s agentem +8, cena o 10 % nižší do ${formatShortDate(until)}, konkurence zchladla. Tržní hodnota asi ${Math.round(value / 100_000) / 10} mil. Kč.` };
}
