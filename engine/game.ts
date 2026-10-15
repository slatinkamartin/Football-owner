import { addDays, formatDate, monthDay, roundDates, SEASON_END, SEASON_START, seasonLabel } from './calendar';
import {
  annualRevenue,
  book,
  commercialMonthly,
  defaultTicketPrice,
  defaultTransferBudget,
  emptyTotals,
  matchAttendance,
  operatingMonthly,
  tvMonthly,
  wageBudgetMonthly,
} from './finance';
import { doubleRoundRobin } from './fixtures';
import { simulateMatch } from './match';
import { POOL_TOWNS } from './names';
import {
  assignWages,
  generatePlayer,
  generateSquad,
  playerAge,
  playersByClub,
  SQUAD_SHAPE,
  squadOf,
  squadQualityForReputation,
} from './players';
import { createRng, type Rng } from './rng';
import { computeTable, formScore } from './standings';
import type { Club, ClubDef, Competition, DataPack, Difficulty, GameState, NewsItem, Player, Position } from './types';

export const START_SEASON = 2026;
const MAX_SQUAD = 26;
const SIGNINGS_PER_SUMMER = 4;

export const DIFFICULTY: Record<Difficulty, { label: string; wallet: number; monthlyIncome: number; clubCash: number }> = {
  snadna: { label: 'Bohatý investor', wallet: 500_000_000, monthlyIncome: 5_000_000, clubCash: 0.25 },
  stredni: { label: 'Úspěšný podnikatel', wallet: 150_000_000, monthlyIncome: 1_500_000, clubCash: 0.1 },
  tezka: { label: 'Začínající majitel', wallet: 30_000_000, monthlyIncome: 300_000, clubCash: 0.03 },
};

export interface NewGameOptions {
  clubId: string;
  ownerName: string;
  difficulty: Difficulty;
  seed?: number;
}

// ---------- Dotazy ----------

export function competitionOf(state: GameState, clubId: string): Competition | undefined {
  return Object.values(state.competitions).find((c) => c.clubIds.includes(clubId));
}

export function tierOf(state: GameState, clubId: string): number {
  return competitionOf(state, clubId)?.tier ?? 4;
}

function addNews(state: GameState, item: Omit<NewsItem, 'date'>): void {
  state.news.unshift({ date: state.date, ...item });
  state.news.length = Math.min(state.news.length, 300);
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
    stadium: { ...def.stadium },
    colors: def.colors,
    reserveOf: def.reserveOf,
    policy: { ticketPrice: defaultTicketPrice(tier), wageMultiplier: 1, transferBudget: 0 },
    finance: { balance: 0, monthsNegative: 0, season: emptyTotals(), transactions: [] },
  };
  club.policy.transferBudget = defaultTransferBudget(club);
  club.finance.balance = Math.round(annualRevenue(club.reputation) * 0.15);
  return club;
}

function fillSquad(state: GameState, rng: Rng, club: Club): void {
  const quality = squadQualityForReputation(club.reputation) + rng.normal(0, 1.5);
  for (const p of generateSquad(rng, state, club.id, state.season, quality)) state.players[p.id] = p;
}

export function newGame(pack: DataPack, opts: NewGameOptions): GameState {
  const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = createRng(seed);
  const state: GameState = {
    version: 1,
    packId: pack.id,
    seed,
    rngState: 0,
    date: `${START_SEASON}-${SEASON_START}`,
    season: START_SEASON,
    owner: { name: opts.ownerName, clubId: opts.clubId, share: 1, wallet: DIFFICULTY[opts.difficulty].wallet, difficulty: opts.difficulty },
    clubs: {},
    players: {},
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
  own.finance.balance = Math.round(annualRevenue(own.reputation) * DIFFICULTY[opts.difficulty].clubCash);

  setupSeason(state, rng, false);
  addNews(state, {
    kind: 'info',
    title: `Vítejte v ${own.name}`,
    text: `Stal jste se majitelem klubu. Sezóna ${seasonLabel(state.season)} začíná. Sportovní ředitel čeká na rozpočet na posily a trenér na první zápas.`,
  });
  state.rngState = rng.state();
  return state;
}

// ---------- Sezóna ----------

function setupSeason(state: GameState, rng: Rng, summerWindow: boolean): void {
  for (const club of Object.values(state.clubs)) {
    if (club.finance.season !== undefined && summerWindow) club.finance.lastSeason = club.finance.season;
    club.finance.season = emptyTotals();
    const tier = tierOf(state, club.id);
    if (club.id !== state.owner.clubId) {
      club.policy.ticketPrice = defaultTicketPrice(tier);
      club.policy.transferBudget = defaultTransferBudget(club);
    }
  }
  for (const p of Object.values(state.players)) {
    p.goals = 0;
    p.apps = 0;
  }
  if (summerWindow) runSummerWindow(state, rng);

  const squads = playersByClub(state);
  for (const comp of Object.values(state.competitions)) {
    const pairings = doubleRoundRobin(comp.clubIds, rng);
    const rounds = Math.max(0, ...pairings.map((p) => p.round));
    const dates = roundDates(state.season, rounds);
    comp.fixtures = pairings.map((p, i) => ({
      id: `${comp.id}-${state.season}-${i}`,
      round: p.round,
      date: dates[p.round - 1],
      homeId: p.homeId,
      awayId: p.awayId,
    }));
    for (const id of comp.clubIds) {
      assignWages(squads.get(id) ?? [], wageBudgetMonthly(state.clubs[id]));
    }
  }
}

/**
 * Letní přestupní okno v první verzi: sportovní ředitel sám nahradí nejslabší hráče.
 * Kvalitu posil určuje rozpočet na přestupy a mzdový rozpočet, které schvaluje majitel.
 */
function runSummerWindow(state: GameState, rng: Rng): void {
  const squads = playersByClub(state);
  for (const comp of Object.values(state.competitions)) {
    for (const clubId of comp.clubIds) {
      const club = state.clubs[clubId];
      const squad = squads.get(clubId) ?? [];
      const budget = Math.max(0, club.policy.transferBudget);
      const ratio = budget / Math.max(defaultTransferBudget(club), 1);
      const quality =
        squadQualityForReputation(club.reputation) +
        3 * Math.log2(1 + ratio) - 3 +
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
      for (const id of leaving) delete state.players[id];

      // Příchody: doplnit pozice, kde chybí hráči, zbytek podle potřeby.
      const signings: Player[] = [];
      const counts = (pos: Position) => remaining.filter((p) => p.position === pos).length + signings.filter((p) => p.position === pos).length;
      while (signings.length < SIGNINGS_PER_SUMMER) {
        const positions = (Object.keys(SQUAD_SHAPE) as Position[]).sort(
          (a, b) => counts(a) - SQUAD_SHAPE[a] - (counts(b) - SQUAD_SHAPE[b]),
        );
        const p = generatePlayer(rng, state, { clubId, position: positions[0], season: state.season, quality, age: rng.int(20, 30) });
        signings.push(p);
        state.players[p.id] = p;
      }
      if (budget > 0) book(state, clubId, 'prestupy', -budget, 'Letní přestupní okno');

      if (clubId === state.owner.clubId) {
        const names = signings.map((p) => `${p.firstName} ${p.lastName} (${p.overall})`).join(', ');
        addNews(state, {
          kind: 'info',
          title: 'Letní přestupní okno uzavřeno',
          text: `Sportovní ředitel přivedl ${plural(signings.length, 'posilu', 'posily', 'posil')}: ${names}. Klub ${leaving.size === 1 ? 'opustil' : leaving.size < 5 ? 'opustili' : 'opustilo'} ${plural(leaving.size, 'hráč', 'hráči', 'hráčů')}.`,
        });
      }
    }
  }
}

function plural(n: number, one: string, few: string, many: string): string {
  return `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
}

function clubLabel(state: GameState, id: string): string {
  return state.clubs[id]?.shortName ?? id;
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
  const tables = new Map(Object.values(state.competitions).map((c) => [c.id, computeTable(c, state)]));
  const champions: Record<string, string> = {};
  for (const comp of Object.values(state.competitions)) {
    const table = tables.get(comp.id)!;
    champions[comp.id] = table[0].clubId;
    addNews(state, { kind: 'sezona', title: `${comp.name}: vítězem je ${state.clubs[table[0].clubId].name}` });
    // Pověst podle umístění.
    const n = table.length;
    table.forEach((row, i) => {
      const club = state.clubs[row.clubId];
      club.reputation = Math.max(1, Math.min(99, club.reputation + (((n - 1) / 2 - i) / (n - 1)) * 4));
    });
  }

  const ownComp = competitionOf(state, state.owner.clubId);
  const ownTable = ownComp ? tables.get(ownComp.id)! : [];
  const ownIndex = ownTable.findIndex((r) => r.clubId === state.owner.clubId);
  state.history.push({
    season: state.season,
    champions,
    ownerClub: { competitionId: ownComp?.id ?? '', position: ownIndex + 1, points: ownTable[ownIndex]?.points ?? 0 },
  });

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
  for (const m of moves) {
    m.from.clubIds = m.from.clubIds.filter((id) => id !== m.clubId);
    m.to.clubIds.push(m.clubId);
    const club = state.clubs[m.clubId];
    club.reputation = Math.max(1, Math.min(99, club.reputation + (m.up ? 5 : -5)));
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
      addNews(state, { kind: 'info', title: `${club.name} postupuje z divize do soutěže ${comp.name}` });
    }
  }

  ageAndDevelopPlayers(state, rng);
}

function ageAndDevelopPlayers(state: GameState, rng: Rng): void {
  const nextSeason = state.season + 1;
  for (const p of Object.values(state.players)) {
    const age = playerAge(p, nextSeason);
    if (age <= 23) p.overall = Math.min(p.potential, p.overall + rng.int(1, 4));
    else if (age <= 29) p.overall = Math.min(p.potential, p.overall + rng.int(-1, 2));
    else if (age <= 32) p.overall -= rng.int(0, 2);
    else p.overall -= rng.int(1, 4);
    p.overall = Math.max(15, p.overall);
    p.potential = Math.max(p.potential, p.overall);

    const retireChance = age >= 38 ? 1 : age >= 36 ? 0.6 : age >= 34 ? 0.25 : 0;
    if (rng.chance(retireChance)) {
      if (p.clubId === state.owner.clubId) {
        addNews(state, { kind: 'info', title: `${p.firstName} ${p.lastName} ukončil kariéru` });
      }
      delete state.players[p.id];
      continue;
    }
    // Smlouvy zatím prodlužuje sportovní ředitel automaticky.
    if (p.contractUntil <= nextSeason) p.contractUntil = nextSeason + rng.int(1, 3);
  }

  // Dorost: každý klub dostane dva mladé hráče z akademie.
  for (const comp of Object.values(state.competitions)) {
    for (const clubId of comp.clubIds) {
      const quality = squadQualityForReputation(state.clubs[clubId].reputation) - 4;
      for (let i = 0; i < 2; i++) {
        const position = rng.pick(['GK', 'DF', 'DF', 'MF', 'MF', 'FW'] as Position[]);
        const p = generatePlayer(rng, state, { clubId, position, season: nextSeason, quality, age: rng.int(17, 18) });
        state.players[p.id] = p;
      }
    }
  }
}

// ---------- Průběh dne ----------

function playMatchesOn(state: GameState, rng: Rng): void {
  let squads: Map<string, Player[]> | undefined;
  for (const comp of Object.values(state.competitions)) {
    const today = comp.fixtures.filter((f) => f.date === state.date && !f.result);
    if (today.length === 0) continue;
    squads ??= playersByClub(state);
    const table = computeTable(comp, state);
    for (const f of today) {
      const home = state.clubs[f.homeId];
      const away = state.clubs[f.awayId];
      const form = formScore(table.find((r) => r.clubId === home.id)?.form ?? []);
      const attendance = matchAttendance(rng, home, away, comp.tier, form);
      f.result = simulateMatch(
        rng,
        { id: home.id, players: squads.get(home.id) ?? [] },
        { id: away.id, players: squads.get(away.id) ?? [] },
        attendance,
      );
      book(state, home.id, 'vstupne', attendance * home.policy.ticketPrice, `Vstupné: ${home.shortName} – ${away.shortName}`);

      const ownId = state.owner.clubId;
      if (f.homeId === ownId || f.awayId === ownId) {
        const own = f.homeId === ownId;
        const gf = own ? f.result.homeGoals : f.result.awayGoals;
        const ga = own ? f.result.awayGoals : f.result.homeGoals;
        const verdict = gf > ga ? 'Výhra' : gf < ga ? 'Prohra' : 'Remíza';
        addNews(state, {
          kind: 'vysledek',
          title: `${verdict}: ${clubLabel(state, f.homeId)} – ${clubLabel(state, f.awayId)} ${f.result.homeGoals}:${f.result.awayGoals}`,
          text: `${comp.name}, ${f.round}. kolo. Návštěva ${attendance.toLocaleString('cs-CZ')} diváků.`,
        });
      }
    }
  }
}

function monthlyFinance(state: GameState): void {
  const squads = playersByClub(state);
  for (const comp of Object.values(state.competitions)) {
    for (const clubId of comp.clubIds) {
      const club = state.clubs[clubId];
      book(state, clubId, 'tv', tvMonthly(comp.tier), 'Podíl z TV práv a odměn soutěže');
      book(state, clubId, 'komercni', commercialMonthly(club, comp.tier), 'Sponzoři a komerční příjmy');
      const wages = (squads.get(clubId) ?? []).reduce((s, p) => s + p.wage, 0);
      book(state, clubId, 'platy', -wages, 'Výplaty hráčů');
      book(state, clubId, 'provoz', -operatingMonthly(club), 'Provoz klubu, zaměstnanci a stadion');

      if (club.finance.balance < 0) club.finance.monthsNegative += 1;
      else club.finance.monthsNegative = 0;

      if (clubId !== state.owner.clubId && club.finance.balance < 0) {
        // Majitelé ostatních klubů zatím ztráty automaticky dorovnávají.
        book(state, clubId, 'vklad', -club.finance.balance + annualRevenue(club.reputation) * 0.05, 'Vklad majitele');
        club.finance.monthsNegative = 0;
      }
    }
  }

  state.owner.wallet += DIFFICULTY[state.owner.difficulty].monthlyIncome;

  const own = state.clubs[state.owner.clubId];
  const months = own.finance.monthsNegative;
  if (months >= 3) {
    state.gameOver = {
      date: state.date,
      reason: `${own.name} třetí měsíc po sobě nemá na zaplacení závazků a vstupuje do insolvence.`,
    };
    addNews(state, { kind: 'varovani', title: 'Klub zkrachoval', text: state.gameOver.reason });
  } else if (months > 0) {
    addNews(state, {
      kind: 'varovani',
      title: `Klub je ve ztrátě (${months}. měsíc)`,
      text: `Finanční ředitel varuje: pokud zůstatek zůstane záporný ${3 - months}× na konci měsíce, klub zkrachuje. Vložte kapitál nebo snižte náklady.`,
    });
  }
}

function processDay(state: GameState, rng: Rng): void {
  const md = monthDay(state.date);
  if (md === SEASON_START) {
    state.season = Number(state.date.slice(0, 4));
    setupSeason(state, rng, true);
    addNews(state, { kind: 'sezona', title: `Začíná sezóna ${seasonLabel(state.season)}` });
  }
  playMatchesOn(state, rng);
  if (state.date.endsWith('-01')) monthlyFinance(state);
  if (md === SEASON_END) endSeason(state, rng);
}

/** Jeden tah: posun o týden. Vrací nový stav, původní se nemění. */
export function advanceWeek(prev: GameState): GameState {
  if (prev.gameOver) return prev;
  const state = structuredClone(prev);
  const rng = createRng(state.rngState);
  for (let i = 0; i < 7 && !state.gameOver; i++) {
    state.date = addDays(state.date, 1);
    processDay(state, rng);
  }
  state.rngState = rng.state();
  return state;
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
  club.policy.wageMultiplier = Math.max(0.7, Math.min(1.5, club.policy.wageMultiplier));
  club.policy.ticketPrice = Math.max(0, Math.round(club.policy.ticketPrice));
  club.policy.transferBudget = Math.max(0, Math.round(club.policy.transferBudget));
  if (patch.wageMultiplier !== undefined) assignWages(squadOf(state, club.id), wageBudgetMonthly(club));
  return state;
}

export function describeDate(state: GameState): string {
  return formatDate(state.date, true);
}
