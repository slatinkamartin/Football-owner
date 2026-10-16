import { addDays, dayOfWeek, formatDate, monthDay, roundDates, SEASON_END, SEASON_START, seasonLabel } from './calendar';
import {
  clubPayFactor,
  departmentEffect,
  departmentReference,
  departmentsMonthly,
  annualCosts,
  bonusPerPoint,
  book,
  commercialMonthly,
  defaultTicketPrice,
  defaultTransferBudget,
  emptyTotals,
  matchAttendance,
  operatingMonthly,
  prizeMoney,
  setMarketWages,
  tvMonthly,
  emptyAccounting,
  monthlyAmortization,
  monthlyLoans,
  settleTax,
} from './finance';
import { completeProjects, effectiveCapacity, licenseCheck, monthlyBuildingDepreciation } from './facilities';
import { defaultFacilities, matchdayExtras } from './stadium';
import { createEvent, expireEvents, maybeCreateEvent, resolveEvent } from './events';
import { checkBan, media, monthlyGrey } from './grey';
import { approveBudget, adjustForNewTier, monthlyReport, TICKET_ANGER, BUDGET_DEADLINE, budgetDeadline, defaultSeasonTicketPrice, forecastSeason, prepareBudget, seasonTicketHolders } from './budget';
import { homeAdvantage, ownTeamSpirit } from './atmosphere';
import { activeOverdraft, applyLicenceSanction, CRISIS_MONTHS, dailyFinancing, enterCrisis, INSOLVENCY_MONTHS, leaveCrisisIfSolved, monthlyFinancing } from './financing';
import { generateSponsorOffers, initialSponsors, seasonStartSponsors, sponsorEuropeBonus, sponsorMonthly, sponsorSeasonBonuses } from './sponsors';
import { goalBonusPoints, pointsBonusFactor, schemeSpirit, suggestedSplit, wageMorale } from './wages';
import { monthlyEurope, qualifyEurope, resolveEurope, startEurope } from './europe';
import { boardCoversLoss, clubValuation, createShareholders, monthlyShareholders } from './ownership';
import { afterMatchday, allFixtures, baseSeasonDone, finalStandings, setupCup, startGroups, startPlayoffs } from './competitions';
import { monthlyDevelopment, moraleNews, recordCareers, recordTimeline, recordTrend } from './development';
import { doubleRoundRobin } from './fixtures';
import { simulateMatch } from './match';
import { POOL_TOWNS } from './names';
import {
  emptySeasonStats,
  generatePlayer,
  generateSquad,
  playerAge,
  playersByClub,
  SQUAD_SHAPE,
  squadOf,
  squadQualityForReputation,
} from './players';
import { createRng, type Rng } from './rng';
import {
  coachBonus,
  coachOf,
  generateStaff,
  monthlyStaff,
  realisticGoal,
  ensureInterimStaff,
  goalLabel,
  refreshStaffPool,
  seasonEndStaff,
  academyBonus,
  financeFactor,
  goalTarget,
  staffLevelForReputation,
} from './staff';
import { computeTable, formScore } from './standings';
import { aiDomesticTransfers, directorSignings, aiSalesAbroad, closeWindow, emergencyFill, generateOffers, generateProposals, refreshFreeAgents, seasonEndContracts } from './transfers';
import { decisiveness, settingsOf } from './settings';
import { recordPulse, pulseValues, snapshotPulse } from './pulse';
import { weeklyStories } from './stories';
import { dailyEvents, eventOfferTick, extrasEffect, sectorEffect } from './venue';
import { monthlyVenue } from './venue';
import { businessIncome, monthlyBusiness, monthlyCity, monthlyUltras, seasonBusiness, seasonTrophies, ultrasEffect } from './surroundings';
import { createSideGoals, seasonFfp, seasonRating, settleSideGoals } from './finplus';
import { dailyDeadline, deadlineDay, monthlyAgents, monthlyWatch, settleConditionals, weeklyReleaseClauses } from './market';
import { autoSponsors, checkPromises, closeYouthIntake, createYouthIntake, delegationOf, monthlyDelegation } from './people';
import { afterOwnMatch, halftimeAdjust, pendingPrematch, planEffect } from './matchday';
import { makeRoundReport, noteTimeline, ownerTypeOf, publishRoundReport, weeklyRivalOwners } from './league';
import { milestoneToday, nextMilestone } from './milestones';
import { aiForeignSignings, monthlyForeign, refreshForeignMarket, returnLoans, weeklyForeign } from './foreign';
import { analyticsBonus, completeBigProjects, monthlyBigProjects, monthlyPrograms } from './investments';
import { communityEffect } from './operations';
import { adminMonthly, pitchFactor, campBonus, dailyOperations, homeMatchOperations, maintenanceInjury, monthlyOperations } from './operations';
import { NEW_CATEGORIES_V10, NEW_CATEGORIES_V11, SAVE_VERSION, type Departments, type Club, type ClubDef, type Competition, type DataPack, type Difficulty, type GameState, type Player, type Position } from './types';
import { addNews, clubLabel, competitionOf, FREE, tierOf, transferWindow } from './world';

export const START_SEASON = 2026;
const MAX_SQUAD = 26;
const SIGNINGS_PER_SUMMER = 4;

export const DIFFICULTY: Record<Difficulty, { label: string; wallet: number; monthlyIncome: number; clubCash: number }> = {
  snadna: { label: 'Bohatý investor', wallet: 500_000_000, monthlyIncome: 5_000_000, clubCash: 0.5 },
  stredni: { label: 'Úspěšný podnikatel', wallet: 150_000_000, monthlyIncome: 1_500_000, clubCash: 0.3 },
  tezka: { label: 'Začínající majitel', wallet: 30_000_000, monthlyIncome: 300_000, clubCash: 0.2 },
};

export interface NewGameOptions {
  clubId: string;
  ownerName: string;
  difficulty: Difficulty;
  /** Podíl majitele v klubu (výchozí 100 %). */
  ownerShare?: number;
  seed?: number;
}

// ---------- Založení hry ----------

function createClub(def: ClubDef, tier: number): Club {
  const club: Club = {
    id: def.id,
    name: def.name,
    shortName: def.shortName,
    city: def.city,
    region: def.region,
    reputation: def.reputation,
    stadium: { ...def.stadium, originalCapacity: def.stadium.capacity },
    colors: def.colors,
    reserveOf: def.reserveOf,
    facilities: defaultFacilities(def.reputation, tier),
    fanMood: 50,
    staff: { coachId: '', directorId: '' },
    policy: { ticketPrice: defaultTicketPrice(tier), wageMultiplier: 1, transferBudget: 0 },
    finance: { balance: 0, monthsNegative: 0, season: emptyTotals(), transactions: [] },
  };
  club.policy.transferBudget = defaultTransferBudget(club);
  club.finance.balance = Math.round(annualCosts(club, tier) * 0.15);
  return club;
}

function fillSquad(state: GameState, rng: Rng, club: Club): void {
  const quality = squadQualityForReputation(club.reputation) + rng.normal(0, 1.5);
  const squad = generateSquad(rng, state, club.id, state.season, quality);
  for (const p of squad) state.players[p.id] = p;
  setMarketWages(squad, club);
}

/** Klub v soutěži musí mít trenéra; klub majitele i sportovního ředitele. */
function ensureStaff(state: GameState, rng: Rng, club: Club): void {
  const level = staffLevelForReputation(club.reputation);
  if (!club.staff.coachId && club.id !== state.owner.clubId) {
    const coach = generateStaff(rng, state, 'trener', level + rng.normal(0, 6), club.id);
    state.staff[coach.id] = coach;
    club.staff.coachId = coach.id;
  }
}

export function newGame(pack: DataPack, opts: NewGameOptions): GameState {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = createRng(seed);
  const state: GameState = {
    version: SAVE_VERSION,
    packId: pack.id,
    seed,
    rngState: 0,
    date: `${START_SEASON}-${SEASON_START}`,
    season: START_SEASON,
    owner: {
      name: opts.ownerName,
      clubId: opts.clubId,
      share: 1,
      wallet: DIFFICULTY[opts.difficulty].wallet,
      difficulty: opts.difficulty,
      seasonGoal: 'stred',
      trust: { trener: 60, reditel: 60 },
      media: 50,
      league: 50,
    },
    clubs: {},
    players: {},
    staff: {},
    cups: {},
    timeline: [],
    projects: [],
    events: [],
    shareholders: [],
    agm: [],
    grey: { exposure: 0, actions: [] },
    loans: [],
    market: { proposals: [], offers: [], listed: [], spent: 0, earned: 0, history: [] },
    competitions: {},
    pool: [],
    news: [],
    history: [],
    nextId: 0,
  };

  for (const def of pack.competitions) {
    state.competitions[def.id] = { ...def, clubIds: [], fixtures: [] };
  }
  for (const def of pack.clubs) {
    const comp = state.competitions[def.competition];
    const club = createClub(def, comp.tier);
    state.clubs[club.id] = club;
    comp.clubIds.push(club.id);
    fillSquad(state, rng, club);
  }

  const own = state.clubs[opts.clubId];
  if (!own) throw new Error(`Neznámý klub ${opts.clubId}`);
  own.finance.balance = Math.round(annualCosts(own, tierOf(state, own.id)) * DIFFICULTY[opts.difficulty].clubCash);
  for (const role of ['trener', 'reditel'] as const) {
    const s = generateStaff(rng, state, role, staffLevelForReputation(own.reputation) + rng.normal(0, 5), own.id);
    state.staff[s.id] = s;
    if (role === 'trener') own.staff.coachId = s.id;
    else own.staff.directorId = s.id;
  }
  for (const club of Object.values(state.clubs)) ensureStaff(state, rng, club);
  for (let i = 0; i < 40; i++) {
    // Na začátku hry je na trhu víc volných hráčů.
    refreshFreeAgents(state, rng);
    if (Object.values(state.players).filter((p) => p.clubId === FREE).length >= 60) break;
  }

  const share = Math.max(0.2, Math.min(1, opts.ownerShare ?? 1));
  state.owner.share = share;
  state.shareholders = createShareholders(state, rng, share);
  setupSeason(state, rng, false);
  state.owner.seasonGoal = realisticGoal(state, own.id);
  state.owner.valuationStart = clubValuation(state);
  // První sezóna: evropské poháry podle pověsti klubů (místo loňské tabulky).
  const top = Object.values(state.competitions).find((c) => c.tier === 1);
  if (top) {
    qualifyEurope(state, [...top.clubIds].sort((a, b) => state.clubs[b].reputation - state.clubs[a].reputation).map((clubId) => ({ clubId })));
    state.europe!.season = state.season;
    for (const e of state.europe!.entries) e.season = state.season;
    startEurope(state, rng);
  }
  initialSponsors(state, rng);
  prepareBudget(state);
  createSideGoals(state);
  // Hned na začátku: výběr generálního partnera.
  maybeCreateEvent(state, rng);
  addNews(state, {
    kind: 'info',
    title: `Vítejte v ${own.name}`,
    text: `Stal jste se majitelem klubu. Sezóna ${seasonLabel(state.season)} začíná a přestupní okno je otevřené do 31. 8. Ve Vedení stanovte cíl sezóny, v Přestupech najdete návrhy sportovního ředitele.`,
  });
  state.rngState = rng.state();
  return state;
}

// ---------- Sezóna ----------

/**
 * Ostatní kluby hospodaří s tím, co vydělají: přebytek nad rezervou jde z poloviny na přestupy
 * a zbytek do zázemí a provozu majitele. Nehromadí se tak miliardy.
 */
function aiReinvest(state: GameState, club: Club, tier: number): void {
  // Bohaté kluby zvednou platy (silnější kádr, ale i vyšší náklady), chudé je stáhnou.
  const costs = annualCosts(club, tier);
  if (club.finance.balance > costs * 1.2) club.policy.wageMultiplier = Math.min(1.6, club.policy.wageMultiplier + 0.1);
  else if (club.finance.balance < costs * 0.2) club.policy.wageMultiplier = Math.max(0.8, club.policy.wageMultiplier - 0.05);
  const reserve = annualCosts(club, tier) * 0.35;
  const excess = club.finance.balance - reserve;
  if (excess <= 0) return;
  club.policy.transferBudget = Math.min(defaultTransferBudget(club) * 3, club.policy.transferBudget + Math.round((excess * 0.5) / 100_000) * 100_000);
  book(state, club.id, 'investice', -Math.round(excess * 0.4), 'Investice majitele do zázemí');
}

function setupSeason(state: GameState, rng: Rng, summerWindow: boolean): void {
  for (const club of Object.values(state.clubs)) {
    if (club.finance.season !== undefined && summerWindow) club.finance.lastSeason = club.finance.season;
    club.finance.season = emptyTotals();
    const tier = tierOf(state, club.id);
    if (club.id !== state.owner.clubId) {
      club.policy.ticketPrice = defaultTicketPrice(tier);
      // Rozhazovačný majitel soupeře dává na posily víc.
      club.policy.transferBudget = Math.round(defaultTransferBudget(club) * (ownerTypeOf(club.id) === 'rozhazovacny' ? 1.3 : 1));
      aiReinvest(state, club, tier);
    }
  }
  for (const p of Object.values(state.players)) {
    Object.assign(p, emptySeasonStats());
    p.suspension = 0;
  }
  state.market.spent = 0;
  state.market.earned = 0;
  for (const club of Object.values(state.clubs)) club.transferSpent = 0;
  if (summerWindow) {
    runSummerWindow(state, rng);
    refreshFreeAgents(state, rng);
    refreshStaffPool(state, rng);
  } else {
    refreshStaffPool(state, rng);
  }
  for (const comp of Object.values(state.competitions)) {
    for (const id of comp.clubIds) ensureStaff(state, rng, state.clubs[id]);
  }

  const squads = playersByClub(state);
  for (const comp of Object.values(state.competitions)) {
    comp.penalties = undefined;
    const pairings = doubleRoundRobin(comp.clubIds, rng);
    const rounds = Math.max(0, ...pairings.map((p) => p.round));
    // Nadstavba potřebuje dalších až 10 termínů po základní části.
    const extra = comp.format === 'nadstavba' && comp.clubIds.length >= 12 ? 10 : 0;
    const dates = roundDates(state.season, rounds + extra);
    comp.groups = undefined;
    comp.reservedDates = extra ? dates.slice(rounds) : undefined;
    comp.fixtures = pairings.map((p, i) => ({
      id: `${comp.id}-${state.season}-${i}`,
      round: p.round,
      date: dates[p.round - 1],
      homeId: p.homeId,
      awayId: p.awayId,
    }));
    // Platy ostatních klubů se přizpůsobí rozpočtu. V klubu majitele platí sjednané smlouvy.
    for (const id of comp.clubIds) {
      if (id !== state.owner.clubId) setMarketWages(squads.get(id) ?? [], state.clubs[id]);
    }
  }
  generateProposals(state);
  state.timeline = [];
  delete state.cups.baraz;
  setupCup(state, rng);
  const own = state.clubs[state.owner.clubId];
  if (summerWindow) own.finance.lastAccounting = own.finance.accounting;
  own.finance.accounting = emptyAccounting();
}

/**
 * Letní přestupní okno ostatních klubů (zjednodušeně): nejslabší hráči odejdou mezi volné hráče
 * a klub přivede nové. Kvalitu posil určuje rozpočet na přestupy a mzdový rozpočet.
 */
function runSummerWindow(state: GameState, rng: Rng): void {
  aiSalesAbroad(state, rng);
  const squads = playersByClub(state);
  for (const comp of Object.values(state.competitions)) {
    for (const clubId of comp.clubIds) {
      if (clubId === state.owner.clubId) continue;
      const club = state.clubs[clubId];
      const squad = squads.get(clubId) ?? [];
      const budget = Math.max(0, club.policy.transferBudget);
      const ratio = budget / Math.max(defaultTransferBudget(club), 1);
      const quality =
        squadQualityForReputation(club.reputation) +
        Math.min(2.5, 3 * Math.log2(1 + ratio) - 3) +
        4 * Math.log2(club.policy.wageMultiplier);

      // Odchody: nejslabší hráči a přebytek nad maximální velikost kádru.
      const sorted = [...squad].sort((a, b) => a.overall - b.overall);
      const leaving = new Set(sorted.slice(0, SIGNINGS_PER_SUMMER).map((p) => p.id));
      const remaining = squad.filter((p) => !leaving.has(p.id));
      while (remaining.length > MAX_SQUAD - SIGNINGS_PER_SUMMER) {
        const weakest = remaining.reduce((a, b) => (a.overall < b.overall ? a : b));
        leaving.add(weakest.id);
        remaining.splice(remaining.indexOf(weakest), 1);
      }
      for (const id of leaving) {
        const p = state.players[id];
        if (playerAge(p, state.season) >= 33) delete state.players[id];
        else p.clubId = FREE;
      }

      // Příchody: doplnit pozice, kde chybí hráči, zbytek podle potřeby.
      const signings: Player[] = [];
      const counts = (pos: Position) => remaining.filter((p) => p.position === pos).length + signings.filter((p) => p.position === pos).length;
      while (signings.length < SIGNINGS_PER_SUMMER || remaining.length + signings.length < 22) {
        const positions = (Object.keys(SQUAD_SHAPE) as Position[]).sort(
          (a, b) => counts(a) - SQUAD_SHAPE[a] - (counts(b) - SQUAD_SHAPE[b]),
        );
        const p = generatePlayer(rng, state, { clubId, position: positions[0], season: state.season, quality, age: rng.int(20, 30) });
        signings.push(p);
        state.players[p.id] = p;
      }
      if (budget > 0) book(state, clubId, 'prestupy', -budget, 'Letní přestupní okno');

    }
  }
}

function isEligibleFor(state: GameState, clubId: string, targetTier: number, excluded: Set<string>): boolean {
  const club = state.clubs[clubId];
  if (excluded.has(clubId)) return false;
  if (!club.reserveOf) return true;
  if (targetTier === 1) return false;
  return tierOf(state, club.reserveOf) !== targetTier;
}

function lowerCompFor(state: GameState, tier: number, region: Club['region']): Competition | undefined {
  const lower = Object.values(state.competitions).filter((c) => c.tier === tier + 1);
  return lower.find((c) => !c.region || c.region === region) ?? lower[0];
}

function createPoolClub(state: GameState, rng: Rng, region: Club['region']): Club {
  const used = new Set(Object.values(state.clubs).map((c) => c.city));
  const town = POOL_TOWNS.find((t) => t.region === region && !used.has(t.town)) ?? { town: `Obec ${state.nextId}`, region };
  const id = `gen${++state.nextId}`;
  const club = createClub(
    {
      id,
      name: `TJ Sokol ${town.town}`,
      shortName: town.town,
      city: town.town,
      region,
      competition: '',
      reputation: rng.int(26, 30),
      stadium: { name: `Stadion ${town.town}`, capacity: 1000 },
      colors: ['#1d3f8f', '#ffffff'],
    },
    3,
  );
  club.generated = true;
  state.clubs[id] = club;
  return club;
}

/** Konec sezóny: tabulky, pověst, postupy a sestupy, stárnutí hráčů a mládež. */
function endSeason(state: GameState, rng: Rng): void {
  recordCareers(state);
  const tables = new Map(Object.values(state.competitions).map((c) => [c.id, finalStandings(c, state)]));
  const champions: Record<string, string> = {};
  for (const comp of Object.values(state.competitions)) {
    const table = tables.get(comp.id)!;
    champions[comp.id] = table[0].clubId;
    addNews(state, { kind: 'sezona', title: `${comp.name}: vítězem je ${state.clubs[table[0].clubId].name}` });
    table.forEach((row, i) => {
      const prize = prizeMoney(comp.tier, i + 1, table.length);
      book(state, row.clubId, 'tv', prize, `Odměna za ${i + 1}. místo (${comp.name})`);
      if (row.clubId === state.owner.clubId) {
        addNews(state, { kind: 'sezona', title: `Odměna za ${i + 1}. místo: ${prize.toLocaleString('cs-CZ')} Kč` });
      }
    });
    // Pověst podle umístění a podle toho, jak klub překonal (nebo zklamal) očekávání dané jeho pověstí.
    const n = table.length;
    const byRep = [...table].sort((a, b) => state.clubs[b.clubId].reputation - state.clubs[a.clubId].reputation).map((r) => r.clubId);
    table.forEach((row, i) => {
      const club = state.clubs[row.clubId];
      const expected = byRep.indexOf(row.clubId);
      const surprise = Math.max(-3, Math.min(3, (expected - i) * 0.4));
      // Slávu je potřeba obhajovat: velké kluby bez úspěchů pomalu ztrácejí, malé bez propadů získávají.
      const drift = -(club.reputation - 55) * 0.03;
      club.reputation = Math.max(1, Math.min(99, club.reputation + (((n - 1) / 2 - i) / (n - 1)) * 4 + surprise + drift + (i === 0 ? 2 : 0)));
      if (i === 0) club.fanMood = Math.min(100, club.fanMood + 12);
    });
    if (comp.tier === 1) qualifyEurope(state, table, state.cups.pohar?.winner);
  }

  const ownComp = competitionOf(state, state.owner.clubId);
  const ownTable = ownComp ? tables.get(ownComp.id)! : [];
  const ownIndex = ownTable.findIndex((r) => r.clubId === state.owner.clubId);
  state.history.push({
    season: state.season,
    champions,
    ownerClub: { competitionId: ownComp?.id ?? '', position: ownIndex + 1, points: ownTable[ownIndex]?.points ?? 0 },
    cupWinner: state.cups.pohar?.winner,
  });
  sponsorSeasonBonuses(state, ownIndex + 1, state.cups.pohar?.winner);
  const cupWinner = state.cups.pohar?.winner ? state.clubs[state.cups.pohar.winner] : undefined;
  if (cupWinner) {
    cupWinner.reputation = Math.min(99, cupWinner.reputation + 2);
    cupWinner.fanMood = Math.min(100, cupWinner.fanMood + 6);
  }
  const tax = settleTax(state);
  if (tax > 0) addNews(state, { kind: 'info', title: `Daň z příjmů za sezónu: ${tax.toLocaleString('cs-CZ')} Kč` });

  // Postupy a sestupy mezi úrovněmi.
  const comps = Object.values(state.competitions).sort((a, b) => a.tier - b.tier);
  const moves: { clubId: string; from: Competition; to: Competition; up: boolean }[] = [];
  const moved = new Set<string>();
  for (const upper of comps) {
    const lowers = comps.filter((c) => c.tier === upper.tier + 1);
    if (lowers.length === 0) continue;
    const upperTable = tables.get(upper.id)!;
    for (const row of upperTable.slice(upperTable.length - upper.relegate)) {
      const club = state.clubs[row.clubId];
      const to = lowerCompFor(state, upper.tier, club.region)!;
      moves.push({ clubId: row.clubId, from: upper, to, up: false });
      moved.add(row.clubId);
    }
    for (const lower of lowers) {
      const eligible = tables.get(lower.id)!.filter((r) => isEligibleFor(state, r.clubId, upper.tier, moved));
      for (const row of eligible.slice(0, lower.promote)) {
        moves.push({ clubId: row.clubId, from: lower, to: upper, up: true });
        moved.add(row.clubId);
      }
    }
  }
  // Baráž: vítěz z nižší soutěže si s poraženým vymění místo.
  for (const t of state.cups.baraz?.ties ?? []) {
    if (t.winner !== t.lower) continue;
    const upperComp = comps.find((c) => c.clubIds.includes(t.upper));
    const lowerComp = comps.find((c) => c.clubIds.includes(t.lower));
    if (!upperComp || !lowerComp || moved.has(t.upper) || moved.has(t.lower)) continue;
    const down = lowerCompFor(state, upperComp.tier, state.clubs[t.upper].region) ?? lowerComp;
    moves.push({ clubId: t.lower, from: lowerComp, to: upperComp, up: true });
    moves.push({ clubId: t.upper, from: upperComp, to: down, up: false });
    moved.add(t.lower);
    moved.add(t.upper);
  }
  for (const m of moves) {
    if (m.clubId === state.owner.clubId && m.up) {
      // Postup: vedení i trenér mají radost.
      state.owner.trust.trener = Math.min(100, state.owner.trust.trener + 10);
      state.owner.trust.reditel = Math.min(100, state.owner.trust.reditel + 10);
    }
    m.from.clubIds = m.from.clubIds.filter((id) => id !== m.clubId);
    m.to.clubIds.push(m.clubId);
    if (m.clubId === state.owner.clubId) adjustForNewTier(state, m.from.tier, m.to.tier);
    const club = state.clubs[m.clubId];
    club.reputation = Math.max(1, Math.min(99, club.reputation + (m.up ? 5 : -5)));
    club.fanMood = Math.max(0, Math.min(100, club.fanMood + (m.up ? 15 : -15)));
    addNews(state, {
      kind: m.clubId === state.owner.clubId ? 'sezona' : 'info',
      title: `${club.name} ${m.up ? 'postupuje do' : 'sestupuje do'} soutěže ${m.to.name}`,
    });
  }

  // B-tým nesmí hrát stejnou soutěž jako mateřský klub: sestoupí a uvolní místo dalšímu v pořadí.
  for (const comp of comps) {
    for (const id of [...comp.clubIds]) {
      const parent = state.clubs[id].reserveOf;
      if (!parent || !comp.clubIds.includes(parent)) continue;
      const to = lowerCompFor(state, comp.tier, state.clubs[id].region);
      if (!to) continue;
      comp.clubIds = comp.clubIds.filter((c) => c !== id);
      to.clubIds.push(id);
      const replacement = tables
        .get(to.id)!
        .find((r) => to.clubIds.includes(r.clubId) && r.clubId !== id && isEligibleFor(state, r.clubId, comp.tier, moved));
      if (replacement) {
        to.clubIds = to.clubIds.filter((c) => c !== replacement.clubId);
        comp.clubIds.push(replacement.clubId);
        moved.add(replacement.clubId);
      }
      addNews(state, { kind: 'info', title: `${state.clubs[id].name} musí kvůli mateřskému klubu do soutěže ${to.name}` });
    }
  }

  // Nejnižší modelované soutěže se vyrovnávají na cílovou velikost přes kluby z divize.
  const lowestTier = Math.max(...comps.map((c) => c.tier));
  for (const comp of comps.filter((c) => c.tier === lowestTier)) {
    const table = tables.get(comp.id)!.filter((r) => comp.clubIds.includes(r.clubId));
    // Nováčci (sestupující shora) mají místo jisté, do divize padají kluby ze spodku tabulky.
    const newcomers = comp.clubIds.filter((id) => !table.some((r) => r.clubId === id));
    const ranked = [...newcomers, ...table.map((r) => r.clubId)];
    while (comp.clubIds.length > comp.targetSize) {
      const out = [...ranked].reverse().find((id) => comp.clubIds.includes(id) && id !== state.owner.clubId)!;
      comp.clubIds = comp.clubIds.filter((id) => id !== out);
      state.pool.push(out);
      for (const p of squadOf(state, out)) delete state.players[p.id];
      const outCoach = coachOf(state, out);
      if (outCoach) outCoach.clubId = FREE;
      state.clubs[out].staff.coachId = '';
      addNews(state, { kind: 'info', title: `${state.clubs[out].name} sestupuje do divize` });
    }
    while (comp.clubIds.length < comp.targetSize) {
      const candidates = state.pool
        .map((id) => state.clubs[id])
        .filter((c) => !comp.region || c.region === comp.region)
        .sort((a, b) => b.reputation - a.reputation);
      const club = candidates[0] ?? createPoolClub(state, rng, comp.region ?? 'cechy');
      state.pool = state.pool.filter((id) => id !== club.id);
      comp.clubIds.push(club.id);
      fillSquad(state, rng, club);
      ensureStaff(state, rng, club);
      addNews(state, { kind: 'info', title: `${club.name} postupuje z divize do soutěže ${comp.name}` });
    }
  }

  // Titul a pohár: bonus k důvěře nad rámec splněného cíle.
  if (ownIndex === 0 || state.cups.pohar?.winner === state.owner.clubId) {
    const bonus = (ownIndex === 0 ? 6 : 0) + (state.cups.pohar?.winner === state.owner.clubId ? 6 : 0);
    state.owner.trust.trener = Math.min(100, state.owner.trust.trener + bonus);
    state.owner.trust.reditel = Math.min(100, state.owner.trust.reditel + bonus);
  }
  seasonEndStaff(state, rng, ownIndex + 1, ownComp);
  if (ownComp) {
    const miss = ownIndex + 1 - goalTarget(state.owner.seasonGoal, ownComp);
    media(state, miss <= 0 ? 6 : miss > 2 ? -6 : 0);
    if (miss <= 0) {
      const own = state.clubs[state.owner.clubId];
      book(state, own.id, 'platy', -goalBonusPoints(state) * bonusPerPoint(own), 'Prémie hráčům za splnění cíle sezóny');
    }
  }
  if (ownComp) seasonTrophies(state, ownIndex + 1, ownComp.tier > 1 && ownIndex + 1 <= ownComp.promote, state.cups.pohar?.winner);
  // Finanční konec sezóny: vedlejší cíle, vysvědčení a fair play.
  settleSideGoals(state);
  seasonRating(state);
  seasonFfp(state);
  returnLoans(state);
  seasonEndContracts(state, rng);
  ageAndDevelopPlayers(state, rng);
}

function ageAndDevelopPlayers(state: GameState, rng: Rng): void {
  const nextSeason = state.season + 1;
  for (const p of Object.values(state.players)) {
    const age = playerAge(p, nextSeason);
    // Hodnocení se vyvíjí průběžně každý měsíc. Mladým se občas ukáže vyšší nebo nižší potenciál.
    if (age <= 21 && rng.chance(0.25)) p.potential = Math.max(p.overall, Math.min(97, p.potential + rng.pick([-3, -2, 2, 3, 4])));

    const retireChance = age >= 38 ? 1 : age >= 36 ? 0.6 : age >= 34 ? 0.25 : 0;
    if (rng.chance(retireChance)) {
      if (p.clubId === state.owner.clubId) {
        addNews(state, { kind: 'info', title: `${p.firstName} ${p.lastName} ukončil kariéru` });
      }
      delete state.players[p.id];
    }
  }

  // Dorost: každý klub dostane dva mladé hráče z akademie.
  for (const comp of Object.values(state.competitions)) {
    for (const clubId of comp.clubIds) {
      // Akademie: lepší akademie dá víc a lepších dorostenců.
      const academy = state.clubs[clubId].facilities?.academy ?? 3;
      const bonus = academyBonus(state, clubId) + 2.5 * departmentEffect(state.clubs[clubId], tierOf(state, clubId), 'mladez');
      const quality = squadQualityForReputation(state.clubs[clubId].reputation) - 4 + (academy - 3) * 2 + bonus;
      const count = academy >= 4 ? 3 : academy >= 2 ? 2 : 1;
      // Klub majitele: přijímačky, ze kterých majitel vybírá.
      if (clubId === state.owner.clubId && !state.owner.ousted) {
        createYouthIntake(state, rng, nextSeason, quality, academy, bonus);
        continue;
      }
      for (let i = 0; i < count; i++) {
        const position = rng.pick(['GK', 'DF', 'DF', 'MF', 'MF', 'FW'] as Position[]);
        const p = generatePlayer(rng, state, { clubId, position, season: nextSeason, quality, age: rng.int(17, 18) });
        p.wage = 8_000;
        p.potential = Math.min(95, Math.round(p.potential + Math.max(0, academy - 3) * 2 + bonus));
        state.players[p.id] = p;
        if (clubId === state.owner.clubId) {
          addNews(state, { kind: 'info', title: `Z akademie přichází ${p.firstName} ${p.lastName} (${p.overall}, potenciál ${p.potential})` });
        }
      }
    }
  }
}

// ---------- Průběh dne ----------

/** Zázemí ovlivňuje zranění: lepší medicína = méně a kratší zranění, poškozený trávník = víc zranění. */
function medicalFactors(club: Club, damaged: boolean, tier = 1): { injuryRisk: number; recovery: number } {
  const m = club.facilities?.medical ?? 3;
  const staff = departmentEffect(club, tier, 'medicina');
  return { injuryRisk: (1.25 - 0.08 * m) * (1 - 0.15 * staff) * (damaged ? 1.3 : 1) * maintenanceInjury(club), recovery: (1.2 - 0.07 * m) * (1 - 0.12 * staff) };
}

/** Odvolaný majitel nerozhoduje: situace vyřeší představenstvo. */
function boardDecides(state: GameState): void {
  for (const e of state.events.filter((x) => x.template !== 'navrat')) {
    const option = e.template === 'valna' && e.options.some((o) => o.id === 'ctvrt') ? 'ctvrt' : e.defaultOption;
    Object.assign(state, resolveEvent(state, e.id, option, true).state);
  }
  state.market.proposals = [];
}

function playMatchesOn(state: GameState, rng: Rng): void {
  const today = allFixtures(state).filter((x) => x.fixture.date === state.date && !x.fixture.result);
  if (!today.length) return;
  const squads = playersByClub(state);
  const tables = new Map<string, ReturnType<typeof computeTable>>();
  const ownId = state.owner.clubId;
  const ownCompId = competitionOf(state, ownId)?.id;
  const spirit = ownTeamSpirit(state) + schemeSpirit(state) + campBonus(state) + analyticsBonus(state);
  // Pořadí před kolem (pro zpravodaj kola soutěže majitele).
  const ownComp = ownCompId ? state.competitions[ownCompId] : undefined;
  const before = new Map(ownComp ? finalStandings(ownComp, state).map((r, i) => [r.clubId, i + 1] as const) : []);
  const roundsToday = new Set(today.filter((x) => x.comp?.id === ownCompId).map((x) => x.fixture.round));
  for (const { fixture: f, name, tier, cup, comp } of today) {
    const home = state.clubs[f.homeId];
    const away = state.clubs[f.awayId];
    if (comp && !tables.has(comp.id)) tables.set(comp.id, computeTable(comp, state));
    const form = comp ? formScore(tables.get(comp.id)!.find((r) => r.clubId === home.id)?.form ?? []) : 0;
    const damaged = !!home.pitchDamagedUntil && home.pitchDamagedUntil >= state.date;
    const capacity = effectiveCapacity(state, home);
    const ownHolders = home.id === ownId && comp ? seasonTicketHolders(state) : 0;
    const involvesOwner = f.homeId === ownId || f.awayId === ownId;
    // Plán majitele (taktika, prémie, levné vstupné, choreo) platí jen pro jeho zápas.
    const plan = involvesOwner ? planEffect(state, f) : { bonus: 0, ticketFactor: 1, homeEdge: 0 };
    const ticketPrice = home.policy.ticketPrice;
    if (plan.ticketFactor !== 1) home.policy.ticketPrice = Math.round(ticketPrice * plan.ticketFactor);
    // Kotel: bojkot nebo nadšení mění návštěvu i domácí prostředí.
    const ultras = home.id === ownId ? ultrasEffect(state) : { homeEdge: 0, attendance: 1, incidents: 1 };
    // Sektory (kotel, rodinný sektor) a vylepšení dne zápasu klubu majitele.
    const sector = home.id === ownId ? sectorEffect(home) : undefined;
    const venueAtt = home.id === ownId ? sector!.attendance * extrasEffect(home).attendance : 1;
    const attendance = Math.min(capacity, Math.max(Math.round(ownHolders * 0.88), Math.round(matchAttendance(rng, home, away, tier, form, capacity, damaged) * ultras.attendance * venueAtt)));
    const homeCoach = coachOf(state, home.id);
    const awayCoach = coachOf(state, away.id);
    const half = involvesOwner ? halftimeAdjust(state, f) : undefined;
    const ownHome = home.id === ownId;
    f.result = simulateMatch(
      rng,
      { id: home.id, players: squads.get(home.id) ?? [], bonus: coachBonus(homeCoach) + (ownHome ? spirit + plan.bonus : 0), style: (ownHome && plan.style) || homeCoach?.style, youthFocus: homeCoach?.youthFocus, ...medicalFactors(home, damaged, tier) },
      { id: away.id, players: squads.get(away.id) ?? [], bonus: coachBonus(awayCoach) + (away.id === ownId ? spirit + plan.bonus : 0), style: (away.id === ownId && plan.style) || awayCoach?.style, youthFocus: awayCoach?.youthFocus, ...medicalFactors(away, false, tier) },
      attendance,
      {
        date: state.date,
        season: state.season,
        decisive: decisiveness(state),
        detail: comp ? comp.id === ownCompId : involvesOwner,
        homeEdge: homeAdvantage(home, attendance, capacity) * (ownHome ? pitchFactor(home, damaged) : damaged ? 0.6 : 1) + plan.homeEdge + ultras.homeEdge + (sector?.homeEdge ?? 0),
        halftime: half ? (ownHome ? { home: half } : { away: half }) : undefined,
      },
    );
    // Držitelé permanentek už zaplatili předem.
    const holders = home.id === ownId && comp ? seasonTicketHolders(state) : 0;
    book(state, home.id, 'vstupne', Math.max(0, attendance - holders) * home.policy.ticketPrice * (sector?.ticketFactor ?? 1), `Vstupné: ${home.shortName} – ${away.shortName}`);
    home.policy.ticketPrice = ticketPrice;
    book(state, home.id, 'stadion', matchdayExtras(home, attendance, tier), `Catering a VIP: ${home.shortName} – ${away.shortName}`);
    if (home.id === ownId && comp) homeMatchOperations(state, rng, `${home.shortName} – ${away.shortName}`);
    if (comp) {
      const hp = f.result.homeGoals > f.result.awayGoals ? 3 : f.result.homeGoals === f.result.awayGoals ? 1 : 0;
      const ap = f.result.awayGoals > f.result.homeGoals ? 3 : f.result.homeGoals === f.result.awayGoals ? 1 : 0;
      if (hp) book(state, home.id, 'platy', -hp * bonusPerPoint(home) * pointsBonusFactor(state, home.id), `Prémie za ${hp === 3 ? 'výhru' : 'remízu'}: ${home.shortName} – ${away.shortName}`);
      if (ap) book(state, away.id, 'platy', -ap * bonusPerPoint(away) * pointsBonusFactor(state, away.id), `Prémie za ${ap === 3 ? 'výhru' : 'remízu'}: ${home.shortName} – ${away.shortName}`);
      // Nálada fanoušků podle výsledku, bonus generálního partnera za výhru.
      for (const [club, pts] of [[home, hp], [away, ap]] as const) {
        club.fanMood = Math.max(0, Math.min(100, club.fanMood + (pts === 3 ? 1.5 : pts === 0 ? -1.5 : 0)));
        if (pts === 3 && club.sponsorDeal?.winBonus && club.sponsorDeal.season === state.season) {
          book(state, club.id, 'komercni', club.sponsorDeal.winBonus, 'Bonus generálního partnera za výhru');
        }
      }
    }
    if (!involvesOwner) continue;

    const own = f.homeId === ownId;
    const gf = own ? f.result.homeGoals : f.result.awayGoals;
    const ga = own ? f.result.awayGoals : f.result.homeGoals;
    const verdict = gf > ga ? 'Výhra' : gf < ga ? 'Prohra' : 'Remíza';
    const d = f.result.detail;
    const xg = d ? ` xG ${d.home.xg.toFixed(1)} : ${d.away.xg.toFixed(1)}.` : '';
    const roundLabel = cup ? cup.rounds[f.round - 1]?.name ?? '' : `${f.round}. kolo`;
    addNews(state, {
      kind: 'vysledek',
      title: `${verdict}: ${clubLabel(state, f.homeId)} – ${clubLabel(state, f.awayId)} ${f.result.homeGoals}:${f.result.awayGoals}`,
      text: `${name}, ${roundLabel}. Návštěva ${attendance.toLocaleString('cs-CZ')} diváků.${xg}`,
      fixtureId: f.id,
    });
    if (comp) recordTimeline(state, f.round);
    afterOwnMatch(state, f, cup);
    for (const e of d?.events ?? []) {
      if (e.clubId !== ownId) continue;
      const p = state.players[e.playerId];
      if (!p) continue;
      if (e.type === 'zraneni') {
        addNews(state, { kind: 'varovani', title: `Zranění: ${p.firstName} ${p.lastName}`, text: `${e.note}. Mimo hru do ${p.injuredUntil?.split('-').reverse().join('. ')}.`, fixtureId: f.id, playerId: p.id });
        const top = squadOf(state, ownId).sort((a, b) => b.overall - a.overall).slice(0, 3);
        if (top.includes(p) && p.injuredUntil && p.injuredUntil > addDays(state.date, 30)) noteTimeline(state, `zranění ${p.lastName}`);
      }
      if ((e.type === 'cervena' || e.type === 'druha-zluta') && p.suspension > 0) {
        addNews(state, { kind: 'varovani', title: `Červená karta: ${p.firstName} ${p.lastName}`, text: `Stop na ${p.suspension} ${p.suspension === 1 ? 'zápas' : 'zápasy'}.`, fixtureId: f.id, playerId: p.id });
      }
    }
  }
  if (ownComp) {
    for (const round of roundsToday) {
      if (ownComp.fixtures.some((x) => x.round === round && !x.result)) continue;
      const report = makeRoundReport(state, ownComp, round, before);
      if (report) publishRoundReport(state, report);
    }
  }
}

function monthlyFinance(state: GameState, rng: Rng): void {
  monthlyReport(state);
  monthlyStaff(state, rng);
  const squads = playersByClub(state);
  for (const comp of Object.values(state.competitions)) {
    for (const clubId of comp.clubIds) {
      const club = state.clubs[clubId];
      book(state, clubId, 'tv', tvMonthly(comp.tier), 'Podíl z TV práv a odměn soutěže');
      const own = clubId === state.owner.clubId;
      const marketing = 1 + 0.08 * departmentEffect(club, comp.tier, 'marketing');
      if (own) {
        const sp = sponsorMonthly(state);
        if (sp.contracts) book(state, clubId, 'komercni', sp.contracts, 'Sponzorské smlouvy');
        book(state, clubId, 'komercni', sp.small, 'Drobní sponzoři, reklama a merchandising');
      } else {
        book(state, clubId, 'komercni', commercialMonthly(club, comp.tier) * marketing, 'Sponzoři a komerční příjmy');
      }
      const wages = (squads.get(clubId) ?? []).reduce((s, p) => s + p.wage, 0);
      // Část platů přes obrazová práva: klub ušetří, ale riskuje doměrek.
      const scheme = own && !!state.grey.taxSchemeUntil && state.grey.taxSchemeUntil > state.date;
      book(state, clubId, 'platy', -wages * (scheme ? 0.9 : 1), 'Výplaty hráčů');
      if (own) book(state, clubId, 'provoz', -adminMonthly(comp.tier) * financeFactor(state), 'Administrativa, cestování a energie');
      else book(state, clubId, 'provoz', -operatingMonthly(club, comp.tier), 'Provoz klubu, stadionu a zázemí');
      book(state, clubId, 'oddeleni', -departmentsMonthly(club, comp.tier), 'Skauting, mládež, medicína a marketing');

      if (own) {
        monthlyOperations(state, rng);
        monthlyForeign(state);
        monthlyPrograms(state);
        monthlyBigProjects(state, rng);
        boardCoversLoss(state);
        monthlyFinancing(state);
      }
      if (club.finance.balance < -(own ? activeOverdraft(state) : 0)) club.finance.monthsNegative += 1;
      else club.finance.monthsNegative = 0;

      // Bohaté kluby peníze neschovávají: přebytek jde do zázemí, mezd a na přestupy.
      if (clubId !== state.owner.clubId && club.finance.balance > annualCosts(club, comp.tier) * 0.8) {
        const excess = club.finance.balance - annualCosts(club, comp.tier) * 0.5;
        book(state, clubId, 'investice', -Math.round(excess * 0.5), 'Investice do klubu (zázemí, mládež, platy)');
        club.policy.transferBudget = Math.min(defaultTransferBudget(club) * 3, club.policy.transferBudget + Math.round((excess * 0.2) / 100_000) * 100_000);
      }
      if (clubId !== state.owner.clubId && club.finance.balance < 0) {
        // Majitelé ostatních klubů zatím ztráty automaticky dorovnávají.
        book(state, clubId, 'vklad', -club.finance.balance + annualCosts(club, comp.tier) * 0.05, 'Vklad majitele');
        club.finance.monthsNegative = 0;
      }
    }
  }

  state.owner.wallet += businessIncome(state, DIFFICULTY[state.owner.difficulty].monthlyIncome);
  monthlyBusiness(state, rng);
  monthlyCity(state, rng, communityEffect(state.clubs[state.owner.clubId], tierOf(state, state.owner.clubId)));
  monthlyUltras(state);
  monthlyVenue(state, rng);
  monthlyShareholders(state, rng);
  monthlyGrey(state, rng);
  monthlyEurope(state);
  wageMorale(state);
  monthlyDevelopment(state, rng);
  monthlyDelegation(state);
  monthlyAgents(state, rng);
  monthlyWatch(state);
  // Pozornost ze sestavy kola měsíčně slábne.
  for (const p of Object.values(state.players)) if (p.spotlight) p.spotlight = p.spotlight > 1 ? p.spotlight - 1 : undefined;
  monthlyAmortization(state);
  monthlyBuildingDepreciation(state);
  monthlyLoans(state);
  licenseCheck(state);
  // Fanoušci: drahé vstupenky je štvou, jinak se nálada pomalu vrací k normálu.
  for (const club of Object.values(state.clubs)) {
    const ratio = club.policy.ticketPrice / defaultTicketPrice(tierOf(state, club.id));
    const target = 50 + 6 * departmentEffect(club, tierOf(state, club.id), 'marketing');
    club.fanMood = Math.max(0, Math.min(100, club.fanMood + (target - club.fanMood) * 0.05 - Math.max(0, ratio - TICKET_ANGER) * 8));
  }
  recordTrend(state);
  moraleNews(state);
  const ownFinance = state.clubs[state.owner.clubId].finance;
  ownFinance.balanceHistory = [...(ownFinance.balanceHistory ?? []), { date: state.date, balance: ownFinance.balance }].slice(-60);
  // Volní hráči bez angažmá postupně slevují ze svých nároků.
  for (const p of Object.values(state.players)) {
    if (p.clubId === FREE) p.wage = Math.max(5_000, Math.round((p.wage * 0.92) / 1000) * 1000);
  }

  const own = state.clubs[state.owner.clubId];
  const months = own.finance.monthsNegative;
  // Výhled finančního ředitele: kolik měsíců vydrží peníze při posledním měsíčním úbytku.
  const start = own.finance.monthStartBalance;
  own.finance.monthStartBalance = own.finance.balance;
  if (start !== undefined && months === 0) {
    const burn = start - own.finance.balance;
    const left = burn > 0 ? own.finance.balance / burn : Infinity;
    if (left < 3) {
      addNews(state, {
        kind: 'varovani',
        title: `Finanční ředitel: peníze vydrží asi ${Math.max(0, Math.floor(left))} ${left < 2 ? 'měsíc' : 'měsíce'}`,
        text: `Minulý měsíc klub prodělal ${Math.round(burn).toLocaleString('cs-CZ')} Kč. Prodejte hráče, snižte náklady, nebo vložte kapitál.`,
      });
    }
  }
  if (months >= INSOLVENCY_MONTHS) {
    state.gameOver = {
      date: state.date,
      kind: 'krach',
      reason: `${own.name} ${months}. měsíc po sobě nemá na zaplacení závazků a krizový plán nepomohl. Klub vstupuje do insolvence.`,
    };
    addNews(state, { kind: 'varovani', title: 'Klub zkrachoval', text: state.gameOver.reason });
  } else if (months > 0) {
    if (months >= CRISIS_MONTHS) enterCrisis(state, rng);
    addNews(state, {
      kind: 'varovani',
      title: `Klub nemá na závazky (${months}. měsíc)`,
      text: `Finanční ředitel varuje: pokud účet zůstane v minusu${state.clubs[state.owner.clubId].policy.overdraft ? ' nad kontokorent' : ''} ještě ${INSOLVENCY_MONTHS - months}× na konci měsíce, klub zkrachuje. ${months >= CRISIS_MONTHS ? 'Klub je v krizovém režimu.' : 'Vložte kapitál, půjčte klubu, nebo prodejte hráče.'}`,
    });
  } else {
    leaveCrisisIfSolved(state);
  }
}

/** Zprávy o fázích sezóny klubu majitele: začátek ligy, zimní pauza, jaro, konec základní části. */
function phaseNews(state: GameState): void {
  const comp = competitionOf(state, state.owner.clubId);
  if (!comp?.fixtures.length) return;
  const dates = [...new Set(comp.fixtures.map((f) => f.date))].sort();
  const autumn = dates.filter((d) => d < `${state.season + 1}-01-01`);
  const spring = dates.filter((d) => d >= `${state.season + 1}-01-01`);
  const fmt = (d: string) => d.split('-').slice(1).reverse().map(Number).join('. ') + '.';
  if (autumn.length && state.date === addDays(autumn[0], -7)) {
    addNews(state, { kind: 'sezona', title: `${comp.name} začíná za týden (${fmt(autumn[0])})` });
  }
  if (autumn.length && state.date === addDays(autumn[autumn.length - 1], 1)) {
    addNews(state, { kind: 'sezona', title: 'Konec podzimní části', text: spring.length ? `Zimní pauza. Jaro začíná ${fmt(spring[0])}, zimní přestupní okno se otevře 8. 1.` : undefined });
  }
  if (spring.length && state.date === addDays(spring[0], -7)) {
    addNews(state, { kind: 'sezona', title: `Jarní část začíná za týden (${fmt(spring[0])})` });
  }
  if (dates.length && state.date === addDays(dates[dates.length - 1], 1) && !comp.reservedDates) {
    addNews(state, { kind: 'sezona', title: `${comp.name}: sezóna dohrána` });
  }
  if (state.date.slice(5) === '06-24') addNews(state, { kind: 'sezona', title: 'Za týden se otevře letní přestupní okno (1. 7.)' });
  if (state.date.slice(5) === '08-24') addNews(state, { kind: 'sezona', title: 'Letní přestupní okno se zavře za týden (31. 8.)' });
  if (state.date.slice(5) === '02-07') addNews(state, { kind: 'sezona', title: 'Zimní přestupní okno se zavře za týden (14. 2.)' });
}

function processDay(state: GameState, rng: Rng): void {
  const md = monthDay(state.date);
  // Kondice se každý den obnovuje.
  for (const p of Object.values(state.players)) {
    if (p.fitness < 100) p.fitness = Math.min(100, p.fitness + 5);
    if (p.injuredUntil && p.injuredUntil < state.date) {
      p.injuredUntil = undefined;
      p.injury = undefined;
    }
  }
  if (md === SEASON_START) {
    state.season = Number(state.date.slice(0, 4));
    setupSeason(state, rng, true);
    emergencyFill(state, rng, 'před začátkem sezóny');
    state.owner.valuationStart = clubValuation(state);
    applyLicenceSanction(state);
    startEurope(state, rng);
    seasonStartSponsors(state, rng);
    // Vedení navrhne dosažitelný cíl sezóny podle síly kádru a soutěže (po postupu i sestupu).
    const goal = realisticGoal(state, state.owner.clubId);
    const ownComp = competitionOf(state, state.owner.clubId);
    if (ownComp) {
      state.owner.seasonGoal = goal;
      addNews(state, { kind: 'info', title: `Vedení navrhuje cíl sezóny: ${goalLabel(goal, ownComp)}`, text: 'Cíl můžete změnit ve Vedení. Podle něj se hodnotí trenér, ředitel i vaše práce.' });
    }
    ensureInterimStaff(state, rng);
    refreshForeignMarket(state, rng);
    createSideGoals(state);
    seasonBusiness(state, rng);
    {
      // Podmíněné doplatky za loňský postup nebo Evropu.
      const last = state.history[state.history.length - 1];
      const prevTier = last ? state.competitions[last.ownerClub.competitionId]?.tier : undefined;
      const nowTier = competitionOf(state, state.owner.clubId)?.tier;
      const promoted = !!prevTier && !!nowTier && nowTier < prevTier;
      const europe = !!state.europe?.entries.some((e) => e.clubId === state.owner.clubId && e.season === state.season);
      settleConditionals(state, promoted, europe);
    }
    prepareBudget(state);
    // Finanční ředitel s pravomocí schválí návrh sám (majitel ho dál může upravit).
    if (delegationOf(state.clubs[state.owner.clubId]).finance && state.clubs[state.owner.clubId].staff.financeId) {
      const r = approveBudget(state);
      if (r.ok) Object.assign(state, r.state);
    }
    addNews(state, { kind: 'sezona', title: `Začíná sezóna ${seasonLabel(state.season)}`, text: 'Přestupní okno je otevřené do 31. 8. Nezapomeňte stanovit cíl sezóny.' });
  }
  completeProjects(state);
  completeBigProjects(state);
  dailyEvents(state, rng);
  if (state.date.endsWith('-01') || state.date.endsWith('-15')) eventOfferTick(state, rng);
  checkBan(state);
  dailyFinancing(state, rng);
  dailyOperations(state);
  if (md === BUDGET_DEADLINE) budgetDeadline(state);
  if (md === '08-28') {
    resolveEurope(state, rng);
    const e = state.europe?.entries.find((x) => x.clubId === state.owner.clubId && x.season === state.season);
    if (e && e.result !== 'predkola') sponsorEuropeBonus(state);
  }
  if (state.date.endsWith('-01') && md !== SEASON_START) generateSponsorOffers(state, rng);
  if (state.youthIntake && state.date >= state.youthIntake.deadline) closeYouthIntake(state, true);
  if (state.date.endsWith('-02')) autoSponsors(state);
  // Zahraniční trh se obnoví i před zimním oknem.
  if (md === '12-01') refreshForeignMarket(state, rng);
  if (md === '06-20') createEvent(state, rng, 'valna', `${state.date.slice(0, 4)}-06-29`);
  expireEvents(state);
  if (state.owner.ousted) boardDecides(state);
  if (dayOfWeek(state.date) === 1) {
    weeklyStories(state, rng);
    checkPromises(state);
    weeklyReleaseClauses(state, rng);
    weeklyRivalOwners(state, rng);
    snapshotPulse(state);
    maybeCreateEvent(state, rng);
    aiDomesticTransfers(state, rng);
    aiForeignSignings(state, rng);
    weeklyForeign(state);
    directorSignings(state, rng);
  }
  phaseNews(state);
  const window = transferWindow(state.date);
  if (md === '01-08') addNews(state, { kind: 'info', title: 'Otevřelo se zimní přestupní okno (do 14. 2.)' });
  if (window && md !== SEASON_START && (md.endsWith('-01') || md.endsWith('-15') || md === '01-08')) generateProposals(state);
  // Deadline day: nabídky a přestupy soupeřů každý den.
  const deadline = deadlineDay(state);
  if (window && (dayOfWeek(state.date) === 1 || deadline)) generateOffers(state, rng);
  if (deadline && dayOfWeek(state.date) !== 1) aiDomesticTransfers(state, rng);
  dailyDeadline(state, rng);
  playMatchesOn(state, rng);
  afterMatchday(state, rng);
  for (const comp of Object.values(state.competitions)) {
    if (comp.format === 'nadstavba' && !comp.groups && comp.reservedDates && baseSeasonDone(comp)) startGroups(state, comp, rng);
  }
  if (md === '06-08') startPlayoffs(state);
  if (state.date.endsWith('-01')) monthlyFinance(state, rng);
  if (md === '08-31' || md === '02-14') {
    closeWindow(state, rng);
    state.grey.tapped = [];
    addNews(state, { kind: 'info', title: 'Přestupní okno se zavřelo' });
  }
  if (md === SEASON_END) endSeason(state, rng);
}

/** Jeden tah: posun o týden. Vrací nový stav, původní se nemění. */
export function advanceWeek(prev: GameState): GameState {
  return advanceDays(prev, 7).state;
}

/**
 * Posun o dny. Volitelná podmínka `stop` ukončí posun po dni, kdy je splněná.
 * Vrací nový stav a zápas klubu majitele, který se odehrál jako poslední.
 */
export function advanceDays(prev: GameState, days: number, stopAtOwnMatch = false): { state: GameState; fixtureId?: string } {
  if (prev.gameOver) return { state: prev };
  const state = structuredClone(prev);
  const rng = createRng(state.rngState);
  const own = state.owner.clubId;
  let fixtureId: string | undefined;
  for (let i = 0; i < days && !state.gameOver; i++) {
    const played = stepDay(state, rng, own);
    if (played) {
      fixtureId = played;
      if (stopAtOwnMatch) break;
    }
  }
  state.rngState = rng.state();
  return { state, fixtureId };
}

/** Jeden den hry včetně zápisu změn v panelu tlaku. Vrací zápas klubu majitele, pokud se ten den hrál. */
function stepDay(state: GameState, rng: Rng, own: string): string | undefined {
  const before = pulseValues(state);
  const top = state.news[0];
  state.date = addDays(state.date, 1);
  processDay(state, rng);
  const cut = top ? state.news.findIndex((n) => n === top) : state.news.length;
  recordPulse(state, before, state.news.slice(0, cut < 0 ? 3 : cut));
  return allFixtures(state).find((x) => x.fixture.date === state.date && x.fixture.result && (x.fixture.homeId === own || x.fixture.awayId === own))?.fixture.id;
}

export type PlayTarget = 'zapas' | 'milnik' | 'mesic' | 'sezona';

export const PLAY_TARGET_LABEL: Record<PlayTarget, string> = { zapas: 'do příštího zápasu', milnik: 'do příštího milníku', mesic: 'do konce měsíce', sezona: 'do konce sezóny' };

/**
 * Hrát do cíle (zápas, milník, konec měsíce nebo sezóny). Zastaví se dřív, když nastane něco,
 * co si majitel v nastavení označil: nová situace k rozhodnutí, nabídka na hráče, zranění opory, milník.
 */
export function advanceUntil(prev: GameState, target: PlayTarget): { state: GameState; fixtureId?: string; reason?: string } {
  if (prev.gameOver) return { state: prev };
  const state = structuredClone(prev);
  const rng = createRng(state.rngState);
  const own = state.owner.clubId;
  const stops = settingsOf(state).stops;
  const goal = target === 'milnik' ? nextMilestone(state)?.date : undefined;
  const events = new Set(state.events.map((e) => e.id));
  const offers = new Set(state.market.offers.map((o) => o.id));
  const injured = new Set(squadOf(state, own).filter((p) => p.injuredUntil && p.injuredUntil >= state.date).map((p) => p.id));
  let fixtureId: string | undefined;
  let reason: string | undefined;
  const prematchAtStart = !!pendingPrematch(state);
  const deadlineAtStart = !!deadlineDay(state);
  for (let i = 0; i < 400 && !state.gameOver; i++) {
    const played = stepDay(state, rng, own);
    if (played) fixtureId = played;
    const md = state.date.slice(5);
    if (target === 'zapas' && played) break;
    if (target === 'milnik' && (!goal || state.date >= goal)) break;
    if (target === 'mesic' && state.date.endsWith('-01')) break;
    if (target === 'sezona' && md === '06-30') break;
    const fresh = state.events.find((e) => !events.has(e.id));
    if (stops.decision && fresh) {
      reason = `Nová situace k rozhodnutí: ${fresh.title}`;
      break;
    }
    // Zastaví jen výhodná nabídka (ředitel doporučuje přijmout), ostatní počkají v Přestupech.
    const offer = state.market.offers.find((o) => !offers.has(o.id) && o.advice === 'prijmout' && o.fee >= stops.offerMin && state.players[o.playerId]?.clubId === own);
    if (stops.offer && offer) {
      reason = `Nová nabídka: ${(offer.fee / 1e6).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč za ${state.players[offer.playerId].firstName} ${state.players[offer.playerId].lastName}`;
      break;
    }
    if (stops.injury) {
      const core = squadOf(state, own).sort((a, b) => b.overall - a.overall).slice(0, 11);
      const hurt = core.find((p) => p.injuredUntil && p.injuredUntil > addDays(state.date, 14) && !injured.has(p.id));
      if (hurt) {
        reason = `Zranění opory: ${hurt.firstName} ${hurt.lastName} (do ${formatDate(hurt.injuredUntil!)})`;
        break;
      }
    }
    if (stops.milestone && !deadlineAtStart && deadlineDay(state)) {
      reason = 'Deadline day: poslední tři dny přestupního okna, hra jde po dnech';
      break;
    }
    const prematch = pendingPrematch(state);
    if (stops.decision && prematch && !prematchAtStart) {
      reason = `Blíží se zápas, o který jde: ${prematch.stakes.map((s) => s.label).join(', ')}`;
      break;
    }
    if (stops.milestone && target !== 'milnik' && milestoneToday(state)) {
      reason = milestoneToday(state)!.title;
      break;
    }
  }
  state.rngState = rng.state();
  return { state, fixtureId, reason };
}

/** Hrát do příštího zápasu klubu majitele (nejvýš 60 dní). */
export function advanceToNextMatch(prev: GameState, maxDays = 60): { state: GameState; fixtureId?: string } {
  return advanceDays(prev, Math.max(1, Math.min(60, maxDays)), true);
}

// ---------- Rozhodnutí majitele ----------

export function injectCapital(prev: GameState, amount: number): GameState {
  const value = Math.floor(amount);
  if (value <= 0 || value > prev.owner.wallet) return prev;
  const state = structuredClone(prev);
  state.owner.wallet -= value;
  book(state, state.owner.clubId, 'vklad', value, 'Vklad majitele do klubu');
  addNews(state, { kind: 'info', title: `Vložil jste do klubu ${value.toLocaleString('cs-CZ')} Kč` });
  return state;
}

export function updatePolicy(prev: GameState, patch: Partial<Club['policy']>): GameState {
  const state = structuredClone(prev);
  const club = state.clubs[state.owner.clubId];
  club.policy = { ...club.policy, ...patch };
  club.policy.wageMultiplier = Math.max(0.5, Math.min(2, club.policy.wageMultiplier));
  if (club.policy.seasonTicketPrice !== undefined) club.policy.seasonTicketPrice = Math.max(0, Math.round(club.policy.seasonTicketPrice));
  if (club.policy.departments) {
    for (const k of Object.keys(club.policy.departments) as (keyof Departments)[]) club.policy.departments[k] = Math.max(0, Math.round(club.policy.departments[k]));
  }
  club.policy.ticketPrice = Math.max(0, Math.round(club.policy.ticketPrice));
  club.policy.transferBudget = Math.max(0, Math.round(club.policy.transferBudget));
  return state;
}

export function describeDate(state: GameState): string {
  return formatDate(state.date, true);
}

/**
 * Převod uložené hry ze starší verze. Verze 2 měla jinou ekonomiku: hráčům se přepočítají
 * platy podle nového trhu a volní hráči dostanou tržní nároky.
 */
/** Pravidla soutěží, která přibyla po verzi 4 (pro převod starších uložených her). */
const PACK_RULES: { id: string; rules: Partial<Competition> }[] = [
  { id: 'cz1', rules: { relegate: 1, format: 'nadstavba', playoff: { vs: 'cz2', upper: [14, 15], lower: [3, 2] } } },
  { id: 'cz2', rules: { promote: 1 } },
];

export function migrateSave(saved: { version: number } & Record<string, unknown>): GameState | null {
  if (saved.version === SAVE_VERSION) return saved as unknown as GameState;
  if (saved.version < 2 || saved.version > SAVE_VERSION) return null;
  const state = saved.version >= 6 ? (structuredClone(saved) as unknown as GameState) : migrateToV6(saved);
  if (!state) return null;
  if (saved.version < 7) {
    // Verze 7: spolumajitelé, šedá zóna, pověst majitele.
    state.shareholders ??= [];
    state.agm ??= [];
    state.grey ??= { exposure: 0, actions: [] };
    state.owner.media ??= 50;
    state.owner.league ??= 50;
    state.owner.valuationStart ??= clubValuation(state);
    refreshStaffPool(state, createRng(state.rngState + 7));
  }
  if (saved.version < 8) migrateToV8(state);
  migrateToV9(state);
  migrateToV10(state);
  migrateToV11(state);
  state.version = SAVE_VERSION;
  addNews(state, {
    kind: 'info',
    title: 'Nová verze hry: zahraniční trh a velké investice',
    text: 'V Přestupech je zahraniční skauting (regiony, odhady s nejistotou, hostování s opcí, limit hráčů mimo EU). Ve Stadionu jsou velké investice (nový stadion, tréninkový a komerční areál) a programy klubu (B-tým, ženský tým, analytika, partnerský klub, integrace).',
  });
  return state;
}

/** Verze 11: zahraniční skauting, programy klubu a komerční areál. */
function migrateToV11(state: GameState): void {
  for (const club of Object.values(state.clubs)) {
    for (const totals of [club.finance.season, club.finance.lastSeason]) {
      if (!totals) continue;
      for (const k of NEW_CATEGORIES_V11) totals[k] ??= 0;
    }
  }
  state.foreign ??= { networks: [], targets: [] };
}

/** Verze 10: nové kategorie financí (fanshop, akce, údržba, soustředění, bezpečnost, komunita). */
function migrateToV10(state: GameState): void {
  for (const club of Object.values(state.clubs)) {
    for (const totals of [club.finance.season, club.finance.lastSeason]) {
      if (!totals) continue;
      for (const k of NEW_CATEGORIES_V10) totals[k] ??= 0;
    }
  }
}

/** Verze 9: sponzorská místa místo jednoho generálního partnera, nové financování. */
function migrateToV9(state: GameState): void {
  const rng = createRng(state.rngState + 9);
  const own = state.clubs[state.owner.clubId];
  if (!own.sponsors) initialSponsors(state, rng);
  own.policy.wageSplit ??= suggestedSplit(state);
  own.sponsorDeal = undefined;
  state.payments ??= [];
}

/** Platový násobek z verze 7 (pro přepočet platů uložených her). */
function oldPayFactor(reputation: number): number {
  if (reputation >= 70) return 1.3 + (reputation - 70) / 25;
  if (reputation >= 60) return 1.3;
  if (reputation >= 50) return 1 + ((reputation - 50) / 10) * 0.3;
  if (reputation >= 40) return 1;
  return 0.75;
}

/** Verze 8: nová ekonomika, oddělení, rozpočet, Evropa. */
function migrateToV8(state: GameState): void {
  for (const p of Object.values(state.players)) {
    const club = state.clubs[p.clubId];
    if (!club) continue;
    p.wage = Math.max(5_000, Math.round((p.wage * clubPayFactor(club.reputation)) / oldPayFactor(club.reputation) / 1000) * 1000);
  }
  for (const club of Object.values(state.clubs)) {
    for (const totals of [club.finance.season, club.finance.lastSeason]) {
      if (!totals) continue;
      totals.oddeleni ??= 0;
      totals.evropa ??= 0;
    }
  }
  const own = state.clubs[state.owner.clubId];
  const tier = tierOf(state, own.id);
  own.policy.departments ??= departmentReference(own, tier);
  own.policy.seasonTicketPrice ??= defaultSeasonTicketPrice(tier);
  own.policy.autoSquad ??= true;
  // Rozběhnutá sezóna: rozpočet se bere jako schválený podle současného nastavení.
  state.budget = { season: state.season, seasonTickets: 0 };
  state.budget = { ...state.budget, approved: state.date, plan: forecastSeason(state) };
}

function migrateToV6(saved: { version: number } & Record<string, unknown>): GameState | null {
  if (saved.version < 2 || saved.version > 5) return null;
  const state = structuredClone(saved) as unknown as GameState;
  // Verze 5: forma a morálka, kariéra hráčů, pohár, baráž, nadstavba, účetnictví.
  for (const p of Object.values(state.players)) {
    p.morale ??= 60;
    p.recent ??= [];
    p.career ??= [];
    p.transfers ??= [];
  }
  state.cups ??= {};
  state.timeline ??= [];
  const ownFinance = state.clubs[state.owner.clubId].finance;
  ownFinance.accounting ??= emptyAccounting();
  for (const def of PACK_RULES) {
    const comp = state.competitions[def.id];
    if (comp) Object.assign(comp, def.rules);
  }
  // Verze 6: stadion a zázemí, fanoušci, situace, úvěry.
  state.projects ??= [];
  state.events ??= [];
  state.loans ??= [];
  for (const club of Object.values(state.clubs)) {
    club.facilities ??= defaultFacilities(club.reputation, tierOf(state, club.id));
    club.fanMood ??= 50;
    club.stadium.originalCapacity ??= club.stadium.capacity;
  }
  const acc = state.clubs[state.owner.clubId].finance.accounting;
  if (acc) {
    acc.buildingDepreciation ??= 0;
    acc.interest ??= 0;
  }
  for (const club of Object.values(state.clubs)) {
    for (const totals of [club.finance.season, club.finance.lastSeason]) {
      if (!totals) continue;
      for (const k of ['stadion', 'ostatni', 'investice', 'uver'] as const) totals[k] ??= 0;
    }
  }
  if (saved.version === 5) {
    state.version = SAVE_VERSION;
    addNews(state, { kind: 'info', title: 'Nová verze hry', text: 'Přibyl stadion a zázemí, situace k rozhodnutí, nálada fanoušků, úvěry, přestupy mezi kluby v lize a kalendář sezóny.' });
    return state;
  }
  if (saved.version === 4) {
    state.version = SAVE_VERSION;
    addNews(state, {
      kind: 'info',
      title: 'Nová verze hry',
      text: 'Přibyla forma a morálka hráčů, karty hráčů a klubů, výsledovka s odpisy a daní. Pohár, nadstavba 1. ligy a baráž začnou od příští sezóny.',
    });
    return state;
  }
  // Verze 4: statistiky hráčů, kondice, zranění a tresty.
  for (const p of Object.values(state.players)) {
    const goals = p.goals ?? 0;
    const apps = p.apps ?? 0;
    Object.assign(p, { ...emptySeasonStats(), goals, apps, starts: apps, minutes: apps * 85 });
    p.fitness = 100;
    p.suspension = 0;
  }
  if (saved.version === 3) {
    state.version = SAVE_VERSION;
    state.cups = {};
    addNews(state, { kind: 'info', title: 'Nový zápasový engine', text: 'Zápasy mají sestavy, střely, xG, karty, zranění a střídání. Kliknutím na výsledek otevřete náhled zápasu.' });
    return state;
  }
  const squads = playersByClub(state);
  for (const club of Object.values(state.clubs)) setMarketWages(squads.get(club.id) ?? [], club);
  for (const club of Object.values(state.clubs)) {
    if (club.id !== state.owner.clubId) club.policy.transferBudget = defaultTransferBudget(club);
  }
  state.version = SAVE_VERSION;
  addNews(state, {
    kind: 'info',
    title: 'Nová ekonomika',
    text: 'Hodnoty hráčů a platy odpovídají české lize. Rozpočet na přestupy si zkontrolujte ve Financích.',
  });
  return state;
}

// ---------- Živý přenos ----------

export interface LiveHalf {
  fixtureId: string;
  homeId: string;
  awayId: string;
  events: import('./types').MatchEvent[];
  homeGoals: number;
  awayGoals: number;
}

/**
 * Náhled prvního poločasu zápasu majitele, který se hraje zítra. Zápas se přehraje na kopii hry;
 * skutečný zápas proběhne do 45. minuty stejně (stejná náhoda), rozhodnutí o poločase platí od 46. minuty.
 */
export function liveFirstHalf(state: GameState): LiveHalf | undefined {
  const own = state.owner.clubId;
  const tomorrow = addDays(state.date, 1);
  const next = allFixtures(state).find((x) => x.fixture.date === tomorrow && !x.fixture.result && (x.fixture.homeId === own || x.fixture.awayId === own));
  if (!next) return undefined;
  const sim = advanceDays(state, 1).state;
  const f = allFixtures(sim).find((x) => x.fixture.id === next.fixture.id)?.fixture;
  if (!f?.result) return undefined;
  const scorers = f.result.scorers.filter((s) => s.minute <= 45);
  return {
    fixtureId: f.id,
    homeId: f.homeId,
    awayId: f.awayId,
    events: (f.result.detail?.events ?? []).filter((e) => e.minute <= 45),
    homeGoals: scorers.filter((s) => s.clubId === f.homeId).length,
    awayGoals: scorers.filter((s) => s.clubId === f.awayId).length,
  };
}
