import { addDays } from './calendar';
import { allFixtures } from './competitions';
import { annualCosts, book } from './finance';
import { changeSponsorRelation } from './finplus';
import { fine, league, media } from './grey';
import { BIG_MATCH_LABEL, daysToBigMatch, upcomingBigMatch, type BigMatch, type BigMatchKind } from './bigmatch';
import { dressingRoom } from './atmosphere';
import { findEuroMatch, nextEuroMatch, type EuroMatch } from './europe';
import type { MatchOptions } from './match';
import { choreoCost, type PlanEffect } from './matchday';
import { natureOf, rivalBoard, touchRival } from './rivals';
import type { ActionResult } from './staff';
import { changeCity, changeUltras, cityOf, ultrasOf } from './surroundings';
import { backlash } from './social';
import type { BigMatchState, Fixture, GameState } from './types';
import { addNews, clamp, clubLabel, hash01, tierOf } from './world';

/**
 * Zážitek velkého zápasu (W1): týden přípravy s odpočtem (napětí, lístky, kotel, bezpečnost, lóže majitele),
 * body zlomu v přenosu (sporný verdikt, pyro, vabank) a vyúčtování po zápase s klíčovými momenty.
 * Všechny volby mají výchozí hodnotu, takže hra plyne, i když majitel nic nezvolí.
 */

const mil = (v: number) => `${(v / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 2 })} mil. Kč`;
const roundTo = (v: number, step: number) => Math.max(step, Math.round(v / step) * step);

// ---------- Týden velkého zápasu ----------

/** Rizikové evropské země (fanoušci s pověstí, přísnější dohled UEFA). */
const RISKY_COUNTRIES = new Set(['Srbsko', 'Chorvatsko', 'Polsko', 'Turecko', 'Řecko', 'Maďarsko', 'Bulharsko', 'Rumunsko', 'Ukrajina', 'Skotsko']);

function euroOf(state: GameState, id: string): EuroMatch | undefined {
  return id.startsWith('eu-') ? findEuroMatch(state, id)?.match : undefined;
}

/** Rizikový zápas: derby, nebo evropský soupeř s rizikovými fanoušky. */
export function isRiskyMatch(state: GameState, bm: Pick<BigMatchState, 'id' | 'kind'>): boolean {
  if (bm.kind === 'derby') return true;
  const e = euroOf(state, bm.id);
  return !!e && RISKY_COUNTRIES.has(e.opponent.country);
}

/** Lóže majitele: hosté u Evropy a derby (doma). */
export function hasOwnerBox(bm: BigMatchState): boolean {
  return !!bm.home && (bm.kind === 'derby' || bm.kind === 'evropa');
}

const BASE_HYPE: Record<BigMatchKind, number> = { derby: 58, evropa: 62, titul: 55, zachrana: 48, pohar: 44, baraz: 60 };

/** Napětí před zápasem 0–100: druh zápasu, rivalita, nálada fanoušků a blížící se termín. */
export function computeHype(state: GameState, bm: BigMatchState): number {
  const kind = bm.kind as BigMatchKind;
  const days = Math.max(0, daysToBigMatch(state, { date: bm.date } as BigMatch));
  const rivalry = bm.opponentId ? rivalBoard(state, bm.opponentId).rivalry : 20;
  const mood = state.clubs[state.owner.clubId].fanMood ?? 50;
  return Math.round(clamp((BASE_HYPE[kind] ?? 50) + rivalry / 6 + (mood - 50) / 5 + (7 - Math.min(7, days)) * 3, 5, 100));
}

/** Poptávka po lístcích (1 = přesně vyprodáno) a za kolik hodin se vyprodá. */
export function ticketDemand(state: GameState, bm: BigMatchState): { ratio: number; hours?: number; pct: number } {
  const club = state.clubs[state.owner.clubId];
  const kindBoost = bm.kind === 'evropa' ? 0.35 : bm.kind === 'derby' ? 0.3 : 0.12;
  const ratio = 0.55 + (club.fanMood ?? 50) / 220 + (bm.hype ?? computeHype(state, bm)) / 160 + kindBoost + club.reputation / 500;
  const hours = ratio >= 1 ? Math.round(clamp(60 / Math.pow(ratio, 3), 1, 72)) : undefined;
  return { ratio, hours, pct: Math.round(Math.min(1, ratio) * 100) };
}

export function securityCost(state: GameState): number {
  const club = state.clubs[state.owner.clubId];
  return roundTo(annualCosts(club, tierOf(state, club.id)) * 0.0015, 10_000);
}

export type PrepKey = 'tickets' | 'alloc' | 'guests' | 'choreo' | 'security' | 'box';

export interface PrepOption {
  id: string;
  label: string;
  hint: string;
}

export interface PrepDecision {
  key: PrepKey;
  title: string;
  options: PrepOption[];
  /** Výchozí volba (použije se, když majitel nic nezvolí). */
  def: string;
}

const LEGENDS = ['Karel Vejvoda', 'Jiří Hruška', 'Pavel Kubát', 'Miroslav Pecha', 'Zdeněk Lukeš', 'Václav Mráz', 'Josef Holub', 'Luboš Kratina'];

/** Jméno legendy klubu (vymyšlené, stabilní pro hru a klub). */
export function clubLegend(state: GameState): string {
  return LEGENDS[Math.floor(hash01(`${state.seed}-${state.owner.clubId}-legenda`) * LEGENDS.length)];
}

/** Krátká rozhodnutí v týdnu před zápasem (jen ta, která dávají smysl: domácí zápas, rizikový soupeř, lóže). */
export function prepDecisions(state: GameState, bm: BigMatchState): PrepDecision[] {
  if (!bm.home) return [];
  const out: PrepDecision[] = [];
  const euro = bm.kind === 'evropa';
  out.push({
    key: 'tickets',
    title: 'Vstupenky',
    def: 'bezne',
    options: [
      { id: 'zdrazit', label: 'Zdražit', hint: 'Vstupné +35 %. Kotel a fanoušci budou reptat, prostředí o něco vlažnější.' },
      { id: 'bezne', label: 'Běžné ceny', hint: 'Nic se nemění.' },
      { id: 'lidove', label: 'Lidové ceny', hint: 'Vstupné −25 %. Fanoušci a kotel to ocení, stadion bude hlasitější.' },
    ],
  });
  out.push({
    key: 'alloc',
    title: 'Rozdělení kapacity',
    def: 'vyvazene',
    options: [
      { id: 'kotel', label: 'Víc pro kotel', hint: 'Bouřlivější domácí prostředí, kotel potěší, ale vyšší riziko incidentů.' },
      { id: 'vyvazene', label: 'Vyváženě', hint: 'Běžné rozdělení.' },
      { id: 'rodiny', label: 'Víc pro rodiny', hint: 'Klidnější stadion a menší riziko, plus u města a rodin; slabší kulisa.' },
    ],
  });
  if (euro) {
    out.push({
      key: 'guests',
      title: 'Příděl pro hosty',
      def: 'minimum',
      options: [
        { id: 'minimum', label: 'Minimum (5 %)', hint: 'Víc místa pro domácí.' },
        { id: 'plny', label: 'Plný příděl (10 %)', hint: 'Hosté utratí ve městě (vztah s městem +), ale riziko roste a domácí kulisa slábne.' },
      ],
    });
  }
  out.push({
    key: 'choreo',
    title: 'Choreo kotle',
    def: 'fanousci',
    options: [
      { id: 'zaplatit', label: `Zaplatit (${mil(choreoCost(state))})`, hint: 'Velké choreo: tým se hecne, kotel vás bude mít rád. Pyro hrozí o něco víc.' },
      { id: 'fanousci', label: 'Nechat na fanoušcích', hint: 'Menší choreo z jejich sbírky.' },
      { id: 'zakaz', label: 'Zakázat pyro', hint: 'Menší riziko pokuty a lepší vztah se svazem, kotel se urazí.' },
    ],
  });
  if (isRiskyMatch(state, bm)) {
    out.push({
      key: 'security',
      title: 'Bezpečnost',
      def: 'bezne',
      options: [
        { id: 'bezne', label: 'Běžná pořadatelská služba', hint: 'Bez nákladů navíc.' },
        { id: 'posilit', label: `Posílit pořadatele (${mil(securityCost(state))})`, hint: 'Riziko výtržností a pokuty klesne na zhruba polovinu.' },
      ],
    });
  }
  if (hasOwnerBox(bm)) {
    const mayor = cityOf(state).mayor;
    out.push({
      key: 'box',
      title: 'Lóže: s kým strávíte zápas',
      def: 'sponzor',
      options: [
        { id: 'sponzor', label: 'Generální partner', hint: 'Vztah s generálním partnerem +6.' },
        { id: 'starosta', label: `Primátor ${mayor}`, hint: 'Vztah s městem +5.' },
        { id: 'legenda', label: `Legenda ${clubLegend(state)}`, hint: 'Fanoušci a kotel to ocení, média si toho všimnou.' },
      ],
    });
  }
  return out;
}

/** Zvolená (nebo výchozí) hodnota přípravy. */
export function prepValue(state: GameState, bm: BigMatchState, key: PrepKey): string | undefined {
  const d = prepDecisions(state, bm).find((x) => x.key === key);
  if (!d) return undefined;
  const v = bm.prep?.[key];
  return typeof v === 'string' && d.options.some((o) => o.id === v) ? v : d.def;
}

export function setBigMatchPrep(prev: GameState, key: PrepKey, value: string): ActionResult {
  const bm = prev.bigMatch;
  if (!bm || bm.settled || prev.date >= bm.date) return { state: prev, ok: false, message: 'Příprava už skončila.' };
  const d = prepDecisions(prev, bm).find((x) => x.key === key);
  const o = d?.options.find((x) => x.id === value);
  if (!d || !o) return { state: prev, ok: false, message: 'Tuhle volbu teď nejde udělat.' };
  const state = structuredClone(prev);
  state.bigMatch!.prep = { ...(state.bigMatch!.prep ?? {}), [key]: value };
  return { state, ok: true, message: `${d.title}: ${o.label}.` };
}

export interface PrepEffect {
  ticketFactor: number;
  homeEdge: number;
  bonus: number;
  /** Pravděpodobnost výtržností (pokuta). */
  risk: number;
  /** Pravděpodobnost pyra s přerušením v zápase. */
  pyro: number;
}

/** Souhrnný dopad přípravy na zápas (jen domácí velký zápas; venku nic). */
export function prepEffect(state: GameState, bm: BigMatchState): PrepEffect {
  const risky = isRiskyMatch(state, bm);
  const baseRisk = risky ? 0.3 : 0.08;
  const basePyro = risky ? 0.4 : 0.15;
  if (!bm.home) return { ticketFactor: 1, homeEdge: 0, bonus: 0, risk: baseRisk * 0.5, pyro: 0 };
  const v = (k: PrepKey) => prepValue(state, bm, k);
  const e: PrepEffect = { ticketFactor: 1, homeEdge: 0, bonus: 0, risk: baseRisk, pyro: basePyro };
  const t = v('tickets');
  if (t === 'zdrazit') {
    e.ticketFactor *= 1.35;
    e.homeEdge -= 0.2;
  } else if (t === 'lidove') {
    e.ticketFactor *= 0.75;
    e.homeEdge += 0.3;
  }
  const a = v('alloc');
  if (a === 'kotel') {
    e.homeEdge += 0.5;
    e.risk *= 1.3;
    e.pyro *= 1.2;
  } else if (a === 'rodiny') {
    e.homeEdge -= 0.2;
    e.risk *= 0.6;
    e.pyro *= 0.7;
  }
  if (v('guests') === 'plny') {
    e.homeEdge -= 0.2;
    e.risk *= 1.3;
    e.ticketFactor *= 1.03;
  }
  const c = v('choreo');
  if (c === 'zaplatit') {
    e.homeEdge += 0.6;
    e.bonus += 0.3;
    e.pyro *= 1.2;
  } else if (c === 'fanousci') {
    e.homeEdge += 0.2;
  } else if (c === 'zakaz') {
    e.homeEdge -= 0.2;
    e.pyro *= 0.3;
  }
  if (v('security') === 'posilit') {
    e.risk *= 0.45;
    e.pyro *= 0.6;
  }
  const u = ultrasOf(state).relation;
  e.risk *= u < 30 ? 1.3 : 1;
  e.risk = clamp(e.risk, 0, 0.9);
  e.pyro = clamp(e.pyro, 0, 0.8);
  return e;
}

/** Hák do zápasu (engine/game.ts): připočte přípravu velkého zápasu k plánu majitele. */
export function applyBigMatchPlan(state: GameState, f: Fixture, plan: PlanEffect): void {
  const bm = state.bigMatch;
  if (!bm || bm.id !== f.id || !bm.home || f.homeId !== state.owner.clubId) return;
  const e = prepEffect(state, bm);
  plan.ticketFactor *= e.ticketFactor;
  plan.homeEdge += e.homeEdge;
  plan.bonus += e.bonus;
}

// ---------- Odpočet na Přehledu ----------

export interface Countdown {
  bm: BigMatchState;
  days: number;
  title: string;
  hype: number;
  hypeLabel: string;
  demand?: { hours?: number; pct: number };
  kabina: string;
  city: string;
  quote?: { who: string; text: string };
  decisions: PrepDecision[];
  risky: boolean;
  /** Stav výjezdu fanoušků na venkovní zápas (volbu ukazuje karta Fanoušci, W3). */
  trip?: string;
}

const QUOTES = {
  hostile: ['„Tohle město má jen jednoho krále. V neděli to znovu ukážeme.“', '„Peníze za hráče utrácet umí, fotbal hrát ne.“', '„Ať si u nich připraví kapesníky.“', '„Na jejich hřišti se nám hraje nejlíp.“'],
  neutral: ['„Respektujeme je, ale jedeme pro tři body.“', '„Derby se nehraje, derby se vyhrává.“', '„Kdo zvládne hlavu, ten vyhraje.“'],
  friendly: ['„Těšíme se na svátek fotbalu. Ať vyhraje lepší.“', '„S jejich vedením vycházíme dobře, na hřišti ale přátelé nebudeme.“'],
  euro: ['„O českém fotbale víme víc, než si myslíte. Jedeme vyhrát.“', '„Jejich stadion je prý peklo. Těšíme se.“', '„Je to pro nás povinná výhra.“', '„Respekt ano, strach ne.“'],
};

/** Výrok soupeře do médií (podle vztahu a rivality vedení soupeře, u Evropy trenér soupeře). */
export function rivalQuote(state: GameState, bm: BigMatchState): { who: string; text: string } | undefined {
  const roll = hash01(`${bm.id}-vyrok`);
  if (bm.kind === 'evropa') return { who: `trenér ${bm.opponentName ?? 'soupeře'}`, text: QUOTES.euro[Math.floor(roll * QUOTES.euro.length)] };
  if (!bm.opponentId) return undefined;
  const r = rivalBoard(state, bm.opponentId);
  const nature = natureOf(bm.opponentId);
  const tone = r.relation > 30 ? 'friendly' : r.relation < -20 || r.rivalry >= 50 || nature === 'populista' ? 'hostile' : 'neutral';
  const list = QUOTES[tone];
  return { who: `vedení ${clubLabel(state, bm.opponentId)}`, text: list[Math.floor(roll * list.length)] };
}

export function hypeLabel(h: number): string {
  return h >= 85 ? 'město nemluví o ničem jiném' : h >= 70 ? 'velké napětí' : h >= 55 ? 'roste napětí' : 'klidné očekávání';
}

/** Data pro kartu odpočtu na Přehledu (týden před velkým zápasem). */
export function bigMatchCountdown(state: GameState): Countdown | undefined {
  const bm = state.bigMatch;
  if (!bm || bm.settled || bm.date < state.date) return undefined;
  const days = daysToBigMatch(state, { date: bm.date } as BigMatch);
  const hype = bm.hype ?? computeHype(state, bm);
  const kind = BIG_MATCH_LABEL[bm.kind as BigMatchKind] ?? 'Velký zápas';
  const when = days <= 0 ? 'Dnes' : days === 1 ? 'Zítra' : `Za ${days} ${days < 5 ? 'dny' : 'dní'}`;
  const room = dressingRoom(state);
  const city = cityOf(state);
  const cityMood = hype >= 80 ? 'město žije jen zápasem' : city.relation >= 60 ? 'město klubu fandí' : city.relation < 35 ? 'radnice je chladná, lidé čekají' : 've městě se o zápase mluví';
  return {
    bm,
    days,
    title: `${when} ${kind.toLowerCase()}: ${pairing(state, bm)}`,
    hype,
    hypeLabel: hypeLabel(hype),
    demand: bm.home ? ticketDemand(state, bm) : undefined,
    kabina: `${room.label} (morálka ${Math.round(room.morale)})`,
    city: cityMood,
    quote: rivalQuote(state, bm),
    decisions: prepDecisions(state, bm),
    risky: isRiskyMatch(state, bm),
    trip: bm.home ? undefined : tripText(state, bm),
  };
}

/** „Domácí – hosté“ pro titulky. */
function pairing(state: GameState, bm: Pick<BigMatchState, 'home' | 'opponentName'>): string {
  const own = state.clubs[state.owner.clubId].shortName;
  const opp = bm.opponentName ?? 'soupeř';
  return bm.home ? `${own} – ${opp}` : `${opp} – ${own}`;
}

function tripText(state: GameState, bm: BigMatchState): string {
  const t = state.fans?.trip;
  if (t && t.matchId === bm.id) return `výjezd: asi ${t.fans.toLocaleString('cs-CZ')} fanoušků (${t.choice === 'vlak' ? bm.kind === 'evropa' ? 'charter' : 'zvláštní vlak' : bm.kind === 'evropa' ? 'dotované letenky' : 'autobusy'})`;
  return 'výjezd: pojede jen jádro kotle (dotaci nastavíte na kartě Fanoušci)';
}

function demandText(d: { hours?: number; pct: number }): string {
  return d.hours ? `vyprodáno za ${d.hours} ${d.hours === 1 ? 'hodinu' : d.hours < 5 ? 'hodiny' : 'hodin'}` : `prodáno ${d.pct} % lístků`;
}

function startBigMatch(state: GameState, up: BigMatch): void {
  const bm: BigMatchState = {
    id: up.id,
    date: up.date,
    kind: up.kind,
    home: up.home,
    opponentName: up.opponentName,
    opponentId: up.opponentId,
    label: up.label,
    competition: up.competition,
    started: state.date,
    prep: {},
  };
  // Posun se zastaví jen u opravdu velkých chvil a nejvýš jednou za 12 dní.
  const prev = state.bigMatch;
  const euro = euroOf(state, up.id);
  const firstLeague = !!euro && euro.tie === undefined && !findEuroMatch(state, up.id)?.run.matches.some((m) => m.tie === undefined && m.result);
  const major = up.kind === 'derby' || up.kind === 'baraz' || (!!euro && (euro.tie !== undefined || firstLeague));
  const rested = !prev?.lastStop || prev.lastStop <= addDays(state.date, -12);
  bm.lastStop = major && rested ? state.date : prev?.lastStop;
  bm.hype = computeHype(state, bm);
  state.bigMatch = bm;
  const days = daysToBigMatch(state, up);
  const kind = BIG_MATCH_LABEL[up.kind];
  const parts = [`${up.competition}, ${up.home ? 'doma' : 'venku'}, za ${days} ${days === 1 ? 'den' : days < 5 ? 'dny' : 'dní'}.`];
  if (up.home) {
    const d = ticketDemand(state, bm);
    parts.push(`Předprodej: ${demandText(d)}.`);
    parts.push('Lístky, choreo a bezpečnost nastavíte na kartě odpočtu na domově Týden (jinak platí výchozí volby).');
  }
  addNews(state, { kind: 'info', title: `Začíná týden: ${kind.toLowerCase()} ${pairing(state, up)}`, text: parts.join(' ') });
}

/** Předvečer: příjezd hostujících fanoušků u Evropy doma, cesta týmu na venkovní velký zápas. */
function eveNews(state: GameState, bm: BigMatchState): void {
  const e = euroOf(state, bm.id);
  if (bm.home && e) {
    const guests = prepValue(state, bm, 'guests') === 'plny' ? 0.1 : 0.05;
    const n = Math.round((state.clubs[state.owner.clubId].stadium.capacity * guests) / 50) * 50;
    const spend = n * 1_800;
    addNews(state, {
      kind: 'info',
      title: `Do města dorazili fanoušci ${e.opponent.name}`,
      text: `Asi ${n.toLocaleString('cs-CZ')} hostů z ${e.opponent.country === 'Česko' ? 'ciziny' : `země ${e.opponent.country}`}. Ve městě utratí kolem ${mil(spend)}.${isRiskyMatch(state, bm) ? ' Policie je v pohotovosti, hosté mají pověst rizikových fanoušků.' : ''}`,
    });
    if (spend >= 1_000_000) changeCity(state, 1);
  } else if (!bm.home && e) {
    addNews(state, { kind: 'info', title: `Tým odletěl k zápasu: ${e.opponent.name}`, text: `Výprava odletěla charterem (${e.opponent.country}). Na letišti se loučilo pár desítek věrných fanoušků.` });
  } else if (!bm.home && bm.kind === 'derby') {
    addNews(state, { kind: 'info', title: `Výjezd na derby: ${bm.opponentName}`, text: 'Kotel chystá výjezd, policie bude fanoušky doprovázet od nádraží až ke stadionu.' });
  }
}

/** Je možné začít nový týden velkého zápasu (předchozí je vyúčtovaný a reakce po něm měly čas)? */
function canReplace(state: GameState, up: BigMatch): boolean {
  const cur = state.bigMatch;
  if (!cur) return true;
  if (!cur.settled) return cur.date < addDays(state.date, -3);
  if (cur.date >= state.date) return false;
  return cur.date <= addDays(state.date, -2) || daysToBigMatch(state, up) <= 3;
}

/**
 * Každý den (engine/game.ts): vyúčtuje odehraný velký zápas, založí týden dalšího,
 * vede napětí a v předvečer napíše zprávy o hostech a cestě.
 */
export function dailyBigMatch(state: GameState): void {
  const cur = state.bigMatch;
  if (cur && !cur.settled && state.date >= cur.date) settleBigMatch(state, cur);
  if (!state.owner.ousted) {
    const up = upcomingBigMatch(state, 7);
    if (up && up.id !== state.bigMatch?.id && canReplace(state, up)) startBigMatch(state, up);
  }
  const bm = state.bigMatch;
  if (bm && !bm.settled && bm.date > state.date) {
    bm.hype = computeHype(state, bm);
    if (bm.date === addDays(state.date, 1)) eveNews(state, bm);
  }
}

/** Důvod zastavení posunu: právě začal týden velkého zápasu (jen jednou za zápas). */
export function bigMatchWeekStarted(state: GameState, prevId: string | undefined): string | undefined {
  const bm = state.bigMatch;
  if (!bm || bm.id === prevId || bm.started !== state.date || bm.lastStop !== state.date || bm.settled) return undefined;
  const kind = BIG_MATCH_LABEL[bm.kind as BigMatchKind] ?? 'Velký zápas';
  return `Začíná týden: ${kind.toLowerCase()} ${pairing(state, bm)}. Přípravu najdete na domově Týden.`;
}

/** Evropský zápas klubu majitele, který se hraje zítra (hra stojí na jeho předvečeru). */
export function euroMatchTomorrow(state: GameState): EuroMatch | undefined {
  const e = nextEuroMatch(state);
  return e && e.date === addDays(state.date, 1) && !state.owner.ousted ? e : undefined;
}

// ---------- Body zlomu v přenosu ----------

export type LiveMomentKind = 'verdikt' | 'pyro' | 'vabank';

export interface LiveMoment {
  kind: LiveMomentKind;
  minute: number;
  title: string;
  text: string;
  options: PrepOption[];
  def: string;
}

/** Nejvýš dvě rozhodnutí za zápas (navíc k poločasu). */
export const MAX_LIVE_DECISIONS = 2;

function avoidHalf(m: number): number {
  return m >= 43 && m <= 47 ? m + 5 : m;
}

/** Předem dané body zlomu (sporný verdikt, pyro). Nezávisí na průběhu, takže platí i bez přenosu. */
export function scheduledMoments(state: GameState, bm: BigMatchState): LiveMoment[] {
  if (bm.id.startsWith('eu-')) return [];
  const out: LiveMoment[] = [];
  const pyro = prepEffect(state, bm).pyro;
  if (bm.home && hash01(`${bm.id}-pyro`) < pyro) {
    const minute = avoidHalf(18 + Math.floor(hash01(`${bm.id}-pyro-min`) * 52));
    out.push({
      kind: 'pyro',
      minute,
      title: 'Pyro a přerušení',
      text: 'Z kotle letí světlice na hřiště, rozhodčí přerušil zápas. Delegát svazu si zapisuje.',
      def: 'poradatele',
      options: [
        { id: 'uklidnit', label: 'Jít uklidnit kotel', hint: ultrasOf(state).relation >= 40 ? 'Kotel vás respektuje: rychle se uklidní, pokuta bude nižší.' : 'Kotel vám moc nevěří, může vás vypískat. Pokuta bude nižší.' },
        { id: 'poradatele', label: 'Nechat to na pořadatelích', hint: 'Dlouhé přerušení, atmosféra ochladne, plná pokuta.' },
      ],
    });
  }
  if (hash01(`${bm.id}-verdikt`) < 0.3) {
    let minute = avoidHalf(22 + Math.floor(hash01(`${bm.id}-verdikt-min`) * 58));
    if (out.some((m) => Math.abs(m.minute - minute) < 6)) minute = Math.min(84, minute + 8);
    out.push({
      kind: 'verdikt',
      minute,
      title: 'Sporný verdikt',
      text: 'Rozhodčí po dlouhém zkoumání u videa neuznal váš gól. Stadion bouří, lavička běží k delegátovi.',
      def: 'klid',
      options: [
        { id: 'protest', label: 'Protestovat u delegáta', hint: 'Tým i stadion se nabudí, ale hrozí pokuta a horší vztah se svazem.' },
        { id: 'klid', label: 'Zachovat klid', hint: 'Svaz to ocení, hra pokračuje bez emocí.' },
      ],
    });
  }
  return out.sort((a, b) => a.minute - b.minute).slice(0, MAX_LIVE_DECISIONS);
}

/** 75. minuta a prohráváte: vzkázat trenérovi vabank (jen když zbývá místo na rozhodnutí). */
export function vabankMoment(): LiveMoment {
  return {
    kind: 'vabank',
    minute: 75,
    title: '75. minuta a prohráváte',
    text: 'Čas utíká. Trenér se otáčí k lóži, čeká, jestli něco vzkážete.',
    def: 'nechat',
    options: [
      { id: 'vabank', label: 'Vzkázat vabank', hint: 'Všechno dopředu: víc šancí, ale i riziko dalšího gólu.' },
      { id: 'nechat', label: 'Nechat to na trenérovi', hint: 'Trenér ví, co dělá.' },
    ],
  };
}

/** Zapíše rozhodnutí majitele v bodě zlomu (přenos). Nemění nic jiného. */
export function recordLiveChoice(prev: GameState, kind: LiveMomentKind, minute: number, choice: string): GameState {
  const bm = prev.bigMatch;
  if (!bm) return prev;
  const state = structuredClone(prev);
  const list = (state.bigMatch!.live ?? []).filter((x) => x.kind !== kind);
  list.push({ kind, minute, choice });
  state.bigMatch!.live = list;
  return state;
}

function liveChoice(bm: BigMatchState, m: LiveMoment): string {
  return bm.live?.find((x) => x.kind === m.kind)?.choice ?? m.def;
}

/** Vyloučení trenéra po protestu (deterministicky podle zápasu). */
function coachSentOff(bm: BigMatchState): boolean {
  return hash01(`${bm.id}-vykazan`) < 0.3;
}

/** Hák do zápasu (engine/game.ts): změny od bodů zlomu (volby majitele, nebo výchozí). */
export function liveChanges(state: GameState, f: Fixture): MatchOptions['changes'] {
  const bm = state.bigMatch;
  if (!bm || bm.id !== f.id) return undefined;
  const ownHome = f.homeId === state.owner.clubId;
  const side = (change: { style?: 'utocny'; bonus?: number }) => (ownHome ? { home: change } : { away: change });
  const out: NonNullable<MatchOptions['changes']> = [];
  for (const m of scheduledMoments(state, bm)) {
    const c = liveChoice(bm, m);
    if (m.kind === 'pyro') {
      if (c === 'poradatele') out.push({ minute: m.minute, homeEdge: -0.5 });
      else if (ultrasOf(state).relation >= 40) out.push({ minute: m.minute, homeEdge: 0.3 });
    } else if (m.kind === 'verdikt' && c === 'protest') {
      out.push({ minute: m.minute, ...side({ bonus: coachSentOff(bm) ? -0.3 : 0.45 }), homeEdge: ownHome ? 0.3 : 0 });
    }
  }
  const vab = bm.live?.find((x) => x.kind === 'vabank');
  if (vab?.choice === 'vabank') out.push({ minute: vab.minute, ...side({ style: 'utocny', bonus: 0.5 }) });
  return out.length ? out : undefined;
}

// ---------- Atmosféra přenosu ----------

/** Výchozí hlasitost stadionu 0–100 podle přípravy, kotle a napětí. */
export function crowdBase(state: GameState, bm: BigMatchState | undefined, home: boolean): number {
  if (!home) return 32;
  const hype = bm?.hype ?? 50;
  const edge = bm ? prepEffect(state, bm).homeEdge : 0;
  return Math.round(clamp(45 + hype / 5 + edge * 12 + (ultrasOf(state).relation - 50) / 5, 20, 92));
}

/**
 * Hlasitost kotle po událostech do dané minuty: vlastní gól ji zvedne, gól soupeře srazí,
 * závěr vyrovnaného zápasu ji vyhecuje, pyro ji krátce vystřelí nahoru.
 */
export function crowdLevel(base: number, goals: { minute: number; own: boolean }[], minute: number, extra: { minute: number; delta: number }[] = []): number {
  let level = base;
  let gf = 0;
  let ga = 0;
  const marks = [...goals.map((g) => ({ minute: g.minute, delta: g.own ? 22 : -16, goal: g.own ? 1 : -1 })), ...extra.map((x) => ({ ...x, goal: 0 }))]
    .filter((x) => x.minute <= minute)
    .sort((a, b) => a.minute - b.minute);
  let last = 0;
  for (const m of marks) {
    // Mezi událostmi se hlasitost vrací k základu.
    level = base + (level - base) * Math.pow(0.97, m.minute - last);
    level += m.delta;
    if (m.goal > 0) gf += 1;
    if (m.goal < 0) ga += 1;
    last = m.minute;
  }
  level = base + (level - base) * Math.pow(0.97, Math.max(0, minute - last));
  // Skóre drží hladinu: vedení zvedá, prohra tlumí.
  level += (gf - ga) * 6;
  if (minute >= 80 && Math.abs(gf - ga) <= 1) level += 8;
  return Math.round(clamp(level, 5, 100));
}

const INTRO: Record<BigMatchKind, string[]> = {
  derby: ['Stadion hučí už hodinu před výkopem. Kotel spouští chorál a celé tribuny ho po sloce přebírají.', 'Nástup týmů: „Kdo neskáče, není náš!“ Skáče celý stadion.'],
  evropa: ['Zní znělka evropských pohárů, hráči stojí v řadě a stadion zpívá s ní.', 'Evropský večer: kotel vítá hosty transparentem přes celou tribunu.'],
  titul: ['Zápas o čelo tabulky: tribuny skandují jméno klubu ještě před výkopem.', 'Nástup týmů. Kotel: „Jdeme si pro titul!“'],
  zachrana: ['Nervózní ticho, pak kotel zavelí: „Bojovat, bojovat!“', 'O záchranu se hraje srdcem. Fanoušci to týmu dávají najevo od první minuty.'],
  pohar: ['Pohárový večer pod světly. Kotel chystá chorál o cestě do finále.', 'Nástup týmů, „Pohár je náš!“ zní z kotle.'],
  baraz: ['Baráž: všechno, nebo nic. Stadion je nabitý k prasknutí.', 'Nástup týmů za bubnů a bengálů v dálce.'],
};

/** Texty nástupu: chorál, znělka u Evropy, host v lóži. */
export function matchIntro(state: GameState, bm: BigMatchState | undefined): string[] {
  if (!bm) return [];
  const kind = bm.kind as BigMatchKind;
  const lines = INTRO[kind] ?? INTRO.titul;
  const out = [lines[Math.floor(hash01(`${bm.id}-intro`) * lines.length)]];
  if (!bm.home) out[0] = kind === 'evropa' ? 'Zní znělka evropských pohárů. V rohu stadionu zpívá hrstka vašich věrných, kteří přiletěli s týmem.' : 'Hostující sektor je plný: vaši fanoušci přehlušují domácí už při nástupu.';
  if (bm.home && prepValue(state, bm, 'choreo') === 'zaplatit') out.push('Kotel odhaluje velké choreo přes celou tribunu. Hráči se zastaví a koukají.');
  const box = hasOwnerBox(bm) ? prepValue(state, bm, 'box') : undefined;
  if (box === 'sponzor') out.push('V lóži s vámi sedí generální partner. Usmívá se, zatím.');
  if (box === 'starosta') out.push(`V lóži s vámi sedí primátor ${cityOf(state).mayor} a mává do kamer.`);
  if (box === 'legenda') out.push(`V lóži s vámi sedí legenda ${clubLegend(state)}. Stadion skanduje jeho jméno.`);
  return out;
}

/** Komentář ke gólu podle druhu zápasu, strany a skóre po gólu (z pohledu klubu majitele). */
export function goalCry(bm: BigMatchState | undefined, own: boolean, minute: number, gf?: number, ga?: number): string {
  const late = minute >= 85;
  const fans = bm && !bm.home ? 'Hostující sektor' : 'Kotel';
  const known = gf !== undefined && ga !== undefined;
  if (own) {
    if (late) return known && gf! > ga! ? 'Stadion vybuchl! Vítězný gól v samém závěru!' : 'Gól v samém závěru! Tohle se bude vyprávět.';
    if (known && gf === ga) return `Vyrovnáno! ${fans} šílí.`;
    if (known && gf! < ga!) return `Kontaktní gól! ${fans} znovu věří.`;
    if (bm?.kind === 'derby') return `Město je vaše! ${fans} šílí.`;
    if (bm?.kind === 'evropa') return 'Evropa to slyší! Tribuny se otřásají.';
    return `${fans} skáče, celý stadion zpívá.`;
  }
  if (late) return 'Ticho jako v kostele. Takhle pozdě…';
  if (known && ga! > gf! + 1) return 'Soupeř odskakuje. Tribuny ztichly.';
  if (bm?.kind === 'derby') return bm.home ? 'Hostující sektor jásá, domácí tribuny zbledly.' : 'Domácí stadion vybuchl, váš sektor stojí v tichu.';
  return `Soupeř udeřil. ${fans} se ale nevzdává.`;
}

/** Závěrečný komentář. */
export function finalWhistle(bm: BigMatchState | undefined, gf: number, ga: number): string {
  const kind = bm?.kind;
  if (gf > ga) return kind === 'derby' ? 'Derby je vaše! Hráči běží ke kotli, celé město bude slavit do rána.' : kind === 'evropa' ? 'Evropský večer, na který se nezapomíná. Hráči tančí před kotlem.' : 'Konec! Stadion tleská vestoje.';
  if (gf < ga) return kind === 'derby' ? 'Derby je ztracené. Kotel mlčí, pak začne zpívat na povzbuzení.' : 'Konec. Tribuny tleskají za snahu, zklamání je ale cítit.';
  return 'Remíza. Tribuny nevědí, jestli slavit, nebo litovat.';
}

// ---------- Vyúčtování po zápase ----------

interface OwnResult {
  gf: number;
  ga: number;
  goals: { minute: number; own: boolean; playerId?: string }[];
  reds: number;
}

function ownResult(state: GameState, bm: BigMatchState): OwnResult | undefined {
  const own = state.owner.clubId;
  const e = euroOf(state, bm.id);
  if (e) {
    if (!e.result) return undefined;
    const goals = [...e.result.scorers.map((s) => ({ minute: s.minute, own: true, playerId: s.playerId })), ...e.result.oppMinutes.map((m) => ({ minute: m, own: false }))].sort((a, b) => a.minute - b.minute);
    const reds = (e.result.match?.detail?.events ?? []).filter((x) => x.clubId === own && (x.type === 'cervena' || x.type === 'druha-zluta')).length; // V4
    return { gf: e.result.own, ga: e.result.opp, goals, reds };
  }
  const f = allFixtures(state).find((x) => x.fixture.id === bm.id)?.fixture;
  if (!f?.result) return undefined;
  const home = f.homeId === own;
  const goals = f.result.scorers.map((s) => ({ minute: s.minute, own: s.clubId === own, playerId: s.playerId })).sort((a, b) => a.minute - b.minute);
  const reds = (f.result.detail?.events ?? []).filter((x) => x.clubId === own && (x.type === 'cervena' || x.type === 'druha-zluta')).length;
  return { gf: home ? f.result.homeGoals : f.result.awayGoals, ga: home ? f.result.awayGoals : f.result.homeGoals, goals, reds };
}

/** Klíčové momenty z průběhu zápasu (pro titulky novin a sociální sítě). */
export function resultMoments(state: GameState, r: OwnResult): string[] {
  const out: string[] = [];
  const name = (id?: string) => (id && state.players[id] ? `${state.players[id].firstName} ${state.players[id].lastName}` : '');
  let gf = 0;
  let ga = 0;
  let worst = 0;
  for (const g of r.goals) {
    if (g.own) gf += 1;
    else ga += 1;
    worst = Math.min(worst, gf - ga);
  }
  const lateOwn = r.goals.filter((g) => g.own && g.minute >= 88).pop();
  if (lateOwn) out.push(`Gól v závěru: ${name(lateOwn.playerId)} (${lateOwn.minute}. min)`);
  const lateOpp = r.goals.filter((g) => !g.own && g.minute >= 88).pop();
  if (lateOpp) out.push(`Inkasovaný gól v závěru (${lateOpp.minute}. min)`);
  if (worst <= -1 && r.gf > r.ga) out.push(`Otočka z ${-worst === 1 ? 'jednogólového' : `${-worst}gólového`} manka`);
  if (r.gf - r.ga >= 3) out.push(`Demolice ${r.gf}:${r.ga}`);
  if (r.ga - r.gf >= 3) out.push(`Debakl ${r.gf}:${r.ga}`);
  const hat = new Map<string, number>();
  for (const g of r.goals) if (g.own && g.playerId) hat.set(g.playerId, (hat.get(g.playerId) ?? 0) + 1);
  for (const [id, n] of hat) if (n >= 2) out.push(`${n >= 3 ? 'Hattrick' : 'Dva góly'}: ${name(id)}`);
  if (r.reds) out.push('Vyloučení ve vašem týmu');
  return out;
}

/** Vyúčtuje velký zápas: náklady a dopady přípravy, lóže, výtržnosti, body zlomu a momenty. */
export function settleBigMatch(state: GameState, bm: BigMatchState): void {
  const r = ownResult(state, bm);
  if (!r) {
    // Zápas se neodehrál (odložen): po třech dnech příprava propadne.
    if (state.date > addDays(bm.date, 2)) bm.settled = true;
    return;
  }
  const own = state.owner.clubId;
  const club = state.clubs[own];
  // Kotel při zápase (před dopady vyúčtování), stejně jako v liveChanges.
  const calm = ultrasOf(state).relation >= 40;
  const report: string[] = [];
  const moments: string[] = [];
  const won = r.gf > r.ga;
  const lost = r.gf < r.ga;
  const kind = BIG_MATCH_LABEL[bm.kind as BigMatchKind] ?? 'Velký zápas';
  if (bm.home) {
    const v = (k: PrepKey) => prepValue(state, bm, k);
    const d = ticketDemand(state, bm);
    if (d.hours) moments.push(`Vyprodáno za ${d.hours} h`);
    const t = v('tickets');
    if (t === 'zdrazit') {
      changeUltras(state, -4);
      club.fanMood = clamp(club.fanMood - 2, 0, 100);
      report.push('Dražší vstupné: víc peněz, kotel reptá.');
      backlash(state, 'ceny', `Fanoušci zuří kvůli zdraženým lístkům na zápas ${pairing(state, bm)}.`); // W2: kauza na sítích
    } else if (t === 'lidove') {
      changeUltras(state, 3);
      club.fanMood = clamp(club.fanMood + 2, 0, 100);
      changeCity(state, 1);
      report.push('Lidové ceny: fanoušci to ocenili.');
    }
    const a = v('alloc');
    if (a === 'kotel') {
      changeUltras(state, 3);
      report.push('Víc místa pro kotel: bouřlivá kulisa.');
    } else if (a === 'rodiny') {
      changeCity(state, 2);
      club.fanMood = clamp(club.fanMood + 1, 0, 100);
      report.push('Rodinný sektor: klidný stadion, město spokojené.');
    }
    if (v('guests') === 'plny') {
      changeCity(state, 2);
      report.push('Plný příděl pro hosty: město vydělalo na hostujících fanoušcích.');
    }
    const c = v('choreo');
    if (c === 'zaplatit') {
      const cost = choreoCost(state);
      book(state, own, 'ostatni', -cost, `Choreo kotle: ${bm.label ?? kind}`);
      changeUltras(state, 5);
      moments.push('Velké choreo kotle');
      report.push(`Choreo kotle: −${mil(cost)}, kotel je nadšený.`);
    } else if (c === 'fanousci') {
      changeUltras(state, 1);
    } else if (c === 'zakaz') {
      changeUltras(state, -6);
      league(state, 2);
      report.push('Zákaz pyrotechniky: svaz spokojený, kotel uražený.');
    }
    if (v('security') === 'posilit') {
      const cost = securityCost(state);
      book(state, own, 'ostatni', -cost, `Posílená pořadatelská služba: ${bm.label ?? kind}`);
      report.push(`Posílení pořadatelé: −${mil(cost)}.`);
    }
    const box = hasOwnerBox(bm) ? v('box') : undefined;
    if (box === 'sponzor') {
      changeSponsorRelation(state, 'generalni', won ? 8 : 5);
      report.push('Lóže: generální partner si večer užil.');
    } else if (box === 'starosta') {
      changeCity(state, won ? 6 : 4);
      report.push(`Lóže: primátor ${cityOf(state).mayor} odcházel spokojený.`);
    } else if (box === 'legenda') {
      club.fanMood = clamp(club.fanMood + 2, 0, 100);
      changeUltras(state, 2);
      media(state, 1);
      moments.push(`Legenda ${clubLegend(state)} v lóži majitele`);
      report.push('Lóže: legenda klubu s vámi, fanoušci to ocenili.');
    }
  }
  // Body zlomu z přenosu (nebo výchozí volby).
  for (const m of scheduledMoments(state, bm)) {
    const c = liveChoice(bm, m);
    if (m.kind === 'pyro') {
      const amount = fine(state, c === 'uklidnit' ? 60_000 : 120_000, `Pokuta za pyrotechniku: ${bm.label ?? kind}`);
      if (c === 'uklidnit') {
        if (calm) {
          changeUltras(state, 4);
          media(state, 1);
          moments.push(`Majitel uklidnil kotel po pyru (${m.minute}. min)`);
        } else {
          changeUltras(state, -1);
          media(state, -1);
          moments.push(`Kotel vypískal majitele při přerušení (${m.minute}. min)`);
        }
      } else {
        changeUltras(state, -3);
        moments.push(`Pyro a přerušení zápasu (${m.minute}. min)`);
      }
      report.push(`Pyro v ${m.minute}. minutě: pokuta ${mil(amount)}.`);
    } else if (m.kind === 'verdikt') {
      if (c === 'protest') {
        league(state, -3);
        club.fanMood = clamp(club.fanMood + 2, 0, 100);
        const sent = coachSentOff(bm);
        moments.push(sent ? `Trenér vykázán na tribunu po protestu (${m.minute}. min)` : `Protest u delegáta po sporném verdiktu (${m.minute}. min)`);
        if (hash01(`${bm.id}-protest-pokuta`) < 0.5) {
          const amount = fine(state, 80_000, 'Pokuta za protesty u delegáta');
          report.push(`Protest u delegáta: pokuta ${mil(amount)}, vztah se svazem −3.`);
        } else report.push('Protest u delegáta: svaz se zlobí (vztah −3), pokuta tentokrát nepřišla.');
      } else {
        league(state, 1);
        moments.push(`Neuznaný gól (${m.minute}. min)`);
      }
    }
  }
  const vab = bm.live?.find((x) => x.kind === 'vabank');
  if (vab?.choice === 'vabank') {
    state.owner.trust.trener = clamp(state.owner.trust.trener + (lost ? -2 : 1), 0, 100);
    moments.push(lost ? 'Vabank v závěru nevyšel' : 'Vabank od 75. minuty se vyplatil');
  }
  // Výtržnosti (deterministicky podle zápasu a rizika).
  const risk = prepEffect(state, bm).risk * (lost ? 1.3 : won ? 0.8 : 1);
  if (hash01(`${bm.id}-vytrznosti`) < risk) {
    const amount = fine(state, bm.home ? 180_000 : 90_000, `Pokuta za výtržnosti fanoušků: ${bm.label ?? kind}`);
    changeCity(state, -3);
    media(state, -1);
    moments.push('Výtržnosti fanoušků');
    report.push(`Výtržnosti fanoušků: pokuta ${mil(amount)}, město nespokojené.`);
    addNews(state, { kind: 'varovani', title: `Výtržnosti po zápase: ${pairing(state, bm)}`, text: `Disciplinárka udělila pokutu ${mil(amount)}.${prepValue(state, bm, 'security') === 'posilit' ? ' Posílení pořadatelé zabránili horšímu.' : ''}` });
  }
  if (bm.kind === 'derby' && bm.opponentId) touchRival(state, bm.opponentId, lost ? 0 : -2, 3, `derby ${r.gf}:${r.ga}`);
  bm.result = { gf: r.gf, ga: r.ga };
  bm.moments = [...(bm.moments ?? []), ...resultMoments(state, { ...r }), ...moments];
  bm.report = report;
  bm.settled = true;
  if (report.length) addNews(state, { kind: 'info', title: `Účet za ${kind.toLowerCase()}: ${pairing(state, bm)}`, text: report.join(' ') });
}

/** Krátký přehled posledního odehraného velkého zápasu (pro kartu po zápase). */
export function lastBigMatch(state: GameState): BigMatchState | undefined {
  const bm = state.bigMatch;
  return bm?.settled && bm.result ? bm : undefined;
}

// ---------- Evropský přenos (zjednodušený) ----------

export interface EuroLiveEvent {
  minute: number;
  own: boolean;
  playerId?: string;
}

/**
 * Evropské zápasy nemají minutovou simulaci: výsledek se generuje z poměru sil (engine/europe.ts).
 * Přenos proto ukazuje góly z vygenerovaného výsledku s atmosférou, bez bodů zlomu (ty by nebyly poctivé).
 */
export function euroLiveEvents(state: GameState, matchId: string): EuroLiveEvent[] {
  const e = euroOf(state, matchId);
  if (!e?.result) return [];
  return [...e.result.scorers.map((s) => ({ minute: s.minute, own: true, playerId: s.playerId })), ...e.result.oppMinutes.map((m) => ({ minute: m, own: false }))].sort((a, b) => a.minute - b.minute);
}

// ---------- Los evropských pohárů ----------

/** Nový los, který majitel ještě neodkryl (karta na Přehledu). */
export function pendingEuroDraw(state: GameState): GameState['euroDraw'] {
  const d = state.euroDraw;
  return d && !d.seen && d.date >= addDays(state.date, -21) ? d : undefined;
}

export function markEuroDrawSeen(prev: GameState): GameState {
  if (!prev.euroDraw || prev.euroDraw.seen) return prev;
  const state = structuredClone(prev);
  state.euroDraw!.seen = true;
  return state;
}
