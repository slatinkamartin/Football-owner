import { addDays } from './calendar';
import { easeAdd } from './ease'; // W2 kalibrace: tlumení zisků nad ~80
import { book, defaultTicketPrice } from './finance';
import { greyAction } from './grey';
import { clubValuation, satisfy } from './ownership';
import { squadOf } from './players';
import type { Rng } from './rng';
import type { ActionResult } from './staff';
import { computeTable } from './standings';
import type { GameEvent, GameState } from './types';
import { addNews, clamp, competitionOf, hash01, tierOf } from './world';

/**
 * Majitel a okolí klubu: byznys majitele (příjmy s výkyvy, investice, sponzoring vlastní firmou),
 * nabídka na převzetí klubu, primátor a volby, vztah s kotlem a síň slávy s odkazem majitele.
 */

const mil = (v: number) => `${(v / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč`;
const own = (s: GameState) => s.clubs[s.owner.clubId];

// ---------- Byznys majitele ----------

export type BusinessMood = 'boom' | 'normal' | 'krize';
export const BUSINESS_LABEL: Record<BusinessMood, string> = { boom: 'skvělý rok', normal: 'běžný rok', krize: 'krize v oboru' };
const MOOD_FACTOR: Record<BusinessMood, number> = { boom: 1.6, normal: 1, krize: 0.3 };

export function businessOf(state: GameState) {
  return state.business ?? { mood: 'normal' as BusinessMood, safe: 0, risky: 0, ownSponsor: 0 };
}

/** Osobní majetek majitele: peněženka + peníze uložené v investicích (bezpečné i rizikové). */
export function personalWealth(state: GameState): number {
  const b = businessOf(state);
  return state.owner.wallet + b.safe + b.risky;
}

/** Měsíční příjem majitele z firem (podle roku v oboru, minus sponzoring vlastní firmou). */
export function businessIncome(state: GameState, base: number): number {
  const b = businessOf(state);
  return Math.round(base * MOOD_FACTOR[b.mood] - b.ownSponsor / 12);
}

/** Začátek sezóny: jaký rok čeká firmy majitele. */
export function seasonBusiness(state: GameState, rng: Rng): void {
  const b = (state.business ??= businessOf(state));
  const x = rng.next();
  b.mood = x < 0.2 ? 'boom' : x < 0.8 ? 'normal' : 'krize';
  if (b.mood !== 'normal') addNews(state, { kind: b.mood === 'boom' ? 'info' : 'varovani', title: `Vaše firmy: ${BUSINESS_LABEL[b.mood]}`, text: b.mood === 'boom' ? 'Příjmy z podnikání letos vzrostou asi o 60 %.' : 'Příjmy z podnikání letos klesnou asi na třetinu. Do klubu půjde méně peněz.' });
}

/** Měsíčně: výnosy investic majitele. */
export function monthlyBusiness(state: GameState, rng: Rng): void {
  const b = (state.business ??= businessOf(state));
  if (b.safe > 0) b.safe = Math.round(b.safe * (1 + 0.03 / 12));
  if (b.risky > 0) b.risky = Math.max(0, Math.round(b.risky * (1 + 0.08 / 12 + (rng.next() - 0.5) * 0.12)));
  // Peněženka v minusu: firma sponzoring ukončí, majitel nemá z čeho platit.
  if (b.ownSponsor > 0 && state.owner.wallet <= 0) {
    b.ownSponsor = 0;
    addNews(state, { kind: 'varovani', title: 'Sponzoring vaší firmou skončil', text: 'Na osobním účtu nemáte peníze, firma proto přestala klub sponzorovat. Obnovit ho můžete, až budete mít z čeho.' });
    return;
  }
  // Sponzoring vlastní firmou: peníze jdou do klubu jako komerční příjem.
  if (b.ownSponsor > 0) book(state, state.owner.clubId, 'komercni', b.ownSponsor / 12, 'Sponzoring firmou majitele');
}

export function invest(prev: GameState, kind: 'safe' | 'risky', amount: number): ActionResult {
  const value = Math.floor(amount);
  if (value <= 0 || value > prev.owner.wallet) return { state: prev, ok: false, message: 'Na to nemáte osobní peníze.' };
  const state = structuredClone(prev);
  const b = (state.business ??= businessOf(state));
  state.owner.wallet -= value;
  b[kind] += value;
  return { state, ok: true, message: `Investováno ${mil(value)} ${kind === 'safe' ? 'bezpečně (asi 3 % ročně)' : 'rizikově (v průměru 8 % ročně, ale může i ztrácet)'}.` };
}

export function withdraw(prev: GameState, kind: 'safe' | 'risky'): ActionResult {
  const b = businessOf(prev);
  if (b[kind] <= 0) return { state: prev, ok: false, message: 'Nic tam není.' };
  const state = structuredClone(prev);
  const bs = (state.business ??= businessOf(state));
  const value = Math.round(bs[kind] * (kind === 'risky' ? 0.98 : 1));
  bs[kind] = 0;
  state.owner.wallet += value;
  return { state, ok: true, message: `Vybráno ${mil(value)}${kind === 'risky' ? ' (poplatek 2 %)' : ''}.` };
}

/** Sponzoring klubu vlastní firmou: rychlé peníze, ale střet zájmů. */
export function setOwnSponsor(prev: GameState, annual: number): ActionResult {
  if (!Number.isFinite(annual)) return { state: prev, ok: false, message: 'Zadejte platnou částku.' };
  if (annual > businessOf(prev).ownSponsor && prev.owner.wallet <= annual / 12) return { state: prev, ok: false, message: 'Na takový sponzoring nemáte na osobním účtu dost peněz (aspoň na měsíc dopředu).' };
  const state = structuredClone(prev);
  const b = (state.business ??= businessOf(state));
  const before = b.ownSponsor;
  b.ownSponsor = Math.max(0, Math.round(annual / 100_000) * 100_000);
  if (b.ownSponsor > before) {
    greyAction(state, { label: 'Sponzoring klubu vlastní firmou', severity: 10, minority: true }, 4);
    satisfy(state, -4, ['investor', 'spekulant']);
  }
  return { state, ok: true, message: b.ownSponsor ? `Vaše firma sponzoruje klub ${mil(b.ownSponsor)} ročně. Spolumajitelům a svazu se střet zájmů nelíbí.` : 'Sponzoring vlastní firmou skončil.' };
}

// ---------- Nabídka na převzetí ----------

export function takeoverTemplate() {
  return {
    weight: (s: GameState) => (s.owner.share >= 0.5 && !s.owner.ousted && s.season > Number(s.history[0]?.season ?? s.season) ? 0.08 : 0),
    create: (s: GameState) => {
      const price = Math.round((clubValuation(s) * 1.3) / 1_000_000) * 1_000_000;
      return {
        title: 'Konsorcium chce koupit celý klub',
        text: `Nabízí za 100 % klubu ${mil(price)} (o 30 % víc, než je hodnota). Váš podíl by vynesl ${mil(price * s.owner.share)}. Prodej znamená konec vaší éry.`,
        amount: price,
        defaultOption: 'odmitnout',
        options: [
          { id: 'prodat', label: 'Prodat a odejít', hint: `+${mil(price * s.owner.share)} do vašich peněz, hra končí s hodnocením vaší éry.` },
          { id: 'vyjednat', label: 'Chtít o 10 % víc', hint: 'Asi 50% šance, že přidají; jinak odejdou.' },
          { id: 'odmitnout', label: 'Odmítnout', hint: 'Klub není na prodej. Spekulanti mezi akcionáři jsou zklamaní.' },
        ],
      };
    },
    resolve: (s: GameState, e: GameEvent, o: string) => {
      let price = e.amount ?? 0;
      if (o === 'vyjednat') {
        if (hash01(`${e.id}-prevzeti`) < 0.5) return 'Konsorcium odmítlo přidat a odešlo.';
        price = Math.round(price * 1.1);
      }
      if (o === 'prodat' || o === 'vyjednat') {
        const gain = Math.round(price * s.owner.share);
        s.owner.wallet += gain;
        s.gameOver = { date: s.date, kind: 'prodej', reason: `${own(s).name} má nového majitele, prodej za ${mil(price)}. Váš podíl vynesl ${mil(gain)}, odcházíte s osobním majetkem ${mil(personalWealth(s))}. Odkaz vaší éry: ${legacyScore(s)} bodů.` };
        return s.gameOver.reason;
      }
      satisfy(s, -4, ['spekulant']);
      return 'Klub není na prodej.';
    },
  };
}

// ---------- Město a politika ----------

export type CityStance = 'sport' | 'neutral' | 'skeptik';
export const STANCE_LABEL: Record<CityStance, string> = { sport: 'fandí sportu', neutral: 'neutrální', skeptik: 'skeptický ke klubu' };
const MAYORS = ['Petr Novotný', 'Jana Dvořáková', 'Tomáš Svoboda', 'Hana Králová', 'Martin Procházka', 'Eva Černá'];

export function cityOf(state: GameState) {
  return state.city ?? { mayor: MAYORS[Math.floor(hash01(`${state.seed}-primator`) * MAYORS.length)], stance: 'neutral' as CityStance, relation: 50, nextElection: `${Math.floor(state.season / 4) * 4 + 4}-10-10`, lastLobby: undefined as string | undefined };
}

/** Násobek příspěvků a šance na dotace podle vztahu s městem (0,7–1,3). */
export function cityFactor(state: GameState): number {
  return 0.7 + cityOf(state).relation / 166;
}

/** Povolí město velkou stavbu? */
export function cityPermit(state: GameState): string | undefined {
  const c = cityOf(state);
  return c.relation < 35 ? `Primátor ${c.mayor} stavbu nepodpoří (vztah ${Math.round(c.relation)}). Zlepšete vztah s městem (komunita, pozvánky na zápas).` : undefined;
}

export function changeCity(state: GameState, delta: number): void {
  const c = (state.city ??= cityOf(state));
  c.relation = easeAdd(c.relation, delta);
}

/** Pozvat primátora na zápas do VIP (jednou za dva měsíce). */
export function lobbyMayor(prev: GameState): ActionResult {
  const c = cityOf(prev);
  if (c.lastLobby && addDays(c.lastLobby, 60) > prev.date) return { state: prev, ok: false, message: 'Primátora jste zvali nedávno, chce to pauzu.' };
  const state = structuredClone(prev);
  const cost = Math.max(20_000, Math.round((own(state).facilities.vip * 10_000 + 50_000) / 10_000) * 10_000);
  book(state, state.owner.clubId, 'ostatni', -cost, 'Pozvání primátora do VIP');
  const city = (state.city ??= cityOf(state));
  city.lastLobby = state.date;
  changeCity(state, city.stance === 'skeptik' ? 3 : 6);
  return { state, ok: true, message: `Primátor ${city.mayor} přišel na zápas. Vztah s městem se zlepšil.` };
}

/** Měsíčně: vztah s městem podle komunity a skandálů; volby každé čtyři roky. */
export function monthlyCity(state: GameState, rng: Rng, communityEffect: number): void {
  const c = (state.city ??= cityOf(state));
  // Výsledky a nálada fanoušků: úspěšný klub, na který se chodí, má u radnice lepší pozici.
  const club = own(state);
  const comp = competitionOf(state, club.id);
  const table = comp ? computeTable(comp, state) : [];
  const i = table.findIndex((r) => r.clubId === club.id);
  const results = i >= 0 && table[i].played >= 4 ? clamp((table.length / 2 - i) * 0.06, -0.4, 0.4) : 0;
  const mood = ((club.fanMood ?? 50) - 50) * 0.008;
  changeCity(state, communityEffect * 0.8 + (50 - c.relation) * 0.02 + results + mood + (state.grey.scandalUntil && state.grey.scandalUntil > state.date ? -1.5 : 0));
  if (state.date >= c.nextElection) {
    const x = rng.next();
    const stance: CityStance = x < 0.35 ? 'sport' : x < 0.75 ? 'neutral' : 'skeptik';
    const mayor = MAYORS[Math.floor(rng.next() * MAYORS.length)];
    const changed = mayor !== c.mayor;
    c.mayor = mayor;
    c.stance = stance;
    c.nextElection = `${Number(c.nextElection.slice(0, 4)) + 4}-10-10`;
    if (changed) c.relation = clamp(c.relation + (stance === 'sport' ? 15 : stance === 'skeptik' ? -15 : 0), 0, 100);
    addNews(state, { kind: 'info', title: `Komunální volby: primátorem je ${mayor}`, text: `Nové vedení města je ${STANCE_LABEL[stance]}. Vztah s městem: ${Math.round(c.relation)}.` });
  }
}

// ---------- Kotel ----------

export function ultrasOf(state: GameState) {
  return state.ultras ?? { relation: 55, boycottUntil: undefined as string | undefined };
}

export function changeUltras(state: GameState, delta: number): void {
  const u = (state.ultras ??= ultrasOf(state));
  u.relation = easeAdd(u.relation, delta);
}

/** Měsíčně: kotel reaguje na ceny, výsledky a bezpečnost. */
export function monthlyUltras(state: GameState): void {
  const club = own(state);
  const tier = tierOf(state, club.id);
  const ratio = club.policy.ticketPrice / defaultTicketPrice(tier);
  const comp = competitionOf(state, club.id);
  const form = comp ? computeTable(comp, state).find((r) => r.clubId === club.id)?.form ?? [] : [];
  const wins = form.filter((f) => f === 'V').length - form.filter((f) => f === 'P').length;
  let d = (55 - ultrasOf(state).relation) * 0.05 + wins * 0.5 - Math.max(0, ratio - 1.1) * 15;
  if (club.policy.security === 'vysoka') d -= 1;
  changeUltras(state, d);
}

/** Domácí prostředí a návštěva podle vztahu s kotlem. */
export function ultrasEffect(state: GameState): { homeEdge: number; attendance: number; incidents: number } {
  const u = ultrasOf(state);
  const boycott = !!u.boycottUntil && u.boycottUntil >= state.date;
  if (boycott) return { homeEdge: -1, attendance: 0.85, incidents: 1 };
  if (u.relation >= 70) return { homeEdge: 0.5, attendance: 1.03, incidents: 0.8 };
  if (u.relation < 30) return { homeEdge: -0.3, attendance: 0.97, incidents: 1.5 };
  return { homeEdge: 0, attendance: 1, incidents: 1 };
}

export function ultrasTemplates() {
  return {
    'kotel-schuzka': {
      weight: (s: GameState) => (ultrasOf(s).relation < 40 && !s.owner.ousted ? 1.5 : 0),
      create: (s: GameState) => {
        const club = own(s);
        const amount = Math.max(50_000, Math.round((club.stadium.capacity * 0.1 * defaultTicketPrice(tierOf(s, club.id)) * 3) / 10_000) * 10_000);
        return {
          title: 'Kotel žádá schůzku s majitelem',
          text: 'Fanklub je nespokojený: drahé vstupenky, výsledky, přísná ochranka. Chce slevu na permanentky pro kotel a víc respektu.',
          amount,
          defaultOption: 'odmitnout',
          options: [
            { id: 'splnit', label: `Vyjít vstříc (sleva pro kotel ${mil(amount)})`, hint: 'Vztah s kotlem +20, choreo a podpora na zápasech.' },
            { id: 'vyslechnout', label: 'Vyslechnout, nic neslíbit', hint: 'Vztah +5.' },
            { id: 'odmitnout', label: 'Odmítnout schůzku', hint: 'Vztah −10, hrozí bojkot a transparenty.' },
          ],
        };
      },
      resolve: (s: GameState, e: GameEvent, o: string) => {
        if (o === 'splnit') {
          book(s, s.owner.clubId, 'vstupne', -(e.amount ?? 0), 'Sleva na permanentky pro kotel');
          changeUltras(s, 20);
          return 'Kotel je spokojený a slibuje podporu.';
        }
        if (o === 'vyslechnout') {
          changeUltras(s, 5);
          return 'Schůzka uklidnila atmosféru.';
        }
        changeUltras(s, -10);
        if (ultrasOf(s).relation < 25) {
          (s.ultras ??= ultrasOf(s)).boycottUntil = addDays(s.date, 30);
          addNews(s, { kind: 'varovani', title: 'Kotel vyhlásil bojkot', text: 'Měsíc nebude chodit na domácí zápasy: méně diváků a horší domácí prostředí.' });
        }
        return 'Kotel je naštvaný.';
      },
    },
  };
}

/** Prodej oblíbené opory: kotel to nese těžce. */
export function ultrasOnSale(state: GameState): void {
  changeUltras(state, -8);
}

// ---------- Síň slávy a odkaz majitele ----------

export interface Trophy {
  season: number;
  kind: 'titul' | 'pohar' | 'postup' | 'evropa' | 'stadion' | 'rekord' | 'odchovanec' | 'scenar' | 'vyzva';
  text: string;
  points: number;
  /** Klub, ve kterém trofej vznikla (kariéra napříč kluby). Starší záznamy ji nemají. */
  clubId?: string;
  clubName?: string;
}

export const TROPHY_POINTS: Record<Trophy['kind'], number> = { titul: 30, pohar: 15, postup: 15, evropa: 20, stadion: 10, rekord: 5, odchovanec: 5, scenar: 20, vyzva: 5 };

export function addTrophy(state: GameState, kind: Trophy['kind'], text: string): void {
  const list = state.trophies ?? [];
  // Duplicita jen v rámci stejného klubu: trofeje z minulých klubů kariéry nové neblokují.
  const sameClub = (t: Trophy) => (t.clubId ? t.clubId === state.owner.clubId : !state.career);
  if (list.some((t) => sameClub(t) && t.season === state.season && t.kind === kind && kind !== 'rekord')) return;
  state.trophies = [...list, { season: state.season, kind, text, points: TROPHY_POINTS[kind], clubId: state.owner.clubId, clubName: own(state).name }];
  addNews(state, { kind: 'sezona', title: `Do síně slávy: ${text}`, text: `Odkaz vaší éry +${TROPHY_POINTS[kind]} bodů.` });
}

export function legacyScore(state: GameState): number {
  return (state.trophies ?? []).reduce((a, t) => a + t.points, 0);
}

/** Odkaz přitahuje sponzory (až +20 %) a lepší lidi. */
export function legacyFactor(state: GameState): number {
  return 1 + Math.min(0.2, legacyScore(state) / 500);
}

/** Konec sezóny: zápis úspěchů do síně slávy. */
export function seasonTrophies(state: GameState, position: number, promoted: boolean, cupWinner?: string): void {
  const club = own(state);
  const comp = competitionOf(state, club.id);
  if (comp && position === 1) addTrophy(state, 'titul', `${comp.name} ${state.season}/${String(state.season + 1).slice(2)}: titul`);
  if (cupWinner === club.id) addTrophy(state, 'pohar', `Vítěz domácího poháru ${state.season}/${String(state.season + 1).slice(2)}`);
  if (promoted) addTrophy(state, 'postup', `Postup do vyšší soutěže (${state.season}/${String(state.season + 1).slice(2)})`);
  const eu = state.europe?.entries.find((e) => e.clubId === club.id && e.season === state.season);
  if (eu && eu.result !== 'predkola') addTrophy(state, 'evropa', `Ligová fáze evropského poháru ${state.season}/${String(state.season + 1).slice(2)}`);
  const academy = squadOf(state, club.id).filter((p) => p.career.length === 0 && state.season - p.birthYear <= 21 && p.starts >= 15);
  if (academy.length) addTrophy(state, 'odchovanec', `Odchovanec ${academy[0].firstName} ${academy[0].lastName} se prosadil do základní sestavy`);
}

/** Rekordní prodej klubu (volá se při prodeji). */
export function checkRecordSale(state: GameState, name: string, fee: number): void {
  const record = Math.max(0, ...(state.trophies ?? []).filter((t) => t.kind === 'rekord' && (t.clubId ? t.clubId === state.owner.clubId : !state.career)).map((t) => Number(t.text.match(/(\d[\d\s]*) mil/)?.[1]?.replace(/\s/g, '') ?? 0) * 1e6));
  if (fee >= 20_000_000 && fee > record) addTrophy(state, 'rekord', `Rekordní prodej: ${name} za ${Math.round(fee / 1e6)} mil. Kč`);
}
