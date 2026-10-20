import { addDays, formatDate } from './calendar';
import { playerWage } from './finance';
import { media } from './grey';
import { FOREIGN_CLUBS } from './names';
import { playerAge, squadOf } from './players';
import type { Rng } from './rng';
import { addTrophy, checkRecordSale } from './surroundings';
import { executeTransfer, playerName, playerValue } from './transfers';
import type { GameEvent, GameState, Player } from './types';
import { addNews, clamp, clubLabel, FOREIGN_PREFIX, FREE, plural } from './world';

/**
 * Hvězdy s příběhem: reprezentační srazy, cesta odchovanců a letní zájem velkých lig.
 * Všechno běží přes zprávy; jediné rozhodnutí je letní nabídka za hvězdu (nejvýš jednou za sezónu).
 */

export interface IntlWindow {
  start: string;
  end: string;
  /** Hráči nominovaní do A-reprezentace (Česko i cizinci do svých reprezentací). */
  senior: string[];
  /** Čeští hráči v reprezentaci do 21 let. */
  youth: string[];
}

export interface StarSummer {
  season: number;
  playerId: string;
  buyerId: string;
  fee: number;
  stage: 'zajem' | 'nabidka' | 'hotovo';
}

export interface StarsState {
  window?: IntlWindow;
  summer?: StarSummer;
  /** Slib „odejde příští léto“: hráč odejde za domluvenou částku. */
  promise?: { playerId: string; buyerId: string; fee: number; season: number };
  /** Nominovaní z minulého srazu (zprávy jen o nových jménech). */
  lastSenior?: string[];
  lastYouth?: string[];
}

/** Začátky reprezentačních srazů (měsíc-den). Sraz trvá devět dní. */
export const INTL_WINDOWS = ['09-01', '10-05', '11-09', '03-22', '06-01'];
const WINDOW_DAYS = 9;
const SENIOR_SQUAD = 23;
const YOUTH_SQUAD = 20;
/** Cizinec s tímto hodnocením hraje za svou reprezentaci. */
const FOREIGN_INTL_MIN = 72;
const CZECH_INTL_MIN = 63;
const YOUTH_MIN = 52;

const mil = (v: number) => `${(v / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč`;

/** Aktivní reprezentant (nominace v posledním roce). */
export function isInternational(state: GameState, p: Player): boolean {
  return !!p.intl?.lastCall && p.intl.lastCall > yearBefore(state.date);
}

/** Stejný den o rok dřív (rychlé porovnání řetězců, volá se při každém ocenění hráče). */
function yearBefore(date: string): string {
  return `${Number(date.slice(0, 4)) - 1}${date.slice(4)}`;
}

/** Násobek tržní hodnoty: aktivní reprezentant je dražší (až +25 %), bývalý trochu. */
export function intlValueFactor(p: Player, date: string): number {
  const caps = p.intl?.caps ?? 0;
  if (!caps && !p.intl?.lastCall) return 1;
  const active = !!p.intl?.lastCall && p.intl.lastCall > yearBefore(date);
  return active ? 1 + Math.min(0.25, 0.1 + caps * 0.01) : 1 + Math.min(0.08, caps * 0.004);
}

export function isAcademyPlayer(state: GameState, p: Player): boolean {
  return !!p.academy && p.academy === state.owner.clubId;
}

function addMilestone(state: GameState, p: Player, key: string, text: string): boolean {
  p.milestones ??= [];
  if (p.milestones.some((m) => m.key === key)) return false;
  p.milestones.push({ date: state.date, key, text });
  if (p.milestones.length > 20) p.milestones.splice(0, p.milestones.length - 20);
  return true;
}

function pName(p: Player): string {
  return playerName(p);
}

// ---------- Reprezentační srazy ----------

function inLeague(state: GameState, p: Player): boolean {
  return p.clubId !== FREE && !!state.clubs[p.clubId];
}

/** Nominace pro sraz: nejlepší čeští hráči ligy, U21 a silní cizinci. */
export function intlNominations(state: GameState): { senior: Player[]; foreign: Player[]; youth: Player[] } {
  const healthy = (p: Player) => !p.injuredUntil || p.injuredUntil < addDays(state.date, 3);
  const all = Object.values(state.players).filter((p) => inLeague(state, p) && healthy(p));
  const czech = all.filter((p) => !p.nationality).sort((a, b) => b.overall - a.overall || b.potential - a.potential);
  const senior = czech.filter((p) => p.overall >= CZECH_INTL_MIN).slice(0, SENIOR_SQUAD);
  const seniorIds = new Set(senior.map((p) => p.id));
  const youth = czech
    .filter((p) => !seniorIds.has(p.id) && playerAge(p, state.season) <= 21 && p.overall >= YOUTH_MIN)
    .sort((a, b) => b.overall + b.potential * 0.5 - (a.overall + a.potential * 0.5))
    .slice(0, YOUTH_SQUAD);
  const foreign = all.filter((p) => p.nationality && p.overall >= FOREIGN_INTL_MIN && playerAge(p, state.season) <= 33);
  return { senior, foreign, youth };
}

function startWindow(state: GameState): void {
  const { senior, foreign, youth } = intlNominations(state);
  const own = state.owner.clubId;
  const club = state.clubs[own];
  state.stars ??= {};
  state.stars.window = { start: state.date, end: addDays(state.date, WINDOW_DAYS), senior: [...senior, ...foreign].map((p) => p.id), youth: youth.map((p) => p.id) };
  for (const p of [...senior, ...foreign]) {
    p.intl ??= { caps: 0, youthCaps: 0 };
    p.intl.lastCall = state.date;
    if (p.nationality) p.intl.nation = p.nationality;
  }
  for (const p of youth) {
    p.intl ??= { caps: 0, youthCaps: 0 };
    p.intl.lastYouth = state.date;
  }
  const ownSenior = [...senior, ...foreign].filter((p) => p.clubId === own);
  const ownYouth = youth.filter((p) => p.clubId === own);
  // Odchovanci: velká zpráva a bonus k pověsti.
  for (const p of ownSenior.filter((x) => isAcademyPlayer(state, x))) {
    if (addMilestone(state, p, 'a-tym', `Poprvé v A-reprezentaci${p.nationality ? ` (${p.nationality})` : ''}`)) {
      club.reputation = clamp(club.reputation + 0.5, 1, 99);
      club.fanMood = clamp(club.fanMood + 3, 0, 100);
      media(state, 3);
      addNews(state, { kind: 'sezona', title: `Odchovanec v reprezentaci: ${pName(p)}`, text: `Hráč z vaší akademie dostal první pozvánku do A-reprezentace. Pro klub i pro vás je to velká reklama: pověst klubu roste, fanoušci jsou hrdí.`, playerId: p.id });
      addTrophy(state, 'odchovanec', `Odchovanec ${pName(p)} v A-reprezentaci`);
    }
  }
  for (const p of ownYouth.filter((x) => isAcademyPlayer(state, x))) {
    if (addMilestone(state, p, 'u21', 'Poprvé v reprezentaci do 21 let')) {
      addNews(state, { kind: 'info', title: `Odchovanec v reprezentaci U21: ${pName(p)}`, text: 'První pozvánka do mládežnické reprezentace. Akademie se může chlubit.', playerId: p.id });
    }
  }
  for (const p of ownSenior) {
    if (!p.academy || p.academy !== own) addMilestone(state, p, 'a-tym', `Poprvé v A-reprezentaci${p.nationality ? ` (${p.nationality})` : ''} jako hráč klubu ${club.shortName}`);
  }
  const before = new Set(state.stars.lastSenior ?? []);
  const beforeYouth = new Set(state.stars.lastYouth ?? []);
  state.stars.lastSenior = state.stars.window.senior;
  state.stars.lastYouth = state.stars.window.youth;
  if (ownSenior.length) {
    club.reputation = clamp(club.reputation + Math.min(0.3, ownSenior.length * 0.1), 1, 99);
    media(state, Math.min(3, ownSenior.length));
    const label = (p: Player) => `${pName(p)}${p.nationality ? ` (${p.nationality})` : ''}`;
    const fresh = ownSenior.filter((p) => !before.has(p.id));
    const youthFresh = ownYouth.filter((p) => !beforeYouth.has(p.id));
    const youthText = youthFresh.length ? ` Nově v U21: ${youthFresh.map(pName).join(', ')}.` : '';
    if (fresh.length) {
      addNews(state, {
        kind: 'info',
        title: fresh.length === 1 ? `${pName(fresh[0])} nominován do reprezentace` : `Nově v reprezentaci: ${fresh.map(pName).join(', ')}`,
        text: `Na sraz jede ${plural(ownSenior.length, 'hráč', 'hráči', 'hráčů')} klubu: ${ownSenior.map(label).join(', ')}. Reprezentanti jsou cennější a klub získá na pověsti. Po srazu se vrátí unavení, s malým rizikem zranění.${youthText}`,
        playerId: fresh.length === 1 ? fresh[0].id : undefined,
      });
    } else {
      addNews(state, { kind: 'info', title: `Reprezentační sraz: ${plural(ownSenior.length, 'hráč', 'hráči', 'hráčů')} klubu`, text: `Stejná jména jako minule (${ownSenior.map((p) => p.lastName).join(', ')}).${youthText}` });
    }
  } else if (ownYouth.some((p) => !beforeYouth.has(p.id))) {
    addNews(state, { kind: 'info', title: `Reprezentace U21: ${ownYouth.filter((p) => !beforeYouth.has(p.id)).map(pName).join(', ')}`, text: 'Mladí hráči klubu dostali pozvánku do reprezentace do 21 let.' });
  }
}

function endWindow(state: GameState, rng: Rng): void {
  const w = state.stars?.window;
  if (!w) return;
  const own = state.owner.clubId;
  const hurt: string[] = [];
  for (const id of w.senior) {
    const p = state.players[id];
    if (!p) continue;
    p.intl ??= { caps: 0, youthCaps: 0 };
    // Ne každý nominovaný nastoupí: lepší hrají oba zápasy.
    const caps = p.overall >= 70 ? rng.int(1, 2) : rng.int(0, 2);
    p.intl.caps += caps;
    if (caps > 0 && p.clubId === own && p.intl.caps - caps === 0) addMilestone(state, p, 'debut', 'Reprezentační debut');
    tire(state, rng, p, hurt);
  }
  for (const id of w.youth) {
    const p = state.players[id];
    if (!p) continue;
    p.intl ??= { caps: 0, youthCaps: 0 };
    p.intl.youthCaps += rng.int(0, 2);
    tire(state, rng, p, hurt);
  }
  state.stars!.window = undefined;
  if (hurt.length) addNews(state, { kind: 'varovani', title: 'Ze srazu reprezentace se vrátil zraněný hráč', text: hurt.join(', ') });
}

function tire(state: GameState, rng: Rng, p: Player, hurt: string[]): void {
  p.fitness = Math.max(55, p.fitness - 15);
  if (rng.chance(0.04) && !(p.injuredUntil && p.injuredUntil >= state.date)) {
    const days = rng.int(7, 24);
    p.injuredUntil = addDays(state.date, days);
    p.injury = days <= 14 ? 'lehké zranění z reprezentace' : 'svalové zranění z reprezentace';
    if (p.clubId === state.owner.clubId) hurt.push(`${pName(p)} (do ${formatDate(p.injuredUntil)})`);
  }
}

// ---------- Odchovanci ----------

function totalApps(p: Player): number {
  return p.career.reduce((a, c) => a + c.apps, 0) + p.apps;
}

function totalGoals(p: Player): number {
  return p.career.reduce((a, c) => a + c.goals, 0) + p.goals;
}

/** Milníky odchovanců klubu majitele: první start, první gól, 10 a 50 startů. */
function academyMilestones(state: GameState): void {
  const own = state.owner.clubId;
  for (const p of squadOf(state, own)) {
    if (p.academy !== own) continue;
    const apps = totalApps(p);
    const goals = totalGoals(p);
    const checks: [boolean, string, string, string][] = [
      [apps >= 1, 'start1', 'První zápas za A-tým', `Odchovanec ${pName(p)} poprvé nastoupil za A-tým`],
      [goals >= 1, 'gol1', 'První gól za A-tým', `Odchovanec ${pName(p)} dal první gól za A-tým`],
      [apps >= 10, 'start10', '10 zápasů za A-tým', `Odchovanec ${pName(p)} má za sebou 10 zápasů za A-tým`],
      [apps >= 50, 'start50', '50 zápasů za A-tým', `Odchovanec ${pName(p)} odehrál už 50 zápasů za A-tým`],
    ];
    for (const [ok, key, text, title] of checks) {
      if (ok && addMilestone(state, p, key, text)) {
        addNews(state, { kind: 'info', title, text: 'Cesta z vaší akademie do prvního týmu pokračuje.', playerId: p.id });
      }
    }
  }
}

// ---------- Letní zájem velkých lig ----------

const BIG_LEAGUE: Record<string, string> = { Německo: 'Bundesligy', Itálie: 'Serie A', Anglie: 'Premier League', Francie: 'Ligue 1', Španělsko: 'La Ligy' };

/** Hvězda klubu, o kterou by stál klub z velké ligy (nebo nikdo). */
export function summerStarCandidate(state: GameState): Player | undefined {
  const own = state.owner.clubId;
  const busy = new Set((state.stories ?? []).filter((s) => !s.done && s.playerId).map((s) => s.playerId!));
  return squadOf(state, own)
    .filter((p) => !p.loan && !busy.has(p.id) && playerAge(p, state.season) <= 29)
    .filter((p) => p.overall >= 68 || (playerAge(p, state.season) <= 23 && p.overall >= 64 && p.potential >= 76))
    .sort((a, b) => playerValue(state, b) - playerValue(state, a))[0];
}

function startSummerInterest(state: GameState, rng: Rng): void {
  const st = (state.stars ??= {});
  if (st.summer?.season === state.season + 1 || st.promise || state.owner.ousted) return;
  const p = summerStarCandidate(state);
  if (!p || !rng.chance(0.75)) return;
  const buyer = rng.pick(FOREIGN_CLUBS.filter((c) => c.level === 1));
  const value = playerValue(state, p);
  const fee = Math.min(500_000_000, Math.round((value * (1.3 + rng.next() * 0.35)) / 1_000_000) * 1_000_000);
  st.summer = { season: state.season + 1, playerId: p.id, buyerId: FOREIGN_PREFIX + buyer.id, fee, stage: 'zajem' };
  addNews(state, {
    kind: 'sezona',
    title: `Zájem z ${BIG_LEAGUE[buyer.country] ?? 'velké ligy'}: ${buyer.name} sleduje ${pName(p)}`,
    text: `Skauti klubu ${buyer.name} (${buyer.country}) byli na posledních zápasech. Pokud zájem vydrží, přijde začátkem července oficiální nabídka.`,
    playerId: p.id,
  });
}

function summerOffer(state: GameState): void {
  const sm = state.stars?.summer;
  if (!sm || sm.stage !== 'zajem' || sm.season !== state.season) return;
  const p = state.players[sm.playerId];
  if (!p || p.clubId !== state.owner.clubId || state.owner.ousted) {
    sm.stage = 'hotovo';
    return;
  }
  sm.stage = 'nabidka';
  const newWage = Math.round(Math.max(p.wage * 1.5, playerWage(p.overall, state.clubs[p.clubId].reputation) * 1.3) / 1_000) * 1_000;
  const event: GameEvent = {
    id: `e${++state.nextId}`,
    template: 'hvezda-velkaliga',
    date: state.date,
    expires: addDays(state.date, 10),
    title: `${clubLabel(state, sm.buyerId)} nabízí ${mil(sm.fee)} za ${pName(p)}`,
    text: `Oficiální nabídka z velké ligy. Tržní hodnota hráče je asi ${mil(playerValue(state, p))}. Hráč by šel rád, ale zachová se podle vás.`,
    playerId: p.id,
    amount: sm.fee,
    defaultOption: 'zarok',
    options: [
      { id: 'prodat', label: `Prodat za ${mil(sm.fee)}`, hint: `Peníze hned do klubu, polovina se vrátí do rozpočtu na přestupy. Fanoušci ztratí oporu (nálada −3).` },
      { id: 'smlouva', label: 'Udržet s novou smlouvou', hint: `Plat ${newWage.toLocaleString('cs-CZ')} Kč měsíčně (teď ${p.wage.toLocaleString('cs-CZ')} Kč), smlouva do 30. 6. ${state.season + 4}, výstupní klauzule ${mil(Math.round(sm.fee * 1.4))}. Morálka +10, fanoušci +3.` },
      { id: 'zarok', label: 'Nechat odejít příští léto', hint: `Hráč zůstane a dá do sezóny všechno (morálka +12). Příští léto odejde do stejného klubu asi za ${mil(Math.round(sm.fee * 0.85))}.` },
    ],
  };
  state.events.push(event);
}

function fulfilPromise(state: GameState): void {
  const pr = state.stars?.promise;
  if (!pr || pr.season !== state.season) return;
  state.stars!.promise = undefined;
  const p = state.players[pr.playerId];
  if (!p || p.clubId !== state.owner.clubId) return;
  executeTransfer(state, p, pr.buyerId, pr.fee, Math.round(p.wage * 1.5), 4);
  checkRecordSale(state, pName(p), pr.fee);
  addNews(state, { kind: 'sezona', title: `Slib splněn: ${pName(p)} odchází do ${clubLabel(state, pr.buyerId)}`, text: `Jak bylo loni domluveno, hráč přestupuje za ${mil(pr.fee)}. Loučí se s fanoušky jako legenda.` });
}

/** Šablona situace pro engine/events.ts (vytváří ji jen tento modul, náhodně nepřichází). */
export function starsTemplates() {
  return {
    'hvezda-velkaliga': {
      weight: () => 0,
      create: () => null,
      resolve: (s: GameState, e: GameEvent, o: string): string => {
        const sm = s.stars?.summer;
        if (sm) sm.stage = 'hotovo';
        const p = e.playerId ? s.players[e.playerId] : undefined;
        if (!p || p.clubId !== s.owner.clubId || !sm) return 'Hráč už v klubu není.';
        const club = s.clubs[s.owner.clubId];
        if (o === 'prodat') {
          executeTransfer(s, p, sm.buyerId, sm.fee, Math.round(p.wage * 2), 4);
          checkRecordSale(s, playerName(p), sm.fee);
          club.fanMood = clamp(club.fanMood - 3, 0, 100);
          return `${playerName(p)} přestupuje do ${clubLabel(s, sm.buyerId)} za ${sm.fee.toLocaleString('cs-CZ')} Kč.`;
        }
        if (o === 'smlouva') {
          p.wage = Math.round(Math.max(p.wage * 1.5, playerWage(p.overall, club.reputation) * 1.3) / 1_000) * 1_000;
          p.contractUntil = Math.max(p.contractUntil, s.season + 4);
          p.releaseClause = Math.round((sm.fee * 1.4) / 1_000_000) * 1_000_000;
          p.morale = clamp(p.morale + 10, 0, 100);
          club.fanMood = clamp(club.fanMood + 3, 0, 100);
          return `${playerName(p)} podepsal novou smlouvu do roku ${p.contractUntil} s výstupní klauzulí ${(p.releaseClause / 1e6).toLocaleString('cs-CZ')} mil. Kč. Fanoušci jásají.`;
        }
        p.morale = clamp(p.morale + 12, 0, 100);
        s.stars!.promise = { playerId: p.id, buyerId: sm.buyerId, fee: Math.round((sm.fee * 0.85) / 1_000_000) * 1_000_000, season: s.season + 1 };
        return `${playerName(p)} zůstává ještě sezónu. Příští léto odejde do ${clubLabel(s, sm.buyerId)}.`;
      },
    },
  };
}

// ---------- Denní háček ----------

/** Volá se jednou denně z processDay. */
export function dailyStars(state: GameState, rng: Rng): void {
  const md = state.date.slice(5);
  if (state.stars?.window && state.date >= state.stars.window.end) endWindow(state, rng);
  if (INTL_WINDOWS.includes(md)) startWindow(state);
  if (md === '06-10') startSummerInterest(state, rng);
  if (md === '07-03') {
    fulfilPromise(state);
    summerOffer(state);
  }
  academyMilestones(state);
}

/** Pro kartu hráče: reprezentace, odchovanec a milníky. */
export function playerStory(state: GameState, p: Player): { caps: number; youthCaps: number; international: boolean; nation: string; academy: boolean; milestones: { date: string; text: string }[]; promise?: string } {
  const pr = state.stars?.promise;
  return {
    caps: p.intl?.caps ?? 0,
    youthCaps: p.intl?.youthCaps ?? 0,
    international: isInternational(state, p),
    nation: p.intl?.nation ?? p.nationality ?? 'Česko',
    academy: !!p.academy,
    milestones: [...(p.milestones ?? [])].reverse(),
    promise: pr && pr.playerId === p.id ? `Slíbený odchod v létě ${pr.season} do ${clubLabel(state, pr.buyerId)} (${mil(pr.fee)})` : undefined,
  };
}
