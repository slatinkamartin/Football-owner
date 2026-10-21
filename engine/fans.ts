import { addDays } from './calendar';
import { upcomingBigMatch, type BigMatch } from './bigmatch';
import { allFixtures } from './competitions';
import { findEuroMatch } from './europe';
import { book } from './finance';
import { media } from './grey';
import { FIRST_NAMES, LAST_NAMES } from './names';
import type { ActionResult } from './staff';
import { changeCity, changeUltras } from './surroundings';
import type { FinanceCategory, Fixture, GameState } from './types';
import { addNews, clamp, competitionOf, hash01, tierOf } from './world';

/**
 * W3: Fanoušci průběžně. Fanouškovská rada (měsíční nápad), ankety se závazným výsledkem
 * (dres, hymna, hráč měsíce, moment sezóny), dotované výjezdy na venkovní derby a evropské zápasy
 * a oslavy úspěchů na náměstí. Vše běží přes jednu kartu na Přehledu; každá volba má výchozí
 * možnost, která se použije sama, když majitel nic nezvolí.
 */

const mil = (v: number) => `${(v / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč`;
const kc = (v: number) => (Math.abs(v) >= 1_000_000 ? mil(v) : `${Math.round(v / 1000).toLocaleString('cs-CZ')} tis. Kč`);
const own = (s: GameState) => s.clubs[s.owner.clubId];
const roundTo = (v: number, step: number) => Math.max(step, Math.round(v / step) * step);

/** Náklady a výnosy fanouškovských akcí podle úrovně soutěže (1. liga = 1). */
export function fanScale(state: GameState): number {
  const t = tierOf(state, state.owner.clubId);
  return t <= 1 ? 1 : t === 2 ? 0.3 : 0.12;
}

function mood(state: GameState, delta: number): void {
  const c = own(state);
  c.fanMood = clamp(c.fanMood + delta, 0, 100);
}

// ---------- Stav ----------

export type IdeaKind = 'retro' | 'tribuna' | 'mladez' | 'vlak' | 'hymna' | 'den' | 'vzpominka' | 'fanzona' | 'drazba';
export type PollKind = 'dres' | 'hymna' | 'hrac' | 'moment';

export interface FanPerk {
  kind: string;
  label: string;
  /** Platí do (bez tohoto dne). */
  until: string;
  /** Kč měsíčně (+ příjem, − náklad). */
  monthly?: number;
  category?: FinanceCategory;
  /** Nálada fanoušků za měsíc. */
  fanMood?: number;
}

export interface FanPoll {
  id: string;
  kind: PollKind;
  question: string;
  options: { id: string; label: string; share: number; playerId?: string }[];
  opened: string;
  closes: string;
  /** Vítězná možnost po uzavření. */
  winner?: string;
}

export interface FanCommitment {
  id: string;
  kind: PollKind;
  /** Co fanoušci odhlasovali (popis závazku). */
  label: string;
  /** Rozhodnout do; pak platí výchozí „splnit“. */
  due: string;
  /** Náklad splnění (Kč). */
  cost: number;
  /** Peníze za porušení (např. verze sponzora). */
  breakGain: number;
  breakLabel: string;
  respectLabel: string;
}

export interface FanPromise {
  playerId: string;
  name: string;
  from: string;
  until: string;
}

export interface FansState {
  council?: { idea: IdeaKind; offered: string; deadline: string; postponed?: boolean; legend?: string };
  /** Kdy byl který nápad naposledy vyřešen (přijat nebo odmítnut). */
  ideasDone?: Partial<Record<IdeaKind, string>>;
  perks?: FanPerk[];
  poll?: FanPoll;
  commitment?: FanCommitment;
  promises?: FanPromise[];
  /** Zvolený výjezd na nejbližší velký venkovní zápas. */
  trip?: { matchId: string; date: string; choice: TripChoice; fans: number; cost: number; label: string };
  /** Sleva na zvláštní vlak (přijatý nápad rady). */
  trainDiscount?: boolean;
  celebration?: { reason: string; label: string; deadline: string; big: boolean };
  /** Počet trofejí v síni slávy, které už fanoušci oslavili (detekce nové). */
  seenTrophies?: number;
  lastDresSeason?: number;
  /** Posledních pár výsledků (pro kartu). */
  log?: { date: string; text: string }[];
  pollCount?: number;
}

export function fansOf(state: GameState): FansState {
  return state.fans ?? {};
}

function fs(state: GameState): FansState {
  return (state.fans ??= {});
}

function log(state: GameState, text: string): void {
  const f = fs(state);
  f.log = [{ date: state.date, text }, ...(f.log ?? [])].slice(0, 4);
}

function nextId(state: GameState, prefix: string): string {
  return `${prefix}-${state.nextId++}`;
}

// ---------- Fanouškovská rada (bod 10) ----------

export interface IdeaDef {
  title: string;
  text: string;
  /** Jednorázový náklad (Kč, před škálou). */
  cost: number;
  accept: string;
  reject: string;
  /** Kotel řeší víc než ostatní (odmítnutí víc zabolí). */
  kotel?: boolean;
  city?: boolean;
}

export const FAN_IDEAS: Record<IdeaKind, IdeaDef> = {
  retro: { title: 'Retro dres k výročí', text: 'Rada navrhuje limitovanou edici dresu podle slavné éry klubu. O podobě by hlasovali fanoušci.', cost: 400_000, accept: 'nálada +3, kotel +3, fanshop navíc každý měsíc do konce sezóny, anketa o podobě', reject: 'nálada −2, kotel −3' },
  tribuna: { title: 'Tribuna pojmenovaná po legendě', text: 'Fanoušci chtějí pojmenovat hlavní tribunu po legendě klubu. Stačí nové cedule a slavnostní odhalení.', cost: 150_000, accept: 'nálada +4, kotel +6, město +2', reject: 'nálada −2, kotel −4', kotel: true },
  mladez: { title: 'Levnější lístky pro mládež do 18 let', text: 'Rada žádá poloviční vstupné pro děti a studenty. Na tribuny přijde nová generace, pokladna přijde o část tržeb.', cost: 0, accept: 'vstupné méně každý měsíc do konce sezóny, nálada +0,6 měsíčně, město +4', reject: 'nálada −2, město −1', city: true },
  vlak: { title: 'Zvláštní vlak na výjezdy', text: 'Kotel chce pronajmout soupravu pro velké venkovní zápasy. Klub by složil zálohu a pak by vlak jezdil se slevou.', cost: 100_000, accept: 'kotel +5, příští velký výjezd vlakem za poloviční cenu', reject: 'kotel −4', kotel: true },
  hymna: { title: 'Nová klubová hymna', text: 'Místní kapela nabízí novou hymnu. Fanoušci by vybrali verzi v anketě.', cost: 200_000, accept: 'nálada +2, anketa o podobě hymny', reject: 'nálada −1, kotel −2' },
  den: { title: 'Den otevřených dveří', text: 'Prohlídky stadionu a šaten, autogramiáda, trénink s fanoušky. Rodiny by si klub víc oblíbily.', cost: 80_000, accept: 'město +5, nálada +3, fanshop jednorázově', reject: 'nálada −1, město −2', city: true },
  vzpominka: { title: 'Vzpomínkový zápas legend', text: 'Bývalí hráči proti výběru fanoušků. Vstupné částečně pokryje náklady.', cost: 300_000, accept: 'vstupné asi tři čtvrtiny nákladu zpět, nálada +3, kotel +2', reject: 'nálada −2' },
  fanzona: { title: 'Fanzóna na náměstí', text: 'Velkoplošná obrazovka a stánky na náměstí při velkých zápasech. Město by akci rádo podpořilo.', cost: 300_000, accept: 'město +6, nálada +3, fanshop navíc půl roku', reject: 'město −2, nálada −1', city: true },
  drazba: { title: 'Charitativní dražba zápasových dresů', text: 'Hráči by podepsali dresy z velkého zápasu, výtěžek půjde dětské nemocnici.', cost: 0, accept: 'město +5, média +3, nálada +1', reject: 'město −2, nálada −3, média −1', city: true },
};

const IDEA_ORDER: IdeaKind[] = ['retro', 'tribuna', 'mladez', 'vlak', 'hymna', 'den', 'vzpominka', 'fanzona', 'drazba'];
const COUNCIL_MONTHS = [8, 9, 10, 11, 12, 1, 2, 3, 4, 5];

export function ideaCost(state: GameState, idea: IdeaKind): number {
  const c = FAN_IDEAS[idea].cost;
  return c ? roundTo(c * fanScale(state), 10_000) : 0;
}

function legendName(state: GameState): string {
  const a = Math.floor(hash01(`${state.seed}-legenda-a`) * FIRST_NAMES.length);
  const b = Math.floor(hash01(`${state.seed}-legenda-b`) * LAST_NAMES.length);
  return `${FIRST_NAMES[a]} ${LAST_NAMES[b]}`;
}

function pickIdea(state: GameState): IdeaKind | undefined {
  const done = fansOf(state).ideasDone ?? {};
  // Stejný nápad nejdřív za rok a půl.
  const free = IDEA_ORDER.filter((k) => !done[k] || addDays(done[k]!, 540) <= state.date);
  if (!free.length) return undefined;
  return free[Math.floor(hash01(`${state.seed}-rada-${state.date}`) * free.length)];
}

/** Popis nápadu rady pro kartu (s legendou a náklady). */
export function councilView(state: GameState): { idea: IdeaKind; title: string; text: string; cost: number; accept: string; reject: string; deadline: string; canPostpone: boolean } | undefined {
  const c = fansOf(state).council;
  if (!c) return undefined;
  const d = FAN_IDEAS[c.idea];
  const title = c.idea === 'tribuna' && c.legend ? `Tribuna ${c.legend}` : d.title;
  const text = c.idea === 'tribuna' && c.legend ? `${d.text} Navrhují jméno ${c.legend}.` : d.text;
  return { idea: c.idea, title, text, cost: ideaCost(state, c.idea), accept: d.accept, reject: d.reject, deadline: c.deadline, canPostpone: !c.postponed };
}

export type CouncilChoice = 'prijmout' | 'odmitnout' | 'odlozit';

function applyCouncil(state: GameState, choice: CouncilChoice): string {
  const f = fs(state);
  const c = f.council!;
  const d = FAN_IDEAS[c.idea];
  const s = fanScale(state);
  const cost = ideaCost(state, c.idea);
  const seasonEnd = `${state.season + 1}-06-01`;
  if (choice === 'odlozit') {
    c.postponed = true;
    c.offered = state.date;
    c.deadline = addDays(state.date, 30);
    return `Rada počká: k nápadu „${d.title}“ se vrátíte do měsíce.`;
  }
  f.council = undefined;
  (f.ideasDone ??= {})[c.idea] = state.date;
  if (choice === 'odmitnout') {
    const kotel = c.idea === 'tribuna' ? -4 : c.idea === 'vlak' || c.idea === 'retro' ? -3 : c.idea === 'hymna' ? -2 : 0;
    const city = c.idea === 'drazba' || c.idea === 'den' || c.idea === 'fanzona' ? -2 : c.idea === 'mladez' ? -1 : 0;
    mood(state, c.idea === 'drazba' ? -3 : c.idea === 'den' || c.idea === 'fanzona' ? -1 : -2);
    if (kotel) changeUltras(state, kotel);
    if (city) changeCity(state, city);
    if (c.idea === 'drazba') media(state, -1);
    const text = `Fanouškovská rada: nápad „${d.title}“ jste odmítli. Fanoušci jsou zklamaní.`;
    log(state, text);
    return text;
  }
  if (cost) book(state, state.owner.clubId, 'komunita', -cost, `Fanouškovská rada: ${d.title}`);
  const perk = (p: FanPerk) => (f.perks = [...(f.perks ?? []), p]);
  switch (c.idea) {
    case 'retro':
      mood(state, 3);
      changeUltras(state, 3);
      perk({ kind: 'retro', label: 'Retro dres v prodeji', until: seasonEnd, monthly: roundTo(120_000 * s, 5_000), category: 'fanshop' });
      openPoll(state, 'dres', true);
      break;
    case 'tribuna':
      mood(state, 4);
      changeUltras(state, 6);
      changeCity(state, 2);
      break;
    case 'mladez':
      changeCity(state, 4);
      perk({ kind: 'mladez', label: 'Poloviční vstupné pro mládež', until: seasonEnd, monthly: -roundTo(100_000 * s, 5_000), category: 'vstupne', fanMood: 0.6 });
      break;
    case 'vlak':
      changeUltras(state, 5);
      f.trainDiscount = true;
      break;
    case 'hymna':
      mood(state, 2);
      openPoll(state, 'hymna', true);
      break;
    case 'den':
      changeCity(state, 5);
      mood(state, 3);
      book(state, state.owner.clubId, 'fanshop', roundTo(60_000 * s, 5_000), 'Den otevřených dveří: fanshop');
      break;
    case 'vzpominka':
      mood(state, 3);
      changeUltras(state, 2);
      book(state, state.owner.clubId, 'vstupne', roundTo(cost * 0.75, 5_000), 'Vzpomínkový zápas legend: vstupné');
      break;
    case 'fanzona':
      changeCity(state, 6);
      mood(state, 3);
      perk({ kind: 'fanzona', label: 'Fanzóna na náměstí', until: addDays(state.date, 182), monthly: roundTo(70_000 * s, 5_000), category: 'fanshop' });
      break;
    case 'drazba':
      changeCity(state, 5);
      media(state, 3);
      mood(state, 1);
      break;
  }
  const text = `Fanouškovská rada: „${c.idea === 'tribuna' && c.legend ? `Tribuna ${c.legend}` : d.title}“ platí${cost ? ` (náklad ${kc(cost)})` : ''}. Fanoušci jsou nadšení.`;
  log(state, text);
  return text;
}

export function councilDecide(prev: GameState, choice: CouncilChoice): ActionResult {
  const c = prev.fans?.council;
  if (!c) return { state: prev, ok: false, message: 'Rada teď nic nenavrhuje.' };
  if (choice === 'odlozit' && c.postponed) return { state: prev, ok: false, message: 'Nápad už jste jednou odložili.' };
  const cost = ideaCost(prev, c.idea);
  if (choice === 'prijmout' && cost > 0 && own(prev).finance.balance < cost) return { state: prev, ok: false, message: `Na to klub nemá peníze (${kc(cost)}).` };
  const state = structuredClone(prev);
  const message = applyCouncil(state, choice);
  return { state, ok: true, message };
}

// ---------- Ankety (bod 18) ----------

const POLL_DAYS = 5;

function shares(state: GameState, ids: string[], weights: number[], salt: string): number[] {
  const w = weights.map((x, i) => x * (0.7 + 0.6 * hash01(`${state.seed}-${salt}-${ids[i]}`)));
  const sum = w.reduce((a, b) => a + b, 0) || 1;
  const raw = w.map((x) => Math.round((x / sum) * 100));
  raw[raw.indexOf(Math.max(...raw))] += 100 - raw.reduce((a, b) => a + b, 0);
  return raw;
}

/** Nejlepší hráči klubu majitele podle známek za období (aspoň 2 zápasy). */
export function bestRatedPlayers(state: GameState, from: string, to: string, n = 3): { id: string; name: string; avg: number; apps: number }[] {
  const ownId = state.owner.clubId;
  const acc = new Map<string, { sum: number; n: number; name: string }>();
  for (const { fixture: f } of allFixtures(state)) {
    if (!f.result?.detail || f.date < from || f.date >= to) continue;
    if (f.homeId !== ownId && f.awayId !== ownId) continue;
    const side = f.homeId === ownId ? f.result.detail.home : f.result.detail.away;
    for (const l of [...side.lineup, ...side.bench]) {
      if (!l.rating || l.minutes < 30) continue;
      const a = acc.get(l.id) ?? { sum: 0, n: 0, name: l.name };
      a.sum += l.rating;
      a.n += 1;
      acc.set(l.id, a);
    }
  }
  const min = Math.max(...[...acc.values()].map((a) => a.n), 0) >= 2 ? 2 : 1;
  return [...acc.entries()]
    .filter(([id, a]) => a.n >= min && state.players[id]?.clubId === ownId)
    .map(([id, a]) => ({ id, name: a.name, avg: a.sum / a.n, apps: a.n }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, n);
}

function seasonMoments(state: GameState): { id: string; label: string; weight: number }[] {
  const ownId = state.owner.clubId;
  const out: { id: string; label: string; weight: number }[] = [];
  const from = `${state.season}-07-01`;
  const fixtures: Fixture[] = allFixtures(state)
    .map((x) => x.fixture)
    .filter((f) => f.result && f.date >= from && (f.homeId === ownId || f.awayId === ownId));
  const margin = (f: Fixture) => (f.homeId === ownId ? 1 : -1) * (f.result!.homeGoals - f.result!.awayGoals);
  const label = (f: Fixture) => `${state.clubs[f.homeId]?.shortName ?? '?'} – ${state.clubs[f.awayId]?.shortName ?? '?'} ${f.result!.homeGoals}:${f.result!.awayGoals}`;
  for (const f of fixtures.filter((x) => margin(x) > 0).sort((a, b) => margin(b) - margin(a)).slice(0, 2)) {
    out.push({ id: f.id, label: `Výhra ${label(f)}`, weight: 1 + margin(f) * 0.3 });
  }
  for (const t of (state.trophies ?? []).filter((t) => t.season === state.season && t.clubId === ownId && ['titul', 'pohar', 'postup', 'evropa'].includes(t.kind))) {
    out.push({ id: `t-${t.kind}`, label: t.text, weight: 2.5 });
  }
  const run = state.europe?.run;
  if (run && run.season === state.season && run.clubId === ownId) {
    const best = run.matches.filter((m) => m.result && m.result.own > m.result.opp).sort((a, b) => b.opponent.rating - a.opponent.rating)[0];
    if (best) out.push({ id: best.id, label: `Evropská výhra nad ${best.opponent.name} ${best.result!.own}:${best.result!.opp}`, weight: 2 });
  }
  return out.slice(0, 3);
}

/** Otevře anketu (vrací false, když teď nejde – běží jiná nebo chybí možnosti). */
export function openPoll(state: GameState, kind: PollKind, force = false): boolean {
  const f = fs(state);
  if (f.poll && !f.poll.winner && !force) return false;
  if (f.commitment && kind !== 'hrac' && !force) return false;
  let question = '';
  let options: FanPoll['options'] = [];
  if (kind === 'dres') {
    question = 'Jak má vypadat nový dres?';
    const opts = [
      { id: 'klasika', label: 'Klasika v klubových barvách', w: 1.3 },
      { id: 'retro', label: 'Retro podle slavné éry', w: 1.2 },
      { id: 'odvazny', label: 'Odvážný design s pruhy', w: 0.8 },
    ];
    const sh = shares(state, opts.map((o) => o.id), opts.map((o) => o.w), `dres-${state.date}`);
    options = opts.map((o, i) => ({ id: o.id, label: o.label, share: sh[i] }));
  } else if (kind === 'hymna') {
    question = 'Kterou verzi hymny hrát před zápasy?';
    const opts = [
      { id: 'kapela', label: 'Rocková verze místní kapely', w: 1.1 },
      { id: 'chorál', label: 'Chorál z kotle', w: 1.3 },
      { id: 'dechovka', label: 'Tradiční dechovka', w: 0.7 },
    ];
    const sh = shares(state, opts.map((o) => o.id), opts.map((o) => o.w), `hymna-${state.date}`);
    options = opts.map((o, i) => ({ id: o.id, label: o.label, share: sh[i] }));
  } else if (kind === 'hrac') {
    const to = `${state.date.slice(0, 7)}-01`;
    const from = addDays(to, -31).slice(0, 7) + '-01';
    const best = bestRatedPlayers(state, from, to);
    if (best.length < 2) return false;
    const month = new Date(`${from}T00:00:00Z`).toLocaleString('cs-CZ', { month: 'long', timeZone: 'UTC' });
    question = `Hráč měsíce (${month})`;
    const sh = shares(state, best.map((b) => b.id), best.map((b) => Math.pow(b.avg, 3) * (1 + (state.players[b.id]?.goals ?? 0) * 0.02)), `hrac-${state.date}`);
    options = best.map((b, i) => ({ id: b.id, playerId: b.id, label: `${b.name} (známka ${b.avg.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })})`, share: sh[i] }));
  } else {
    const ms = seasonMoments(state);
    if (ms.length < 2) return false;
    question = 'Nejkrásnější moment sezóny';
    const sh = shares(state, ms.map((m) => m.id), ms.map((m) => m.weight), `moment-${state.date}`);
    options = ms.map((m, i) => ({ id: m.id, label: m.label, share: sh[i] }));
  }
  f.poll = { id: nextId(state, 'anketa'), kind, question, options, opened: state.date, closes: addDays(state.date, POLL_DAYS) };
  f.pollCount = (f.pollCount ?? 0) + 1;
  return true;
}

function closePoll(state: GameState): void {
  const f = fs(state);
  const p = f.poll!;
  const win = [...p.options].sort((a, b) => b.share - a.share)[0];
  p.winner = win.id;
  const s = fanScale(state);
  const due = addDays(state.date, 14);
  if (p.kind === 'hrac') {
    const until = addDays(state.date, 60);
    f.promises = [...(f.promises ?? []).filter((x) => x.until > state.date && x.playerId !== win.id), { playerId: win.id, name: win.label.replace(/ \(.*$/, ''), from: state.date, until }];
    const pl = state.players[win.id];
    if (pl) pl.morale = clamp(pl.morale + 5, 0, 100);
    mood(state, 1);
    addNews(state, { kind: 'info', title: `Hráčem měsíce je ${f.promises[f.promises.length - 1].name}`, text: `Fanoušci rozhodli (${win.share} % hlasů). Slib: do ${fmt(until)} hráče neprodáte ani nepošlete na hostování, jinak to fanoušky naštve.` });
    log(state, `Hráč měsíce: ${win.label.replace(/ \(.*$/, '')} (${win.share} %).`);
    return;
  }
  if (p.kind === 'dres') {
    f.commitment = { id: p.id, kind: 'dres', label: `Dres podle ankety: ${win.label.toLowerCase()}`, due, cost: 0, breakGain: roundTo(500_000 * s, 10_000), respectLabel: 'Vyrobit podle fanoušků', breakLabel: 'Vzít návrh sponzora' };
  } else if (p.kind === 'hymna') {
    f.commitment = { id: p.id, kind: 'hymna', label: `Hymna: ${win.label.toLowerCase()}`, due, cost: 0, breakGain: roundTo(250_000 * s, 10_000), respectLabel: 'Hrát vítěznou verzi', breakLabel: 'Hrát verzi sponzora' };
  } else {
    f.commitment = { id: p.id, kind: 'moment', label: `Malba na tribuně: ${win.label}`, due, cost: roundTo(120_000 * s, 10_000), breakGain: 0, respectLabel: 'Namalovat', breakLabel: 'Nedělat nic' };
  }
  addNews(state, { kind: 'info', title: `Anketa fanoušků: ${win.label}`, text: `${p.question} Vyhrálo „${win.label}“ (${win.share} %). Výsledek je pro klub závazek, rozhodněte na Přehledu do ${fmt(due)}.` });
}

function fmt(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(d)}. ${Number(m)}.`;
}

export type CommitmentChoice = 'splnit' | 'porusit';

function applyCommitment(state: GameState, choice: CommitmentChoice): string {
  const f = fs(state);
  const c = f.commitment!;
  f.commitment = undefined;
  const s = fanScale(state);
  if (choice === 'splnit') {
    if (c.cost) book(state, state.owner.clubId, 'komunita', -c.cost, c.label);
    if (c.kind === 'dres') {
      mood(state, 2);
      f.perks = [...(f.perks ?? []), { kind: 'dres', label: 'Dres podle fanoušků', until: addDays(state.date, 300), monthly: roundTo(60_000 * s, 5_000), category: 'fanshop' }];
    } else if (c.kind === 'hymna') {
      mood(state, 2);
      changeUltras(state, 3);
    } else {
      mood(state, 2);
      changeCity(state, 1);
    }
    const text = `Závazek splněn: ${c.label}. Fanoušci oceňují, že jejich hlas platí.`;
    log(state, text);
    return text;
  }
  if (c.breakGain) book(state, state.owner.clubId, 'komercni', c.breakGain, `${c.breakLabel} (místo výsledku ankety)`);
  mood(state, c.kind === 'moment' ? -3 : -5);
  changeUltras(state, c.kind === 'hymna' ? -6 : c.kind === 'dres' ? -4 : -2);
  if (c.kind !== 'moment') media(state, -1);
  const text = `Výsledek ankety jste nedodrželi (${c.label.toLowerCase()}). Fanoušci se cítí podvedení.`;
  addNews(state, { kind: 'varovani', title: 'Fanoušci: „Proč hlasujeme, když to neplatí?“', text });
  log(state, text);
  return text;
}

export function commitmentDecide(prev: GameState, choice: CommitmentChoice): ActionResult {
  const c = prev.fans?.commitment;
  if (!c) return { state: prev, ok: false, message: 'Žádný závazek z ankety.' };
  if (choice === 'splnit' && c.cost > own(prev).finance.balance) return { state: prev, ok: false, message: `Na to klub nemá peníze (${kc(c.cost)}).` };
  const state = structuredClone(prev);
  return { state, ok: true, message: applyCommitment(state, choice) };
}

function checkPromises(state: GameState): void {
  const f = fs(state);
  if (!f.promises?.length) return;
  const ownId = state.owner.clubId;
  const keep: FanPromise[] = [];
  for (const p of f.promises) {
    const left = (state.transferLog ?? []).find((t) => t.playerId === p.playerId && t.fromId === ownId && t.date >= p.from && (t.kind === 'prestup' || t.kind === 'hostovani' || t.kind === 'zahranici'));
    if (left) {
      mood(state, -6);
      changeUltras(state, -5);
      addNews(state, { kind: 'varovani', title: `Fanoušci: prodali jste hráče měsíce`, text: `${p.name} odešel, ačkoli jste slíbili, že do ${fmt(p.until)} zůstane. Nálada −6, kotel −5.` });
      log(state, `Slib porušen: ${p.name} odešel.`);
      continue;
    }
    if (p.until > state.date) keep.push(p);
  }
  f.promises = keep;
}

// ---------- Výjezdy (bod 11) ----------

export type TripChoice = 'nic' | 'autobusy' | 'vlak';

export interface TripOption {
  id: TripChoice;
  label: string;
  fans: number;
  cost: number;
  /** O kolik se sníží domácí výhoda soupeře (body síly). */
  edge: number;
  hint: string;
}

/** Výjezd na velký venkovní zápas (derby, Evropa): co jde dotovat. Pro kartu fanoušků i odpočet zápasu. */
export function awayTripOption(state: GameState, big: BigMatch | undefined = upcomingBigMatch(state)): { match: BigMatch; options: TripOption[]; chosen: TripChoice } | undefined {
  if (!big || big.home || (big.kind !== 'derby' && big.kind !== 'evropa')) return undefined;
  if (big.date <= state.date) return undefined;
  const club = own(state);
  const euro = big.kind === 'evropa';
  const base = clamp(Math.round((club.stadium.capacity * 0.04) / 50) * 50, 100, 1500);
  const small = euro ? Math.round(base * 0.4 / 50) * 50 || 50 : base;
  const large = euro ? small * 2 : base * 2;
  const perSmall = euro ? 2_500 : 300;
  const perLarge = euro ? 4_500 : 500;
  const discount = fansOf(state).trainDiscount ? 0.5 : 1;
  const options: TripOption[] = [
    { id: 'nic', label: 'Nechat na fanoušcích', fans: Math.round(small * 0.4), cost: 0, edge: 0, hint: 'bez nákladů, pojede jen jádro kotle' },
    { id: 'autobusy', label: euro ? 'Dotovat letenky' : 'Dotovat autobusy', fans: small, cost: roundTo(small * perSmall, 10_000), edge: euro ? 0.2 : 0.35, hint: euro ? 'kotel +4, nálada +1' : 'menší výhoda domácích, kotel +4' },
    { id: 'vlak', label: euro ? 'Charterový let' : `Zvláštní vlak${discount < 1 ? ' (sleva)' : ''}`, fans: large, cost: roundTo(large * perLarge * (euro ? 1 : discount), 10_000), edge: euro ? 0.4 : 0.7, hint: euro ? 'kotel +8, nálada +2, pověst v Evropě' : 'citelně menší výhoda domácích, kotel +8' },
  ];
  const t = fansOf(state).trip;
  return { match: big, options, chosen: t && t.matchId === big.id ? t.choice : 'nic' };
}

export function setAwayTrip(prev: GameState, choice: TripChoice): ActionResult {
  const opt = awayTripOption(prev);
  if (!opt) return { state: prev, ok: false, message: 'Teď není velký venkovní zápas, na který by šlo jet.' };
  const o = opt.options.find((x) => x.id === choice)!;
  if (o.cost > own(prev).finance.balance) return { state: prev, ok: false, message: `Na to klub nemá peníze (${kc(o.cost)}).` };
  const state = structuredClone(prev);
  const f = fs(state);
  f.trip = choice === 'nic' ? undefined : { matchId: opt.match.id, date: opt.match.date, choice, fans: o.fans, cost: o.cost, label: opt.match.label };
  return { state, ok: true, message: choice === 'nic' ? 'Výjezd necháte na fanoušcích.' : `${o.label}: pojede asi ${o.fans.toLocaleString('cs-CZ')} fanoušků, klub zaplatí ${kc(o.cost)} v den zápasu.` };
}

/** Snížení domácí výhody soupeře díky výjezdu fanoušků klubu majitele (jen ligové a pohárové zápasy). */
export function awayTripEdge(state: GameState, f: Fixture): number {
  const t = state.fans?.trip;
  if (!t || t.matchId !== f.id || f.awayId !== state.owner.clubId) return 0;
  return t.choice === 'vlak' ? 0.7 : t.choice === 'autobusy' ? 0.35 : 0;
}

function settleTrip(state: GameState): void {
  const f = fs(state);
  const t = f.trip;
  if (!t || t.date > state.date) return;
  f.trip = undefined;
  const euro = t.matchId.startsWith('eu-');
  const fx = euro ? undefined : allFixtures(state).find((x) => x.fixture.id === t.matchId)?.fixture;
  const em = euro ? findEuroMatch(state, t.matchId)?.match : undefined;
  if (!fx?.result && !em?.result) return; // zápas se neodehrál (odklad): nic se neplatí
  book(state, state.owner.clubId, 'komunita', -t.cost, `Výjezd fanoušků: ${t.label}`);
  const big = t.choice === 'vlak';
  changeUltras(state, big ? 8 : 4);
  mood(state, big ? 2 : 1);
  if (big && t.choice === 'vlak' && !euro) f.trainDiscount = false;
  if (euro && big) media(state, 1);
  const won = fx ? (fx.awayId === state.owner.clubId ? fx.result!.awayGoals > fx.result!.homeGoals : fx.result!.homeGoals > fx.result!.awayGoals) : em!.result!.own > em!.result!.opp;
  const text = `Výjezd: ${t.fans.toLocaleString('cs-CZ')} fanoušků podpořilo tým (${t.label}). ${won ? 'Po výhře slavili s hráči u plotu.' : 'Hráči jim po zápase přišli poděkovat.'} Kotel +${big ? 8 : 4}.`;
  addNews(state, { kind: 'info', title: `Výjezd fanoušků: ${t.label}`, text });
  log(state, text);
}

// ---------- Oslavy (bod 12) ----------

export type CelebrationChoice = 'velka' | 'skromna' | 'zadna';

export function celebrationCost(state: GameState, choice: CelebrationChoice): number {
  const big = fansOf(state).celebration?.big ?? false;
  const s = fanScale(state) * (big ? 1.5 : 1);
  return choice === 'velka' ? roundTo(1_200_000 * s, 10_000) : choice === 'skromna' ? roundTo(200_000 * s, 10_000) : 0;
}

function checkCelebration(state: GameState): void {
  const f = fs(state);
  const all = state.trophies ?? [];
  if (f.seenTrophies === undefined) {
    f.seenTrophies = all.length;
    return;
  }
  const fresh = all.slice(f.seenTrophies).filter((t) => t.clubId === state.owner.clubId);
  f.seenTrophies = all.length;
  const order: [string, string, boolean][] = [
    ['titul', 'titul', true],
    ['evropa', 'evropský triumf', true],
    ['pohar', 'pohár', true],
    ['postup', 'postup', false],
  ];
  for (const [kind, reason, big] of order) {
    const t = fresh.find((x) => x.kind === kind && (kind !== 'evropa' || x.text.startsWith('Vítěz')));
    if (t) {
      startCelebration(state, reason, t.text, big);
      return;
    }
  }
}

function startCelebration(state: GameState, reason: string, label: string, big: boolean): void {
  const f = fs(state);
  if (f.celebration) return;
  f.celebration = { reason, label, deadline: addDays(state.date, 7), big };
  addNews(state, { kind: 'sezona', title: `Fanoušci chtějí slavit ${reason} na náměstí`, text: `${label}. Rozhodněte na Přehledu, jak velká oslava bude (do ${fmt(f.celebration.deadline)}).` });
}

/** Záchrana: den po konci sezóny, když byl cíl záchrana (nebo klub hrál dole) a nesestoupil. */
function checkSurvival(state: GameState): void {
  const last = state.history[state.history.length - 1];
  if (!last || last.season !== state.season) return;
  const comp = state.competitions[last.ownerClub.competitionId];
  const now = competitionOf(state, state.owner.clubId);
  if (!comp || !now || now.tier !== comp.tier) return;
  const n = comp.clubIds.length;
  const low = last.ownerClub.position > n - 4;
  if (state.owner.seasonGoal !== 'zachrana' && !low) return;
  if ((state.trophies ?? []).some((t) => t.season === state.season && t.clubId === state.owner.clubId && ['titul', 'pohar', 'postup'].includes(t.kind))) return;
  startCelebration(state, 'záchranu', `${comp.name}: záchrana (${last.ownerClub.position}. místo)`, false);
}

function applyCelebration(state: GameState, choice: CelebrationChoice): string {
  const f = fs(state);
  const c = f.celebration!;
  const cost = celebrationCost(state, choice);
  f.celebration = undefined;
  const k = c.big ? 1.5 : 1;
  let text: string;
  if (choice === 'velka') {
    book(state, state.owner.clubId, 'komunita', -cost, `Oslava na náměstí: ${c.reason}`);
    book(state, state.owner.clubId, 'fanshop', roundTo(cost * 0.25, 5_000), 'Oslava na náměstí: suvenýry a dresy');
    mood(state, Math.round(6 * k));
    changeCity(state, 6);
    changeUltras(state, 5);
    media(state, 4);
    text = `Náměstí bylo plné: pódium, ohňostroj, hráči s trofejí na balkoně radnice. Fanoušci na ${c.reason} nezapomenou.`;
  } else if (choice === 'skromna') {
    book(state, state.owner.clubId, 'komunita', -cost, `Oslava se fanoušky: ${c.reason}`);
    mood(state, 3);
    changeCity(state, 3);
    changeUltras(state, 2);
    media(state, 1);
    text = `Hráči slavili ${c.reason} s fanoušky před stadionem. Skromně, ale od srdce.`;
  } else {
    mood(state, -3);
    changeCity(state, -2);
    media(state, -2);
    text = `Klub ${c.reason} oficiálně neoslavil. Fanoušci slavili sami a média se ptají proč.`;
  }
  addNews(state, { kind: choice === 'zadna' ? 'varovani' : 'info', title: choice === 'zadna' ? 'Bez oficiální oslavy' : `Oslava: ${c.reason}`, text });
  log(state, text);
  return text;
}

export function celebrate(prev: GameState, choice: CelebrationChoice): ActionResult {
  if (!prev.fans?.celebration) return { state: prev, ok: false, message: 'Teď není co slavit.' };
  const cost = celebrationCost(prev, choice);
  if (cost > own(prev).finance.balance) return { state: prev, ok: false, message: `Na to klub nemá peníze (${kc(cost)}).` };
  const state = structuredClone(prev);
  return { state, ok: true, message: applyCelebration(state, choice) };
}

// ---------- Denní běh ----------

function monthlyPerks(state: GameState): void {
  const f = fs(state);
  if (!f.perks?.length) return;
  const keep: FanPerk[] = [];
  for (const p of f.perks) {
    if (p.until <= state.date) continue;
    if (p.monthly) book(state, state.owner.clubId, p.category ?? 'fanshop', p.monthly, p.label);
    if (p.fanMood) mood(state, p.fanMood);
    keep.push(p);
  }
  f.perks = keep;
}

/** Denně (volá processDay po zápasech dne): rada, ankety, výjezdy, oslavy a výchozí volby. */
export function dailyFans(state: GameState): void {
  if (state.gameOver || state.owner.ousted) return;
  const f = fs(state);
  const md = state.date.slice(5);
  const day = Number(state.date.slice(8));
  const month = Number(state.date.slice(5, 7));
  settleTrip(state);
  checkCelebration(state);
  if (md === '06-21') checkSurvival(state);
  checkPromises(state);
  if (day === 1) monthlyPerks(state);
  // Výchozí volby po termínu.
  if (f.celebration && f.celebration.deadline <= state.date) {
    const choice: CelebrationChoice = celebrationCost(state, 'skromna') <= own(state).finance.balance ? 'skromna' : 'zadna';
    applyCelebration(state, choice);
  }
  if (f.council && f.council.deadline <= state.date) applyCouncil(state, f.council.postponed ? 'odmitnout' : 'odlozit');
  if (f.commitment && f.commitment.due <= state.date) applyCommitment(state, f.commitment.cost <= own(state).finance.balance ? 'splnit' : 'porusit');
  if (f.poll && !f.poll.winner && f.poll.closes <= state.date) closePoll(state);
  if (f.poll?.winner && addDays(f.poll.closes, 10) <= state.date) f.poll = undefined;
  // Nové věci (rozprostřené do měsíce, aby nepřišlo všechno najednou).
  if (day === 4 && COUNCIL_MONTHS.includes(month) && !f.council) {
    const idea = pickIdea(state);
    if (idea) {
      f.council = { idea, offered: state.date, deadline: addDays(state.date, 14), legend: idea === 'tribuna' ? legendName(state) : undefined };
      addNews(state, { kind: 'info', title: `Fanouškovská rada: ${FAN_IDEAS[idea].title}`, text: 'Nápad čeká na Přehledu v kartě Fanoušci. Když nerozhodnete do dvou týdnů, odloží se.' });
    }
  }
  if (day === 2 && [8, 9, 10, 11, 12, 3, 4, 5, 6].includes(month)) openPoll(state, 'hrac');
  if (md === '07-12' && f.lastDresSeason !== state.season && !(f.ideasDone?.retro && f.ideasDone.retro >= `${state.season}-01-01`)) {
    if (openPoll(state, 'dres')) f.lastDresSeason = state.season;
  }
  if (md === '06-24') openPoll(state, 'moment');
}

// ---------- Pro kartu ----------

export function fansSummary(state: GameState): { mood: number; ultras: number; city: number } {
  return { mood: Math.round(own(state).fanMood), ultras: Math.round(state.ultras?.relation ?? 55), city: Math.round(state.city?.relation ?? 50) };
}
