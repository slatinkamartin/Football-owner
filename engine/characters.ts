import { addDays, formatShortDate } from './calendar';
import { book } from './finance';
import { changeSponsorRelation, sponsorRelation } from './finplus';
import { agentOf, agentsOf, changeAgentRelation } from './market';
import { FIRST_NAMES, LAST_NAMES } from './names';
import { addOwnerXp, XP } from './ownerlevel';
import { playerAge, squadOf } from './players';
import { addPromise, decisionBudgetLeft, situationsOf } from './situations';
import { contracts } from './sponsors';
import { coachOf, directorOf, type ActionResult } from './staff';
import { changeCity, changeUltras, cityOf, ultrasOf } from './surroundings';
import { budgetRemaining, playerName } from './transfers';
import type { GameEvent, GameState, Player, Position } from './types';
import { clamp, FREE, hash01, transferWindow } from './world';

/**
 * V1 (A4, A5): Postavy kolem klubu. Trenér, sportovní ředitel, kapitán (skutečný hráč ze soupisky –
 * jen sportovní témata), předák kotle, starosta, hlavní sponzor a agenti hvězd. Nálada a vztah se berou
 * ze skutečných dat (důvěra, kotel, město, sponzoři, agenti); postavy mají paměť rozhovorů.
 * Vztah otevírá a zavírá možnosti. Postavy samy přicházejí s požadavky (situace v týdenním limitu).
 */

export type CharacterRole = 'trener' | 'reditel' | 'kapitan' | 'kotel' | 'starosta' | 'sponzor' | 'agent';

export interface CharactersState {
  /** Historie rozhovorů podle id postavy (nejnovější na konci, nejvýš 12). */
  log: Record<string, { date: string; text: string }[]>;
  /** Vztahy, které nejsou jinde ve stavu (kapitán podle id hráče), −100..100. */
  rel: Record<string, number>;
  /** Jednorázové výhody (příspěvek sponzora za sezónu, zrychlené povolení stavby…). */
  used: Record<string, string>;
}

export interface Character {
  id: string;
  role: CharacterRole;
  name: string;
  roleLabel: string;
  /** Nálada 0–100. */
  mood: number;
  /** Vztah s majitelem −100..100. */
  relation: number;
  need?: string;
  lastTalk?: { date: string; text: string };
  history: { date: string; text: string }[];
  /** Hráč (kapitán) nebo agent, ke kterému se postava váže. */
  playerId?: string;
  agentId?: string;
}

export interface CharacterTopic {
  id: string;
  label: string;
  hint: string;
  disabledReason?: string;
}

const POS_ACC: Record<Position, string> = { GK: 'brankáře', DF: 'obránce', MF: 'záložníka', FW: 'útočníka' };
const own = (s: GameState) => s.clubs[s.owner.clubId];
const squad = (s: GameState) => squadOf(s, s.owner.clubId);
const fmt = (v: number) => `${Math.round(v).toLocaleString('cs-CZ')} Kč`;
const toRel = (v0to100: number) => Math.round(clamp(v0to100 * 2 - 100, -100, 100));
/** Klesající účinek: čím vyšší hodnota (0–100), tím menší přírůstek (vztahy nejdou snadno na maximum). */
export function diminish(value: number, delta: number): number {
  return delta > 0 ? Math.max(1, Math.round(delta * clamp((100 - value) / 45, 0.2, 1))) : delta;
}

export function charactersOf(state: GameState): CharactersState {
  state.characters ??= { log: {}, rel: {}, used: {} };
  state.characters.log ??= {};
  state.characters.rel ??= {};
  state.characters.used ??= {};
  return state.characters;
}

function fictionalName(state: GameState, key: string): string {
  const f = FIRST_NAMES[Math.floor(hash01(`${state.seed}-${key}-f`) * FIRST_NAMES.length)];
  const l = LAST_NAMES[Math.floor(hash01(`${state.seed}-${key}-l`) * LAST_NAMES.length)];
  return `${f} ${l}`;
}

/** Kapitán: nejzkušenější z nejlepších hráčů kádru (skutečný hráč – jen sportovní témata). */
export function captainOf(state: GameState): Player | undefined {
  const list = [...squad(state)].sort((a, b) => b.overall - a.overall).slice(0, 8);
  return list.sort((a, b) => playerAge(b, state.season) + b.overall / 4 - (playerAge(a, state.season) + a.overall / 4) || a.id.localeCompare(b.id))[0];
}

function teamMoraleAvg(state: GameState): number {
  const s = squad(state);
  return s.length ? s.reduce((a, p) => a + p.morale, 0) / s.length : 50;
}

function weakestPosition(state: GameState): Position | undefined {
  const s = squad(state);
  if (!s.length) return undefined;
  const avg = s.reduce((a, p) => a + p.overall, 0) / s.length;
  const need: Record<Position, number> = { GK: 1, DF: 4, MF: 4, FW: 2 };
  const gaps = (Object.keys(need) as Position[]).map((pos) => {
    const top = s.filter((p) => p.position === pos).sort((a, b) => b.overall - a.overall).slice(0, need[pos]);
    const q = top.length ? top.reduce((a, p) => a + p.overall, 0) / top.length : 0;
    return { pos, gap: avg - q + (need[pos] - top.length) * 5 };
  });
  const worst = gaps.sort((a, b) => b.gap - a.gap)[0];
  return worst && worst.gap > 1 ? worst.pos : undefined;
}

function starAgents(state: GameState): { agentId: string; playerId: string }[] {
  const out: { agentId: string; playerId: string }[] = [];
  for (const p of [...squad(state)].sort((a, b) => b.overall - a.overall).slice(0, 4)) {
    const a = agentOf(state, p.id);
    if (!out.some((x) => x.agentId === a.id)) out.push({ agentId: a.id, playerId: p.id });
    if (out.length >= 2) break;
  }
  return out;
}

/** Všechny postavy kolem klubu majitele. Nemění stav. */
export function characters(state: GameState): Character[] {
  const log = state.characters?.log ?? {};
  const mk = (c: Omit<Character, 'history' | 'lastTalk'>): Character => {
    const history = log[c.id] ?? [];
    return { ...c, history, lastTalk: history[history.length - 1] };
  };
  const out: Character[] = [];
  const club = own(state);
  const morale = teamMoraleAvg(state);
  const coach = coachOf(state, club.id);
  if (coach) {
    const weak = weakestPosition(state);
    out.push(mk({
      id: 'trener', role: 'trener', name: `${coach.firstName} ${coach.lastName}`, roleLabel: 'Hlavní trenér',
      mood: Math.round(clamp(morale * 0.5 + state.owner.trust.trener * 0.5, 0, 100)), relation: toRel(state.owner.trust.trener),
      need: state.owner.trust.trener < 40 ? 'Víc podpory od majitele' : weak && transferWindow(state.date) ? `Posilu na místo ${POS_ACC[weak]}` : morale < 50 ? 'Klid v kabině' : 'Čas na práci s týmem',
    }));
  }
  const dir = directorOf(state, club.id);
  if (dir) {
    const left = budgetRemaining(state);
    out.push(mk({
      id: 'reditel', role: 'reditel', name: `${dir.firstName} ${dir.lastName}`, roleLabel: 'Sportovní ředitel',
      mood: Math.round(state.owner.trust.reditel), relation: toRel(state.owner.trust.reditel),
      need: left < club.policy.transferBudget * 0.15 && transferWindow(state.date) ? 'Peníze na přestupy' : 'Jasný plán přestupního okna',
    }));
  }
  const cap = captainOf(state);
  if (cap) {
    const rel = state.characters?.rel[`kapitan:${cap.id}`] ?? Math.round((cap.morale - 50) * 0.8);
    out.push(mk({
      id: 'kapitan', role: 'kapitan', name: playerName(cap), roleLabel: 'Kapitán týmu', playerId: cap.id,
      mood: Math.round(cap.morale), relation: Math.round(clamp(rel, -100, 100)),
      need: morale < 50 ? 'Klid v kabině' : cap.morale < 50 ? 'Víc uznání a minut' : 'Jasné cíle týmu',
    }));
  }
  const u = ultrasOf(state);
  out.push(mk({
    id: 'kotel', role: 'kotel', name: fictionalName(state, 'kotel'), roleLabel: 'Předák kotle',
    mood: Math.round(club.fanMood), relation: toRel(u.relation),
    need: u.boycottUntil && u.boycottUntil >= state.date ? 'Ukončit bojkot' : u.relation < 45 ? 'Respekt a levnější vstupenky' : 'Podporu choreí a výjezdů',
  }));
  const city = cityOf(state);
  out.push(mk({
    id: 'starosta', role: 'starosta', name: city.mayor, roleLabel: 'Primátor (starosta)',
    mood: Math.round(clamp((city.stance === 'sport' ? 65 : city.stance === 'skeptik' ? 35 : 50) + (city.relation - 50) * 0.4, 0, 100)), relation: toRel(city.relation),
    need: (club.policy.community ?? 0) <= 0 ? 'Komunitní akce klubu pro město' : 'Klid kolem stadionu a dobré jméno města',
  }));
  const gen = contracts(state).find((c) => c.slot === 'generalni');
  if (gen) {
    const rel = sponsorRelation(state, 'generalni');
    out.push(mk({
      id: 'sponzor', role: 'sponzor', name: `${fictionalName(state, `sponzor-${gen.name}`)} (${gen.name})`, roleLabel: 'Hlavní sponzor',
      mood: Math.round(clamp(club.fanMood * 0.4 + rel * 0.6, 0, 100)), relation: toRel(rel),
      need: gen.untilSeason <= state.season ? 'Jednání o prodloužení smlouvy' : 'Viditelnost značky a dobré výsledky',
    }));
  }
  for (const { agentId, playerId } of starAgents(state)) {
    const a = agentsOf(state).find((x) => x.id === agentId);
    const p = state.players[playerId];
    if (!a || !p) continue;
    out.push(mk({
      id: `agent-${a.id}`, role: 'agent', name: a.name, roleLabel: `Agent (zastupuje ${playerName(p)})`, agentId: a.id, playerId,
      mood: Math.round(a.relation), relation: toRel(a.relation),
      need: p.contractUntil <= state.season + 1 ? `Nová smlouva pro ${p.lastName}` : 'Dobré podmínky pro klienty',
    }));
  }
  return out;
}

export function characterById(state: GameState, id: string): Character | undefined {
  return characters(state).find((c) => c.id === id);
}

/** Témata schůzky s postavou (vztah otevírá a zavírá možnosti). */
export function characterTopics(state: GameState, id: string): CharacterTopic[] {
  const c = characterById(state, id);
  if (!c) return [];
  const used = state.characters?.used ?? {};
  switch (c.role) {
    case 'trener':
      return [
        { id: 'podpora', label: 'Vyjádřit podporu', hint: 'Důvěra trenéra +5' },
        { id: 'kabina', label: 'Probrat náladu v kabině', hint: 'Morálka týmu +2, důvěra +2' },
        { id: 'mladi', label: 'Víc šancí pro mladé', hint: 'Trenér dá prostor mladým, důvěra −1' },
      ];
    case 'reditel':
      return [
        { id: 'plan', label: 'Probrat plán okna', hint: 'Důvěra ředitele +5' },
        { id: 'trh', label: 'Projít trh', hint: 'Ředitel přidá do lovu 1–2 tipy na vaši slabou pozici' },
      ];
    case 'kapitan':
      return [
        { id: 'kabina', label: 'Uklidnit kabinu', hint: c.relation >= 30 ? 'Kapitán uklidní kabinu: morálka týmu +5' : 'Morálka týmu +2 (kapitán vám zatím moc nevěří)' },
        { id: 'role', label: 'Ocenit jeho roli', hint: 'Morálka kapitána +8, vztah +8' },
      ];
    case 'kotel':
      return [
        { id: 'dialog', label: 'Vyslechnout kotel', hint: 'Vztah s kotlem +6' },
        { id: 'choreo', label: 'Přispět na choreo', hint: `Klub zaplatí ${fmt(choreoCost(state))}, vztah +10, nálada fanoušků +2` },
      ];
    case 'starosta': {
      const running = (state.bigProjects ?? []).find((p) => p.end > state.date && !used[`povoleni:${p.id}`]);
      return [
        {
          id: 'stavba', label: running ? 'Urychlit povolení stavby' : 'Probrat plány klubu',
          hint: running ? 'Při dobrém vztahu (nad 40) se stavba zkrátí o 3 týdny' : 'Vztah s městem +4',
          disabledReason: c.relation < -30 ? 'Primátor s vámi o stavbách mluvit nechce (vztah s městem je špatný).' : undefined,
        },
        { id: 'komunita', label: 'Nabídnout komunitní akci', hint: `Klub zaplatí ${fmt(communityCost(state))}, vztah s městem +7` },
      ];
    }
    case 'sponzor': {
      const key = `prispevek:${state.season}`;
      return [
        { id: 'aktivace', label: 'Společná aktivace značky', hint: 'Vztah se sponzorem +6' },
        {
          id: 'posila', label: 'Požádat o příspěvek na posilu', hint: `Při vztahu nad 40: ${fmt(sponsorContribution(state))} do rozpočtu na přestupy (jednou za sezónu)`,
          disabledReason: used[key] ? 'Příspěvek na posilu už sponzor letos dal.' : c.relation < 40 ? 'Na takovou prosbu je vztah se sponzorem zatím slabý (potřeba nad 40).' : undefined,
        },
      ];
    }
    case 'agent':
      return [
        { id: 'vztah', label: 'Pozvat na oběd', hint: 'Vztah s agentem +8 (levnější provize, ochota jednat)' },
        { id: 'tip', label: 'Požádat o tip na hráče', hint: 'Agent nabídne svého klienta z jiného klubu o 10 % levněji', disabledReason: c.relation < 30 ? 'Agent vám tipy zatím nedává (vztah pod 30).' : undefined },
      ];
  }
}

function scale(state: GameState): number {
  return Math.max(0.2, own(state).stadium.capacity / 10_000);
}
function choreoCost(state: GameState): number {
  return Math.max(20_000, Math.round((60_000 * scale(state)) / 10_000) * 10_000);
}
function communityCost(state: GameState): number {
  return Math.max(30_000, Math.round((120_000 * scale(state)) / 10_000) * 10_000);
}
export function sponsorContribution(state: GameState): number {
  const gen = contracts(state).find((c) => c.slot === 'generalni');
  return Math.max(200_000, Math.round(((gen?.annual ?? 2_000_000) * 0.12) / 50_000) * 50_000);
}

/** Zapíše do paměti postavy. */
export function rememberTalk(state: GameState, id: string, text: string): void {
  const ch = charactersOf(state);
  ch.log[id] = [...(ch.log[id] ?? []), { date: state.date, text }].slice(-12);
}

/** Schůzka s postavou (mutuje stav). Vrací výsledek textem. Používá ji agenda. */
export function meetCharacterMut(state: GameState, id: string, topicId?: string): { ok: boolean; text: string } {
  const c = characterById(state, id);
  if (!c) return { ok: false, text: 'Tato postava teď u klubu není.' };
  const topics = characterTopics(state, id);
  const topic = topics.find((t) => t.id === topicId) ?? topics.find((t) => !t.disabledReason);
  if (!topic) return { ok: false, text: 'Teď není o čem jednat.' };
  if (topic.disabledReason) return { ok: false, text: topic.disabledReason };
  const ch = charactersOf(state);
  const club = own(state);
  let text = '';
  const trustT = (d: number) => {
    const b = state.owner.trust.trener;
    state.owner.trust.trener = clamp(b + diminish(b, d), 0, 100);
    return `důvěra trenéra ${Math.round(b)} → ${Math.round(state.owner.trust.trener)}`;
  };
  const trustR = (d: number) => {
    const b = state.owner.trust.reditel;
    state.owner.trust.reditel = clamp(b + diminish(b, d), 0, 100);
    return `důvěra ředitele ${Math.round(b)} → ${Math.round(state.owner.trust.reditel)}`;
  };
  const teamMorale = (d: number) => {
    for (const p of squad(state)) p.morale = clamp(p.morale + d, 0, 100);
    return `morálka týmu +${d}`;
  };
  switch (c.role) {
    case 'trener': {
      if (topic.id === 'podpora') text = `Podpořili jste trenéra: ${trustT(5)}.`;
      else if (topic.id === 'kabina') text = `Probrali jste kabinu: ${teamMorale(2)}, ${trustT(2)}.`;
      else {
        const coach = coachOf(state, club.id);
        if (coach) coach.youthFocus = true;
        text = `Trenér dá víc prostoru mladým, ${trustT(-1)}.`;
      }
      break;
    }
    case 'reditel': {
      if (topic.id === 'plan') text = `Plán okna je jasný: ${trustR(5)}.`;
      else {
        const pos = weakestPosition(state) ?? 'MF';
        const known = new Set(state.watchlist ?? []);
        const avg = squad(state).reduce((a, p) => a + p.overall, 0) / Math.max(1, squad(state).length);
        const picks = Object.values(state.players)
          .filter((p) => p.position === pos && p.clubId !== club.id && p.clubId !== FREE && !known.has(p.id) && p.overall >= avg && p.overall <= avg + 8 && !p.clubId.startsWith('zahr'))
          .sort((a, b) => hash01(`trh-${state.date}-${a.id}`) - hash01(`trh-${state.date}-${b.id}`))
          .slice(0, 2);
        state.watchlist = [...(state.watchlist ?? []), ...picks.map((p) => p.id)].slice(-20);
        text = picks.length ? `Ředitel přidal do lovu: ${picks.map(playerName).join(', ')} (${POS_ACC[pos]}). ${trustR(2)}.` : `Ředitel na trhu nic vhodného nevidí. ${trustR(2)}.`;
      }
      break;
    }
    case 'kapitan': {
      const key = `kapitan:${c.playerId}`;
      const cap = c.playerId ? state.players[c.playerId] : undefined;
      if (topic.id === 'kabina') {
        const d = c.relation >= 30 ? 5 : 2;
        text = `Kapitán ${cap ? cap.lastName : ''} si vzal kabinu na starost: ${teamMorale(d)}.`;
        ch.rel[key] = clamp(c.relation + 3, -100, 100);
      } else {
        if (cap) cap.morale = clamp(cap.morale + 8, 0, 100);
        ch.rel[key] = clamp(c.relation + 8, -100, 100);
        text = `Ocenili jste kapitána: jeho morálka +8, vztah ${c.relation} → ${ch.rel[key]}.`;
      }
      break;
    }
    case 'kotel': {
      const b = Math.round(ultrasOf(state).relation);
      if (topic.id === 'dialog') changeUltras(state, diminish(b, 6));
      else {
        book(state, club.id, 'ostatni', -choreoCost(state), 'Příspěvek kotli na choreo');
        changeUltras(state, 10);
        club.fanMood = clamp(club.fanMood + 2, 0, 100);
      }
      const u = ultrasOf(state);
      if (u.boycottUntil && u.boycottUntil > state.date && u.relation >= 45) {
        state.ultras = { ...u, boycottUntil: state.date };
        text = ' Kotel ukončil bojkot.';
      }
      text = `Schůzka s kotlem: vztah ${b} → ${Math.round(ultrasOf(state).relation)}${topic.id === 'choreo' ? `, nálada fanoušků +2 (klub zaplatil ${fmt(choreoCost(state))})` : ''}.${text}`;
      break;
    }
    case 'starosta': {
      const b = Math.round(cityOf(state).relation);
      if (topic.id === 'komunita') {
        book(state, club.id, 'komunita', -communityCost(state), 'Komunitní akce pro město');
        changeCity(state, 7);
        text = `Komunitní akce pro město: vztah ${b} → ${Math.round(cityOf(state).relation)}.`;
      } else {
        const running = (state.bigProjects ?? []).find((p) => p.end > state.date && !ch.used[`povoleni:${p.id}`]);
        changeCity(state, diminish(b, 4));
        if (running && c.relation >= -20) {
          running.end = addDays(running.end, -21);
          ch.used[`povoleni:${running.id}`] = state.date;
          text = `Primátor urychlil povolení: ${running.label} bude hotová o 3 týdny dřív (${formatShortDate(running.end)}). Vztah ${b} → ${Math.round(cityOf(state).relation)}.`;
        } else text = `Primátor vyslechl plány klubu: vztah ${b} → ${Math.round(cityOf(state).relation)}.`;
      }
      break;
    }
    case 'sponzor': {
      const b = Math.round(sponsorRelation(state, 'generalni'));
      if (topic.id === 'aktivace') {
        changeSponsorRelation(state, 'generalni', diminish(b, 6));
        text = `Společná aktivace se sponzorem: vztah ${b} → ${Math.round(sponsorRelation(state, 'generalni'))}.`;
      } else {
        const amount = sponsorContribution(state);
        book(state, club.id, 'komercni', amount, 'Příspěvek sponzora na posilu');
        club.policy.transferBudget += amount;
        ch.used[`prispevek:${state.season}`] = state.date;
        changeSponsorRelation(state, 'generalni', -3);
        text = `Sponzor přispěl ${fmt(amount)} na posilu (rozpočet na přestupy navýšen).`;
      }
      break;
    }
    case 'agent': {
      const a = agentsOf(state).find((x) => x.id === c.agentId);
      if (!a || !c.playerId) return { ok: false, text: 'Agent není k zastižení.' };
      if (topic.id === 'vztah') {
        const before = Math.round(a.relation);
        changeAgentRelation(state, c.playerId, diminish(before, 8));
        const after = Math.round(agentsOf(state).find((x) => x.id === a.id)?.relation ?? before);
        text = `Oběd s agentem ${a.name}: vztah ${before} → ${after}.`;
      } else {
        const client = Object.values(state.players)
          .filter((p) => p.clubId !== club.id && p.clubId !== FREE && !p.clubId.startsWith('zahr') && agentOf(state, p.id).id === a.id)
          .sort((x, y) => y.overall - x.overall)
          .find((p) => p.overall <= squad(state).reduce((m, q) => Math.max(m, q.overall), 0) + 3);
        if (!client) {
          text = `Agent ${a.name} teď nemá klienta, který by se vám hodil.`;
        } else {
          const until = addDays(state.date, 30);
          state.tips = [...(state.tips ?? []).filter((t) => t.playerId !== client.id), { playerId: client.id, agentId: a.id, until }];
          state.watchlist = [...new Set([...(state.watchlist ?? []), client.id])].slice(-20);
          text = `Agent ${a.name} nabízí ${playerName(client)} o 10 % levněji do ${formatShortDate(until)} (přidáno do lovu).`;
        }
      }
      break;
    }
  }
  rememberTalk(state, id, `${topic.label}: ${text}`);
  return { ok: true, text };
}

/** Schůzka s postavou jako samostatná akce (agenda volá meetCharacterMut a spotřebuje slot). */
export function meetCharacter(prev: GameState, id: string, topic?: string): ActionResult {
  const state = structuredClone(prev);
  const r = meetCharacterMut(state, id, topic);
  return r.ok ? { state, ok: true, message: r.text } : { state: prev, ok: false, message: r.text };
}

// ---------- A5: požadavky a nabídky postav (situace v týdenním limitu) ----------

const REQUEST_COOLDOWN = 56;

type Body = Omit<GameEvent, 'id' | 'template' | 'date' | 'expires'>;

function requestCandidates(state: GameState): { id: string; score: number; build: () => Body }[] {
  const out: { id: string; score: number; build: () => Body }[] = [];
  const cs = characters(state);
  const by = (r: CharacterRole) => cs.find((c) => c.role === r);
  const coach = by('trener');
  const weak = weakestPosition(state);
  if (coach && weak && transferWindow(state.date)) {
    out.push({
      id: 'char-trener', score: 40 + (coach.relation < 0 ? 10 : 0),
      build: () => ({
        title: `${coach.name}: chce posilu na místo ${POS_ACC[weak]}`,
        text: `Trenér přišel s požadavkem: na pozici ${POS_ACC[weak]} je kádr nejslabší. Vztah s ním: ${coach.relation}.`,
        defaultOption: 'pockat',
        data: { position: weak },
        options: [
          { id: 'slib', label: 'Slíbit posilu do konce okna', hint: 'Důvěra trenéra +4 hned; nesplněný slib ji vezme zpátky i s úroky' },
          { id: 'pockat', label: 'Nejdřív se poradit s ředitelem', hint: 'Důvěra trenéra −1' },
          { id: 'odmitnout', label: 'Kádr stačí', hint: 'Důvěra trenéra −5' },
        ],
      }),
    });
  }
  const cap = by('kapitan');
  if (cap && teamMoraleAvg(state) < 48) {
    out.push({
      id: 'char-kapitan', score: 45,
      build: () => ({
        title: `Kapitán ${cap.name}: kabina je nervózní`,
        text: `Průměrná morálka týmu je ${Math.round(teamMoraleAvg(state))}. Kapitán by uvítal, kdyby majitel přišel do kabiny nebo tým odměnil.`,
        defaultOption: 'nic',
        playerId: cap.playerId,
        amount: Math.round(squad(state).reduce((a, p) => a + p.wage, 0) * 0.05),
        options: [
          { id: 'kabina', label: 'Přijít do kabiny', hint: 'Morálka týmu +3, vztah s kapitánem +6' },
          { id: 'premie', label: 'Mimořádná prémie za příští výhru', hint: 'Morálka týmu +5, stojí 5 % měsíčních platů' },
          { id: 'nic', label: 'Nechat to na trenérovi', hint: 'Vztah s kapitánem −4' },
        ],
      }),
    });
  }
  const sp = by('sponzor');
  if (sp && sp.relation >= 40 && transferWindow(state.date) && !state.characters?.used[`prispevek:${state.season}`]) {
    const amount = sponsorContribution(state);
    out.push({
      id: 'char-sponzor', score: 35,
      build: () => ({
        title: `${sp.name}: nabídka příspěvku na posilu`,
        text: `Hlavní sponzor je s klubem spokojený (vztah ${sp.relation}) a nabízí ${fmt(amount)} na posilu – výměnou za společnou akci s fanoušky.`,
        defaultOption: 'prijmout',
        amount,
        options: [
          { id: 'prijmout', label: 'Přijmout', hint: `Rozpočet na přestupy +${fmt(amount)}` },
          { id: 'odmitnout', label: 'Poděkovat a odmítnout', hint: 'Vztah se sponzorem −3' },
        ],
      }),
    });
  }
  const mayor = by('starosta');
  if (mayor && mayor.relation >= 30) {
    const amount = Math.max(100_000, Math.round((150_000 * scale(state)) / 50_000) * 50_000);
    out.push({
      id: 'char-starosta', score: 25,
      build: () => ({
        title: `Primátor ${mayor.name}: společný den s městem`,
        text: `Radnice (vztah ${mayor.relation}) navrhuje sportovní den pro školy na stadionu. Město přispěje ${fmt(amount)} na mládež, pokud klub dodá hráče a trenéry.`,
        defaultOption: 'prijmout',
        amount,
        options: [
          { id: 'prijmout', label: 'Souhlasit', hint: `Klub dostane ${fmt(amount)}, vztah s městem +5, kondice hráčů −5` },
          { id: 'odmitnout', label: 'Odmítnout kvůli programu', hint: 'Vztah s městem −4' },
        ],
      }),
    });
  } else if (mayor && mayor.relation < -30) {
    out.push({
      id: 'char-starosta', score: 30,
      build: () => ({
        title: `Primátor ${mayor.name}: radnice zvažuje vyšší nájem`,
        text: `Vztah s městem je špatný (${mayor.relation}). Radnice mluví o přehodnocení nájmu a podpory klubu.`,
        defaultOption: 'nic',
        amount: communityCost(state),
        options: [
          { id: 'komunita', label: 'Nabídnout komunitní program', hint: `Klub zaplatí ${fmt(communityCost(state))}, vztah +8` },
          { id: 'nic', label: 'Nereagovat', hint: 'Vztah −3, příspěvky města nižší' },
        ],
      }),
    });
  }
  const kotel = by('kotel');
  if (kotel && kotel.relation >= 40) {
    out.push({
      id: 'char-kotel', score: 20,
      build: () => ({
        title: `${kotel.name} (kotel): chystáme velké choreo`,
        text: `Kotel je s majitelem zadobře (vztah ${kotel.relation}) a chystá choreo na příští domácí zápas. Žádá příspěvek na materiál.`,
        defaultOption: 'odmitnout',
        amount: choreoCost(state),
        options: [
          { id: 'prispet', label: `Přispět ${fmt(choreoCost(state))}`, hint: 'Vztah s kotlem +6, nálada fanoušků +3' },
          { id: 'odmitnout', label: 'Odmítnout', hint: 'Vztah s kotlem −3' },
        ],
      }),
    });
  }
  const ag = cs.find((c) => c.role === 'agent' && c.playerId && (state.players[c.playerId]?.contractUntil ?? 9999) <= state.season + 1);
  if (ag && ag.playerId) {
    const p = state.players[ag.playerId];
    out.push({
      id: 'char-agent', score: 30,
      build: () => ({
        title: `Agent ${ag.name}: smlouva pro ${playerName(p)}`,
        text: `${playerName(p)} má smlouvu do 30. 6. ${p.contractUntil}. Agent (vztah ${ag.relation}) chce vědět, s čím klub počítá.`,
        defaultOption: 'pozdeji',
        playerId: p.id,
        options: [
          { id: 'jednat', label: 'Počítáme s ním, jednejme', hint: 'Vztah s agentem +6, morálka hráče +5 (smlouvu pak nabídnete v kádru)' },
          { id: 'pozdeji', label: 'Až po sezóně', hint: 'Vztah s agentem −3, morálka hráče −3' },
        ],
      }),
    });
  }
  return out;
}

/** Kandidáti na požadavek postavy (bez změny stavu). */
export function characterRequests(state: GameState): { id: string; score: number; title: string }[] {
  return requestCandidates(state).map((c) => ({ id: c.id, score: c.score, title: c.build().title }));
}

/** Jednou týdně (středa): nejvýš jeden požadavek postavy za ~5 týdnů, jen v rámci týdenního limitu rozhodnutí. */
export function weeklyCharacterRequest(state: GameState): void {
  if (state.gameOver || state.owner.ousted || state.events.length >= 3 || decisionBudgetLeft(state) <= 0) return;
  state.eventLog ??= {};
  const recentAny = Object.entries(state.eventLog).some(([k, d]) => k.startsWith('char-') && addDays(d, 34) > state.date);
  if (recentAny) return;
  // Agent hráče už tlačí přes situaci z dat → postava stejné téma neotevírá znovu.
  const agentBusy = Object.entries(state.eventLog).some(([k, d]) => k.startsWith('sit-agent') && addDays(d, 45) > state.date);
  const cands = requestCandidates(state)
    .filter((c) => !state.eventLog![c.id] || addDays(state.eventLog![c.id], REQUEST_COOLDOWN) <= state.date)
    .filter((c) => !(agentBusy && c.id === 'char-agent'))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const best = cands[0];
  if (!best) return;
  const body = best.build();
  const e: GameEvent = { ...body, id: `e${++state.nextId}`, template: best.id, date: state.date, expires: addDays(state.date, 7) };
  state.events.push(e);
  state.eventLog[best.id] = state.date;
  situationsOf(state).log.push({ id: e.id, date: e.date, template: e.template });
}

/** Šablony pro engine/events.ts (vznikají jen přes weeklyCharacterRequest, nikdy náhodně). */
export function characterTemplates(): Record<string, { weight: () => number; create: () => null; resolve: (s: GameState, e: GameEvent, o: string) => string }> {
  const t = (resolve: (s: GameState, e: GameEvent, o: string) => string) => ({ weight: () => 0, create: () => null, resolve });
  const talk = (s: GameState, id: string, text: string) => {
    rememberTalk(s, id, text);
    addOwnerXp(s, XP.request);
    return text;
  };
  return {
    'char-trener': t((s, e, o) => {
      const pos = (e.data?.position as Position) || 'MF';
      if (o === 'slib') {
        s.owner.trust.trener = clamp(s.owner.trust.trener + 4, 0, 100);
        const end = s.date.slice(5) <= '02-14' ? `${s.date.slice(0, 4)}-02-14` : `${s.date.slice(0, 4)}-08-31`;
        addPromise(s, { kind: 'posila', text: `Posila na místo ${POS_ACC[pos]} do konce okna`, metric: 'signing', target: 1, until: end, position: pos, stake: 'trener', source: 'char-trener' });
        return talk(s, 'trener', `Slíbili jste posilu na místo ${POS_ACC[pos]}.`);
      }
      s.owner.trust.trener = clamp(s.owner.trust.trener + (o === 'pockat' ? -1 : -5), 0, 100);
      return talk(s, 'trener', o === 'pockat' ? 'Posilu zatím neslíbil, poradí se s ředitelem.' : 'Majitel posilu odmítl.');
    }),
    'char-kapitan': t((s, e, o) => {
      const ch = charactersOf(s);
      const key = `kapitan:${e.playerId ?? ''}`;
      const base = ch.rel[key] ?? 0;
      if (o === 'kabina') {
        for (const p of squad(s)) p.morale = clamp(p.morale + 3, 0, 100);
        ch.rel[key] = clamp(base + 6, -100, 100);
        return talk(s, 'kapitan', 'Majitel přišel do kabiny, tým to ocenil (morálka +3).');
      }
      if (o === 'premie') {
        book(s, s.owner.clubId, 'platy', -(e.amount ?? 0), 'Mimořádná prémie týmu');
        for (const p of squad(s)) p.morale = clamp(p.morale + 5, 0, 100);
        ch.rel[key] = clamp(base + 3, -100, 100);
        return talk(s, 'kapitan', 'Mimořádná prémie zvedla náladu (morálka +5).');
      }
      ch.rel[key] = clamp(base - 4, -100, 100);
      return talk(s, 'kapitan', 'Majitel nechal kabinu na trenérovi.');
    }),
    'char-sponzor': t((s, e, o) => {
      if (o === 'prijmout') {
        const amount = e.amount ?? 0;
        book(s, s.owner.clubId, 'komercni', amount, 'Příspěvek sponzora na posilu');
        own(s).policy.transferBudget += amount;
        charactersOf(s).used[`prispevek:${s.season}`] = s.date;
        return talk(s, 'sponzor', `Sponzor přispěl ${fmt(amount)} na posilu.`);
      }
      changeSponsorRelation(s, 'generalni', -3);
      return talk(s, 'sponzor', 'Příspěvek jste odmítli.');
    }),
    'char-starosta': t((s, e, o) => {
      if (o === 'prijmout') {
        book(s, s.owner.clubId, 'ostatni', e.amount ?? 0, 'Příspěvek města na mládež');
        changeCity(s, 5);
        for (const p of squad(s)) p.fitness = Math.max(0, p.fitness - 5);
        return talk(s, 'starosta', 'Sportovní den s městem se vydařil.');
      }
      if (o === 'komunita') {
        book(s, s.owner.clubId, 'komunita', -(e.amount ?? 0), 'Komunitní program pro město');
        changeCity(s, 8);
        return talk(s, 'starosta', 'Komunitní program radnici uklidnil.');
      }
      changeCity(s, o === 'nic' ? -3 : -4);
      return talk(s, 'starosta', 'Radnice zůstala bez odpovědi.');
    }),
    'char-kotel': t((s, e, o) => {
      if (o === 'prispet') {
        book(s, s.owner.clubId, 'ostatni', -(e.amount ?? 0), 'Příspěvek kotli na choreo');
        changeUltras(s, 6);
        own(s).fanMood = clamp(own(s).fanMood + 3, 0, 100);
        return talk(s, 'kotel', 'Kotel chystá choreo s podporou klubu.');
      }
      changeUltras(s, -3);
      return talk(s, 'kotel', 'Choreo bude bez příspěvku klubu.');
    }),
    'char-agent': t((s, e, o) => {
      const p = e.playerId ? s.players[e.playerId] : undefined;
      if (!p) return '';
      const a = agentOf(s, p.id);
      changeAgentRelation(s, p.id, o === 'jednat' ? 6 : -3);
      p.morale = clamp(p.morale + (o === 'jednat' ? 5 : -3), 0, 100);
      return talk(s, `agent-${a.id}`, o === 'jednat' ? `Klub počítá s ${playerName(p)}, jednání o smlouvě začne.` : `Jednání o smlouvě ${playerName(p)} odloženo.`);
    }),
  };
}
