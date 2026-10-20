import { annualCosts } from './finance';
import { newGame, type NewGameOptions } from './game';
import { squadOf } from './players';
import { careerAchievements, restoreCareerAchievements, seasonAchievementLines, type AchievementRecord } from './achievements'; // W3
import { challengeReportLines } from './challenges'; // W3
import { addTrophy, legacyScore, personalWealth, type Trophy } from './surroundings';
import type { DataPack, GameState } from './types';
import { addNews, competitionOf, tierOf } from './world';

/**
 * Celek hry: výroční zpráva sezóny, scénáře s cílem a hodnocením (hvězdy)
 * a kariéra majitele napříč kluby (peníze, pověst a síň slávy se přenášejí).
 */

const mil = (v: number) => `${(v / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč`;

// ---------- Výroční zpráva ----------

export interface SeasonReport {
  season: number;
  date: string;
  clubName: string;
  competition: string;
  position: number;
  goalText: string;
  goalMet: boolean;
  bestPlayer?: { name: string; rating: number };
  topScorer?: { name: string; goals: number };
  moments: string[];
  best?: string;
  worst?: string;
  operating: number;
  balance: number;
  grade?: string;
  sideGoals: string[];
  trophies: string[];
  seen?: boolean;
  /** W3: výzvy sezóny a odznaky získané v sezóně. */
  challenges?: string[];
  achievements?: string[];
  /** W2: hodnocení majitele (známka A–F) a pořadí mezi majiteli soutěže. */
  ownerGrade?: string;
  ownerRank?: { rank: number; of: number };
}

/** Zlomové okamžiky bez opakování (stejný příběh dvakrát za sezónu se liší jen koncem v závorce). */
function dedupeMoments(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter((m) => {
    const key = m.replace(/^\d+\. kolo: /, '').replace(/ \((dobrý konec|špatný konec|uzavřeno)\)$/, '').trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Konec sezóny (po vyhodnocení financí): výroční zpráva. */
export function buildSeasonReport(state: GameState, position: number, goalText: string, goalMet: boolean, competitionName?: string): void {
  const club = state.clubs[state.owner.clubId];
  // Soutěž, ve které se sezóna hrála (po postupu/sestupu už je klub jinde).
  const comp = competitionOf(state, club.id);
  const squad = squadOf(state, club.id);
  const rated = squad.filter((p) => p.ratingCount >= 10).sort((a, b) => b.ratingSum / b.ratingCount - a.ratingSum / a.ratingCount)[0];
  const scorer = [...squad].sort((a, b) => b.goals - a.goals)[0];
  const stories = (state.stories ?? []).filter((s) => s.started >= `${state.season}-07-01`);
  const notes = (state.timelineNotes ?? []).filter((n) => n.season === state.season).map((n) => `${n.round}. kolo: ${n.text}`);
  const sales = state.market.history.filter((h) => h.date >= `${state.season}-07-01` && h.fromId === club.id).sort((a, b) => b.fee - a.fee);
  const buys = state.market.history.filter((h) => h.date >= `${state.season}-07-01` && h.toId === club.id).sort((a, b) => b.fee - a.fee);
  const good = stories.find((s) => s.outcome === 'dobre');
  const bad = stories.find((s) => s.outcome === 'spatne');
  const best = good ? `${good.title}: ${good.log[good.log.length - 1] ?? ''}` : sales[0] && sales[0].fee > 0 ? `Prodej ${sales[0].playerName} za ${mil(sales[0].fee)}` : buys[0] ? `Posila ${buys[0].playerName}` : undefined;
  const worst = bad ? `${bad.title}: ${bad.log[bad.log.length - 1] ?? ''}` : !goalMet ? `Cíl sezóny se nesplnil (${goalText})` : undefined;
  const report: SeasonReport = {
    season: state.season,
    date: state.date,
    clubName: club.name,
    competition: competitionName ?? comp?.name ?? '',
    position,
    goalText,
    goalMet,
    bestPlayer: rated ? { name: `${rated.firstName} ${rated.lastName}`, rating: rated.ratingSum / rated.ratingCount } : undefined,
    topScorer: scorer && scorer.goals > 0 ? { name: `${scorer.firstName} ${scorer.lastName}`, goals: scorer.goals } : undefined,
    moments: dedupeMoments([...notes, ...stories.map((s) => `${s.title}${s.outcome ? ` (${s.outcome === 'dobre' ? 'dobrý konec' : s.outcome === 'spatne' ? 'špatný konec' : 'uzavřeno'})` : ''}`)]).slice(0, 8),
    best,
    worst,
    operating: Object.entries(club.finance.season).filter(([k]) => !['prestupy', 'investice', 'dane', 'uver', 'vklad'].includes(k)).reduce((a, [, v]) => a + v, 0),
    balance: club.finance.balance,
    grade: state.rating?.season === state.season ? state.rating.grade : undefined,
    sideGoals: (state.sideGoals?.season === state.season ? state.sideGoals.goals : []).map((g) => `${g.label}: ${g.done === 'splneno' ? 'splněno' : 'nesplněno'}`),
    trophies: (state.trophies ?? []).filter((t) => t.season === state.season && (!t.clubId || t.clubId === club.id) && t.kind !== 'vyzva').map((t) => t.text),
    challenges: challengeReportLines(state), // W3
    achievements: seasonAchievementLines(state), // W3
  };
  const ownerRating = state.ownerRatings?.find((r) => r.season === state.season);
  if (ownerRating) {
    report.ownerGrade = ownerRating.grade;
    report.ownerRank = { rank: ownerRating.rank, of: ownerRating.of };
  }
  state.seasonReports = [report, ...(state.seasonReports ?? [])].slice(0, 12);
}

export function markReportSeen(prev: GameState, season: number): GameState {
  const state = structuredClone(prev);
  for (const r of state.seasonReports ?? []) if (r.season === season) r.seen = true;
  return state;
}

// ---------- Scénáře ----------

export type ScenarioId = 'zachrana' | 'vzestup' | 'evropa' | 'prodejni';

export interface ScenarioDef {
  id: ScenarioId;
  title: string;
  description: string;
  clubId: string;
  seasons: number;
  ownerShare?: number;
}

export const SCENARIOS: ScenarioDef[] = [
  { id: 'zachrana', title: 'Zachraňte krachující klub', description: 'Zlín je v minusu a splácí úvěr. Za dvě sezóny udržte 1. ligu a dostaňte účet z hluboké díry. Hvězdy podle zdraví financí (zůstatek po odečtení vaší půjčky klubu): ★ ztráta do 10 % ročních nákladů, ★★ aspoň nula, ★★★ rezerva 10 % nákladů.', clubId: 'zlin', seasons: 2 },
  { id: 'vzestup', title: 'Vraťte Dynamo do 1. ligy', description: 'České Budějovice spadly až do ČFL. Do šesti sezón je doveďte zpátky do 1. ligy. ★ za postup do 2. ligy, ★★ za 1. ligu, ★★★ za 1. ligu do čtyř sezón.', clubId: 'budejovice', seasons: 6 },
  { id: 'evropa', title: 'Evropa s městem jako spolumajitelem', description: 'Hradec vlastníte z 51 %, město a patrioti zbytek. Do tří sezón skončete do 4. místa 1. ligy (Evropa).', clubId: 'hradec', seasons: 3, ownerShare: 0.51 },
  { id: 'prodejni', title: 'Prodejní klub', description: 'Jablonec žije z prodejů. Za čtyři sezóny vydělejte na přestupech čistých 400 mil. Kč a zůstaňte v 1. lize. Čím víc navíc, tím víc hvězd.', clubId: 'jablonec', seasons: 4 },
];

export function scenarioDef(id: ScenarioId): ScenarioDef {
  return SCENARIOS.find((s) => s.id === id)!;
}

/** Nová hra ve scénáři. */
export function newScenarioGame(pack: DataPack, id: ScenarioId, opts: Omit<NewGameOptions, 'clubId'>): GameState {
  const def = scenarioDef(id);
  const state = newGame(pack, { ...opts, clubId: def.clubId, ownerShare: def.ownerShare ?? opts.ownerShare ?? 1 });
  const club = state.clubs[def.clubId];
  const costs = annualCosts(club, tierOf(state, club.id));
  if (id === 'zachrana') {
    club.finance.balance = -Math.round(costs * 0.2);
    const amount = Math.round((costs * 0.25) / 1_000_000) * 1_000_000;
    const months = 36;
    const r = 0.07 / 12;
    state.loans.push({ id: `u${++state.nextId}`, kind: 'provozni', principal: amount, remaining: amount, rate: 0.07, payment: Math.round((amount * r) / (1 - Math.pow(1 + r, -months))), monthsLeft: months });
    club.fanMood = 35;
  }
  if (id === 'evropa') {
    state.shareholders = [
      { id: `a${++state.nextId}`, name: 'Statutární město Hradec Králové', kind: 'mesto', share: 0.29, satisfaction: 60 },
      { id: `a${++state.nextId}`, name: 'Spolek bývalých hráčů', kind: 'patriot', share: 0.2, satisfaction: 60 },
    ];
  }
  state.scenario = { id, startSeason: state.season, progress: 0 };
  addNews(state, { kind: 'sezona', title: `Scénář: ${def.title}`, text: def.description });
  return state;
}

export interface ScenarioCheck {
  done: boolean;
  failed: boolean;
  text: string;
}

/** Jak je scénář splněný (po skončení sezóny, kdy už platí postupy a sestupy). */
export function scenarioStatus(state: GameState): ScenarioCheck | undefined {
  const sc = state.scenario;
  if (!sc) return undefined;
  const def = scenarioDef(sc.id);
  const played = state.season - sc.startSeason;
  const last = played >= def.seasons;
  const club = state.clubs[state.owner.clubId];
  const tier = tierOf(state, club.id);
  const prev = state.history[state.history.length - 1];
  if (sc.id === 'zachrana') {
    // Hodnotí se až po obou sezónách; peníze půjčené majitelem se od zůstatku odečítají.
    const net = club.finance.balance - (state.ownerLoan?.remaining ?? 0);
    const costs = annualCosts(club, tier);
    const ok = played >= def.seasons && net >= -costs * 0.1 && tier === 1;
    return { done: ok, failed: !ok && (last || tier > 1), text: `Zůstatek ${mil(club.finance.balance)}${state.ownerLoan?.remaining ? `, po odečtení vaší půjčky ${mil(net)}` : ''}, ${tier === 1 ? '1. liga' : 'mimo 1. ligu'}.` };
  }
  if (sc.id === 'vzestup') {
    // Na konci stačí i 2. liga (jedna hvězda).
    return { done: tier === 1 || (last && tier === 2), failed: tier > 2 && last, text: `Klub hraje ${competitionOf(state, club.id)?.name ?? ''}.` };
  }
  if (sc.id === 'evropa') {
    const top = prev && state.competitions[prev.ownerClub.competitionId]?.tier === 1 && prev.ownerClub.position <= 4;
    return { done: !!top, failed: !top && last, text: prev ? `Loni ${prev.ownerClub.position}. místo.` : 'Sezóna běží.' };
  }
  const ok = sc.progress >= PRODEJNI_TARGET && tier === 1 && played >= def.seasons;
  const failed = tier > 1 || (last && sc.progress < PRODEJNI_TARGET);
  return { done: ok, failed: !ok && failed, text: `Na přestupech zatím ${mil(sc.progress)} čistého (cíl ${mil(PRODEJNI_TARGET)}).` };
}

/** Cíl prodejního klubu: čistý zisk z přestupů za čtyři sezóny. */
export const PRODEJNI_TARGET = 400_000_000;

/** Hvězdy za splněný scénář: rychlost, u prodejního klubu o kolik se cíl překročil, u záchrany jak zdravé finance jsou. */
function scenarioStars(state: GameState, def: ScenarioDef, used: number): number {
  const sc = state.scenario!;
  if (sc.id === 'prodejni') return sc.progress >= PRODEJNI_TARGET * 1.5 ? 3 : sc.progress >= PRODEJNI_TARGET * 1.2 ? 2 : 1;
  if (sc.id === 'zachrana') {
    const club = state.clubs[state.owner.clubId];
    const net = club.finance.balance - (state.ownerLoan?.remaining ?? 0);
    const costs = annualCosts(club, tierOf(state, club.id));
    return net >= costs * 0.1 ? 3 : net >= 0 ? 2 : 1;
  }
  if (sc.id === 'vzestup') {
    if (tierOf(state, state.owner.clubId) > 1) return 1;
    return used <= 4 ? 3 : 2;
  }
  return used <= Math.ceil(def.seasons / 2) ? 3 : used < def.seasons ? 2 : 1;
}

/** Konec sezóny: průběh scénáře (prodejní klub sčítá čistý zisk z přestupů). */
export function scenarioSeasonEnd(state: GameState): void {
  const sc = state.scenario;
  if (!sc || sc.result) return;
  if (sc.id === 'prodejni') sc.progress += state.clubs[state.owner.clubId].finance.season.prestupy ?? 0;
}

/** Začátek sezóny: vyhodnocení scénáře. */
export function evaluateScenario(state: GameState): void {
  const sc = state.scenario;
  if (!sc || sc.result) return;
  const st = scenarioStatus(state);
  if (!st || (!st.done && !st.failed)) return;
  const def = scenarioDef(sc.id);
  const used = state.season - sc.startSeason;
  const stars = st.done ? scenarioStars(state, def, used) : 0;
  sc.result = { stars, date: state.date, text: st.done ? `Splněno za ${used} ${used === 1 ? 'sezónu' : used < 5 ? 'sezóny' : 'sezón'}: ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}. ${st.text}` : `Nesplněno. ${st.text}` };
  if (stars) addTrophy(state, 'scenar', `Scénář „${def.title}“: ${'★'.repeat(stars)}`);
  addNews(state, { kind: 'sezona', title: `Scénář ${def.title}: ${st.done ? 'splněno' : 'nesplněno'}`, text: `${sc.result.text} Hra pokračuje jako volná hra.` });
}

export function markScenarioSeen(prev: GameState): GameState {
  const state = structuredClone(prev);
  if (state.scenario?.result) state.scenario.result.seen = true;
  return state;
}

// ---------- Kariéra ----------

export interface Career {
  name: string;
  wallet: number;
  media: number;
  league: number;
  /** Síň slávy ze všech klubů. */
  trophies: Trophy[];
  clubs: { name: string; seasons: string; result: string }[];
  /** W3: odznaky ze všech klubů. */
  achievements?: Record<string, AchievementRecord>;
}

/** Uloží kariéru po skončení v klubu (prodej, odvolání, krach). */
export function careerFrom(state: GameState, previous?: Career): Career {
  const club = state.clubs[state.owner.clubId];
  const first = Math.min(...(state.history.map((h) => h.season)), state.season);
  const result = state.gameOver?.kind === 'prodej' ? 'prodal klub' : state.gameOver?.kind === 'krach' ? 'klub zkrachoval' : state.gameOver?.kind === 'trest' ? 'zákaz činnosti' : 'odešel';
  return {
    name: state.owner.name,
    // Do další kariéry jdou i peníze uložené v investicích.
    wallet: personalWealth(state),
    media: state.gameOver?.kind === 'krach' ? Math.max(0, state.owner.media - 20) : state.owner.media,
    league: state.owner.league,
    trophies: [
      ...(previous?.trophies ?? []),
      ...(state.trophies ?? [])
        .filter((t) => (t.clubId ? t.clubId === club.id : !(previous?.trophies ?? []).some((p) => p.text === t.text && p.season === t.season)))
        .map((t) => ({ ...t, clubId: t.clubId ?? club.id, clubName: t.clubName ?? club.name })),
    ],
    clubs: [...(previous?.clubs ?? []), { name: club.name, seasons: `${first}/${String(first + 1).slice(2)}–${state.season}/${String(state.season + 1).slice(2)}`, result }],
    achievements: careerAchievements(state, previous?.achievements), // W3
  };
}

/** Které kluby jsou majiteli s danou kariérou ochotné prodat. */
export function careerAllows(career: Career | undefined, reputation: number): string | undefined {
  if (!career) return undefined;
  const legacy = career.trophies.reduce((a, t) => a + t.points, 0);
  if (reputation >= 80 && legacy < 30) return 'Velké kluby chtějí majitele s úspěchy (odkaz aspoň 30 bodů).';
  if (reputation >= 60 && career.media < 30) return 'Po skandálech vás kluby nechtějí (pověst u médií pod 30).';
  return undefined;
}

/** Nová hra v kariéře: přenese peníze, pověst a síň slávy. */
export function newCareerGame(pack: DataPack, career: Career, opts: Omit<NewGameOptions, 'ownerName'>): GameState {
  const state = newGame(pack, { ...opts, ownerName: career.name });
  state.owner.wallet = career.wallet;
  state.owner.media = career.media;
  state.owner.league = career.league;
  // Trofeje z minulých klubů zůstávají v síni slávy, označené klubem (nové trofeje neblokují).
  state.trophies = career.trophies.map((t) => ({ ...t, clubId: t.clubId ?? 'kariera' }));
  state.career = career;
  restoreCareerAchievements(state, career.achievements); // W3
  addNews(state, { kind: 'sezona', title: `Nová kapitola kariéry: ${state.clubs[opts.clubId].name}`, text: `Předchozí kluby: ${career.clubs.map((c) => `${c.name} (${c.seasons}, ${c.result})`).join(', ')}. Odkaz kariéry ${legacyScore(state)} bodů.` });
  return state;
}

