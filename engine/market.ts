import { addDays } from './calendar';
import { book } from './finance';
import { media } from './grey';
import { clubMoment, crisisDiscount } from './league';
import { squadOf } from './players';
import type { Rng } from './rng';
import type { ActionResult } from './staff';
import { contractExpiring, executeTransfer, playerName, playerValue } from './transfers';
import type { Agent, GameState, Player } from './types';
import { addNews, clamp, clubLabel, FREE, hash01, isForeign, transferWindow } from './world';

/**
 * Trh hráčů kolem majitele: agenti jako postavy, sledovaní hráči soupeřů, poslední dny okna
 * (deadline day), domino po prodeji opory, výstupní klauzule a podmíněné doplatky.
 */

const mil = (v: number) => `${(v / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč`;

// ---------- Agenti ----------

const AGENT_NAMES = ['Pavel Zeman', 'Viktor Kolář', 'Martina Horská', 'Radek Bláha', 'Lukáš Peterka', 'Jana Šimonová'];
const AGENT_STYLES: Agent['style'][] = ['ferovy', 'chamtivy', 'kontakty', 'chamtivy', 'ferovy', 'kontakty'];
export const AGENT_STYLE_LABEL: Record<Agent['style'], { label: string; hint: string }> = {
  ferovy: { label: 'férový', hint: 'nižší odměny, drží slovo' },
  chamtivy: { label: 'chamtivý', hint: 'vyšší odměny a platy, při špatném vztahu pouští informace médiím' },
  kontakty: { label: 's kontakty do ciziny', hint: 'prodá vaše hráče dráž do zahraničí, nosí tipy' },
};

export function agentsOf(state: GameState): Agent[] {
  return state.agents ?? AGENT_NAMES.map((name, i) => ({ id: `ag${i}`, name, style: AGENT_STYLES[i], relation: 50 }));
}

function ensureAgents(state: GameState): Agent[] {
  state.agents ??= agentsOf(state);
  return state.agents;
}

/** Agent hráče (pevně podle hráče). */
export function agentOf(state: GameState, playerId: string): Agent {
  const list = agentsOf(state);
  return list[Math.floor(hash01(`agent-${playerId}`) * list.length)];
}

/** Násobek odměny agentovi podle jeho povahy a vztahu s majitelem. */
export function agentFeeFactor(state: GameState, playerId: string): number {
  const a = agentOf(state, playerId);
  const style = a.style === 'chamtivy' ? 1.5 : a.style === 'ferovy' ? 0.8 : 1;
  return style * (1.25 - a.relation / 200);
}

/** Násobek platových nároků (chamtivý agent tlačí výš). */
export function agentWageFactor(state: GameState, playerId: string): number {
  const a = agentOf(state, playerId);
  return (a.style === 'chamtivy' ? 1.08 : 1) * (1.04 - a.relation / 1250);
}

export function changeAgentRelation(state: GameState, playerId: string, delta: number): void {
  const list = ensureAgents(state);
  const a = list.find((x) => x.id === agentOf(state, playerId).id)!;
  a.relation = clamp(a.relation + delta, 0, 100);
}

/** Měsíčně: agenti s dobrým vztahem nosí tipy, chamtiví se špatným vztahem pouštějí informace. */
export function monthlyAgents(state: GameState, rng: Rng): void {
  if (state.owner.ousted) return;
  const list = ensureAgents(state);
  const own = state.owner.clubId;
  state.tips = (state.tips ?? []).filter((t) => t.until >= state.date && state.players[t.playerId]);
  for (const a of list) {
    if (a.relation >= 60 && rng.next() < 0.35) {
      const level = squadOf(state, own).sort((x, y) => y.overall - x.overall)[10]?.overall ?? 50;
      const client = Object.values(state.players)
        .filter((p) => p.clubId && p.clubId !== own && !isForeign(p.clubId) && state.clubs[p.clubId] && agentOf(state, p.id).id === a.id)
        .filter((p) => p.overall >= level && (p.morale < 45 || contractExpiring(state, p) || clubMoment(state, p.clubId) === 'krize'))
        .sort((x, y) => y.overall - x.overall)[0];
      if (client && !state.tips.some((t) => t.playerId === client.id)) {
        state.tips.push({ playerId: client.id, agentId: a.id, until: addDays(state.date, 45) });
        addWatch(state, client.id);
        addNews(state, { kind: 'info', title: `Tip od agenta ${a.name}: ${playerName(client)}`, text: `Hráč ${clubLabel(state, client.clubId)} chce změnu. Klub ho teď pustí o 10 % levněji (do ${addDays(state.date, 45).split('-').reverse().join('. ')}). Je mezi sledovanými.`, playerId: client.id });
      }
    }
    if (a.style === 'chamtivy' && a.relation <= 25 && rng.next() < 0.25) {
      media(state, -2);
      addNews(state, { kind: 'varovani', title: `Agent ${a.name} pustil do médií informace z jednání`, text: 'Novináři píšou o tom, jak klub jedná s hráči. Pověst u médií −2.' });
    }
    // Vztahy se pomalu vracejí k normálu.
    a.relation += (50 - a.relation) * 0.03;
  }
}

/** Sleva z tipu agenta (hráč je k mání levněji). */
export function tipDiscount(state: GameState, playerId: string): number {
  return (state.tips ?? []).some((t) => t.playerId === playerId && t.until >= state.date) ? 0.9 : 1;
}

// ---------- Sledovaní hráči ----------

export function addWatch(state: GameState, playerId: string): void {
  state.watchlist = [...new Set([...(state.watchlist ?? []), playerId])].slice(-20);
}

export function toggleWatch(prev: GameState, playerId: string): ActionResult {
  const state = structuredClone(prev);
  const on = (state.watchlist ?? []).includes(playerId);
  if (on) state.watchlist = (state.watchlist ?? []).filter((id) => id !== playerId);
  else addWatch(state, playerId);
  const p = state.players[playerId];
  return { state, ok: true, message: p ? (on ? `${playerName(p)} už není mezi sledovanými.` : `${playerName(p)} je mezi sledovanými hráči (Přestupy).`) : '' };
}

export interface WatchInfo {
  player: Player;
  notes: string[];
  /** Je teď výhodná chvíle (levněji, končí smlouva, nespokojený)? */
  hot: boolean;
}

/** Co ředitel hlásí o sledovaných hráčích. */
export function watchReport(state: GameState): WatchInfo[] {
  const out: WatchInfo[] = [];
  for (const id of state.watchlist ?? []) {
    const p = state.players[id];
    if (!p || p.clubId === state.owner.clubId) continue;
    const notes: string[] = [];
    if (p.clubId === FREE) notes.push('je bez klubu');
    if (p.clubId && contractExpiring(state, p)) notes.push('končí mu smlouva (v létě zadarmo, teď levněji)');
    if (p.morale < 40) notes.push('je nespokojený');
    if (p.clubId && crisisDiscount(state, p.clubId) < 1) notes.push('klub je v krizi a prodává levněji');
    if (tipDiscount(state, p.id) < 1) notes.push('tip od agenta: o 10 % levněji');
    if ((state.deadlineDeals ?? []).includes(p.id)) notes.push('deadline day: klub ho pustí se slevou');
    out.push({ player: p, notes, hot: notes.length > 0 });
  }
  return out;
}

/** Měsíčně: ředitel upozorní na sledované hráče, u kterých je výhodná chvíle. */
export function monthlyWatch(state: GameState): void {
  const hot = watchReport(state).filter((w) => w.hot && w.player.clubId !== FREE);
  if (hot.length && state.clubs[state.owner.clubId].staff.directorId) {
    addNews(state, { kind: 'info', title: `Sledovaní hráči: výhodná chvíle u ${hot.length === 1 ? playerName(hot[0].player) : `${hot.length} hráčů`}`, text: hot.slice(0, 3).map((w) => `${playerName(w.player)}: ${w.notes.join(', ')}`).join(' · ') });
  }
}

// ---------- Deadline day ----------

/** Poslední tři dny okna. */
export function deadlineDay(state: GameState): { daysLeft: number; end: string } | undefined {
  const w = transferWindow(state.date);
  if (!w) return undefined;
  const end = w === 'leto' ? `${state.date.slice(0, 4)}-08-31` : `${state.date.slice(0, 4)}-02-14`;
  const daysLeft = Math.round((new Date(`${end}T00:00:00Z`).getTime() - new Date(`${state.date}T00:00:00Z`).getTime()) / 86_400_000);
  return daysLeft <= 2 ? { daysLeft, end } : undefined;
}

/** Den, kdy deadline day začíná (pro zastavení hry). */
export function deadlineStart(state: GameState): string | undefined {
  const w = transferWindow(state.date) ?? (state.date.slice(5) < '07-01' && state.date.slice(5) > '02-14' ? 'leto' : 'zima');
  const year = Number(state.date.slice(0, 4));
  const start = w === 'leto' ? `${year}-08-29` : `${state.date.slice(5) > '08-31' ? year + 1 : year}-02-12`;
  return start > state.date ? start : undefined;
}

/** Každý den deadline day: soupeři panikaří a pár hráčů je k mání se slevou. */
export function dailyDeadline(state: GameState, rng: Rng): void {
  const d = deadlineDay(state);
  if (!d) {
    if (state.deadlineDeals?.length) state.deadlineDeals = [];
    return;
  }
  const own = state.owner.clubId;
  const level = squadOf(state, own).sort((x, y) => y.overall - x.overall)[12]?.overall ?? 50;
  const pool = Object.values(state.players).filter((p) => p.clubId && p.clubId !== own && !isForeign(p.clubId) && state.clubs[p.clubId] && p.overall >= level - 2 && !(state.deadlineDeals ?? []).includes(p.id));
  const picks: Player[] = [];
  for (let i = 0; i < 2 && pool.length; i++) picks.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]);
  state.deadlineDeals = [...(state.deadlineDeals ?? []), ...picks.map((p) => p.id)];
  if (picks.length) {
    addNews(state, { kind: 'info', title: `Deadline day: ${picks.map(playerName).join(' a ')} k mání se slevou`, text: `Kluby uvolňují místo v kádru. Sleva 15 % do konce okna. Do konce okna ${d.daysLeft === 0 ? 'zbývá poslední den' : `zbývají ${d.daysLeft + 1} dny`}.` });
  }
}

export function deadlineDiscount(state: GameState, playerId: string): number {
  return deadlineDay(state) && (state.deadlineDeals ?? []).includes(playerId) ? 0.85 : 1;
}

// ---------- Domino po prodeji ----------

export function startDomino(state: GameState, sold: Player, fee: number): void {
  state.domino = { soldName: playerName(sold), soldOverall: sold.overall, position: sold.position, budget: Math.round(fee * 0.5), until: addDays(state.date, 30) };
}

/** Konec okna: když za prodanou oporu nepřišla náhrada, fanoušci jsou zklamaní. */
export function closeDomino(state: GameState): void {
  const d = state.domino;
  if (!d) return;
  const replaced = squadOf(state, state.owner.clubId).some((p) => p.position === d.position && p.overall >= d.soldOverall - 3 && p.transfers.some((t) => t.date >= addDays(d.until, -30)));
  if (!replaced) {
    const club = state.clubs[state.owner.clubId];
    club.fanMood = clamp(club.fanMood - 3, 0, 100);
    addNews(state, { kind: 'varovani', title: `Za ${d.soldName} nepřišla náhrada`, text: 'Fanoušci nesou prodej opory bez náhrady nelibě (nálada −3).' });
  }
  state.domino = undefined;
}

// ---------- Klauzule ----------

/** Výstupní klauzule při podpisu: částka, za kterou hráč může odejít. */
export function releaseClauseFor(state: GameState, p: Player, fee: number): number {
  return Math.round(Math.max(playerValue(state, p) * 1.6, fee * 1.4, 1_000_000) / 100_000) * 100_000;
}

/** Každý týden v okně: větší klub může zaplatit výstupní klauzuli hráče majitele. */
export function weeklyReleaseClauses(state: GameState, rng: Rng): void {
  if (!transferWindow(state.date)) return;
  const own = state.owner.clubId;
  for (const p of squadOf(state, own)) {
    if (!p.releaseClause) continue;
    const worth = playerValue(state, p);
    // Čím víc hráč stojí proti klauzuli, tím spíš ji někdo zaplatí.
    const chance = clamp((worth / p.releaseClause - 0.6) * 0.25, 0, 0.3);
    if (rng.next() >= chance) continue;
    const fee = p.releaseClause;
    const name = playerName(p);
    const buyer = 'zahr:hoffenheim';
    executeTransfer(state, p, buyer, fee, p.wage, 3);
    addNews(state, { kind: 'varovani', title: `${name} odchází díky výstupní klauzuli`, text: `${clubLabel(state, buyer)} zaplatil klauzuli ${mil(fee)}. Klub nemohl nic dělat.` });
  }
}

/** Začátek sezóny: podmíněné doplatky za loňský postup nebo Evropu (platí sezóna nákupu). */
export function settleConditionals(state: GameState, promoted: boolean, europe: boolean): void {
  const own = state.owner.clubId;
  const last = state.season - 1;
  for (const c of state.conditionals ?? []) {
    if (c.season !== last) continue;
    if ((c.kind === 'postup' && promoted) || (c.kind === 'evropa' && europe)) {
      book(state, own, 'prestupy', -c.amount, `Doplatek za ${c.playerName} (${c.kind === 'postup' ? 'postup' : 'Evropa'})`);
      if (state.clubs[c.sellerId]) book(state, c.sellerId, 'prestupy', c.amount, `Doplatek za ${c.playerName}`);
      addNews(state, { kind: 'info', title: `Doplatek ${mil(c.amount)} za ${c.playerName}`, text: 'Podmínka ve smlouvě se splnila.' });
    }
  }
  state.conditionals = (state.conditionals ?? []).filter((c) => c.season >= state.season);
}
