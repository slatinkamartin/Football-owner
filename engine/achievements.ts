import { clubValuation } from './ownership';
import { playerAge, squadOf } from './players';
import type { Fixture, GameState, Player } from './types';
import { addNews, competitionOf, tierOf } from './world';

/**
 * Úspěchy a odznaky majitele. Kontrolují se jednou týdně a na konci sezóny, při zisku přijde
 * zpráva (a v rozhraní krátké upozornění), žádné okno. Odznaky se přenášejí do další kariéry.
 */

export type AchievementTier = 1 | 2 | 3;

export interface AchievementRecord {
  /** Dosažený stupeň (1 = bronz, 2 = stříbro, 3 = zlato; jednostupňové odznaky mají 1). */
  tier: AchievementTier;
  date: string;
  season: number;
  clubName: string;
}

/** Průběžné počítadlo pro odznaky (za éru v aktuálním klubu). */
export interface AchievementStats {
  wins?: number;
  winStreak?: number;
  bestWinStreak?: number;
  bigWins?: number;
  derbyWins?: number;
  derbyStreak?: number;
  bestDerbyStreak?: number;
  giantKills?: number;
  sellouts?: number;
  cupWins?: number;
  titles?: number;
  leagueWins?: number;
  promotions?: number;
  escapes?: number;
  unbeatenHome?: number;
  unbeatenSeasons?: number;
  debtFreeStreak?: number;
  seasonsAtClub?: number;
  topScorerGoals?: number;
  youngMax?: number;
  homegrownMax?: number;
  bestAttendance?: number;
  maxSale?: number;
  maxBuy?: number;
  fanPeak?: number;
  europe?: number;
  europeSpring?: number;
  scenarioStars?: number;
  challengesDone?: number;
  bigDecisions?: number;
  maxValuation?: number;
}

export interface AchievementsState {
  unlocked: Record<string, AchievementRecord>;
  stats: AchievementStats;
  /** Do kterého dne jsou zpracované zápasy. */
  cursor?: string;
  /** Dorostenci z přijímaček klubu majitele (odchovanci). */
  youthIds?: string[];
  /** Klub, ke kterému se počítadla vztahují. */
  clubId?: string;
}

export interface AchievementDef {
  id: string;
  icon: string;
  title: string;
  /** Co je potřeba udělat (u stupňů {n} = hranice). */
  desc: string;
  /** Hranice stupňů: jedna = jednoduchý odznak, tři = bronz, stříbro, zlato. */
  tiers: number[];
  /** Jednotka u stupňů (např. „výher“). */
  unit?: string;
  /** Vlastní popisky stupňů (místo čísla a jednotky). */
  tierLabels?: string[];
  value: (state: GameState, s: AchievementStats) => number;
}

const mil = (v: number) => `${Math.round(v / 1_000_000).toLocaleString('cs-CZ')} mil.`;
const n = (v: number | undefined) => v ?? 0;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'prvni-vyhra', icon: '⚽', title: 'První výhra', desc: 'Vyhrajte první soutěžní zápas pod vaším vedením.', tiers: [1], value: (_, s) => n(s.wins) },
  { id: 'vyhry', icon: '📈', title: 'Sbírka výher', desc: 'Vyhrajte soutěžní zápasy celkem.', tiers: [25, 100, 250], unit: 'výher', value: (_, s) => n(s.wins) },
  { id: 'serie', icon: '🔥', title: 'Vítězná šňůra', desc: 'Vyhrajte ligové zápasy za sebou.', tiers: [3, 5, 8], unit: 'výher v řadě', tierLabels: ['3 v řadě', '5 v řadě', '8 v řadě'], value: (_, s) => n(s.bestWinStreak) },
  { id: 'kanonada', icon: '💥', title: 'Kanonáda', desc: 'Vyhrajte soutěžní zápas o 5 a více gólů.', tiers: [1], value: (_, s) => n(s.bigWins) },
  { id: 'derby', icon: '🏙️', title: 'Pán města', desc: 'Vyhrajte derby (soupeř ze stejného města), nejlépe několikrát po sobě.', tiers: [1, 3, 5], unit: 'derby v řadě', tierLabels: ['1 derby', '3 derby v řadě', '5 derby v řadě'], value: (_, s) => n(s.bestDerbyStreak) },
  { id: 'obr', icon: '🪨', title: 'David a Goliáš', desc: 'Vyřaďte v poháru klub z vyšší soutěže.', tiers: [1, 3, 5], unit: 'skalpů', tierLabels: ['1 skalp', '3 skalpy', '5 skalpů'], value: (_, s) => n(s.giantKills) },
  { id: 'pohar', icon: '🏆', title: 'Pohárový tým', desc: 'Vyhrajte domácí pohár.', tiers: [1, 2, 3], unit: 'pohárů', tierLabels: ['1 pohár', '2 poháry', '3 poháry'], value: (_, s) => n(s.cupWins) },
  { id: 'postup', icon: '⬆️', title: 'Postup', desc: 'Postupte do vyšší soutěže.', tiers: [1, 2, 3], unit: 'postupů', tierLabels: ['1 postup', '2 postupy', '3 postupy'], value: (_, s) => n(s.promotions) },
  { id: 'vitez-souteze', icon: '🥇', title: 'Vítěz soutěže', desc: 'Vyhrajte ligovou soutěž (jakoukoli úroveň).', tiers: [1], value: (_, s) => n(s.leagueWins) },
  { id: 'titul', icon: '👑', title: 'Mistr ligy', desc: 'Vyhrajte nejvyšší soutěž.', tiers: [1, 2, 3], unit: 'titulů', tierLabels: ['1 titul', '2 tituly', '3 tituly'], value: (_, s) => n(s.titles) },
  { id: 'zachrana', icon: '🛟', title: 'Záchrana na poslední chvíli', desc: 'Skončete na posledním místě, které ještě nesestupuje.', tiers: [1], value: (_, s) => n(s.escapes) },
  { id: 'doma', icon: '🏠', title: 'Doma neporažení', desc: 'Odehrajte ligovou sezónu bez domácí porážky.', tiers: [1], value: (_, s) => n(s.unbeatenHome) },
  { id: 'neporazeni', icon: '🛡️', title: 'Neporazitelní', desc: 'Odehrajte celou ligovou sezónu bez porážky.', tiers: [1], value: (_, s) => n(s.unbeatenSeasons) },
  { id: 'vyprodano', icon: '🎟️', title: 'Vyprodáno', desc: 'Vyprodejte stadion (aspoň 98 % kapacity).', tiers: [1, 10, 30], unit: 'vyprodaných zápasů', tierLabels: ['1 zápas', '10 zápasů', '30 zápasů'], value: (_, s) => n(s.sellouts) },
  { id: 'navsteva', icon: '👥', title: 'Divácký magnet', desc: 'Průměrná návštěva ligových zápasů doma za sezónu.', tiers: [3_000, 8_000, 14_000], unit: 'diváků', value: (_, s) => n(s.bestAttendance) },
  { id: 'fanousci', icon: '📣', title: 'Miláček tribun', desc: 'Dostaňte náladu fanoušků na 90 a víc.', tiers: [90], value: (_, s) => n(s.fanPeak) },
  { id: 'evropa', icon: '🌍', title: 'Evropské podzimy', desc: 'Projděte do ligové fáze evropského poháru (bronz Konferenční liga, stříbro Evropská liga, zlato Liga mistrů).', tiers: [1, 2, 3], tierLabels: ['Konferenční liga', 'Evropská liga', 'Liga mistrů'], value: (_, s) => n(s.europe) },
  { id: 'evropa-jaro', icon: '🌷', title: 'Evropské jaro', desc: 'Postupte z ligové fáze evropského poháru do jarní vyřazovací části.', tiers: [1], value: (_, s) => n(s.europeSpring) },
  { id: 'prodej', icon: '💰', title: 'Obchodník', desc: 'Prodejte hráče za velké peníze.', tiers: [50_000_000, 100_000_000, 200_000_000], unit: 'Kč', value: (_, s) => n(s.maxSale) },
  { id: 'nakup', icon: '🛒', title: 'Velká posila', desc: 'Kupte hráče aspoň za 30 mil. Kč.', tiers: [30_000_000], value: (_, s) => n(s.maxBuy) },
  { id: 'kanonyr', icon: '🎯', title: 'Kanonýr', desc: 'Váš hráč dá v sezóně aspoň 20 gólů.', tiers: [20], value: (_, s) => n(s.topScorerGoals) },
  { id: 'mladi', icon: '🌱', title: 'Šance pro mladé', desc: 'Hráči do 21 let s aspoň 10 starty v jedné sezóně.', tiers: [2, 4, 6], unit: 'hráčů', value: (_, s) => n(s.youngMax) },
  { id: 'odchovanec', icon: '🎓', title: 'Z vlastní líhně', desc: 'Odchovanci z vaší akademie s aspoň 10 starty v A-týmu za sezónu.', tiers: [1, 3, 5], unit: 'odchovanců', tierLabels: ['1 odchovanec', '3 odchovanci', '5 odchovanců'], value: (_, s) => n(s.homegrownMax) },
  { id: 'bez-dluhu', icon: '🧾', title: 'Hospodář', desc: 'Zakončete sezóny po sobě bez bankovního dluhu a v plusu.', tiers: [1, 3, 5], unit: 'sezón v řadě', tierLabels: ['1 sezóna', '3 sezóny v řadě', '5 sezón v řadě'], value: (_, s) => n(s.debtFreeStreak) },
  { id: 'hodnota', icon: '💎', title: 'Rodinné stříbro', desc: 'Zvyšte odhadní hodnotu klubu.', tiers: [300_000_000, 1_000_000_000, 2_500_000_000], unit: 'Kč', value: (_, s) => n(s.maxValuation) },
  { id: 'vernost', icon: '🗓️', title: 'Věrný majitel', desc: 'Vydržte u klubu celé sezóny.', tiers: [3, 5, 10], unit: 'sezón', value: (_, s) => n(s.seasonsAtClub) },
  { id: 'vyzvy', icon: '✅', title: 'Plním, co slíbím', desc: 'Splňte osobní výzvy sezóny.', tiers: [3, 10, 25], unit: 'výzev', value: (_, s) => n(s.challengesDone) },
  { id: 'velke-rozhodnuti', icon: '♟️', title: 'Velká sázka', desc: 'Přijměte velké rozhodnutí s dlouhými důsledky.', tiers: [1], value: (_, s) => n(s.bigDecisions) },
  { id: 'scenar', icon: '⭐', title: 'Splněný scénář', desc: 'Dokončete scénář (stupeň podle počtu hvězd).', tiers: [1, 2, 3], unit: 'hvězdy', tierLabels: ['★', '★★', '★★★'], value: (_, s) => n(s.scenarioStars) },
];

export const TIER_LABEL: Record<AchievementTier, string> = { 1: 'bronz', 2: 'stříbro', 3: 'zlato' };

export function achievementDef(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

/** Popis hranice stupně (např. „100 mil. Kč“, „5 výher v řadě“). */
export function tierThresholdText(def: AchievementDef, i: number): string {
  if (def.tierLabels?.[i]) return def.tierLabels[i];
  const t = def.tiers[i];
  if (def.unit === 'Kč') return `${t >= 1_000_000_000 ? `${(t / 1e9).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mld.` : mil(t)} Kč`;
  return def.unit ? `${t.toLocaleString('cs-CZ')} ${def.unit}` : '';
}

export function achievementsOf(state: GameState): AchievementsState {
  return state.achievements ?? { unlocked: {}, stats: {} };
}

function ensure(state: GameState): AchievementsState {
  const a = (state.achievements ??= { unlocked: {}, stats: {} });
  // Nový klub (kariéra): počítadla začínají znovu, odznaky zůstávají.
  if (a.clubId !== state.owner.clubId) {
    if (a.clubId) a.stats = {};
    a.clubId = state.owner.clubId;
    a.cursor = undefined;
    a.youthIds = [];
  }
  return a;
}

/** Počet získaných odznaků a nejvyšší možný počet. */
export function achievementCount(state: GameState): { unlocked: number; total: number; gold: number } {
  const u = achievementsOf(state).unlocked;
  const ids = Object.keys(u).filter((id) => achievementDef(id));
  return { unlocked: ids.length, total: ACHIEVEMENTS.length, gold: ids.filter((id) => u[id].tier === 3).length };
}

/** Je hráč odchovanec klubu majitele? (Příznak akademie nebo dorostenec z přijímaček.) */
export function isHomegrownPlayer(state: GameState, p: Player): boolean {
  if (p.academy && p.academy === state.owner.clubId) return true;
  return !!state.achievements?.youthIds?.includes(p.id);
}

// ---------- Zpracování zápasů ----------

interface OwnFixture {
  f: Fixture;
  kind: 'liga' | 'pohar' | 'jine';
}

function ownFixtures(state: GameState, from: string | undefined, to: string): OwnFixture[] {
  const own = state.owner.clubId;
  const out: OwnFixture[] = [];
  const take = (f: Fixture, kind: OwnFixture['kind']) => {
    if (!f.result || (f.homeId !== own && f.awayId !== own)) return;
    if ((from && f.date <= from) || f.date > to) return;
    out.push({ f, kind });
  };
  for (const c of Object.values(state.competitions)) for (const f of c.fixtures) take(f, 'liga');
  for (const cup of Object.values(state.cups)) for (const f of cup.fixtures) take(f, cup.kind === 'pohar' ? 'pohar' : 'jine');
  return out.sort((a, b) => (a.f.date < b.f.date ? -1 : a.f.date > b.f.date ? 1 : 0));
}

/** Výsledek zápasu z pohledu klubu (penalty rozhodují pohár). */
export function fixtureOutcome(f: Fixture, clubId: string): 'W' | 'D' | 'L' {
  const r = f.result!;
  const home = f.homeId === clubId;
  let mine = home ? r.homeGoals : r.awayGoals;
  let theirs = home ? r.awayGoals : r.homeGoals;
  if (mine === theirs && r.penalties) {
    mine += home ? r.penalties[0] : r.penalties[1];
    theirs += home ? r.penalties[1] : r.penalties[0];
  }
  return mine > theirs ? 'W' : mine < theirs ? 'L' : 'D';
}

/** Derby: soupeř ze stejného města (ne B-tým). */
export function isDerby(state: GameState, a: string, b: string): boolean {
  const x = state.clubs[a];
  const y = state.clubs[b];
  return !!x && !!y && x.city === y.city && !x.reserveOf && !y.reserveOf && x.reserveOf !== b && y.reserveOf !== a;
}

function processResults(state: GameState, a: AchievementsState): void {
  const own = state.owner.clubId;
  const club = state.clubs[own];
  const s = a.stats;
  for (const { f, kind } of ownFixtures(state, a.cursor, state.date)) {
    const o = fixtureOutcome(f, own);
    const opp = f.homeId === own ? f.awayId : f.homeId;
    const r = f.result!;
    if (o === 'W') s.wins = n(s.wins) + 1;
    if (o === 'W' && Math.abs(r.homeGoals - r.awayGoals) >= 5) s.bigWins = n(s.bigWins) + 1;
    if (kind === 'liga') {
      s.winStreak = o === 'W' ? n(s.winStreak) + 1 : 0;
      s.bestWinStreak = Math.max(n(s.bestWinStreak), s.winStreak);
      if (isDerby(state, own, opp)) {
        s.derbyStreak = o === 'W' ? n(s.derbyStreak) + 1 : 0;
        if (o === 'W') s.derbyWins = n(s.derbyWins) + 1;
        s.bestDerbyStreak = Math.max(n(s.bestDerbyStreak), s.derbyStreak);
      }
    }
    if (kind === 'pohar' && o === 'W' && tierOf(state, opp) < tierOf(state, own)) s.giantKills = n(s.giantKills) + 1;
    if (f.homeId === own && r.attendance >= club.stadium.capacity * 0.98) s.sellouts = n(s.sellouts) + 1;
  }
  a.cursor = state.date;
}

function liveStats(state: GameState, a: AchievementsState): void {
  const s = a.stats;
  const own = state.owner.clubId;
  const club = state.clubs[own];
  // Dorostenci z letních přijímaček jsou odchovanci.
  if (state.youthIntake?.candidates.length) a.youthIds = [...new Set([...(a.youthIds ?? []), ...state.youthIntake.candidates.map((p) => p.id)])].slice(-80);
  const log = (state.transferLog ?? []).filter((e) => e.kind !== 'hostovani');
  const sales = log.filter((e) => e.fromId === own && e.toId !== own).map((e) => e.fee);
  const buys = log.filter((e) => e.toId === own && e.fromId !== own).map((e) => e.fee);
  s.maxSale = Math.max(n(s.maxSale), 0, ...sales);
  s.maxBuy = Math.max(n(s.maxBuy), 0, ...buys);
  s.fanPeak = Math.max(n(s.fanPeak), Math.round(club.fanMood));
  s.maxValuation = Math.max(n(s.maxValuation), clubValuation(state));
  const squad = squadOf(state, own);
  s.topScorerGoals = Math.max(n(s.topScorerGoals), 0, ...squad.map((p) => p.goals));
  s.youngMax = Math.max(n(s.youngMax), squad.filter((p) => playerAge(p, state.season) <= 21 && p.starts >= 10).length);
  s.homegrownMax = Math.max(n(s.homegrownMax), squad.filter((p) => p.starts >= 10 && isHomegrownPlayer(state, p)).length);
  const eu = state.europe?.season === state.season ? state.europe.entries.find((e) => e.clubId === own) : undefined;
  if (eu && state.europe?.resolved && eu.result !== 'predkola') s.europe = Math.max(n(s.europe), eu.result === 'LM' ? 3 : eu.result === 'EL' ? 2 : 1);
  const run = state.europe?.run;
  if ((run && run.clubId === own && run.season === state.season && (run.phase === 'jaro' || /osmifin|čtvrtfin|semifin|finále|vítěz/i.test(run.best ?? ''))) || (eu?.best && /osmifin|čtvrtfin|semifin|finále|vítěz/i.test(eu.best))) {
    s.europeSpring = Math.max(n(s.europeSpring), 1);
  }
  const stars = state.scenario?.result?.stars ?? 0;
  s.scenarioStars = Math.max(n(s.scenarioStars), stars);
}

/** Projde odznaky a udělí nové stupně (zpráva u každého). Vrací nově získané. */
function award(state: GameState, a: AchievementsState): string[] {
  const club = state.clubs[state.owner.clubId];
  const got: string[] = [];
  for (const def of ACHIEVEMENTS) {
    const v = def.value(state, a.stats);
    const reached = def.tiers.filter((t) => v >= t).length;
    const have = a.unlocked[def.id]?.tier ?? 0;
    if (reached <= have) continue;
    const tier = reached as AchievementTier;
    a.unlocked[def.id] = { tier, date: state.date, season: state.season, clubName: club.name };
    got.push(def.id);
    const multi = def.tiers.length > 1;
    addNews(state, {
      kind: 'sezona',
      title: `Odznak: ${def.icon} ${def.title}${multi ? ` (${TIER_LABEL[tier]})` : ''}`,
      text: `${def.desc}${multi && tierThresholdText(def, tier - 1) ? ` Dosaženo: ${tierThresholdText(def, tier - 1)}.` : ''}${multi && tier < 3 ? ` Další stupeň: ${tierThresholdText(def, tier)}.` : ''}`,
    });
  }
  return got;
}

/** Týdně: zpracovat odehrané zápasy a zkontrolovat odznaky. */
export function weeklyAchievements(state: GameState): void {
  if (state.gameOver) return;
  const a = ensure(state);
  processResults(state, a);
  liveStats(state, a);
  award(state, a);
}

/** Konec sezóny (po vyhodnocení soutěží a výzev): sezónní odznaky. */
export function seasonAchievements(state: GameState): void {
  const a = ensure(state);
  processResults(state, a);
  liveStats(state, a);
  const s = a.stats;
  const own = state.owner.clubId;
  const last = state.history[state.history.length - 1];
  const comp = last?.season === state.season ? state.competitions[last.ownerClub.competitionId] : undefined;
  s.seasonsAtClub = n(s.seasonsAtClub) + 1;
  if (comp && last) {
    const pos = last.ownerClub.position;
    if (pos === 1) s.leagueWins = n(s.leagueWins) + 1;
    if (pos === 1 && comp.tier === 1) s.titles = n(s.titles) + 1;
    const nowTier = competitionOf(state, own)?.tier ?? comp.tier;
    if (nowTier < comp.tier) s.promotions = n(s.promotions) + 1;
    const size = new Set(comp.fixtures.flatMap((f) => [f.homeId, f.awayId])).size;
    if (comp.relegate > 0 && pos === size - comp.relegate && nowTier === comp.tier) s.escapes = n(s.escapes) + 1;
    const mine = comp.fixtures.filter((f) => f.result && (f.homeId === own || f.awayId === own));
    if (mine.length >= 10) {
      if (!mine.some((f) => f.homeId === own && fixtureOutcome(f, own) === 'L')) s.unbeatenHome = n(s.unbeatenHome) + 1;
      if (!mine.some((f) => fixtureOutcome(f, own) === 'L')) s.unbeatenSeasons = n(s.unbeatenSeasons) + 1;
      const home = mine.filter((f) => f.homeId === own);
      if (home.length) s.bestAttendance = Math.max(n(s.bestAttendance), Math.round(home.reduce((x, f) => x + f.result!.attendance, 0) / home.length));
    }
  }
  if (state.cups.pohar?.winner === own) s.cupWins = n(s.cupWins) + 1;
  const club = state.clubs[own];
  const debtFree = club.finance.balance >= 0 && state.loans.length === 0;
  s.debtFreeStreak = debtFree ? n(s.debtFreeStreak) + 1 : 0;
  award(state, a);
}

/** Vnější počítadla (výzvy, velká rozhodnutí) přičtou bod a hned zkontrolují odznaky. */
export function bumpAchievementStat(state: GameState, key: 'challengesDone' | 'bigDecisions', by = 1): void {
  const a = ensure(state);
  a.stats[key] = n(a.stats[key]) + by;
  award(state, a);
}

/** Odznaky sezóny pro výroční zprávu. */
export function seasonAchievementLines(state: GameState): string[] {
  const u = achievementsOf(state).unlocked;
  return Object.entries(u)
    .filter(([, r]) => r.season === state.season && r.clubName === state.clubs[state.owner.clubId].name)
    .map(([id, r]) => {
      const def = achievementDef(id);
      return def ? `${def.icon} ${def.title}${def.tiers.length > 1 ? ` (${TIER_LABEL[r.tier]})` : ''}` : '';
    })
    .filter(Boolean);
}

// ---------- Kariéra ----------

/** Odznaky do kariéry: lepší stupeň vyhrává. */
export function careerAchievements(state: GameState, previous?: Record<string, AchievementRecord>): Record<string, AchievementRecord> {
  const out: Record<string, AchievementRecord> = { ...(previous ?? {}) };
  for (const [id, r] of Object.entries(state.achievements?.unlocked ?? {})) {
    if (!out[id] || out[id].tier < r.tier) out[id] = r;
  }
  return out;
}

/** Nová hra v kariéře: odznaky zůstávají, počítadla začínají znovu. */
export function restoreCareerAchievements(state: GameState, unlocked?: Record<string, AchievementRecord>): void {
  if (!unlocked) return;
  state.achievements = { unlocked: { ...unlocked }, stats: {}, clubId: state.owner.clubId };
}
