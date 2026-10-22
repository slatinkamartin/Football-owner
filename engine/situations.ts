import { addDays, dayOfWeek, formatDate } from './calendar';
import { freshOwnMatch, matchesWord, minutesSince, ownMatchesSince, seasonFacts, type OwnMatchFacts, type SeasonFacts } from './facts';
import { annualCosts, bonusPerPoint, book } from './finance';
import { fine, league, media } from './grey';
import { playerAge, squadOf } from './players';
import type { Rng } from './rng';
import { coachOf } from './staff';
import { computeTable } from './standings';
import { changeUltras } from './surroundings';
import type { GameEvent, GameState, Player, Position } from './types';
import { addNews, clamp, competitionOf, hash01, plural, tierOf, transferWindow } from './world';

/**
 * R1: Situace z dat. Každé rozhodnutí má konkrétní příčinu ve hře (fakta z engine/facts.ts),
 * cituje ji a zvolená odpověď se propíše zpět do dat (důvěra, morálka, minuty mladých, peníze…).
 *
 * Tři části:
 * 1. Sliby majitele s měřítkem a termínem (`addPromise`, `activePromises`, `promiseStatus`).
 * 2. Týdenní limit rozhodnutí (`decisionBudgetLeft`): nejvýš 1–2 rozhodnutí týdně, přednost mají situace z dat.
 * 3. Katalog situací a fronta: den po zápase (a v pondělí) se spočítají kandidáti, ohodnotí se závažnost
 *    a vznikne nejvýš jedno rozhodnutí; drobnosti jen jako zprávy.
 */

// ---------- Stav ----------

export type PromiseMetric =
  /** Minuty hráčů do 21 let od slibu. */
  | 'youthMinutes'
  /** Minuty konkrétního hráče od slibu. */
  | 'playerMinutes'
  /** Góly konkrétního hráče od slibu. */
  | 'playerGoals'
  /** Nový hráč v kádru (volitelně na pozici) do termínu. */
  | 'signing'
  /** Trenér zůstane ve funkci do termínu. */
  | 'coachKept'
  /** Hráč podepíše novou (delší) smlouvu do termínu. */
  | 'contractSigned'
  /** Body ze zápasů od slibu. */
  | 'points'
  /** Výhry od slibu. */
  | 'wins'
  /** Výhry venku od slibu. */
  | 'awayWins'
  /** Pozice v tabulce k termínu (target = nejhorší přijatelné místo). */
  | 'position'
  /** Nálada fanoušků aspoň target k termínu. */
  | 'fanMood'
  /** Vyhodnotí volající sám přes `settlePromise`. */
  | 'manual';

/** Komu byl slib dán: podle toho dopadne splnění i porušení. */
export type PromiseStake = 'fanousci' | 'kabina' | 'trener' | 'media' | 'hrac';

export interface OwnerPledge {
  id: string;
  /** Druh slibu (volný řetězec, např. 'mladi', 'posila', 'podpora-trenera', 'forum', 'tiskovka'). */
  kind: string;
  /** Znění slibu pro zprávy a kartu (česky, „Slíbili jste …“ se nepíše, jen obsah). */
  text: string;
  metric: PromiseMetric;
  target: number;
  /** Termín (YYYY-MM-DD) včetně. */
  until: string;
  made: string;
  /** Měří se jen v prvních N zápasech od slibu (u výher venku N venkovních). */
  matches?: number;
  playerId?: string;
  position?: Position;
  staffId?: string;
  /** Výchozí hodnota v době slibu (smlouva hráče, hráči v kádru apod.). */
  baseline?: number;
  known?: string[];
  stake: PromiseStake;
  /** Váha dopadu (1 = běžný slib). */
  weight: number;
  /** Odměna vyplacená klubem při splnění (např. prémie za sérii). */
  reward?: number;
  /** Odkud slib pochází (šablona situace, fórum, tiskovka…). */
  source?: string;
  status: 'bezi' | 'splneno' | 'poruseno';
  resolved?: string;
}

export interface PromiseInput {
  kind: string;
  text: string;
  metric: PromiseMetric;
  target: number;
  until: string;
  matches?: number;
  playerId?: string;
  position?: Position;
  staffId?: string;
  stake?: PromiseStake;
  weight?: number;
  reward?: number;
  source?: string;
}

export interface PromiseProgress {
  status: OwnerPledge['status'];
  current: number;
  target: number;
  /** 0–1 */
  progress: number;
  daysLeft: number;
  /** Krátký popis stavu, např. „Minuty mladých: 210 z 450“. */
  label: string;
}

export interface SituationsState {
  promises: OwnerPledge[];
  /** Vzniklá rozhodnutí (všechna, i z jiných systémů) pro týdenní limit. */
  log: { id: string; date: string; template: string }[];
  /** Kdy naposledy vznikla situace / klíč (cooldown). */
  last: Record<string, string>;
  /** Sledování nového trenéra (efekt nového trenéra). */
  coach?: { id: string; since: string };
}

export function situationsOf(state: GameState): SituationsState {
  state.situations ??= { promises: [], log: [], last: {} };
  state.situations.promises ??= [];
  state.situations.log ??= [];
  state.situations.last ??= {};
  return state.situations;
}

// ---------- Drobné pomocníky ----------

const own = (s: GameState) => s.clubs[s.owner.clubId];
const squad = (s: GameState) => squadOf(s, s.owner.clubId);
const pName = (p: Pick<Player, 'firstName' | 'lastName'>) => `${p.firstName} ${p.lastName}`;
const fmt = (v: number) => `${Math.round(v).toLocaleString('cs-CZ')} Kč`;
const dec = (v: number) => v.toLocaleString('cs-CZ', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);
const POS_LABEL: Record<Position, string> = { GK: 'brankář', DF: 'obránce', MF: 'záložník', FW: 'útočník' };
const POS_ACC: Record<Position, string> = { GK: 'brankáře', DF: 'obránce', MF: 'záložníka', FW: 'útočníka' };

function fans(s: GameState, d: number): void {
  own(s).fanMood = clamp(own(s).fanMood + d, 0, 100);
}
function teamMorale(s: GameState, d: number): void {
  for (const p of squad(s)) p.morale = clamp(p.morale + d, 0, 100);
}
function morale(s: GameState, id: string | undefined, d: number): void {
  const p = id ? s.players[id] : undefined;
  if (p) p.morale = clamp(p.morale + d, 0, 100);
}
function trust(s: GameState, d: number): void {
  s.owner.trust.trener = clamp(s.owner.trust.trener + d, 0, 100);
}
/** Měřítko částek podle velikosti klubu. */
function scale(s: GameState): number {
  return Math.max(0.25, annualCosts(own(s), tierOf(s, s.owner.clubId)) / 70_000_000);
}
function money(s: GameState, base: number): number {
  return Math.max(20_000, Math.round((base * scale(s)) / 10_000) * 10_000);
}
function pay(s: GameState, amount: number, note: string): void {
  book(s, s.owner.clubId, 'ostatni', -amount, note);
}
/** Konec nejbližšího (nebo právě otevřeného) přestupního okna. */
export function windowEnd(date: string): string {
  const y = Number(date.slice(0, 4));
  const md = date.slice(5);
  if (md <= '02-14') return `${y}-02-14`;
  if (md <= '08-31') return `${y}-08-31`;
  return `${y + 1}-02-14`;
}
/** Konec aktuální poloviny sezóny (podzim / jaro). */
export function halfEnd(date: string): string {
  const y = Number(date.slice(0, 4));
  return date.slice(5) >= '07-01' ? `${y}-12-15` : `${y}-06-15`;
}
function resultWord(m: OwnMatchFacts): string {
  return `${m.home ? 'doma s' : 'venku na hřišti'} ${m.opponentName} ${m.gf}:${m.ga}`;
}

// ---------- 1. Sliby ----------

/** Zaregistruje slib majitele (mění stav). Vrací vytvořený slib. */
export function addPromise(state: GameState, input: PromiseInput): OwnerPledge {
  const sit = situationsOf(state);
  const p: OwnerPledge = {
    id: `sl${++state.nextId}`,
    kind: input.kind,
    text: input.text,
    metric: input.metric,
    target: input.target,
    until: input.until,
    made: state.date,
    matches: input.matches,
    playerId: input.playerId,
    position: input.position,
    staffId: input.staffId ?? (input.metric === 'coachKept' ? coachOf(state, state.owner.clubId)?.id : undefined),
    stake: input.stake ?? defaultStake(input.metric),
    weight: input.weight ?? 1,
    reward: input.reward,
    source: input.source,
    status: 'bezi',
  };
  if (p.metric === 'signing') p.known = squad(state).map((x) => x.id);
  if (p.metric === 'contractSigned' && p.playerId) p.baseline = state.players[p.playerId]?.contractUntil;
  sit.promises = [...sit.promises, p];
  return p;
}

function defaultStake(metric: PromiseMetric): PromiseStake {
  if (metric === 'youthMinutes' || metric === 'signing' || metric === 'position' || metric === 'fanMood') return 'fanousci';
  if (metric === 'coachKept') return 'trener';
  if (metric === 'playerMinutes' || metric === 'contractSigned' || metric === 'playerGoals') return 'hrac';
  return 'kabina';
}

/** Běžící sliby majitele (nejbližší termín první). */
export function activePromises(state: GameState): OwnerPledge[] {
  return (state.situations?.promises ?? []).filter((p) => p.status === 'bezi').sort((a, b) => (a.until < b.until ? -1 : 1));
}

/** Všechny sliby této sezóny (i vyhodnocené), pro navazující příběhy. */
export function seasonPromises(state: GameState): OwnerPledge[] {
  return (state.situations?.promises ?? []).filter((p) => p.made >= `${state.season}-07-01` || p.status === 'bezi');
}

/** Stav slibu podle dat hry (nemění stav). */
export function promiseStatus(state: GameState, p: OwnerPledge): PromiseProgress {
  const daysLeft = Math.max(0, daysBetween(state.date, p.until));
  const expired = state.date > p.until;
  const out = (current: number, label: string, done: boolean, broken: boolean): PromiseProgress => ({
    status: p.status !== 'bezi' ? p.status : done ? 'splneno' : broken ? 'poruseno' : 'bezi',
    current,
    target: p.target,
    progress: p.target > 0 ? clamp(current / p.target, 0, 1) : done ? 1 : 0,
    daysLeft,
    label,
  });
  const matches = () => {
    const all = ownMatchesSince(state, p.made);
    return p.matches ? all.slice(0, p.matches) : all;
  };
  const windowDone = (n: number) => !!p.matches && n >= p.matches;
  switch (p.metric) {
    case 'youthMinutes': {
      const ms = matches();
      const until = p.matches && ms.length >= p.matches ? ms[ms.length - 1].date : state.date;
      const v = minutesSinceUntil(state, p.made, until, { maxAge: 21 });
      return out(v, `Minuty hráčů do 21 let: ${v} z ${p.target}${p.matches ? ` (zápasy ${ms.length}/${p.matches})` : ''}`, v >= p.target, (expired || windowDone(ms.length)) && v < p.target);
    }
    case 'playerMinutes': {
      const v = p.playerId ? minutesSince(state, p.made, { playerId: p.playerId }) : 0;
      const gone = !!p.playerId && state.players[p.playerId]?.clubId !== state.owner.clubId;
      return out(v, `Odehrané minuty: ${v} z ${p.target}`, v >= p.target, (expired || gone) && v < p.target);
    }
    case 'playerGoals': {
      const ms = matches();
      const v = ms.reduce((a, m) => a + m.scorers.filter((x) => x.playerId === p.playerId).length, 0);
      return out(v, `Góly: ${v} z ${p.target}${p.matches ? ` (zápasy ${ms.length}/${p.matches})` : ''}`, v >= p.target, (expired || windowDone(ms.length)) && v < p.target);
    }
    case 'signing': {
      const known = new Set(p.known ?? []);
      const v = squad(state).filter((x) => !known.has(x.id) && x.academy !== state.owner.clubId && (!p.position || x.position === p.position)).length;
      return out(v, `Nové posily${p.position ? ` (${POS_LABEL[p.position]})` : ''}: ${v} z ${p.target}`, v >= p.target, expired && v < p.target);
    }
    case 'coachKept': {
      const c = coachOf(state, state.owner.clubId);
      const kept = !!c && c.id === p.staffId;
      return out(kept ? 1 : 0, kept ? `Trenér ve funkci, zbývá ${daysLeft} dní` : 'Trenér už ve funkci není', kept && expired, !kept);
    }
    case 'contractSigned': {
      const pl = p.playerId ? state.players[p.playerId] : undefined;
      const signed = !!pl && pl.clubId === state.owner.clubId && pl.contractUntil > (p.baseline ?? 0);
      const gone = !pl || pl.clubId !== state.owner.clubId;
      return out(signed ? 1 : 0, signed ? `Smlouva do ${pl!.contractUntil} podepsána` : `Smlouva zatím do ${pl?.contractUntil ?? '–'}`, signed, !signed && (expired || gone));
    }
    case 'points':
    case 'wins': {
      const ms = matches();
      const v = ms.reduce((a, m) => a + (p.metric === 'wins' ? (m.outcome === 'V' ? 1 : 0) : m.outcome === 'V' ? 3 : m.outcome === 'R' ? 1 : 0), 0);
      const what = p.metric === 'wins' ? 'Výhry' : 'Body';
      return out(v, `${what}: ${v} z ${p.target}${p.matches ? ` (zápasy ${ms.length}/${p.matches})` : ''}`, v >= p.target, (expired || windowDone(ms.length)) && v < p.target);
    }
    case 'awayWins': {
      const all = ownMatchesSince(state, p.made).filter((m) => !m.home);
      const ms = p.matches ? all.slice(0, p.matches) : all;
      const v = ms.filter((m) => m.outcome === 'V').length;
      return out(v, `Výhry venku: ${v} z ${p.target}${p.matches ? ` (venku ${ms.length}/${p.matches})` : ''}`, v >= p.target, (expired || windowDone(ms.length)) && v < p.target);
    }
    case 'position': {
      const comp = competitionOf(state, state.owner.clubId);
      const pos = comp ? computeTable(comp, state).findIndex((r) => r.clubId === state.owner.clubId) + 1 : 0;
      return out(pos, `Místo v tabulce: ${pos || '–'}. (cíl ${p.target}. nebo lepší)`, expired && pos > 0 && pos <= p.target, expired && (pos === 0 || pos > p.target));
    }
    case 'fanMood': {
      const v = Math.round(own(state).fanMood);
      return out(v, `Nálada fanoušků: ${v} z ${p.target}`, v >= p.target, expired && v < p.target);
    }
    default:
      return out(0, expired ? 'Termín vypršel' : `Do termínu ${daysLeft} dní`, false, expired);
  }
}

function minutesSinceUntil(state: GameState, after: string, until: string, opts: { maxAge?: number; playerId?: string }): number {
  if (until >= state.date) return minutesSince(state, after, opts);
  // Minuty jen do posledního měřeného zápasu: rozdíl dvou průběžných součtů.
  return minutesSince(state, after, opts) - minutesSince(state, until, opts);
}

const STAKE_TEXT: Record<PromiseStake, [string, string]> = {
  fanousci: ['Fanoušci to oceňují.', 'Fanoušci to berou jako zradu.'],
  kabina: ['Kabina vidí, že slovo platí.', 'Kabina ztrácí víru ve vaše slovo.'],
  trener: ['Trenér ví, že se na vás může spolehnout.', 'Trenér se cítí podražený.'],
  media: ['Novináři uznávají, že jste slovo dodrželi.', 'Novináři připomínají, že jste slovo nedodrželi.'],
  hrac: ['Hráč je spokojený.', 'Hráč je zklamaný.'],
};

function applyStake(state: GameState, p: OwnerPledge, ok: boolean): void {
  const w = p.weight;
  const k = (good: number, bad: number) => Math.round((ok ? good : bad) * w);
  switch (p.stake) {
    case 'fanousci':
      fans(state, k(4, -7));
      media(state, k(1, -2));
      break;
    case 'kabina':
      teamMorale(state, k(3, -5));
      break;
    case 'trener':
      trust(state, k(5, -10));
      if (!ok) media(state, Math.round(-4 * w));
      break;
    case 'media':
      media(state, k(3, -6));
      fans(state, k(1, -3));
      break;
    case 'hrac':
      morale(state, p.playerId, k(10, -15));
      if (!ok) teamMorale(state, -1);
      break;
  }
  if (ok && p.reward) book(state, state.owner.clubId, 'platy', -p.reward, `Slíbená odměna: ${p.text}`);
}

/** Ruční vyhodnocení slibu (metric 'manual' nebo předčasné uzavření). */
export function settlePromise(state: GameState, id: string, ok: boolean, note?: string): void {
  const p = state.situations?.promises.find((x) => x.id === id);
  if (!p || p.status !== 'bezi') return;
  closePromise(state, p, ok, note ?? promiseStatus(state, p).label);
}

function closePromise(state: GameState, p: OwnerPledge, ok: boolean, label: string): void {
  p.status = ok ? 'splneno' : 'poruseno';
  p.resolved = state.date;
  applyStake(state, p, ok);
  addNews(state, {
    kind: ok ? 'info' : 'varovani',
    title: ok ? `Slib splněn: ${p.text}` : `Nesplněný slib: ${p.text}`,
    text: `${label}. ${STAKE_TEXT[p.stake][ok ? 0 : 1]}`,
    playerId: p.playerId && state.players[p.playerId] ? p.playerId : undefined,
  });
}

/** Denně: vyhodnotí běžící sliby podle dat (splněné i porušené). */
export function checkOwnerPromises(state: GameState): void {
  const sit = state.situations;
  if (!sit) return;
  for (const p of sit.promises) {
    if (p.status !== 'bezi' || (p.metric === 'manual' && state.date <= p.until)) continue;
    const st = promiseStatus(state, p);
    if (st.status !== 'bezi') closePromise(state, p, st.status === 'splneno', st.label);
  }
  // Vyhodnocené sliby se drží jednu sezónu (pro navazující příběhy), pak se zapomenou.
  sit.promises = sit.promises.filter((p) => p.status === 'bezi' || (p.resolved ?? p.until) > addDays(state.date, -300));
}

// ---------- 2. Týdenní limit rozhodnutí ----------

/** Kolik rozhodnutí smí vzniknout za 7 dní (klidná hra 1, jinak 2). */
export function weeklyDecisionLimit(state: GameState): number {
  // Běžné tempo: jedno rozhodnutí týdně (navazující kroky příběhů a velká rozhodnutí mimo limit), drama dvě.
  return state.settings?.drama === 'drama' ? 2 : 1;
}

/** Rozhodnutí vzniklá za posledních 7 dní (ze všech systémů). */
export function decisionsLastWeek(state: GameState): number {
  const from = addDays(state.date, -6);
  const ids = new Set<string>();
  for (const l of state.situations?.log ?? []) if (l.date >= from) ids.add(l.id);
  for (const e of state.events) if (e.date >= from) ids.add(e.id);
  return ids.size;
}

/** Kolik rozhodnutí ještě může tento týden vzniknout. Ostatní systémy ho mohou respektovat. */
export function decisionBudgetLeft(state: GameState): number {
  return Math.max(0, weeklyDecisionLimit(state) - decisionsLastWeek(state));
}

/** Zapíše nově otevřená rozhodnutí (ze všech systémů) do deníku pro týdenní limit. */
function recordNewEvents(state: GameState): void {
  const sit = situationsOf(state);
  const known = new Set(sit.log.map((l) => l.id));
  for (const e of state.events) if (!known.has(e.id)) sit.log.push({ id: e.id, date: e.date, template: e.template });
  const from = addDays(state.date, -60);
  sit.log = sit.log.filter((l) => l.date >= from);
}

// ---------- 3. Katalog situací z dat ----------

type Body = Omit<GameEvent, 'id' | 'template' | 'date' | 'expires'>;

interface Candidate {
  /** Šablona bez předpony „sit-“. */
  id: string;
  /** Klíč pro opakování (např. hráč, zápas). */
  key: string;
  severity: number;
  /** Skupina sdílí cooldown (např. útok: sucho střelce i zápasy bez gólu). */
  group?: string;
  /** Citovaný fakt, ze kterého situace vznikla (musí být v textu). */
  fact: string;
  build?: () => Body;
  news?: () => { title: string; text: string; apply?: () => void; playerId?: string };
}

/** Kolik dní se stejná situace (nebo skupina) nezopakuje. */
const SIT_COOLDOWN: Record<string, number> = {
  sucho: 35, brankar: 40, cervena: 21, 'bez-vyhry': 45, odchovanec: 45, 'zraneni-okno': 30, agent: 40, verdikt: 30, venku: 60,
  jistota: 365, 'novy-trener': 60, hattrick: 30, debakl: 30, otocka: 21, serie: 40, sebeuspokojeni: 60, stridani: 35, 'pozdni-gol': 45,
  nejhorsi: 30, 'mladi-minuty': 90, pad: 45, 'zraneni-zapas': 45, xg: 30, 'bez-golu': 45, obrana: 45, skok: 30,
};
const GROUP_COOLDOWN = 21;
const KEY_COOLDOWN = 90;
/** Delší pauza pro stejného hráče (sucho, agent), aby se situace neopakovala každé tři měsíce. */
const KEY_COOLDOWN_BY_ID: Record<string, number> = { sucho: 200, agent: 150, brankar: 120 };
const goalsWord = (n: number) => plural(n, 'gól', 'góly', 'gólů');
const pointsWord = (n: number) => plural(n, 'bod', 'body', 'bodů');

/** Zbývající zápasy klubu v jeho soutěži. */
function remainingFor(s: GameState, clubId: string): number {
  const comp = competitionOf(s, s.owner.clubId);
  return comp ? comp.fixtures.filter((x) => !x.result && (x.homeId === clubId || x.awayId === clubId)).length : 0;
}
const EXPIRES = 6;

function goalsLine(m: OwnMatchFacts): string {
  return m.scorers.length ? m.scorers.map((x) => `${x.name} ${x.minute}.${x.penalty ? ' pen.' : ''}`).join(', ') : 'bez vstřeleného gólu';
}

function healthyAt(s: GameState, pos: Position, except?: string): Player[] {
  return squad(s).filter((p) => p.position === pos && p.id !== except && !(p.injuredUntil && p.injuredUntil > s.date));
}

/** Je cíl (záchrana nebo první místo) matematicky jistý? */
function secured(s: GameState, f: SeasonFacts): 'titul' | 'zachrana' | undefined {
  const comp = competitionOf(s, s.owner.clubId);
  if (!comp || !f.position || !f.teams || f.teams < 6) return undefined;
  const table = computeTable(comp, s);
  const left = (r: (typeof table)[number]) => remainingFor(s, r.clubId);
  const me = table[f.position - 1];
  if (!me || left(me) === 0 || me.played < (me.played + left(me)) * 0.6) return undefined;
  if (f.position === 1) {
    const second = table[1];
    if (second && me.points > second.points + 3 * left(second)) return 'titul';
  }
  // Záchrana: na nás už nedosáhne tým na třetím místě od konce.
  const line = table[f.teams - 3];
  if (f.position < f.teams - 2 && line && me.points > line.points + 3 * left(line)) return 'zachrana';
  return undefined;
}

function collect(s: GameState, m: OwnMatchFacts | undefined, f: SeasonFacts): Candidate[] {
  const c: Candidate[] = [];
  const coach = coachOf(s, s.owner.clubId);
  const coachName = coach ? `${coach.firstName} ${coach.lastName}` : 'trenér';
  const posText = f.position ? `${f.position}. místo` : '';
  const posLoc = f.position ? `${f.position}. místě` : '';
  const big = m && s.bigMatch && s.bigMatch.date === m.date ? s.bigMatch : undefined;
  const sit = situationsOf(s);

  // --- Den po zápase ---
  if (m) {
    const res = resultWord(m);
    const red = m.reds[0];
    if (red && s.players[red.playerId]?.clubId === s.owner.clubId) {
      const p = s.players[red.playerId];
      const fact = `${red.name} dostal v ${red.minute}. minutě červenou kartu (${res})`;
      c.push({
        id: 'cervena', key: `cervena:${m.fixtureId}`, severity: 50 + (big ? 15 : 0), fact,
        build: () => ({
          title: `Červená karta: ${red.name}${big ? ` v zápase ${big.label ?? 's ' + m.opponentName}` : ''}`,
          text: `${fact}. Disciplinárka ho čeká${p.suspension ? ` (zatím ${p.suspension} ${p.suspension === 1 ? 'zápas' : 'zápasy'} stop)` : ''} a kabina sleduje, jak se zachováte.`,
          playerId: red.playerId,
          amount: Math.round(p.wage * 0.3),
          defaultOption: 'trener',
          options: [
            { id: 'pokuta', label: 'Klubová pokuta', hint: `Hráč zaplatí ${fmt(p.wage * 0.3)}, jeho morálka −10, důvěra trenéra +3` },
            { id: 'obhajoba', label: 'Podržet ho u disciplinárky', hint: `Právník za ${fmt(money(s, 60_000))}, šance na kratší trest, morálka hráče +8, pověst u svazu −2` },
            { id: 'trener', label: 'Nechat to na trenérovi', hint: 'Morálka hráče −3, důvěra trenéra +1' },
          ],
        }),
      });
    }
    if (m.hattrick) {
      const h = m.hattrick;
      const p = s.players[h.playerId];
      const mins = m.scorers.filter((x) => x.playerId === h.playerId).map((x) => `${x.minute}.`).join(', ');
      const fact = `${h.name} dal hattrick (${mins} minuta) v zápase ${m.scoreline}`;
      if (p && p.clubId === s.owner.clubId)
        c.push({
          id: 'hattrick', key: `hattrick:${m.fixtureId}`, severity: 48, fact,
          build: () => ({
            title: `Hattrick: ${h.name}`,
            text: `${fact}. V sezóně má ${goalsWord(p.goals)} a jeho agent hned volá. Kabina čeká, jestli klub výkon ocení.`,
            playerId: p.id,
            amount: Math.round(p.wage),
            defaultOption: 'pochvala',
            options: [
              { id: 'bonus', label: 'Mimořádná prémie', hint: `−${fmt(p.wage)}, morálka hráče +12, morálka týmu +1` },
              { id: 'smlouva', label: 'Nabídnout delší smlouvu', hint: `Smlouva o rok delší (do ${Math.max(p.contractUntil, s.season + 1) + 1}), plat +15 %, morálka +10` },
              { id: 'pochvala', label: 'Jen veřejně pochválit', hint: 'Morálka hráče +5, média +2' },
            ],
          }),
        });
    }
    if (m.outcome === 'P' && m.ga - m.gf >= 3) {
      const fact = `Prohra ${res}`;
      c.push({
        id: 'debakl', key: `debakl:${m.fixtureId}`, severity: 55 + 5 * (m.ga - m.gf - 3), fact,
        build: () => ({
          title: `Debakl ${m.gf}:${m.ga}: fanoušci chtějí omluvu`,
          text: `${fact}${m.oppScorers.length ? `, soupeř skóroval v ${m.oppScorers.map((x) => `${x.minute}.`).join(', ')} minutě` : ''}. ${posLoc ? `Tým je na ${posLoc}. ` : ''}Fanoušci tým po zápase vypískali.`,
          amount: money(s, 150_000),
          defaultOption: 'kabina',
          options: [
            { id: 'omluva', label: 'Omluva a levnější vstupné na příští domácí zápas', hint: `Ušlé vstupné asi ${fmt(money(s, 150_000))}, fanoušci +6, média +2` },
            { id: 'premie', label: 'Krátit hráčům prémie', hint: `Úspora ${fmt(money(s, 100_000))}, morálka týmu −8, důvěra trenéra −4, fanoušci +3` },
            { id: 'kabina', label: 'Nechat to v kabině', hint: 'Důvěra trenéra +3, fanoušci −4' },
          ],
        }),
      });
    }
    if (m.outcome !== 'V' && m.lateDecider && !m.lateDecider.own) {
      const fact = `gól soupeře v ${m.lateDecider.minute}. minutě (${res})`;
      c.push({
        id: 'pozdni-gol', key: `pozdni:${m.fixtureId}`, severity: 38, fact,
        build: () => ({
          title: `Body ztracené v ${m.lateDecider!.minute}. minutě`,
          text: `Rozhodl ${fact}. Kondiční trenér upozorňuje, že tým v závěrech zápasů odpadá, a chce posilu do realizačního týmu.`,
          amount: money(s, 250_000),
          defaultOption: 'nic',
          options: [
            { id: 'kondice', label: 'Zaplatit kondičního specialistu', hint: `−${fmt(money(s, 250_000))}, kondice kádru +15 hned, důvěra trenéra +3` },
            { id: 'nic', label: 'Nechat to být', hint: 'Důvěra trenéra −2' },
          ],
        }),
      });
    }
    if (m.earlySub && s.players[m.earlySub.playerId]?.clubId === s.owner.clubId) {
      const e = m.earlySub;
      const fact = `${coachName} stáhl ${e.name} už ve ${e.minute}. minutě (${res})`;
      c.push({
        id: 'stridani', key: `stridani:${m.fixtureId}`, severity: 33, fact,
        build: () => ({
          title: `Střídání ve ${e.minute}. minutě: ${e.name} je naštvaný`,
          text: `${fact}. Hráč odcházel ze hřiště rozčilený a novináři se ptají, co se v kabině děje.`,
          playerId: e.playerId,
          defaultOption: 'nic',
          options: [
            { id: 'trener', label: 'Podpořit trenéra', hint: 'Důvěra trenéra +4, morálka hráče −8' },
            { id: 'hrac', label: 'Promluvit si s hráčem', hint: 'Morálka hráče +8, důvěra trenéra −4' },
            { id: 'nic', label: 'Do sestavy nemluvit', hint: 'Morálka hráče −3' },
          ],
        }),
      });
    }
    if (m.outcome === 'P' && m.worst && m.worst.rating <= 5.0 && s.players[m.worst.playerId]?.clubId === s.owner.clubId) {
      const w = m.worst;
      const fact = `${w.name} dostal za zápas ${m.scoreline} známku ${dec(w.rating)}`;
      c.push({
        id: 'nejhorsi', key: `nejhorsi:${w.playerId}`, severity: 34, fact,
        build: () => ({
          title: `Fanoušci hledají viníka: ${w.name}`,
          text: `${fact}, nejhorší z týmu. Na sítích ho fanoušci označují za viníka porážky.`,
          playerId: w.playerId,
          defaultOption: 'trener',
          options: [
            { id: 'podrzet', label: 'Veřejně ho podržet', hint: 'Morálka hráče +8, fanoušci −2' },
            { id: 'kritika', label: 'Přiznat, že to byl slabý výkon', hint: 'Morálka hráče −10, morálka týmu −1, fanoušci +3, média +1' },
            { id: 'trener', label: 'Nechat to na trenérovi', hint: 'Morálka hráče −2' },
          ],
        }),
      });
    }
    if (m.injuries.length >= 2) {
      const names = m.injuries.map((x) => x.name).join(' a ');
      const lvl = own(s).facilities.medical;
      const fact = `v zápase ${m.scoreline} se zranili ${names}`;
      c.push({
        id: 'zraneni-zapas', key: `zraneni:${m.fixtureId}`, severity: 42 + 5 * (m.injuries.length - 2), fact,
        build: () => ({
          title: `${m.injuries.length} zranění v jednom zápase`,
          text: `Smůla: ${fact}. Fyzioterapeut upozorňuje, že regenerace (úroveň ${lvl} z 5) nestačí.`,
          amount: money(s, 2_000_000),
          defaultOption: 'odlozit',
          options: [
            ...(lvl < 5 ? [{ id: 'koupit', label: 'Koupit vybavení regenerace', hint: `−${fmt(money(s, 2_000_000))}, regenerace +1, morálka týmu +2` }] : []),
            { id: 'externi', label: 'Zaplatit externí fyzioterapii', hint: `−${fmt(money(s, 300_000))}, zranění hráči se vrátí asi o pětinu dřív` },
            { id: 'odlozit', label: 'Zatím nic', hint: 'Morálka týmu −2' },
          ],
          data: { injured: m.injuries.map((x) => x.playerId).join(',') },
        }),
      });
    }
    if (m.academyScorer) {
      const a = m.academyScorer;
      const sc = m.scorers.find((x) => x.playerId === a.playerId);
      const fact = `odchovanec ${a.name} dal gól v ${sc?.minute ?? '?'}. minutě (${res})`;
      const youth = f.youthMinutes;
      const p = s.players[a.playerId];
      if (p && p.clubId === s.owner.clubId)
        c.push({
          id: 'odchovanec', key: `odchovanec:${a.playerId}`, severity: 42 + (youth < 300 ? 10 : 0), fact,
          build: () => ({
            title: `Gól odchovance: ${a.name}`,
            text: `${fact[0].toUpperCase()}${fact.slice(1)}. Hráči do 21 let přitom za posledních 5 zápasů odehráli dohromady ${youth} minut. Fanoušci chtějí vidět víc vlastních hráčů.`,
            playerId: a.playerId,
            defaultOption: 'pochvala',
            options: [
              { id: 'minuty', label: 'Pokyn trenérovi: víc minut pro mladé', hint: `Trenér dá přednost mladým (důvěra −3), fanoušci +4. Slib: aspoň ${Math.max(450, youth + 200)} minut hráčů do 21 let v dalších 5 zápasech` },
              { id: 'smlouva', label: 'Odměnit ho delší smlouvou', hint: `Smlouva do ${Math.min(s.season + 5, Math.max(p.contractUntil, s.season + 1) + 2)}, plat +20 %, morálka +12, fanoušci +2` },
              { id: 'pochvala', label: 'Jen veřejně pochválit', hint: 'Morálka hráče +6, média +1' },
            ],
            data: { youth },
          }),
        });
    }
    if (big && (big.moments ?? []).some((x) => /Neuznaný gól|sporném verdiktu|vykázán/.test(x))) {
      const moment = (big.moments ?? []).find((x) => /Neuznaný gól|sporném verdiktu|vykázán/.test(x))!;
      const fact = `${moment} v zápase ${m.scoreline}`;
      c.push({
        id: 'verdikt', key: `verdikt:${m.fixtureId}`, severity: m.outcome === 'V' ? 30 : 56, fact,
        build: () => ({
          title: 'Sporný verdikt: podat stížnost?',
          text: `${fact}. Fanoušci zuří a novináři čekají na reakci klubu.`,
          defaultOption: 'nic',
          options: [
            { id: 'stiznost', label: 'Podat stížnost komisi rozhodčích', hint: 'Fanoušci +3, pověst u svazu −3; komise může chybu uznat (média +2)' },
            { id: 'kritika', label: 'Ostře kritizovat rozhodčí', hint: `Fanoušci +6, pověst u svazu −12, pokuta asi ${fmt(money(s, 150_000))}` },
            { id: 'nic', label: 'Nechat to být', hint: 'Fanoušci −2, pověst u svazu +2' },
          ],
        }),
      });
    } else if (m.outcome === 'P' && m.xgFor !== undefined && m.xgAgainst !== undefined && m.xgFor - m.xgAgainst >= 1) {
      const fact = `xG ${dec(m.xgFor)} : ${dec(m.xgAgainst)}`;
      c.push({
        id: 'xg', key: `xg:${m.fixtureId}`, severity: 10, fact,
        news: () => ({ title: `Prohra navzdory šancím (${fact})`, text: `${res[0].toUpperCase()}${res.slice(1)}: tým si podle očekávaných gólů (${fact}) zasloužil víc. Trenér věří, že se to obrátí.` }),
      });
    }
    if (m.comeback === 'nase') {
      const last = [...m.scorers].sort((a, b) => b.minute - a.minute)[0];
      const fact = `otočka ${res}${last ? `, rozhodl ${last.name} v ${last.minute}. minutě` : ''}`;
      c.push({
        id: 'otocka', key: `otocka:${m.fixtureId}`, severity: 12, fact,
        news: () => ({
          title: `Otočka ${m.gf}:${m.ga}: tým slaví s kotlem`,
          text: `${fact[0].toUpperCase()}${fact.slice(1)}. Hráči šli děkovat ke kotli (morálka +2, fanoušci +2). Střelci: ${goalsLine(m)}.`,
          apply: () => {
            teamMorale(s, 2);
            fans(s, 2);
          },
        }),
      });
    }
    // Pád do sestupového pásma / skok nahoru.
    if (f.position && f.positionBefore && f.teams) {
      const zone = f.teams - 2;
      if (f.position > zone && f.positionBefore <= zone && f.played >= 5) {
        const left = remainingFor(s, s.owner.clubId);
        const fact = `po zápase ${m.scoreline} jste spadli na ${f.position}. místo`;
        c.push({
          id: 'pad', key: `pad:${s.season}:${f.played}`, severity: 64, fact,
          build: () => ({
            title: `Sestupové pásmo: ${f.position}. místo`,
            text: `${fact[0].toUpperCase()}${fact.slice(1)} (${pointsWord(f.points ?? 0)}), do sestupového pásma.${left ? ` Do konce soutěže zbývá ${left} ${left === 1 ? 'zápas' : left < 5 ? 'zápasy' : 'zápasů'}.` : ''} Fanoušci i trenér čekají, co uděláte.`,
            defaultOption: 'nic',
            options: [
              { id: 'posila', label: 'Slíbit posilu do konce okna', hint: `Slib: nový hráč do ${formatDate(windowEnd(s.date))}. Důvěra trenéra +3, fanoušci +2` },
              { id: 'duvera', label: `Podržet trenéra do ${formatDate(halfEnd(s.date))}`, hint: 'Důvěra trenéra +6. Slib: trenér zůstane; když ho odvoláte dřív, důvěra i média půjdou dolů' },
              { id: 'nic', label: 'Nekomentovat', hint: 'Fanoušci −3' },
            ],
          }),
        });
      } else if (f.position <= 3 && f.positionBefore - f.position >= 2) {
        const fact = `skok z ${f.positionBefore}. na ${f.position}. místo po zápase ${m.scoreline}`;
        c.push({
          id: 'skok', key: `skok:${s.season}:${f.played}`, severity: 11, fact,
          news: () => ({ title: `Skok na ${f.position}. místo`, text: `${fact[0].toUpperCase()}${fact.slice(1)}. Fanoušci začínají počítat body (nálada +2).`, apply: () => fans(s, 2) }),
        });
      }
    }
    // Venku bez výhry.
    if (!m.home && m.outcome !== 'V' && f.awayWinless >= 5) {
      const fact = `venku jste nevyhráli ${matchesWord(f.awayWinless)} v řadě, naposledy ${m.opponentName} ${m.gf}:${m.ga}`;
      c.push({
        id: 'venku', key: `venku:${s.season}`, severity: 38 + 3 * (f.awayWinless - 5), fact,
        build: () => ({
          title: `Venku bez výhry: ${matchesWord(f.awayWinless)}`,
          text: `${fact[0].toUpperCase()}${fact.slice(1)}. Trenér navrhuje změnit přípravu na venkovní zápasy: odjezd den předem a hotel.`,
          amount: money(s, 300_000),
          defaultOption: 'nic',
          options: [
            { id: 'hotel', label: 'Zaplatit hotel a odjezd den předem', hint: `−${fmt(money(s, 300_000))} do konce sezóny, morálka týmu +4, důvěra trenéra +2. Slib kabině: výhra venku v dalších 3 venkovních zápasech` },
            { id: 'kritika', label: 'Problém je v hlavách, ne v autobuse', hint: 'Důvěra trenéra −5, fanoušci +2' },
            { id: 'nic', label: 'Nechat to na trenérovi', hint: 'Důvěra trenéra +1, fanoušci −2' },
          ],
        }),
      });
    }
  }

  // --- Sezónní stav (den po zápase i v pondělí) ---
  if (f.winless >= 4 && f.played >= 4 && !(s.stories ?? []).some((x) => x.kind === 'krize' && !x.done)) {
    const recent = f.form.slice(-f.winless).join(', ');
    const fact = `${matchesWord(f.winless)} bez výhry (${recent}), skóre posledních tří ${f.last3.gf}:${f.last3.ga}`;
    c.push({
      id: 'bez-vyhry', key: `bezvyhry:${s.season}:${Math.floor(f.played / 6)}`, severity: 58 + 4 * (f.winless - 4), fact,
      build: () => ({
        title: `${matchesWord(f.winless)} bez výhry: co s trenérem?`,
        text: `${fact[0].toUpperCase()}${fact.slice(1)}${posText ? `, ${posText}` : ''}. Fanoušci i novináři chtějí vidět reakci majitele${coach ? ` a ptají se, jestli ${coachName} zůstane trenérem` : ''}.`,
        amount: money(s, 40_000),
        defaultOption: 'kotel',
        options: [
          { id: 'ultimatum', label: 'Ultimátum: 6 bodů z dalších 4 zápasů', hint: 'Důvěra trenéra −8, hráči se vzchopí (morálka +3), fanoušci +2. Když to nevyjde a trenér zůstane, média vám to připomenou' },
          { id: 'podpora', label: `Veřejně podpořit trenéra do ${formatDate(halfEnd(s.date))}`, hint: 'Důvěra trenéra +8, média −2. Slib: když ho odvoláte dřív, důvěra i média půjdou dolů' },
          { id: 'kotel', label: 'Krizová schůzka s kotlem', hint: `−${fmt(money(s, 40_000))}, fanoušci +5, vztah s kotlem +6, morálka týmu +1` },
        ],
      }),
    });
  }
  if (f.streak.kind === 'V' && f.streak.length >= 3) {
    const last = ownMatchesSince(s, `${s.season}-07-01`).slice(-f.streak.length);
    const scores = last.map((x) => `${x.gf}:${x.ga}`).join(', ');
    const fact = `${f.streak.length} ${f.streak.length < 5 ? 'výhry' : 'výher'} v řadě (${scores})`;
    if (f.streak.length >= 5) {
      c.push({
        id: 'sebeuspokojeni', key: `sebeusp:${s.season}:${f.played}`, severity: 36, fact,
        build: () => ({
          title: `${f.streak.length} výher v řadě: pozor na sebeuspokojení`,
          text: `${fact[0].toUpperCase()}${fact.slice(1)}${posText ? `, ${posText}` : ''}. Trenér ${coachName} varuje, že hráči začínají číst, co se o nich píše.`,
          defaultOption: 'nic',
          options: [
            { id: 'varovat', label: 'Na tréninku připomenout, že nic není hotovo', hint: 'Důvěra trenéra +3, morálka týmu −1. Slib kabině: aspoň 7 bodů z dalších 4 zápasů' },
            { id: 'volno', label: 'Dát hráčům volno navíc', hint: 'Morálka týmu +5, kondice +10, důvěra trenéra −2' },
            { id: 'nic', label: 'Nechat to plynout', hint: 'Bez zásahu' },
          ],
        }),
      });
    } else {
      const amount = Math.max(50_000, Math.round((bonusPerPoint(own(s)) * 3) / 10_000) * 10_000);
      c.push({
        id: 'serie', key: `serie:${s.season}:${f.played}`, severity: 40, fact,
        build: () => ({
          title: 'Kapitán žádá prémii za sérii výher',
          text: `Tým má ${fact}${posLoc ? ` a je na ${posLoc}` : ''}. Kabina by ocenila odměnu navíc.`,
          amount,
          defaultOption: 'odmitnout',
          options: [
            { id: 'zaplatit', label: 'Vyplatit prémii hned', hint: `−${fmt(amount)}, morálka týmu +5` },
            { id: 'podminka', label: 'Prémie za další dvě výhry', hint: `Slib kabině: když tým vyhraje i další 2 zápasy, dostane ${fmt(amount * 1.5)}. Morálka týmu +2` },
            { id: 'odmitnout', label: 'Odmítnout', hint: 'Morálka týmu −4' },
          ],
        }),
      });
    }
  }
  const drought = f.droughts.find((d) => s.players[d.playerId]?.clubId === s.owner.clubId && !(s.players[d.playerId].injuredUntil && s.players[d.playerId].injuredUntil! > s.date));
  if (drought) {
    const p = s.players[drought.playerId];
    const fact = `${drought.name} nedal gól ${matchesWord(drought.games)} po sobě`;
    c.push({
      id: 'sucho', key: `sucho:${p.id}`, group: 'utok', severity: Math.min(70, 30 + 3 * drought.games + (drought.seasonGoals >= 5 ? 5 : 0)), fact,
      build: () => ({
        title: `${drought.name}: ${matchesWord(drought.games)} bez gólu`,
        text: `${fact} (v sezóně ${goalsWord(drought.seasonGoals)}). Fanoušci chtějí změnu, ${coachName} ho zatím staví.`,
        playerId: p.id,
        defaultOption: 'trener',
        options: [
          { id: 'podrzet', label: 'Veřejně ho podržet', hint: 'Morálka hráče +12, důvěra trenéra +2. Slib fanouškům: gól v dalších 4 zápasech' },
          { id: 'posila', label: 'Hledat nového útočníka', hint: `Slib: útočník do ${formatDate(windowEnd(s.date))}. Fanoušci +3, morálka hráče −6` },
          { id: 'trener', label: 'Nechat to na trenérovi', hint: 'Morálka hráče −3, fanoušci −2' },
        ],
      }),
    });
  }
  if (f.played >= 3 && f.form.length >= 3 && f.last3.gf === 0) {
    const fact = `tři zápasy bez vstřeleného gólu (skóre ${f.last3.gf}:${f.last3.ga})`;
    c.push({
      id: 'bez-golu', key: `bezgolu:${s.season}:${f.played}`, group: 'utok', severity: 52, fact,
      build: () => ({
        title: 'Tři zápasy bez gólu',
        text: `${fact[0].toUpperCase()}${fact.slice(1)}.${f.topScorer ? ` Nejlepší střelec ${f.topScorer.name} má v sezóně ${goalsWord(f.topScorer.goals)}.` : ''} Fanoušci volají po útočníkovi.`,
        defaultOption: 'duvera',
        options: [
          { id: 'posila', label: 'Slíbit útočníka', hint: `Slib: útočník do ${formatDate(windowEnd(s.date))}. Fanoušci +3` },
          { id: 'utok', label: 'Požádat trenéra o útočnější hru', hint: 'Styl trenéra: útočný, důvěra trenéra −4' },
          { id: 'duvera', label: 'Věřit současnému kádru', hint: 'Důvěra trenéra +3, fanoušci −2' },
        ],
      }),
    });
  }
  if (f.played >= 3 && f.last3.ga >= 8) {
    const fact = `${f.last3.ga} inkasovaných gólů ve třech zápasech (skóre ${f.last3.gf}:${f.last3.ga})`;
    c.push({
      id: 'obrana', key: `obrana:${s.season}:${f.played}`, group: 'obrana', severity: 50, fact,
      build: () => ({
        title: 'Děravá obrana',
        text: `${fact[0].toUpperCase()}${fact.slice(1)}. Fanoušci se ptají, kdo za to může.`,
        defaultOption: 'duvera',
        options: [
          { id: 'posila', label: 'Slíbit obránce', hint: `Slib: obránce do ${formatDate(windowEnd(s.date))}. Fanoušci +3` },
          { id: 'beton', label: 'Požádat trenéra o opatrnější hru', hint: 'Styl trenéra: defenzivní, důvěra trenéra −4' },
          { id: 'duvera', label: 'Věřit současnému kádru', hint: 'Důvěra trenéra +3, fanoušci −2' },
        ],
      }),
    });
  }
  if (f.shakyKeeper && s.players[f.shakyKeeper.playerId]?.clubId === s.owner.clubId) {
    const gk = s.players[f.shakyKeeper.playerId];
    const [r1, r2] = gk.recent.slice(-2);
    const backup = healthyAt(s, 'GK', gk.id).sort((a, b) => b.overall - a.overall)[0];
    const fact = `brankář ${f.shakyKeeper.name} dostal ve dvou posledních zápasech známky ${dec(r1)} a ${dec(r2)}`;
    c.push({
      id: 'brankar', key: `brankar:${gk.id}`, group: 'obrana', severity: 50, fact,
      build: () => ({
        title: `Je ${f.shakyKeeper!.name} pořád jednička?`,
        text: `${fact[0].toUpperCase()}${fact.slice(1)}${m ? ` (naposledy ${m.scoreline})` : ''}. Kabina i fanoušci tlačí na výměnu${backup ? `, náhradníkem je ${pName(backup)}` : ''}.`,
        playerId: gk.id,
        defaultOption: 'podrzet',
        options: [
          { id: 'podrzet', label: 'Podržet ho', hint: 'Morálka brankáře +12, důvěra trenéra +2, fanoušci −2' },
          ...(backup ? [{ id: 'konkurence', label: `Vyhlásit konkurenční boj s ${pName(backup)}`, hint: `Morálka ${gk.lastName} −10, ${backup.lastName} +10, důvěra trenéra −2` }] : []),
          { id: 'posila', label: 'Hledat nového brankáře', hint: `Slib: brankář do ${formatDate(windowEnd(s.date))}. Morálka brankáře −5, fanoušci +2` },
        ],
        data: backup ? { backup: backup.id } : undefined,
      }),
    });
  }
  // Agent hráče ve formě s končící smlouvou.
  const star = f.expiringStars.map((x) => ({ x, p: s.players[x.playerId] })).find((o) => o.p && o.p.clubId === s.owner.clubId && !o.p.loan && o.p.contractUntil <= s.season + 1);
  if (star) {
    const fact = `${star.x.name} má průměrnou známku ${dec(star.x.avg)} a smlouvu jen do 30. 6. ${star.p.contractUntil}`;
    c.push({
      id: 'agent', key: `agent:${star.p.id}:${star.p.contractUntil}`, severity: 38 + Math.round((star.x.avg - 7) * 20), fact,
      build: () => ({
        title: `Agent tlačí: ${star.x.name}`,
        text: `${fact}. Jeho agent ohlásil zájem jiných klubů a chce jednat o nové smlouvě.`,
        playerId: star.p.id,
        defaultOption: 'slib',
        options: [
          { id: 'prodlouzit', label: 'Nabídnout novou smlouvu hned', hint: `Plat +25 % (${fmt(star.p.wage * 1.25)} měsíčně), smlouva do ${s.season + 3}, morálka +10` },
          { id: 'slib', label: 'Slíbit jednání do dvou měsíců', hint: 'Morálka hráče +4. Slib: nová smlouva do 60 dní, jinak hráč i kabina zklamaní' },
          { id: 'prodat', label: 'Nabídnout ho k prodeji', hint: 'Zařadí se na seznam k prodeji, morálka hráče −8, fanoušci −3' },
        ],
      }),
    });
  }
  // Konec okna, dlouhodobé zranění opory a málo hráčů na pozici.
  const win = transferWindow(s.date);
  const daysToEnd = daysBetween(s.date, windowEnd(s.date));
  if (win && daysToEnd <= 14) {
    const need: Record<Position, number> = { GK: 2, DF: 5, MF: 5, FW: 3 };
    const inj = f.longInjuries.find((x) => healthyAt(s, x.position as Position, x.playerId).length < need[x.position as Position]);
    if (inj) {
      const n = healthyAt(s, inj.position as Position, inj.playerId).length;
      const fact = `${inj.name} (${POS_LABEL[inj.position as Position]}) je zraněný do ${formatDate(inj.until)} a na jeho pozici ${n === 1 ? 'máte jen jednoho zdravého hráče' : `máte jen ${n} zdravé hráče`}`;
      c.push({
        id: 'zraneni-okno', key: `zranokno:${inj.playerId}:${windowEnd(s.date)}`, severity: 60, fact,
        build: () => ({
          title: `Okno se zavírá za ${daysToEnd} dní: náhrada za ${inj.name}?`,
          text: `${fact[0].toUpperCase()}${fact.slice(1)}. Trenér tlačí na nákup před koncem okna (${formatDate(windowEnd(s.date))}).`,
          playerId: inj.playerId,
          defaultOption: 'vystacit',
          options: [
            { id: 'nakup', label: `Slíbit ${POS_ACC[inj.position as Position]} do konce okna`, hint: `Slib trenérovi: nový ${POS_LABEL[inj.position as Position]} do ${formatDate(windowEnd(s.date))}. Důvěra trenéra +4` },
            { id: 'mladi', label: 'Dát šanci mladým z kádru', hint: 'Trenér dá přednost mladým, důvěra trenéra −3, fanoušci +2' },
            { id: 'vystacit', label: 'Vystačit si s kádrem', hint: 'Důvěra trenéra −6' },
          ],
          data: { position: inj.position },
        }),
      });
    }
  }
  // Málo minut pro mladé, přestože jsou v kádru talenty (jen v pondělí, když není čerstvý zápas, nebo po něm).
  if (f.played >= 5 && f.youthMinutes < 90 && own(s).facilities.academy >= 2) {
    const sq = squad(s);
    const avg = sq.length ? sq.reduce((a, p) => a + p.overall, 0) / sq.length : 0;
    const talents = sq.filter((p) => playerAge(p, s.season) <= 21 && p.overall >= avg - 6).slice(0, 2);
    if (talents.length) {
      const fact = `hráči do 21 let odehráli za posledních 5 zápasů jen ${f.youthMinutes} minut`;
      c.push({
        id: 'mladi-minuty', key: `mladi:${s.season}:${s.date < `${s.season + 1}-01-01` ? 'podzim' : 'jaro'}`, severity: 31, fact,
        build: () => ({
          title: 'Fanoušci: proč nehrají mladí?',
          text: `${fact[0].toUpperCase()}${fact.slice(1)}, přestože v kádru jsou ${talents.map(pName).join(' a ')}. Fanoušci se ptají proč.`,
          defaultOption: 'vysvetlit',
          options: [
            { id: 'pokyn', label: 'Pokyn trenérovi: víc minut mladým', hint: 'Trenér dá přednost mladým (důvěra −3). Slib fanouškům: aspoň 300 minut hráčů do 21 let v dalších 5 zápasech' },
            { id: 'vysvetlit', label: 'Vysvětlit, že sestava je věc trenéra', hint: 'Fanoušci −2, důvěra trenéra +2' },
          ],
        }),
      });
    }
  }
  // Jistý cíl: záchrana nebo titul.
  const sure = secured(s, f);
  if (sure) {
    const fact = sure === 'titul' ? `${pointsWord(f.points ?? 0)} a náskok, který už druhý tým nedožene` : `${pointsWord(f.points ?? 0)}, na které už sestupové pásmo nedosáhne`;
    c.push({
      id: 'jistota', key: `jistota:${s.season}:${sure}`, severity: 52, fact,
      build: () => ({
        title: sure === 'titul' ? 'První místo je jisté: slavit, nebo hrát dál naplno?' : 'Záchrana je jistá: slavit, nebo hrát dál naplno?',
        text: `Matematicky hotovo: ${fact}. Hráči chtějí slavit, trenér chce koncentraci až do konce.`,
        amount: money(s, 200_000),
        defaultOption: 'koncentrace',
        options: [
          { id: 'oslava', label: 'Oslava s fanoušky', hint: `−${fmt(money(s, 200_000))}, fanoušci +8, morálka týmu +6, kondice −15` },
          { id: 'koncentrace', label: 'Žádné oslavy, hrát dál o body', hint: 'Důvěra trenéra +4, morálka týmu −2' },
        ],
      }),
    });
  }
  // Efekt nového trenéra: první tři zápasy výhry.
  if (coach && sit.coach?.id === coach.id && sit.coach.since > `${s.season - 1}-12-31`) {
    const ms = ownMatchesSince(s, sit.coach.since);
    if (ms.length >= 3 && ms.slice(0, 3).every((x) => x.outcome === 'V') && m && ms[2].fixtureId === m.fixtureId) {
      const fact = `${coachName} vyhrál první tři zápasy (${ms.slice(0, 3).map((x) => `${x.gf}:${x.ga}`).join(', ')})`;
      c.push({
        id: 'novy-trener', key: `novytrener:${coach.id}`, severity: 15, fact,
        news: () => ({ title: 'Efekt nového trenéra', text: `${fact}. Fanoušci jsou nadšení (nálada +3) a hráči mu věří.`, apply: () => { fans(s, 3); trust(s, 3); } }),
      });
    }
  }
  return c;
}

// ---------- Rozhodnutí ----------

type Resolver = (s: GameState, e: GameEvent, o: string) => string;

function contract(s: GameState, p: Player, years: number, raise: number): void {
  p.contractUntil = Math.min(s.season + 5, Math.max(p.contractUntil, s.season + 1) + years);
  p.wage = Math.round(p.wage * (1 + raise));
}

function setStyle(s: GameState, style: 'utocny' | 'defenzivni'): void {
  const c = coachOf(s, s.owner.clubId);
  if (c) c.style = style;
}

function youthFocus(s: GameState): void {
  const c = coachOf(s, s.owner.clubId);
  if (c) c.youthFocus = true;
}

function signingPromise(s: GameState, position: Position | undefined, source: string, stake: PromiseStake = 'fanousci'): string {
  const until = windowEnd(s.date);
  addPromise(s, { kind: 'posila', text: `${position ? `Nový ${POS_LABEL[position]}` : 'Posila'} do ${formatDate(until)}`, metric: 'signing', target: 1, until, position, stake, source });
  return `Slib platí: ${position ? `nový ${POS_LABEL[position]}` : 'posila'} do ${formatDate(until)}.`;
}

const RESOLVERS: Record<string, Resolver> = {
  cervena: (s, e, o) => {
    const p = s.players[e.playerId!];
    if (!p || p.clubId !== s.owner.clubId) return 'Hráč už v klubu není.';
    if (o === 'pokuta') {
      book(s, s.owner.clubId, 'ostatni', e.amount ?? 0, `Klubová pokuta: ${pName(p)}`);
      morale(s, p.id, -10);
      trust(s, 3);
      return `${pName(p)} zaplatí klubu ${fmt(e.amount ?? 0)}. Trenér oceňuje pořádek.`;
    }
    if (o === 'obhajoba') {
      pay(s, money(s, 60_000), `Právní zastoupení u disciplinárky: ${pName(p)}`);
      league(s, -2);
      morale(s, p.id, 8);
      if (p.suspension > 1 && hash01(e.id) < 0.5) {
        p.suspension -= 1;
        return `Disciplinárka zkrátila trest o jeden zápas (zbývá ${p.suspension}).`;
      }
      return 'Disciplinárka trest nezměnila, hráč ale ocenil podporu.';
    }
    morale(s, p.id, -3);
    trust(s, 1);
    return 'Trenér si to s hráčem vyřeší sám.';
  },
  hattrick: (s, e, o) => {
    const p = s.players[e.playerId!];
    if (!p || p.clubId !== s.owner.clubId) return 'Hráč už v klubu není.';
    if (o === 'bonus') {
      book(s, s.owner.clubId, 'platy', -(e.amount ?? p.wage), `Prémie za hattrick: ${pName(p)}`);
      morale(s, p.id, 12);
      teamMorale(s, 1);
      return `${pName(p)} dostal prémii za hattrick.`;
    }
    if (o === 'smlouva') {
      contract(s, p, 1, 0.15);
      morale(s, p.id, 10);
      return `${pName(p)} podepsal smlouvu do ${p.contractUntil}.`;
    }
    morale(s, p.id, 5);
    media(s, 2);
    return 'Majitel hráče veřejně pochválil.';
  },
  debakl: (s, e, o) => {
    if (o === 'omluva') {
      pay(s, e.amount ?? money(s, 150_000), 'Levnější vstupné po debaklu');
      fans(s, 6);
      media(s, 2);
      return 'Omluva zabrala, na příští domácí zápas je levnější vstupné.';
    }
    if (o === 'premie') {
      book(s, s.owner.clubId, 'platy', money(s, 100_000), 'Krácené prémie po debaklu');
      teamMorale(s, -8);
      trust(s, -4);
      fans(s, 3);
      return 'Hráči přišli o část prémií. Kabina je naštvaná, fanoušci spokojení.';
    }
    trust(s, 3);
    fans(s, -4);
    return 'Klub mlčí, fanoušci jsou nespokojení.';
  },
  'pozdni-gol': (s, e, o) => {
    if (o === 'kondice') {
      pay(s, e.amount ?? money(s, 250_000), 'Kondiční specialista');
      for (const p of squad(s)) p.fitness = Math.min(100, p.fitness + 15);
      trust(s, 3);
      return 'Kondiční specialista nastoupil.';
    }
    trust(s, -2);
    return 'Bez změn v realizačním týmu.';
  },
  stridani: (s, e, o) => {
    if (o === 'trener') {
      trust(s, 4);
      morale(s, e.playerId, -8);
      return 'Majitel se postavil za trenéra.';
    }
    if (o === 'hrac') {
      morale(s, e.playerId, 8);
      trust(s, -4);
      return 'Hráč ocenil rozhovor, trenér nerad slyší, že mu majitel mluví do střídání.';
    }
    morale(s, e.playerId, -3);
    return 'Sestava je věc trenéra.';
  },
  nejhorsi: (s, e, o) => {
    if (o === 'podrzet') {
      morale(s, e.playerId, 8);
      fans(s, -2);
      return 'Klub se za hráče postavil.';
    }
    if (o === 'kritika') {
      morale(s, e.playerId, -10);
      teamMorale(s, -1);
      fans(s, 3);
      media(s, 1);
      return 'Majitel přiznal slabý výkon.';
    }
    morale(s, e.playerId, -2);
    return 'Trenér to s hráčem probere.';
  },
  'zraneni-zapas': (s, e, o) => {
    const club = own(s);
    if (o === 'koupit' && club.facilities.medical < 5) {
      pay(s, e.amount ?? money(s, 2_000_000), 'Nové vybavení regenerace');
      club.facilities.medical += 1;
      teamMorale(s, 2);
      return `Regenerace má nové vybavení (úroveň ${club.facilities.medical}).`;
    }
    if (o === 'externi') {
      pay(s, money(s, 300_000), 'Externí fyzioterapie');
      for (const id of String(e.data?.injured ?? '').split(',')) {
        const p = s.players[id];
        if (p?.injuredUntil && p.injuredUntil > s.date) {
          const days = daysBetween(s.date, p.injuredUntil);
          p.injuredUntil = addDays(s.date, Math.max(1, Math.round(days * 0.8)));
        }
      }
      return 'Zranění hráči dostanou externí péči a vrátí se dřív.';
    }
    teamMorale(s, -2);
    return 'Nákup se odkládá.';
  },
  odchovanec: (s, e, o) => {
    const p = s.players[e.playerId!];
    if (o === 'minuty') {
      youthFocus(s);
      trust(s, -3);
      fans(s, 4);
      const target = Math.max(450, Number(e.data?.youth ?? 0) + 200);
      addPromise(s, { kind: 'mladi', text: `Aspoň ${target} minut pro hráče do 21 let v 5 zápasech`, metric: 'youthMinutes', target, matches: 5, until: addDays(s.date, 45), stake: 'fanousci', source: 'sit-odchovanec' });
      return `Trenér dostal pokyn dávat víc minut mladým. Slib: ${target} minut v dalších 5 zápasech.`;
    }
    if (!p || p.clubId !== s.owner.clubId) return 'Hráč už v klubu není.';
    if (o === 'smlouva') {
      contract(s, p, 2, 0.2);
      morale(s, p.id, 12);
      fans(s, 2);
      return `${pName(p)} podepsal smlouvu do ${p.contractUntil}.`;
    }
    morale(s, p.id, 6);
    media(s, 1);
    return 'Majitel odchovance veřejně pochválil.';
  },
  verdikt: (s, e, o) => {
    if (o === 'stiznost') {
      fans(s, 3);
      league(s, -3);
      if (hash01(`${e.id}k`) < 0.4) {
        media(s, 2);
        return 'Komise rozhodčích uznala chybu, rozhodčí dostal pauzu.';
      }
      return 'Komise stížnost zamítla, fanoušci ale ocenili snahu.';
    }
    if (o === 'kritika') {
      fans(s, 6);
      league(s, -12);
      const amount = fine(s, 150_000, 'Pokuta za kritiku rozhodčích');
      return `Fanoušci tleskají, disciplinárka vyměřila pokutu ${fmt(amount)}.`;
    }
    fans(s, -2);
    league(s, 2);
    return 'Klub se k verdiktu nevyjadřuje.';
  },
  pad: (s, _e, o) => {
    if (o === 'posila') {
      trust(s, 3);
      fans(s, 2);
      return signingPromise(s, undefined, 'sit-pad', 'trener');
    }
    if (o === 'duvera') {
      trust(s, 6);
      const until = halfEnd(s.date);
      addPromise(s, { kind: 'podpora-trenera', text: `Podpora trenéra do ${formatDate(until)}`, metric: 'coachKept', target: 1, until, stake: 'trener', weight: 1.2, source: 'sit-pad' });
      return `Trenér má vaši podporu do ${formatDate(until)}.`;
    }
    fans(s, -3);
    return 'Majitel mlčí.';
  },
  venku: (s, e, o) => {
    if (o === 'hotel') {
      pay(s, e.amount ?? money(s, 300_000), 'Hotel a odjezdy den předem na venkovní zápasy');
      teamMorale(s, 4);
      trust(s, 2);
      addPromise(s, { kind: 'venku', text: 'Výhra venku v dalších 3 venkovních zápasech', metric: 'awayWins', target: 1, matches: 3, until: addDays(s.date, 70), stake: 'kabina', source: 'sit-venku' });
      return 'Tým bude na venkovní zápasy odjíždět den předem.';
    }
    if (o === 'kritika') {
      trust(s, -5);
      fans(s, 2);
      return 'Majitel veřejně zpochybnil přístup týmu venku.';
    }
    trust(s, 1);
    fans(s, -2);
    return 'Příprava zůstává beze změny.';
  },
  'bez-vyhry': (s, e, o) => {
    if (o === 'ultimatum') {
      trust(s, -8);
      teamMorale(s, 3);
      fans(s, 2);
      addPromise(s, { kind: 'ultimatum', text: 'Ultimátum: 6 bodů z dalších 4 zápasů', metric: 'points', target: 6, matches: 4, until: addDays(s.date, 42), stake: 'media', source: 'sit-bez-vyhry' });
      return 'Trenér dostal ultimátum: 6 bodů ze 4 zápasů.';
    }
    if (o === 'podpora') {
      trust(s, 8);
      media(s, -2);
      const until = halfEnd(s.date);
      addPromise(s, { kind: 'podpora-trenera', text: `Podpora trenéra do ${formatDate(until)}`, metric: 'coachKept', target: 1, until, stake: 'trener', weight: 1.2, source: 'sit-bez-vyhry' });
      return `Majitel veřejně podržel trenéra do ${formatDate(until)}.`;
    }
    pay(s, e.amount ?? money(s, 40_000), 'Krizová schůzka s fanoušky');
    fans(s, 5);
    changeUltras(s, 6);
    teamMorale(s, 1);
    return 'Schůzka s kotlem uklidnila atmosféru.';
  },
  serie: (s, e, o) => {
    if (o === 'zaplatit') {
      book(s, s.owner.clubId, 'platy', -(e.amount ?? 0), 'Mimořádná prémie za sérii výher');
      teamMorale(s, 5);
      return 'Prémie vyplacena, kabina je nadšená.';
    }
    if (o === 'podminka') {
      teamMorale(s, 2);
      addPromise(s, { kind: 'premie', text: 'Prémie za další dvě výhry v řadě', metric: 'wins', target: 2, matches: 2, until: addDays(s.date, 30), stake: 'kabina', reward: Math.round((e.amount ?? 0) * 1.5), source: 'sit-serie' });
      return 'Prémie čeká na další dvě výhry.';
    }
    teamMorale(s, -4);
    return 'Hráči si prémii nevybojovali.';
  },
  sebeuspokojeni: (s, _e, o) => {
    if (o === 'varovat') {
      trust(s, 3);
      teamMorale(s, -1);
      addPromise(s, { kind: 'koncentrace', text: 'Aspoň 7 bodů z dalších 4 zápasů', metric: 'points', target: 7, matches: 4, until: addDays(s.date, 40), stake: 'kabina', source: 'sit-sebeuspokojeni' });
      return 'Majitel připomněl, že nic není hotovo.';
    }
    if (o === 'volno') {
      teamMorale(s, 5);
      for (const p of squad(s)) p.fitness = Math.min(100, p.fitness + 10);
      trust(s, -2);
      return 'Hráči dostali volno navíc.';
    }
    return 'Série pokračuje bez zásahu.';
  },
  sucho: (s, e, o) => {
    const p = s.players[e.playerId!];
    if (o === 'podrzet') {
      morale(s, e.playerId, 12);
      trust(s, 2);
      if (p) addPromise(s, { kind: 'strelec', text: `${pName(p)} dá gól v dalších 4 zápasech`, metric: 'playerGoals', target: 1, matches: 4, until: addDays(s.date, 35), playerId: p.id, stake: 'fanousci', weight: 0.7, source: 'sit-sucho' });
      return 'Majitel útočníka veřejně podržel.';
    }
    if (o === 'posila') {
      fans(s, 3);
      morale(s, e.playerId, -6);
      return signingPromise(s, 'FW', 'sit-sucho');
    }
    morale(s, e.playerId, -3);
    fans(s, -2);
    return 'Sestava je věc trenéra.';
  },
  'bez-golu': (s, _e, o) => {
    if (o === 'posila') {
      fans(s, 3);
      return signingPromise(s, 'FW', 'sit-bez-golu');
    }
    if (o === 'utok') {
      setStyle(s, 'utocny');
      trust(s, -4);
      return 'Trenér přechází na útočnější hru.';
    }
    trust(s, 3);
    fans(s, -2);
    return 'Majitel věří současnému kádru.';
  },
  obrana: (s, _e, o) => {
    if (o === 'posila') {
      fans(s, 3);
      return signingPromise(s, 'DF', 'sit-obrana');
    }
    if (o === 'beton') {
      setStyle(s, 'defenzivni');
      trust(s, -4);
      return 'Trenér zahraje opatrněji.';
    }
    trust(s, 3);
    fans(s, -2);
    return 'Majitel věří současnému kádru.';
  },
  brankar: (s, e, o) => {
    if (o === 'podrzet') {
      morale(s, e.playerId, 12);
      trust(s, 2);
      fans(s, -2);
      return 'Brankář má podporu majitele.';
    }
    if (o === 'konkurence') {
      morale(s, e.playerId, -10);
      morale(s, String(e.data?.backup ?? ''), 10);
      trust(s, -2);
      return 'O post jedničky se bude bojovat.';
    }
    morale(s, e.playerId, -5);
    fans(s, 2);
    return signingPromise(s, 'GK', 'sit-brankar');
  },
  agent: (s, e, o) => {
    const p = s.players[e.playerId!];
    if (!p || p.clubId !== s.owner.clubId) return 'Hráč už v klubu není.';
    if (o === 'prodlouzit') {
      p.wage = Math.round(p.wage * 1.25);
      p.contractUntil = Math.max(p.contractUntil, s.season + 3);
      morale(s, p.id, 10);
      return `${pName(p)} podepsal smlouvu do ${p.contractUntil}.`;
    }
    if (o === 'prodat') {
      if (!s.market.listed.includes(p.id)) s.market.listed.push(p.id);
      morale(s, p.id, -8);
      fans(s, -3);
      return `${pName(p)} je na seznamu k prodeji.`;
    }
    morale(s, p.id, 4);
    addPromise(s, { kind: 'smlouva', text: `Nová smlouva pro ${pName(p)} do 60 dní`, metric: 'contractSigned', target: 1, until: addDays(s.date, 60), playerId: p.id, stake: 'hrac', source: 'sit-agent' });
    return 'Agent čeká na nabídku do dvou měsíců.';
  },
  'zraneni-okno': (s, e, o) => {
    if (o === 'nakup') {
      trust(s, 4);
      return signingPromise(s, String(e.data?.position ?? '') as Position || undefined, 'sit-zraneni-okno', 'trener');
    }
    if (o === 'mladi') {
      youthFocus(s);
      trust(s, -3);
      fans(s, 2);
      return 'Šanci dostanou mladí z kádru.';
    }
    trust(s, -6);
    return 'Klub si vystačí s kádrem.';
  },
  'mladi-minuty': (s, _e, o) => {
    if (o === 'pokyn') {
      youthFocus(s);
      trust(s, -3);
      addPromise(s, { kind: 'mladi', text: 'Aspoň 300 minut pro hráče do 21 let v 5 zápasech', metric: 'youthMinutes', target: 300, matches: 5, until: addDays(s.date, 45), stake: 'fanousci', source: 'sit-mladi-minuty' });
      return 'Trenér dostal pokyn dávat víc minut mladým.';
    }
    fans(s, -2);
    trust(s, 2);
    return 'Majitel do sestavy nemluví.';
  },
  jistota: (s, e, o) => {
    if (o === 'oslava') {
      pay(s, e.amount ?? money(s, 200_000), 'Oslava s fanoušky');
      fans(s, 8);
      teamMorale(s, 6);
      for (const p of squad(s)) p.fitness = Math.max(0, p.fitness - 15);
      return 'Stadion slavil s týmem do noci.';
    }
    trust(s, 4);
    teamMorale(s, -2);
    return 'Oslavy počkají na konec sezóny.';
  },
};

/** Šablony pro engine/events.ts (vznikají jen z fronty situací, nikdy náhodně). */
export function situationTemplates(): Record<string, { weight: () => number; create: () => null; resolve: Resolver }> {
  const out: Record<string, { weight: () => number; create: () => null; resolve: Resolver }> = {};
  for (const [id, r] of Object.entries(RESOLVERS)) out[`sit-${id}`] = { weight: () => 0, create: () => null, resolve: r };
  return out;
}

/** Všechny druhy situací katalogu (rozhodnutí i zprávy). */
export const SITUATION_KINDS = Object.keys(SIT_COOLDOWN);

// ---------- Fronta ----------

function onCooldown(s: GameState, c: Candidate): boolean {
  const last = situationsOf(s).last;
  const recent = (key: string, days: number) => !!last[key] && addDays(last[key], days) > s.date;
  return recent(`id:${c.id}`, SIT_COOLDOWN[c.id] ?? 30) || recent(`key:${c.key}`, KEY_COOLDOWN_BY_ID[c.id] ?? KEY_COOLDOWN) || (!!c.group && recent(`group:${c.group}`, GROUP_COOLDOWN));
}

function mark(s: GameState, c: Candidate): void {
  const last = situationsOf(s).last;
  last[`id:${c.id}`] = s.date;
  last[`key:${c.key}`] = s.date;
  if (c.group) last[`group:${c.group}`] = s.date;
  // Staré záznamy se mažou, aby stav nebobtnal.
  const cut = addDays(s.date, -400);
  for (const k of Object.keys(last)) if (last[k] < cut) delete last[k];
}

/** Kandidáti na situaci (pro testy a ladění, nemění stav kromě inicializace). */
export function situationCandidates(state: GameState, dayAfterMatch = true): { id: string; severity: number; fact: string; decision: boolean }[] {
  const m = dayAfterMatch ? freshOwnMatch(state, 1) : undefined;
  return collect(state, m, seasonFacts(state)).map((c) => ({ id: c.id, severity: c.severity, fact: c.fact, decision: !!c.build }));
}

/** Sleduje změnu trenéra (pro efekt nového trenéra). */
function trackCoach(s: GameState): void {
  const c = coachOf(s, s.owner.clubId);
  const sit = situationsOf(s);
  if (!c) return;
  if (!sit.coach) sit.coach = { id: c.id, since: '0000-00-00' };
  else if (sit.coach.id !== c.id) sit.coach = { id: c.id, since: s.date };
}

/**
 * Denně (po zápasech a reakcích): vyhodnotí sliby a den po zápase klubu majitele (nebo v pondělí)
 * vybere nejzávažnější situaci z dat. Vznikne nejvýš jedno rozhodnutí denně a jen v rámci týdenního limitu.
 */
export function dailySituations(state: GameState, _rng?: Rng): void {
  if (state.gameOver || state.owner.ousted) return;
  situationsOf(state);
  recordNewEvents(state);
  trackCoach(state);
  checkOwnerPromises(state);
  const fresh = freshOwnMatch(state, 1);
  const m = fresh && fresh.date === addDays(state.date, -1) ? fresh : undefined;
  const monday = dayOfWeek(state.date) === 1;
  if (!m && !monday) return;
  // V pondělí bez čerstvého zápasu jen jednou za týden „sezónní“ přehled; v létě mimo sezónu nic.
  const md = state.date.slice(5);
  if (md > '06-10' && md < '07-20') return;
  const f = seasonFacts(state);
  if (!f.form.length) return;
  const cands = collect(state, m, f).filter((c) => !onCooldown(state, c));
  // Zprávy (bez rozhodnutí): nejvýš jedna denně.
  const news = cands.filter((c) => c.news).sort((a, b) => b.severity - a.severity)[0];
  if (news) {
    const n = news.news!();
    n.apply?.();
    addNews(state, { kind: 'info', title: n.title, text: n.text, playerId: n.playerId });
    mark(state, news);
  }
  const decisions = cands.filter((c) => c.build).sort((a, b) => b.severity - a.severity);
  if (!decisions.length || decisionBudgetLeft(state) <= 0 || state.events.length >= 4) return;
  const best = decisions[0];
  const body = best.build!();
  const event: GameEvent = { ...body, id: `e${++state.nextId}`, template: `sit-${best.id}`, date: state.date, expires: addDays(state.date, EXPIRES), data: { ...(body.data ?? {}), fact: best.fact } };
  state.events.push(event);
  state.eventLog ??= {};
  state.eventLog[event.template] = state.date;
  mark(state, best);
  situationsOf(state).log.push({ id: event.id, date: event.date, template: event.template });
}
