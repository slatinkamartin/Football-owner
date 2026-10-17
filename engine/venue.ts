import { addDays } from './calendar';
import { book } from './finance';
import { league as leagueRep } from './grey';
import { changeCity } from './surroundings';
import type { Rng } from './rng';
import type { ActionResult } from './staff';
import type { Club, GameState } from './types';
import { addNews, clamp, competitionOf, tierOf } from './world';

/**
 * Stadion, který žije: sektory (kotel a rodinný sektor), konkrétní nabídky akcí místo posuvníku,
 * stav stadionu a licenční kategorie, vylepšení dne zápasu.
 */

const mil = (v: number) => `${(v / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč`;
const own = (s: GameState) => s.clubs[s.owner.clubId];

// ---------- Sektory ----------

export interface SectorEffect {
  homeEdge: number;
  attendance: number;
  /** Průměrná cena lístku proti plné ceně. */
  ticketFactor: number;
  catering: number;
  incidents: number;
  /** Měsíční posun vztahu s kotlem a nálady fanoušků. */
  ultrasDrift: number;
  moodDrift: number;
}

export function sectorsOf(club: Club) {
  return club.policy.sectors ?? { kotel: 'stredni' as const, rodina: 'maly' as const };
}

export function sectorEffect(club: Club): SectorEffect {
  const s = sectorsOf(club);
  const k = { maly: { homeEdge: -0.3, ticket: 0.02, incidents: 0.8, ultras: -0.5 }, stredni: { homeEdge: 0, ticket: 0, incidents: 1, ultras: 0 }, velky: { homeEdge: 0.6, ticket: -0.04, incidents: 1.3, ultras: 0.6 } }[s.kotel];
  const r = { zadny: { attendance: -0.02, ticket: 0.02, catering: -0.03, incidents: 1.05, mood: -0.1 }, maly: { attendance: 0, ticket: 0, catering: 0, incidents: 1, mood: 0 }, velky: { attendance: 0.06, ticket: -0.05, catering: 0.08, incidents: 0.9, mood: 0.2 } }[s.rodina];
  return {
    homeEdge: k.homeEdge,
    attendance: 1 + r.attendance,
    ticketFactor: 1 + k.ticket + r.ticket,
    catering: 1 + r.catering,
    incidents: k.incidents * r.incidents,
    ultrasDrift: k.ultras,
    moodDrift: r.mood,
  };
}

export function setSectors(prev: GameState, patch: Partial<ReturnType<typeof sectorsOf>>): ActionResult {
  const state = structuredClone(prev);
  const club = own(state);
  club.policy.sectors = { ...sectorsOf(club), ...patch };
  return { state, ok: true, message: 'Rozdělení stadionu upraveno, platí od příštího domácího zápasu.' };
}

// ---------- Vylepšení dne zápasu ----------

export type ExtraKind = 'fanzona' | 'rodina' | 'muzeum' | 'obrazovka';

export function hasExtra(club: Club, kind: ExtraKind): boolean {
  return (club.facilities.extras ?? []).includes(kind);
}

/** Útrata a návštěva podle vylepšení dne zápasu. */
export function extrasEffect(club: Club): { catering: number; attendance: number } {
  return { catering: hasExtra(club, 'fanzona') ? 1.1 : 1, attendance: hasExtra(club, 'rodina') ? 1.03 : 1 };
}

/** Měsíční příjmy z muzea a obrazovky. */
export function extrasMonthly(state: GameState): { museum: number; screen: number } {
  const club = own(state);
  const k = { 1: 1, 2: 0.4, 3: 0.15 }[Math.min(3, tierOf(state, club.id))] ?? 0.1;
  const trophies = (state.trophies ?? []).length;
  return {
    museum: hasExtra(club, 'muzeum') ? Math.round((40_000 + trophies * 15_000) * k) : 0,
    screen: hasExtra(club, 'obrazovka') ? Math.round(150_000 * k) : 0,
  };
}

// ---------- Stav stadionu a kategorie ----------

export function conditionOf(club: Club): number {
  return club.facilities.condition ?? 80;
}

/** Licenční kategorie stadionu (pro evropské zápasy aspoň 3). */
export function stadiumCategory(club: Club): { category: number; missing: string[] } {
  const f = club.facilities;
  const cond = conditionOf(club);
  const missing: string[] = [];
  const cap = club.stadium.capacity;
  let category = 1;
  if (cap >= 3000) category = 2;
  if (cap >= 4500 && f.heating && cond >= 50) category = 3;
  if (cap >= 8000 && f.heating && f.vip >= 10 && cond >= 60) category = 4;
  if (category < 3) {
    if (cap < 4500) missing.push('kapacita aspoň 4 500');
    if (!f.heating) missing.push('vyhřívaný trávník');
    if (cond < 50) missing.push('stav stadionu aspoň 50');
  }
  if (category < 4) {
    if (cap < 8000) missing.push('pro kategorii 4: kapacita 8 000');
    if (f.vip < 10) missing.push('pro kategorii 4: 10 skyboxů');
  }
  return { category, missing };
}

/** Měsíčně: stadion stárne podle údržby, při špatném stavu přicházejí poruchy. */
export function monthlyCondition(state: GameState, rng: Rng): void {
  const club = own(state);
  const level = club.policy.maintenance ?? 'bezna';
  const drift = level === 'vysoka' ? 0.6 : level === 'nizka' ? -1.4 : -0.3;
  club.facilities.condition = clamp(conditionOf(club) + drift + (club.facilities.newStadium ? 0.2 : 0), 0, 100);
  const cond = club.facilities.condition;
  if (cond < 45 && rng.next() < (45 - cond) / 120) {
    const tier = tierOf(state, club.id);
    const cost = Math.round(({ 1: 1_500_000, 2: 500_000, 3: 150_000 }[Math.min(3, tier)] ?? 100_000) * (1 + rng.next()));
    const kind = rng.next() < 0.5 ? 'Selhalo osvětlení' : 'Prasklo potrubí v kabinách';
    book(state, club.id, 'udrzba', -cost, `Porucha: ${kind}`);
    club.fanMood = clamp(club.fanMood - 1, 0, 100);
    addNews(state, { kind: 'varovani', title: `Porucha na stadionu: ${kind}`, text: `Oprava ${mil(cost)}. Stav stadionu je ${Math.round(cond)} ze 100, vyšší údržba by poruchám předešla.` });
  }
  if (cond < 25) {
    const f = club.facilities;
    if (f.medical > 1) f.medical -= 1;
    else if (f.training > 1) f.training -= 1;
    club.facilities.condition = 45;
    addNews(state, { kind: 'varovani', title: 'Zázemí zchátralo', text: 'Bez údržby přišlo zázemí o hvězdu. Údržbu nastavíte ve Výdajích.' });
  }
}

/** Evropa: bez kategorie 3 hraje klub domácí zápasy jinde a přijde o část příjmů. */
export function europeVenueFactor(club: Club): number {
  return stadiumCategory(club).category >= 3 ? 1 : 0.85;
}

// ---------- Nabídky akcí ----------

const EVENT_KINDS = {
  koncert: { label: 'Koncert hvězdy', income: 3, damage: 0.55 },
  firemni: { label: 'Firemní den', income: 0.8, damage: 0.1 },
  reprezentace: { label: 'Zápas reprezentace', income: 1.5, damage: 0.05 },
  kluziste: { label: 'Zimní kluziště a trhy', income: 1.2, damage: 0.25 },
} as const;

/** Nejbližší domácí zápas po datu (kvůli riziku pro trávník). */
function nextHomeMatchAfter(state: GameState, date: string): string | undefined {
  const comp = competitionOf(state, state.owner.clubId);
  return comp?.fixtures.filter((f) => f.homeId === state.owner.clubId && f.date > date).map((f) => f.date).sort()[0];
}

/** Dvakrát za měsíc: nová nabídka akce. Přijatá akce se odehraje v daný den. */
export function eventOfferTick(state: GameState, rng: Rng): void {
  const club = own(state);
  state.eventOffers = (state.eventOffers ?? []).filter((o) => o.accepted ? o.date >= state.date : o.expires >= state.date && o.date > state.date);
  if (state.eventOffers.filter((o) => !o.accepted).length >= 2 || rng.next() > 0.3) return;
  const m = Number(state.date.slice(5, 7));
  const pool: (keyof typeof EVENT_KINDS)[] = ['firemni', 'koncert'];
  if ([12, 1].includes(m)) pool.push('kluziste');
  if ([9, 10, 3, 6].includes(m) && stadiumCategory(club).category >= 3) pool.push('reprezentace');
  const kind = pool[Math.floor(rng.next() * pool.length)];
  const def = EVENT_KINDS[kind];
  const tier = tierOf(state, club.id);
  const base = (150_000 + club.stadium.capacity * 30) * (tier === 1 ? 1 : tier === 2 ? 0.6 : 0.35);
  const date = addDays(state.date, rng.int(10, 40));
  const next = nextHomeMatchAfter(state, date);
  const gap = next ? Math.round((new Date(`${next}T00:00:00Z`).getTime() - new Date(`${date}T00:00:00Z`).getTime()) / 86_400_000) : 30;
  const label = `${def.label}${next && gap <= 5 ? ` (${gap} dny před domácím zápasem)` : ''}`;
  state.eventOffers.push({ id: `ev${++state.nextId}`, kind, label, income: Math.round((base * def.income) / 10_000) * 10_000, date, damage: Math.min(0.9, def.damage * (gap <= 5 ? 1.4 : 1) * maintenanceDamage(club)), expires: addDays(state.date, 14) });
}

function maintenanceDamage(club: Club): number {
  return club.policy.maintenance === 'vysoka' ? 0.6 : club.policy.maintenance === 'nizka' ? 1.4 : 1;
}

/** Lze nabídku akce ještě přijmout? (nevypršela a akce je až v budoucnu) */
export function eventOfferOpen(state: GameState, o: { expires: string; date: string; accepted?: boolean }): boolean {
  return !o.accepted && o.expires >= state.date && o.date > state.date;
}

export function answerEventOffer(prev: GameState, id: string, accept: boolean): ActionResult {
  const state = structuredClone(prev);
  const o = (state.eventOffers ?? []).find((x) => x.id === id);
  if (!o) return { state: prev, ok: false, message: 'Nabídka už neplatí.' };
  if (accept && !o.accepted && !eventOfferOpen(prev, o)) {
    state.eventOffers = (state.eventOffers ?? []).filter((x) => x.id !== id);
    return { state, ok: false, message: 'Nabídka už neplatí: vypršel termín nebo akce už měla proběhnout.' };
  }
  if (!accept) {
    state.eventOffers = (state.eventOffers ?? []).filter((x) => x.id !== id);
    return { state, ok: true, message: 'Nabídka odmítnuta.' };
  }
  o.accepted = true;
  return { state, ok: true, message: `Přijato: ${o.label} ${o.date.split('-').reverse().join('. ')} za ${mil(o.income)}.` };
}

/** Denně: přijaté akce, které se dnes konají. */
export function dailyEvents(state: GameState, rng: Rng): void {
  const club = own(state);
  for (const o of (state.eventOffers ?? []).filter((x) => x.accepted && x.date === state.date)) {
    book(state, club.id, 'akce', o.income, `Akce na stadionu: ${o.label}`);
    if (o.kind === 'reprezentace') leagueRep(state, 3);
    // Akce pro veřejnost zlepší vztah s městem (koncert ruší sousedy jen málo).
    changeCity(state, o.kind === 'koncert' ? 0.5 : 1.5);
    if (rng.next() < o.damage && !(club.pitchDamagedUntil && club.pitchDamagedUntil >= state.date)) {
      const days = club.policy.maintenance === 'vysoka' ? 10 : club.policy.maintenance === 'nizka' ? 28 : 18;
      club.pitchDamagedUntil = addDays(state.date, days);
      addNews(state, { kind: 'varovani', title: `${o.label}: trávník je poškozený`, text: `Oprava potrvá asi ${days} dní.` });
    } else {
      addNews(state, { kind: 'info', title: `${o.label}: proběhlo bez problémů`, text: `Klub vydělal ${mil(o.income)}.` });
    }
  }
}

/** Plánované příjmy z přijatých akcí (pro výhled). */
export function scheduledEventIncome(state: GameState): { date: string; amount: number }[] {
  return (state.eventOffers ?? []).filter((o) => o.accepted && o.date > state.date).map((o) => ({ date: o.date, amount: o.income }));
}

/** Měsíčně: stav stadionu, vliv sektorů na kotel a náladu, příjmy z muzea a obrazovky. */
export function monthlyVenue(state: GameState, rng: Rng): void {
  const club = own(state);
  monthlyCondition(state, rng);
  const e = sectorEffect(club);
  if (state.ultras || e.ultrasDrift) state.ultras = { ...(state.ultras ?? { relation: 55 }), relation: clamp((state.ultras?.relation ?? 55) + e.ultrasDrift, 0, 100) };
  club.fanMood = clamp(club.fanMood + e.moodDrift, 0, 100);
  const x = extrasMonthly(state);
  if (x.museum) book(state, club.id, 'stadion', x.museum, 'Klubové muzeum a prohlídky stadionu');
  if (x.screen) book(state, club.id, 'komercni', x.screen, 'Reklama na velkoplošné obrazovce');
}
