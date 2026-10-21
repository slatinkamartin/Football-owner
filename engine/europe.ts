import { addDays, dayOfWeek, formatShortDate } from './calendar';
import { europeVenueFactor } from './venue';
import { book } from './finance';
import { media } from './grey';
import { squadOf } from './players';
import type { Rng } from './rng';
import { addTrophy } from './surroundings';
import type { EuropeCompetition, EuropeEntry, GameState, Player } from './types';
import { addNews, clamp, clubLabel } from './world';

/**
 * Evropské poháry českých klubů. U ostatních klubů se výsledek předkol vyhodnotí podle síly kádru
 * na konci srpna. Klub majitele hraje skutečné dvojzápasy se skutečnými evropskými kluby:
 * play-off o ligovou fázi (v létě), ligovou fázi (září až leden) a případně jaro (vyřazovací boje).
 * Ligová fáze přináší velké peníze (vyplácí se říjen až leden), prémie UEFA za výsledky a pověst.
 */

export const EUROPE_LABEL: Record<EuropeCompetition | 'predkola', string> = {
  LM: 'Liga mistrů',
  EL: 'Evropská liga',
  KL: 'Konferenční liga',
  predkola: 'vyřazení v předkolech',
};

/** Peníze za ligovou fázi (základ, k tomu bonus za výsledky až +50 %). */
// O 30 % méně než dřív: velké kluby jinak bohatly i bez péče majitele (stovky milionů ročně).
const LEAGUE_PHASE: Record<EuropeCompetition, number> = { LM: 280_000_000, EL: 85_000_000, KL: 55_000_000 };
/** Peníze za účast v předkolech. */
const QUALIFYING: Record<EuropeCompetition, number> = { LM: 25_000_000, EL: 15_000_000, KL: 10_000_000 };
/** Podíl evropských peněz, který jde hráčům jako prémie. */
export const EUROPE_BONUS_SHARE = 0.15;

/** Rozsah evropských peněz před předkoly: jen předkola, nebo ligová fáze s nejlepšími výsledky. */
export function europeRange(entry: EuropeCompetition): { low: number; high: number } {
  return { low: QUALIFYING[entry], high: QUALIFYING[entry] + LEAGUE_PHASE[entry] * 1.5 };
}

/** Síla kádru, při které má klub poloviční šanci projít do ligové fáze. */
const THRESHOLD: Record<EuropeCompetition, number> = { LM: 71, EL: 67, KL: 63.5 };
const NEXT: Record<EuropeCompetition, EuropeCompetition | undefined> = { LM: 'EL', EL: 'KL', KL: undefined };

/** Síla do Evropy: průměr 14 nejlepších hráčů. */
export function europeStrength(state: GameState, clubId: string): number {
  const best = squadOf(state, clubId).map((p) => p.overall).sort((a, b) => b - a).slice(0, 14);
  return best.length ? best.reduce((a, b) => a + b, 0) / best.length : 40;
}

export function leaguePhaseChance(strength: number, comp: EuropeCompetition): number {
  return 1 / (1 + Math.exp(-(strength - THRESHOLD[comp]) / 2));
}

/** Konec sezóny: kdo z 1. ligy hraje příští rok Evropu (1. a 2. LM, 3. a vítěz poháru EL, 4. KL). */
export function qualifyEurope(state: GameState, table: { clubId: string }[], cupWinner?: string): void {
  if (!table.length) return;
  const slots: EuropeCompetition[] = ['LM', 'LM', 'EL', 'KL'];
  const entries: EuropeEntry[] = table.slice(0, 4).map((r, i) => ({ season: state.season + 1, clubId: r.clubId, entry: slots[i], result: 'predkola', revenue: 0 }));
  if (cupWinner && !entries.some((e) => e.clubId === cupWinner) && table.some((r) => r.clubId === cupWinner)) {
    entries.push({ season: state.season + 1, clubId: cupWinner, entry: 'EL', result: 'predkola', revenue: 0 });
  } else if (table[4]) {
    entries.push({ season: state.season + 1, clubId: table[4].clubId, entry: 'KL', result: 'predkola', revenue: 0 });
  }
  state.europe = { season: state.season + 1, entries };
}

// ---------- Evropské kluby (skutečné názvy, síla v měřítku hry) ----------

export interface EuroClub {
  name: string;
  country: string;
  /** 1 = evropská špička … 4 = mistři a pohárníci menších lig. */
  level: 1 | 2 | 3 | 4;
  rating: number;
}

const C = (name: string, country: string, level: 1 | 2 | 3 | 4, rating: number): EuroClub => ({ name, country, level, rating });

export const EURO_CLUBS: EuroClub[] = [
  C('Real Madrid', 'Španělsko', 1, 89), C('FC Barcelona', 'Španělsko', 1, 88), C('Bayern Mnichov', 'Německo', 1, 88),
  C('Manchester City', 'Anglie', 1, 88), C('Liverpool', 'Anglie', 1, 88), C('Arsenal', 'Anglie', 1, 87),
  C('Paris Saint-Germain', 'Francie', 1, 88), C('Inter Milán', 'Itálie', 1, 86), C('Chelsea', 'Anglie', 1, 85),
  C('Borussia Dortmund', 'Německo', 2, 83), C('Bayer Leverkusen', 'Německo', 2, 83), C('RB Lipsko', 'Německo', 2, 81),
  C('Atlético Madrid', 'Španělsko', 2, 84), C('Juventus', 'Itálie', 2, 83), C('AC Milán', 'Itálie', 2, 83),
  C('SSC Neapol', 'Itálie', 2, 83), C('Atalanta Bergamo', 'Itálie', 2, 82), C('AS Řím', 'Itálie', 2, 81),
  C('Tottenham Hotspur', 'Anglie', 2, 82), C('Aston Villa', 'Anglie', 2, 82), C('Newcastle United', 'Anglie', 2, 82),
  C('Benfica Lisabon', 'Portugalsko', 2, 81), C('FC Porto', 'Portugalsko', 2, 80), C('Sporting Lisabon', 'Portugalsko', 2, 81),
  C('Olympique Marseille', 'Francie', 2, 80), C('AS Monaco', 'Francie', 2, 80),
  C('Ajax Amsterdam', 'Nizozemsko', 3, 78), C('PSV Eindhoven', 'Nizozemsko', 3, 78), C('Feyenoord', 'Nizozemsko', 3, 78),
  C('Celtic', 'Skotsko', 3, 76), C('Rangers', 'Skotsko', 3, 75), C('Club Brugge', 'Belgie', 3, 77),
  C('Galatasaray', 'Turecko', 3, 78), C('Fenerbahçe', 'Turecko', 3, 78), C('Olympiakos Pireus', 'Řecko', 3, 76),
  C('RB Salcburk', 'Rakousko', 3, 76), C('Šachtar Doněck', 'Ukrajina', 3, 75), C('Olympique Lyon', 'Francie', 3, 79),
  C('LOSC Lille', 'Francie', 3, 79), C('Real Sociedad', 'Španělsko', 3, 79), C('Villarreal', 'Španělsko', 3, 79),
  C('Real Betis', 'Španělsko', 3, 78), C('Sevilla FC', 'Španělsko', 3, 77), C('Fiorentina', 'Itálie', 3, 78),
  C('Lazio Řím', 'Itálie', 3, 79), C('Eintracht Frankfurt', 'Německo', 3, 79), C('VfB Stuttgart', 'Německo', 3, 79),
  C('Sporting Braga', 'Portugalsko', 3, 76), C('PAOK Soluň', 'Řecko', 3, 75), C('AZ Alkmaar', 'Nizozemsko', 3, 75),
  C('Dinamo Záhřeb', 'Chorvatsko', 3, 74), C('Crvena zvezda', 'Srbsko', 3, 74),
  C('Young Boys Bern', 'Švýcarsko', 4, 73), C('FC Basilej', 'Švýcarsko', 4, 72), C('FC Kodaň', 'Dánsko', 4, 73),
  C('FC Midtjylland', 'Dánsko', 4, 73), C('Bodø/Glimt', 'Norsko', 4, 73), C('Malmö FF', 'Švédsko', 4, 71),
  C('Molde FK', 'Norsko', 4, 70), C('Ferencváros', 'Maďarsko', 4, 72), C('Partizan Bělehrad', 'Srbsko', 4, 70),
  C('Legia Varšava', 'Polsko', 4, 71), C('Lech Poznaň', 'Polsko', 4, 71), C('Rapid Vídeň', 'Rakousko', 4, 70),
  C('Sturm Graz', 'Rakousko', 4, 71), C('LASK Linec', 'Rakousko', 4, 69), C('AEK Atény', 'Řecko', 4, 73),
  C('Panathinaikos', 'Řecko', 4, 72), C('KAA Gent', 'Belgie', 4, 72), C('RSC Anderlecht', 'Belgie', 4, 73),
  C('Union Saint-Gilloise', 'Belgie', 4, 73), C('FC Twente', 'Nizozemsko', 4, 73), C('Slovan Bratislava', 'Slovensko', 4, 68),
  C('Ludogorec Razgrad', 'Bulharsko', 4, 69), C('Maccabi Tel Aviv', 'Izrael', 4, 69), C('Qarabağ', 'Ázerbájdžán', 4, 70),
  C('Omonia Nikósie', 'Kypr', 4, 67), C('APOEL Nikósie', 'Kypr', 4, 67), C('HJK Helsinky', 'Finsko', 4, 64),
  C('Shamrock Rovers', 'Irsko', 4, 64), C('Heart of Midlothian', 'Skotsko', 4, 67), C('FC Lugano', 'Švýcarsko', 4, 68),
  C('Hajduk Split', 'Chorvatsko', 4, 69), C('HNK Rijeka', 'Chorvatsko', 4, 68), C('NK Celje', 'Slovinsko', 4, 66),
  C('Olimpija Lublaň', 'Slovinsko', 4, 66), C('Spartak Trnava', 'Slovensko', 4, 65), C('CFR Kluž', 'Rumunsko', 4, 67),
  C('FCSB', 'Rumunsko', 4, 69), C('Dynamo Kyjev', 'Ukrajina', 4, 70), C('BK Häcken', 'Švédsko', 4, 67),
  C('Rosenborg', 'Norsko', 4, 66), C('Brøndby IF', 'Dánsko', 4, 68), C('Jagiellonia Białystok', 'Polsko', 4, 68),
  C('Raków Częstochowa', 'Polsko', 4, 68), C('Pafos FC', 'Kypr', 4, 68), C('AEK Larnaka', 'Kypr', 4, 66),
  C('Rīgas FS', 'Lotyšsko', 4, 63), C('Žalgiris Vilnius', 'Litva', 4, 62), C('FK Astana', 'Kazachstán', 4, 64),
];

// ---------- Evropská cesta klubu majitele ----------

export interface EuroOpponent {
  name: string;
  country: string;
  rating: number;
}

export interface EuroMatchResult {
  own: number;
  opp: number;
  scorers: { playerId: string; minute: number }[];
  oppMinutes: number[];
  attendance?: number;
  /** Vstupné z domácího evropského večera. */
  gate?: number;
  /** Prémie UEFA za výsledek. */
  prize?: number;
  /** Penalty (vy : soupeř). */
  penalties?: [number, number];
}

export interface EuroMatch {
  id: string;
  date: string;
  comp: EuropeCompetition;
  stage: string;
  home: boolean;
  /** Finále na neutrální půdě. */
  neutral?: boolean;
  opponent: EuroOpponent;
  tie?: number;
  leg?: 1 | 2;
  result?: EuroMatchResult;
  /** Předkola: výsledek dvojzápasu je daný silou kádru při prvním zápase (skóre se odkryje v den zápasu). */
  planned?: { own: number; opp: number; ownPens?: boolean };
}

export interface EuroRun {
  season: number;
  clubId: string;
  /** Soutěž, kterou klub teď hraje. */
  comp: EuropeCompetition;
  phase: 'predkola' | 'liga' | 'jaro' | 'konec';
  matches: EuroMatch[];
  /** Ligová fáze: body a skóre. */
  points: number;
  gf: number;
  ga: number;
  /** Odhad konečného pořadí v ligové fázi (36 týmů). */
  rank?: number;
  /** Kam klub zatím došel (pro historii a zprávy). */
  best: string;
  /** Ligová fáze, kam klub postoupil z předkol. */
  leagueComp?: EuropeCompetition;
  nextTie: number;
}

const COMP_GEN: Record<EuropeCompetition, string> = { LM: 'Ligy mistrů', EL: 'Evropské ligy', KL: 'Konferenční ligy' };
/** Prémie UEFA (v měřítku hry): výhra a remíza v ligové fázi. */
const PRIZE_WIN: Record<EuropeCompetition, number> = { LM: 25_000_000, EL: 7_000_000, KL: 5_000_000 };
const PRIZE_DRAW: Record<EuropeCompetition, number> = { LM: 8_000_000, EL: 2_300_000, KL: 1_700_000 };
/** Prémie za postup do kola jara (osmifinále, čtvrtfinále, semifinále, finále, vítěz). */
const KO_PRIZE: Record<EuropeCompetition, number[]> = {
  LM: [30_000_000, 40_000_000, 55_000_000, 80_000_000, 100_000_000],
  EL: [8_000_000, 11_000_000, 16_000_000, 25_000_000, 35_000_000],
  KL: [5_000_000, 7_000_000, 10_000_000, 15_000_000, 20_000_000],
};
const KO_ROUNDS = ['Play-off o osmifinále', 'Osmifinále', 'Čtvrtfinále', 'Semifinále', 'Finále'];
const KO_ROUNDS_GEN = ['play-off o osmifinále', 'osmifinále', 'čtvrtfinále', 'semifinále', 'finále'];
/** Úroveň soupeřů podle kola jara (play-off … finále). */
const KO_LEVELS: Record<EuropeCompetition, (1 | 2 | 3 | 4)[][]> = {
  LM: [[2, 3], [1, 2], [1, 2], [1], [1]],
  EL: [[3, 4], [2, 3], [2, 3], [2, 3], [2]],
  KL: [[3, 4], [3, 4], [2, 3], [2, 3], [2, 3]],
};
/** Termíny jara (měsíc-den první zápas, odveta o týden později; finále jeden zápas). */
const KO_DATES = ['02-17', '03-10', '04-07', '04-28', '05-26'];
/** Ligová fáze: koše soupeřů a termíny. */
const LEAGUE_POTS: Record<EuropeCompetition, (1 | 2 | 3 | 4)[]> = { LM: [1, 1, 2, 2, 3, 3, 4, 4], EL: [2, 2, 3, 3, 3, 4, 4, 4], KL: [3, 3, 4, 4, 4, 4] };
const LEAGUE_DATES: Record<EuropeCompetition, string[]> = {
  LM: ['09-15', '09-29', '10-20', '11-03', '11-24', '12-08', '01-19', '01-27'],
  EL: ['09-23', '10-01', '10-22', '11-05', '11-26', '12-10', '01-21', '01-28'],
  KL: ['10-01', '10-22', '11-05', '11-26', '12-10', '12-17'],
};
/** Liga mistrů ve středu, ostatní ve čtvrtek (finále LM v sobotu). */
const WEEKDAY: Record<EuropeCompetition, number> = { LM: 3, EL: 4, KL: 4 };

const mil = (v: number) => `${(v / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč`;

/** Datum v sezóně: měsíce červenec až prosinec v roce sezóny, leden až červen v roce dalším. */
function seasonDate(season: number, md: string): string {
  const month = Number(md.slice(0, 2));
  return `${month >= 7 ? season : season + 1}-${md}`;
}

/** Nejbližší zadaný den v týdnu od data (včetně). */
function onWeekday(date: string, dow: number): string {
  let d = date;
  while (dayOfWeek(d) !== dow) d = addDays(d, 1);
  return d;
}

/** Den bez ligového či pohárového zápasu klubu majitele (jinak o den dřív). */
function freeDate(state: GameState, date: string): string {
  const own = state.owner.clubId;
  const busy = (d: string) =>
    Object.values(state.competitions).some((c) => c.fixtures.some((f) => f.date === d && (f.homeId === own || f.awayId === own))) ||
    Object.values(state.cups).some((c) => c.fixtures.some((f) => f.date === d && (f.homeId === own || f.awayId === own)));
  return busy(date) ? addDays(date, -1) : date;
}

/** Termíny předkol: tři dvojzápasy v létě, poslední odveta nejpozději 27. 8. */
function qualifyingSlots(season: number, comp: EuropeCompetition): [string, string][] {
  let last = `${season}-08-27`;
  while (dayOfWeek(last) !== 4) last = addDays(last, -1);
  const shift = comp === 'LM' ? -1 : 0;
  return [35, 21, 7].map((back) => [addDays(last, -back + shift), addDays(last, -back + 7 + shift)] as [string, string]);
}

function usedNames(run: EuroRun): Set<string> {
  return new Set(run.matches.map((m) => m.opponent.name));
}

function drawClub(rng: Rng, run: EuroRun, levels: (1 | 2 | 3 | 4)[], near?: number, exclude: Set<string> = new Set()): EuroOpponent {
  const used = new Set([...usedNames(run), ...exclude]);
  let pool = EURO_CLUBS.filter((c) => levels.includes(c.level) && !used.has(c.name));
  if (near !== undefined) {
    const close = pool.filter((c) => Math.abs(c.rating - near) <= 3);
    if (close.length >= 2) pool = close;
    else pool = [...pool].sort((a, b) => Math.abs(a.rating - near) - Math.abs(b.rating - near)).slice(0, 4);
  }
  if (!pool.length) pool = EURO_CLUBS.filter((c) => levels.includes(c.level));
  const c = rng.pick(pool);
  return { name: c.name, country: c.country, rating: c.rating };
}

function newMatchId(state: GameState, run: EuroRun): string {
  return `eu-${run.season}-${++state.nextId}`;
}

function addTie(state: GameState, run: EuroRun, comp: EuropeCompetition, stage: string, dates: [string, string], opponent: EuroOpponent, homeFirst: boolean): void {
  const tie = run.nextTie++;
  run.matches.push({ id: newMatchId(state, run), date: freeDate(state, dates[0]), comp, stage, home: homeFirst, opponent, tie, leg: 1 });
  run.matches.push({ id: newMatchId(state, run), date: freeDate(state, dates[1]), comp, stage, home: !homeFirst, opponent, tie, leg: 2 });
}

/** Úroveň soupeře v předkolech podle soutěže. */
const QUAL_LEVELS: Record<EuropeCompetition, (1 | 2 | 3 | 4)[]> = { LM: [3, 4], EL: [3, 4], KL: [4] };

/** Dvojzápas předkola o ligovou fázi dané soutěže (k-tý termín). */
function addQualifyingTie(state: GameState, rng: Rng, run: EuroRun, comp: EuropeCompetition, slot: number): EuroOpponent {
  const p = leaguePhaseChance(europeStrength(state, run.clubId), comp);
  // Soupeř odpovídá šanci: když je klub favorit, losuje slabšího a naopak.
  const near = europeStrength(state, run.clubId) + (0.5 - p) * 10 + rng.normal(0, 1.5);
  const opponent = drawClub(rng, run, QUAL_LEVELS[comp], near);
  addTie(state, run, comp, `Play-off ${COMP_GEN[comp]}`, qualifyingSlots(run.season, comp)[slot], opponent, rng.chance(0.5));
  return opponent;
}

/** Začátek sezóny: zpráva, kdo hraje předkola, a los klubu majitele. */
export function startEurope(state: GameState, rng: Rng): void {
  const eu = state.europe;
  if (!eu || eu.season !== state.season) return;
  const own = eu.entries.find((e) => e.clubId === state.owner.clubId);
  if (own) {
    // Odhad do rozpočtu: peníze za předkola plus vážená šance na ligovou fázi.
    own.revenue = expectedRevenue(state, own.clubId, own.entry);
    const run: EuroRun = { season: state.season, clubId: own.clubId, comp: own.entry, phase: 'predkola', matches: [], points: 0, gf: 0, ga: 0, best: 'předkola', nextTie: 0 };
    eu.run = run;
    const slot = own.entry === 'LM' ? 0 : own.entry === 'EL' ? 1 : 2;
    const opp = addQualifyingTie(state, rng, run, own.entry, slot);
    const first = run.matches[0];
    noteDraw(state, first.stage, [opp]);
    addNews(state, {
      kind: 'sezona',
      title: 'Los předkola je hotový',
      text: `Hrajete o ligovou fázi: ${EUROPE_LABEL[own.entry]}. První zápas ${formatShortDate(first.date)} ${first.home ? 'doma' : 'venku'}. Šance na postup podle síly kádru asi ${Math.round(leaguePhaseChance(europeStrength(state, own.clubId), own.entry) * 100)} %. Kdo vypadne, má ještě šanci v nižší soutěži.`,
    });
  }
}

function expectedRevenue(state: GameState, clubId: string, entry: EuropeCompetition): number {
  const s = europeStrength(state, clubId);
  let left = 1;
  let total = QUALIFYING[entry];
  for (let c: EuropeCompetition | undefined = entry; c; c = NEXT[c]) {
    const p = leaguePhaseChance(s, c);
    total += left * p * LEAGUE_PHASE[c] * 1.2;
    left *= 1 - p;
  }
  return Math.round(total / 1_000_000) * 1_000_000;
}

/** Konec srpna: výsledky předkol, peníze za účast, pověst a nálada fanoušků. */
export function resolveEurope(state: GameState, rng: Rng): void {
  const eu = state.europe;
  if (!eu || eu.season !== state.season || eu.resolved) return;
  const lines: string[] = [];
  for (const e of eu.entries) {
    const club = state.clubs[e.clubId];
    if (!club) continue;
    const s = europeStrength(state, e.clubId);
    const run = eu.run?.clubId === e.clubId ? eu.run : undefined;
    let result: EuropeCompetition | 'predkola' = 'predkola';
    if (run) {
      // Klub majitele: rozhodly odehrané dvojzápasy.
      result = run.leagueComp ?? 'predkola';
    } else {
      for (let c: EuropeCompetition | undefined = e.entry; c; c = NEXT[c]) {
        if (rng.chance(leaguePhaseChance(s, c))) {
          result = c;
          break;
        }
      }
    }
    e.result = result;
    book(state, e.clubId, 'evropa', QUALIFYING[e.entry], `Evropské poháry: předkola (${EUROPE_LABEL[e.entry]})`);
    book(state, e.clubId, 'platy', -QUALIFYING[e.entry] * EUROPE_BONUS_SHARE, 'Prémie hráčům za evropské poháry');
    e.revenue = QUALIFYING[e.entry];
    if (result !== 'predkola') {
      // Bez stadionu kategorie 3 hraje klub domácí zápasy jinde a přijde o část příjmů.
      const venue = e.clubId === state.owner.clubId ? europeVenueFactor(club) : 1;
      // Klub majitele dostává bonus za výsledky jako prémie UEFA po zápasech, ostatní odhadem.
      const bonus = run ? 0 : rng.next() * 0.5;
      e.revenue += Math.round((LEAGUE_PHASE[result] * (1 + bonus) * venue) / 1_000_000) * 1_000_000;
      club.reputation = clamp(club.reputation + (result === 'LM' ? 2 : result === 'EL' ? 1.5 : 1), 1, 99);
      club.fanMood = clamp(club.fanMood + 8, 0, 100);
    } else {
      club.reputation = clamp(club.reputation + 0.5, 1, 99);
    }
    lines.push(`${clubLabel(state, e.clubId)}: ${result === 'predkola' ? EUROPE_LABEL.predkola : `ligová fáze – ${EUROPE_LABEL[result]}`}`);
  }
  eu.resolved = true;
  state.europeHistory = [...(state.europeHistory ?? []), ...eu.entries].slice(-30);
  const own = eu.entries.find((e) => e.clubId === state.owner.clubId);
  addNews(state, {
    kind: own ? 'sezona' : 'info',
    title: own
      ? own.result === 'predkola'
        ? 'Evropa: vypadli jsme v předkolech'
        : `Evropa: postup do ligové fáze (${EUROPE_LABEL[own.result]})!`
      : 'Čeští kluby v evropských pohárech',
    text: lines.join(' · '),
  });
}

/** Září až prosinec: výplata peněz za ligovou fázi po částech. */
export function monthlyEurope(state: GameState): void {
  const eu = state.europe;
  const month = Number(state.date.slice(5, 7));
  if (!eu?.resolved || eu.season !== state.season || ![10, 11, 12, 1].includes(month)) return;
  for (const e of eu.entries) {
    if (e.result === 'predkola') continue;
    const part = Math.round((e.revenue - QUALIFYING[e.entry]) / 4);
    book(state, e.clubId, 'evropa', part, `Evropské poháry: ${EUROPE_LABEL[e.result]}`);
    book(state, e.clubId, 'platy', -part * EUROPE_BONUS_SHARE, 'Prémie hráčům za evropské poháry');
  }
}

// ---------- Simulace evropských zápasů ----------

/** Očekávané góly: rozdíl síly a domácí prostředí. */
function expectedGoals(own: number, opp: number, home: boolean, neutral = false): [number, number] {
  const d = (own - opp) * 0.04 + (neutral ? 0 : home ? 0.15 : -0.15);
  return [1.3 * Math.exp(d), 1.3 * Math.exp(-d)];
}

function simScore(rng: Rng, own: number, opp: number, home: boolean, neutral = false): [number, number] {
  const [a, b] = expectedGoals(own, opp, home, neutral);
  return [Math.min(7, rng.poisson(a)), Math.min(7, rng.poisson(b))];
}

function minutes(rng: Rng, n: number): number[] {
  return Array.from({ length: n }, () => rng.int(1, 90)).sort((a, b) => a - b);
}

function pickScorers(state: GameState, rng: Rng, n: number): { playerId: string; minute: number }[] {
  const squad = squadOf(state, state.owner.clubId)
    .filter((p) => !(p.injuredUntil && p.injuredUntil >= state.date))
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 14);
  const weight = (p: Player) => ({ GK: 0, DF: 0.6, MF: 2, FW: 4 })[p.position] * Math.pow(p.overall / 60, 2);
  const total = squad.reduce((a, p) => a + weight(p), 0);
  return minutes(rng, n).map((minute) => {
    let r = rng.next() * total;
    let pick = squad[0];
    for (const p of squad) {
      r -= weight(p);
      if (r <= 0) {
        pick = p;
        break;
      }
    }
    return { playerId: pick?.id ?? '', minute };
  });
}

function strengthOf(state: GameState, run: EuroRun): number {
  return europeStrength(state, run.clubId);
}

/** Předkola: výsledek dvojzápasu podle šance na ligovou fázi, skóre obou zápasů tomu odpovídá. */
function planTie(state: GameState, rng: Rng, run: EuroRun, leg1: EuroMatch, leg2: EuroMatch): void {
  const s = strengthOf(state, run);
  const win = rng.chance(leaguePhaseChance(s, leg1.comp));
  for (let i = 0; i < 300; i++) {
    const a = simScore(rng, s, leg1.opponent.rating, leg1.home);
    const b = simScore(rng, s, leg2.opponent.rating, leg2.home);
    const own = a[0] + b[0];
    const opp = a[1] + b[1];
    if ((win && own >= opp) || (!win && own <= opp)) {
      leg1.planned = { own: a[0], opp: a[1] };
      leg2.planned = { own: b[0], opp: b[1], ownPens: own === opp ? win : undefined };
      return;
    }
  }
  leg1.planned = win ? { own: 1, opp: 0 } : { own: 0, opp: 1 };
  leg2.planned = { own: 1, opp: 1 };
}

function penalties(rng: Rng, ownWins: boolean): [number, number] {
  const loser = rng.int(2, 4);
  const winner = loser + 1;
  return ownWins ? [winner, loser] : [loser, winner];
}

/** Odehraje zápas: skóre, střelci, vstupné, prémie, pověst. */
function playMatch(state: GameState, rng: Rng, run: EuroRun, m: EuroMatch): void {
  const club = state.clubs[run.clubId];
  const s = strengthOf(state, run);
  if (m.leg === 1 && run.phase === 'predkola' && !m.planned) {
    const leg2 = run.matches.find((x) => x.tie === m.tie && x.leg === 2);
    if (leg2) planTie(state, rng, run, m, leg2);
  }
  const [own, opp] = m.planned ? [m.planned.own, m.planned.opp] : simScore(rng, s + prepEdge(state, m), m.opponent.rating, m.home, m.neutral);
  const result: EuroMatchResult = { own, opp, scorers: pickScorers(state, rng, own), oppMinutes: minutes(rng, opp) };
  const venue = europeVenueFactor(club);
  if (m.home && !m.neutral) {
    // Evropský večer: vyprodáno a dražší vstupenky.
    result.attendance = club.stadium.capacity;
    result.gate = Math.round(result.attendance * club.policy.ticketPrice * 2.5 * venue * prepTicket(state, m));
    book(state, run.clubId, 'vstupne', result.gate, `Evropský večer: ${club.shortName} – ${m.opponent.name} (vyprodáno)`);
  } else if (m.neutral) {
    result.attendance = 60_000;
  }
  m.result = result;
  // Ligová fáze: prémie UEFA za výhru a remízu.
  if (run.phase === 'liga') {
    run.gf += own;
    run.ga += opp;
    run.points += own > opp ? 3 : own === opp ? 1 : 0;
    const prize = own > opp ? PRIZE_WIN[m.comp] : own === opp ? PRIZE_DRAW[m.comp] : 0;
    if (prize) {
      result.prize = prize;
      book(state, run.clubId, 'evropa', prize, `Prémie UEFA: ${m.opponent.name} ${own}:${opp}`);
      book(state, run.clubId, 'platy', -prize * EUROPE_BONUS_SHARE, 'Prémie hráčům za evropské poháry');
    }
  }
  // Pověst, média a fanoušci.
  const strong = m.opponent.rating >= s + 6;
  if (own > opp) {
    club.reputation = clamp(club.reputation + (strong ? 0.4 : 0.2), 1, 99);
    media(state, strong ? 2 : 1);
    club.fanMood = clamp(club.fanMood + (m.home ? 3 : 2), 0, 100);
  } else if (own === opp) {
    club.reputation = clamp(club.reputation + (strong ? 0.2 : 0.08), 1, 99);
    club.fanMood = clamp(club.fanMood + 1, 0, 100);
  }
  // Únava: středa/čtvrtek a hned víkend.
  for (const p of squadOf(state, run.clubId).sort((a, b) => b.overall - a.overall).slice(0, 14)) p.fitness = Math.max(50, p.fitness - 8);
  matchNews(state, run, m);
}

/** W1: příprava evropského večera (lístky, kotel, choreo) mírně posune domácí prostředí. */
function prepEdge(state: GameState, m: EuroMatch): number {
  const bm = state.bigMatch;
  // Výjezd fanoušků na venkovní evropský zápas (W3: state.fans.trip) trochu pomůže i venku.
  const trip = state.fans?.trip;
  if (!m.home && !m.neutral && trip?.matchId === m.id) return trip.choice === 'vlak' ? 0.8 : trip.choice === 'autobusy' ? 0.4 : 0;
  if (!m.home || m.neutral || bm?.id !== m.id) return 0;
  const p = bm.prep ?? {};
  const choreo = p.choreo === 'zaplatit' ? 1 : p.choreo === 'zakaz' ? -0.3 : 0.4;
  const alloc = p.alloc === 'kotel' ? 0.5 : p.alloc === 'rodiny' ? -0.2 : 0;
  const tickets = p.tickets === 'lidove' ? 0.3 : p.tickets === 'zdrazit' ? -0.2 : 0;
  return choreo + alloc + tickets;
}

/** W1: vstupné evropského večera podle volby lístků (zdražit / lidové, plný příděl hostům). */
function prepTicket(state: GameState, m: EuroMatch): number {
  const bm = state.bigMatch;
  if (!m.home || m.neutral || bm?.id !== m.id) return 1;
  const p = bm.prep ?? {};
  return (p.tickets === 'zdrazit' ? 1.35 : p.tickets === 'lidove' ? 0.75 : 1) * (p.guests === 'plny' ? 1.03 : 1);
}

/** W1: zapíše los pro kartu s postupným odkrytím soupeře. */
function noteDraw(state: GameState, stage: string, opponents: EuroOpponent[]): void {
  state.euroDraw = { date: state.date, stage, opponents: opponents.map((o) => ({ ...o })) };
}

function scoreLine(state: GameState, run: EuroRun, m: EuroMatch): string {
  const own = state.clubs[run.clubId].shortName;
  const r = m.result!;
  return m.home ? `${own} – ${m.opponent.name} ${r.own}:${r.opp}` : `${m.opponent.name} – ${own} ${r.opp}:${r.own}`;
}

function matchNews(state: GameState, run: EuroRun, m: EuroMatch): void {
  const r = m.result!;
  const outcome = r.own > r.opp ? 'výhra' : r.own === r.opp ? 'remíza' : 'prohra';
  const scorers = r.scorers.map((x) => `${state.players[x.playerId]?.lastName ?? '?'} ${x.minute}.`).join(', ');
  const parts = [
    `${m.stage}, ${outcome}.`,
    scorers ? `Góly: ${scorers}.` : '',
    r.gate ? `Vyprodáno, ${r.attendance!.toLocaleString('cs-CZ')} diváků, vstupné ${mil(r.gate)}.` : '',
    r.prize ? `Prémie UEFA ${mil(r.prize)}.` : '',
  ];
  addNews(state, {
    kind: 'vysledek',
    title: `${m.home && !m.neutral ? 'Evropský večer: ' : ''}${scoreLine(state, run, m)}`,
    text: parts.filter(Boolean).join(' '),
    fixtureId: m.id,
  });
}

/** Součet dvojzápasu z pohledu klubu majitele. */
export function tieAggregate(run: EuroRun, tie: number): { own: number; opp: number; pens?: [number, number] } {
  const ms = run.matches.filter((m) => m.tie === tie && m.result);
  return {
    own: ms.reduce((a, m) => a + m.result!.own, 0),
    opp: ms.reduce((a, m) => a + m.result!.opp, 0),
    pens: ms.find((m) => m.result!.penalties)?.result!.penalties,
  };
}

/** Po odvetě (nebo finále): kdo postupuje. */
function tieWinner(state: GameState, rng: Rng, run: EuroRun, m: EuroMatch): boolean {
  const agg = tieAggregate(run, m.tie!);
  if (agg.own !== agg.opp) return agg.own > agg.opp;
  const ownWins = m.planned?.ownPens ?? rng.chance(0.5 + clamp((strengthOf(state, run) - m.opponent.rating) * 0.02, -0.2, 0.2));
  m.result!.penalties = penalties(rng, ownWins);
  return ownWins;
}

/** Odhad pořadí v ligové fázi (36 týmů) podle bodů a skóre. */
export function leaguePhaseRank(comp: EuropeCompetition, points: number, gd: number): number {
  const eight = comp !== 'KL';
  const table = eight ? [35, 35, 35, 35, 35, 33, 32, 31, 29, 27, 25, 22, 19, 16, 13, 10, 8, 6, 5, 3] : [35, 35, 35, 34, 31, 29, 27, 24, 22, 19, 16, 13, 10, 7, 4, 2];
  const base = table[Math.min(points, table.length - 1)];
  return clamp(Math.round(base - gd / 4), 1, 36);
}

function startLeaguePhase(state: GameState, rng: Rng, run: EuroRun, comp: EuropeCompetition): void {
  run.phase = 'liga';
  run.comp = comp;
  run.leagueComp = comp;
  run.best = `ligová fáze ${COMP_GEN[comp]}`;
  const pots = LEAGUE_POTS[comp];
  const dates = LEAGUE_DATES[comp].map((md) => onWeekday(seasonDate(run.season, md), WEEKDAY[comp]));
  const taken = new Set<string>();
  const opponents = pots.map((lvl) => {
    const o = drawClub(rng, run, [lvl], undefined, taken);
    taken.add(o.name);
    return o;
  });
  // Pořadí soupeřů zamíchat, doma a venku střídavě.
  const order = opponents.map((o, i) => ({ o, k: rng.next(), i })).sort((a, b) => a.k - b.k);
  const firstHome = rng.chance(0.5);
  order.forEach((x, i) => {
    run.matches.push({ id: newMatchId(state, run), date: freeDate(state, dates[i]), comp, stage: `Ligová fáze ${COMP_GEN[comp]}, ${i + 1}. kolo`, home: i % 2 === 0 ? firstHome : !firstHome, opponent: x.o });
  });
  noteDraw(state, `Ligová fáze ${COMP_GEN[comp]}`, order.map((x) => x.o));
  addNews(state, {
    kind: 'sezona',
    title: `Los ligové fáze ${COMP_GEN[comp]} je hotový`,
    text: `Soupeři: ${order.map((x) => `${x.o.name} (${x.o.country})`).join(', ')}. Za každou výhru prémie UEFA ${mil(PRIZE_WIN[comp])}, za remízu ${mil(PRIZE_DRAW[comp])}. Domácí zápasy budou vyprodané.`,
  });
}

function addKnockoutTie(state: GameState, rng: Rng, run: EuroRun, round: number): void {
  const comp = run.comp;
  const opponent = drawClub(rng, run, KO_LEVELS[comp][round]);
  const first = onWeekday(seasonDate(run.season, KO_DATES[round]), WEEKDAY[comp]);
  if (round === 4) {
    const date = comp === 'LM' ? onWeekday(seasonDate(run.season, '05-29'), 6) : first;
    run.matches.push({ id: newMatchId(state, run), date, comp, stage: `Finále ${COMP_GEN[comp]}`, home: false, neutral: true, opponent, tie: run.nextTie++, leg: 2 });
  } else {
    addTie(state, run, comp, `${KO_ROUNDS[round]} ${COMP_GEN[comp]}`, [first, addDays(first, 7)], opponent, round === 0 ? false : rng.chance(0.5));
  }
  const m = run.matches[run.matches.length - (round === 4 ? 1 : 2)];
  noteDraw(state, `${KO_ROUNDS[round]} ${COMP_GEN[comp]}`, [opponent]);
  addNews(state, { kind: 'info', title: `Los: ${KO_ROUNDS[round]} ${COMP_GEN[comp]}`, text: `Soupeř: ${opponent.name} (${opponent.country}). ${round === 4 ? 'Finále se hraje na neutrální půdě' : 'První zápas'} ${formatShortDate(m.date)}.` });
}

/** Kolo jara, ve kterém klub je (0 = play-off … 4 = finále). */
function koRound(m: EuroMatch): number {
  return Math.max(0, KO_ROUNDS.findIndex((r) => m.stage.startsWith(r)));
}

function afterMatch(state: GameState, rng: Rng, run: EuroRun, m: EuroMatch): void {
  const club = state.clubs[run.clubId];
  const season = `${run.season}/${String(run.season + 1).slice(2)}`;
  if (run.phase === 'predkola' && m.leg === 2) {
    const won = tieWinner(state, rng, run, m);
    if (won) {
      startLeaguePhase(state, rng, run, m.comp);
      return;
    }
    const next = NEXT[m.comp];
    const slot = run.nextTie;
    if (next && slot <= 2) {
      const opp = addQualifyingTie(state, rng, run, next, Math.max(slot, next === 'EL' ? 1 : 2));
      run.comp = next;
      noteDraw(state, `Play-off ${COMP_GEN[next]}`, [opp]);
      addNews(state, { kind: 'info', title: `Druhá šance: los play-off ${COMP_GEN[next]}`, text: `Po vyřazení pokračujete v nižší soutěži. Soupeř: ${opp.name} (${opp.country}).` });
    } else {
      run.phase = 'konec';
    }
    return;
  }
  if (run.phase === 'liga') {
    const league = run.matches.filter((x) => x.tie === undefined);
    const left = league.filter((x) => !x.result).length;
    // Během ligové fáze odhad podle dosavadního průměru bodů na zápas.
    const played = league.length - left;
    const scale = played ? league.length / played : 1;
    run.rank = leaguePhaseRank(run.comp, Math.round(run.points * scale), Math.round((run.gf - run.ga) * scale));
    if (left > 0) return;
    if (run.rank <= 24) {
      run.phase = 'jaro';
      run.best = run.rank <= 8 ? `osmifinále ${COMP_GEN[run.comp]}` : `play-off o osmifinále ${COMP_GEN[run.comp]}`;
      club.reputation = clamp(club.reputation + 1, 1, 99);
      club.fanMood = clamp(club.fanMood + 5, 0, 100);
      media(state, 3);
      addNews(state, {
        kind: 'sezona',
        title: `Jaro v Evropě! ${club.shortName} postupuje z ligové fáze ${COMP_GEN[run.comp]}`,
        text: `${run.points} bodů, skóre ${run.gf}:${run.ga}, asi ${run.rank}. místo. ${run.rank <= 8 ? 'Mezi nejlepší osmičkou: rovnou do osmifinále.' : 'Čeká vás play-off o osmifinále.'} Pověst klubu roste, fanoušci slaví.`,
      });
      addTrophy(state, 'evropa', `Jaro v Evropě: ${EUROPE_LABEL[run.comp]} ${season}`);
      addKnockoutTie(state, rng, run, run.rank <= 8 ? 1 : 0);
    } else {
      run.phase = 'konec';
      addNews(state, { kind: 'info', title: `Konec v ligové fázi ${COMP_GEN[run.comp]}`, text: `${run.points} bodů, skóre ${run.gf}:${run.ga}, asi ${run.rank}. místo. Na jaro to nestačilo, peníze a zkušenosti zůstávají.` });
    }
    return;
  }
  if (run.phase === 'jaro' && m.leg === 2) {
    const round = koRound(m);
    const won = tieWinner(state, rng, run, m);
    const agg = tieAggregate(run, m.tie!);
    const aggText = round === 4 ? `${agg.own}:${agg.opp}` : `celkem ${agg.own}:${agg.opp}`;
    const pens = m.result!.penalties ? `, penalty ${m.result!.penalties[0]}:${m.result!.penalties[1]}` : '';
    if (!won) {
      run.phase = 'konec';
      addNews(state, { kind: 'info', title: `Konec v Evropě: ${KO_ROUNDS[round].toLowerCase()} s ${m.opponent.name}`, text: `${aggText}${pens}. Evropská sezóna končí, ${run.best} je zápis do historie klubu.` });
      return;
    }
    const prize = KO_PRIZE[run.comp][round === 4 ? 4 : round];
    if (round < 4) {
      book(state, run.clubId, 'evropa', prize, `Prémie UEFA: postup do ${KO_ROUNDS_GEN[round + 1]}`);
      book(state, run.clubId, 'platy', -prize * EUROPE_BONUS_SHARE, 'Prémie hráčům za evropské poháry');
      run.best = `${KO_ROUNDS_GEN[round + 1]} ${COMP_GEN[run.comp]}`;
      club.reputation = clamp(club.reputation + 0.5 + round * 0.5, 1, 99);
      media(state, 2);
      addNews(state, { kind: 'sezona', title: `Postup do ${KO_ROUNDS_GEN[round + 1]}! ${club.shortName} vyřadil ${m.opponent.name}`, text: `${aggText}${pens}. Prémie UEFA ${mil(prize)}.` });
      addKnockoutTie(state, rng, run, round + 1);
    } else {
      book(state, run.clubId, 'evropa', prize, `Prémie UEFA: vítěz ${COMP_GEN[run.comp]}`);
      book(state, run.clubId, 'platy', -prize * EUROPE_BONUS_SHARE, 'Prémie hráčům za evropské poháry');
      run.best = `vítěz ${COMP_GEN[run.comp]}`;
      run.phase = 'konec';
      club.reputation = clamp(club.reputation + 5, 1, 99);
      club.fanMood = clamp(club.fanMood + 15, 0, 100);
      media(state, 10);
      addNews(state, { kind: 'sezona', title: `${club.shortName} vyhrál ${EUROPE_LABEL[run.comp]}!`, text: `Finále s ${m.opponent.name} ${aggText}${pens}. Největší úspěch v historii klubu. Prémie UEFA ${mil(prize)}.` });
      addTrophy(state, 'evropa', `Vítěz: ${EUROPE_LABEL[run.comp]} ${season}`);
    }
  }
}

/** Každý den: evropské zápasy klubu majitele, které se ten den hrají. */
export function dailyEurope(state: GameState, rng: Rng): void {
  const run = state.europe?.run;
  if (!run || run.season !== state.season || run.clubId !== state.owner.clubId) return;
  for (const m of run.matches.filter((x) => x.date === state.date && !x.result)) {
    playMatch(state, rng, run, m);
    afterMatch(state, rng, run, m);
  }
  for (const e of [...state.europe!.entries, ...(state.europeHistory ?? [])]) {
    if (e.clubId === run.clubId && e.season === run.season) e.best = run.best;
  }
}

/** Evropská cesta klubu majitele v aktuální sezóně. */
export function europeRun(state: GameState): EuroRun | undefined {
  const run = state.europe?.run;
  return run && run.season === state.season && run.clubId === state.owner.clubId ? run : undefined;
}

export function isEuroMatchId(id: string): boolean {
  return id.startsWith('eu-');
}

export function findEuroMatch(state: GameState, id: string): { run: EuroRun; match: EuroMatch } | undefined {
  const run = state.europe?.run;
  const match = run?.matches.find((m) => m.id === id);
  return run && match ? { run, match } : undefined;
}

/** Další neodehraný evropský zápas klubu majitele. */
export function nextEuroMatch(state: GameState): EuroMatch | undefined {
  return europeRun(state)?.matches.filter((m) => !m.result && m.date > state.date).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
}

export function lastEuroMatch(state: GameState): EuroMatch | undefined {
  return europeRun(state)?.matches.filter((m) => m.result).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
}

/** Popisek dosaženého výsledku pro historii (např. „osmifinále Evropské ligy“). */
export function europeBestLabel(e: EuropeEntry): string {
  return e.best ?? (e.result === 'predkola' ? EUROPE_LABEL.predkola : `ligová fáze: ${EUROPE_LABEL[e.result]}`);
}
