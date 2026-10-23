import { bumpAchievementStat, fixtureOutcome, isDerby } from './achievements';
import { operatingActual } from './budget';
import { playerAge, squadOf } from './players';
import { createRng, type Rng } from './rng';
import type { Competition, GameState } from './types';
import { addNews, clamp, competitionOf, hash01, tierOf } from './world';

/**
 * Výzvy sezóny: tři osobní výzvy majitele, které se losují na začátku sezóny (nezávisle na
 * vedlejších cílech od sponzorů). Splnění přinese body odkazu a k tomu peníze nebo pověst.
 * Výzva se vyhodnotí hned, jak je jasný výsledek, zbytek na konci sezóny.
 */

export type ChallengeKind = 'pohar' | 'mladi' | 'vys' | 'derby' | 'zisk' | 'navsteva' | 'prodej' | 'pevnost' | 'kanonyr' | 'fanousci';

export interface ChallengeReward {
  /** Body odkazu (síň slávy). */
  legacy: number;
  /** Peníze do vaší peněženky. */
  wallet?: number;
  /** Pověst klubu (+) a u médií. */
  reputation?: number;
}

export interface Challenge {
  kind: ChallengeKind;
  label: string;
  /** Hranice (kolo poháru, počet hráčů, částka, …). */
  target: number;
  /** Výchozí hodnota (loňské umístění, loňská návštěva). */
  baseline?: number;
  rivalId?: string;
  hard?: boolean;
  reward: ChallengeReward;
  status?: 'splneno' | 'nesplneno';
  /** Kdy se rozhodlo. */
  settled?: string;
}

export interface ChallengesState {
  season: number;
  list: Challenge[];
  /** Průměrná domácí návštěva minulé sezóny (pro výzvu návštěvy). */
  lastAttendance?: number;
  /** Bilance minulých sezón (nejnovější první). */
  history?: { season: number; done: number; total: number }[];
}

export const CHALLENGE_COUNT = 3;
/** Kolik startů musí mladý hráč mít, aby se počítal do výzvy. */
export const YOUNG_STARTS = 8;
const CUP_TARGET_NAME: Record<number, string> = { 4: 'čtvrtfinále', 5: 'semifinále', 6: 'finále', 7: 'vítězství' };

const mil = (v: number) => `${(v / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč`;

function seasonRng(state: GameState, salt: string): Rng {
  return createRng(Math.floor(hash01(`${state.seed}-${state.season}-${salt}`) * 2 ** 31) + state.season);
}

/** Soutěž, kterou klub majitele hraje (na konci sezóny ta, ve které sezónu dohrál). */
function playedComp(state: GameState): Competition | undefined {
  const last = state.history[state.history.length - 1];
  if (last && last.season === state.season) return state.competitions[last.ownerClub.competitionId];
  return competitionOf(state, state.owner.clubId);
}

function leagueFixtures(state: GameState) {
  const own = state.owner.clubId;
  return playedComp(state)?.fixtures.filter((f) => f.homeId === own || f.awayId === own) ?? [];
}

/** Pořadí podle pověsti v soutěži: 0 = favorit, 1 = outsider. */
function strengthRank(state: GameState): number {
  const comp = competitionOf(state, state.owner.clubId);
  if (!comp || comp.clubIds.length < 2) return 0.5;
  const sorted = [...comp.clubIds].sort((a, b) => state.clubs[b].reputation - state.clubs[a].reputation);
  return sorted.indexOf(state.owner.clubId) / (sorted.length - 1);
}

function homeAttendance(state: GameState): { avg: number; games: number } {
  const own = state.owner.clubId;
  const home = leagueFixtures(state).filter((f) => f.homeId === own && f.result);
  return { avg: home.length ? home.reduce((a, f) => a + f.result!.attendance, 0) / home.length : 0, games: home.length };
}

function walletReward(state: GameState, factor: number): number {
  const tier = tierOf(state, state.owner.clubId);
  const base = tier === 1 ? 6_000_000 : tier === 2 ? 2_500_000 : 1_000_000;
  return Math.round((base * factor) / 100_000) * 100_000;
}

/** Nabídka možných výzev pro tuto sezónu (podle klubu a soutěže). */
function candidates(state: GameState): Challenge[] {
  const own = state.owner.clubId;
  const comp = competitionOf(state, own);
  const tier = tierOf(state, own);
  const rank = strengthRank(state);
  const club = state.clubs[own];
  const out: Challenge[] = [];
  const money = (f: number): ChallengeReward => ({ legacy: f >= 1.5 ? 10 : 5, wallet: walletReward(state, f) });
  const rep = (f: number): ChallengeReward => ({ legacy: f >= 1.5 ? 10 : 5, reputation: f >= 1.5 ? 3 : 2 });

  // Pohár: favorit ho má vyhrát, ostatní dojít co nejdál.
  const cup = state.cups.pohar;
  if (cup && !cup.winner && cup.alive.includes(own)) {
    const target = tier === 1 && rank < 0.3 ? 7 : tier === 1 ? 5 : tier === 2 ? 4 : 4;
    out.push({ kind: 'pohar', label: target === 7 ? 'Vyhrajte domácí pohár' : `Dojděte v poháru aspoň do kola: ${CUP_TARGET_NAME[target]}`, target, hard: target >= 5, reward: target >= 5 ? money(2) : money(1) });
  }
  out.push({ kind: 'mladi', label: `Dejte šanci 2 hráčům do 21 let (aspoň ${YOUNG_STARTS} startů každý)`, target: 2, reward: rep(1) });

  const last = state.history[state.history.length - 1];
  const lastComp = last ? state.competitions[last.ownerClub.competitionId] : undefined;
  if (last && comp && lastComp && lastComp.tier === comp.tier && last.ownerClub.position > 0) {
    if (last.ownerClub.position === 1) out.push({ kind: 'vys', label: 'Obhajte první místo v lize', target: 1, baseline: 1, hard: true, reward: money(2.5) });
    else out.push({ kind: 'vys', label: `Skončete v lize výš než loni (${last.ownerClub.position}. místo)`, target: last.ownerClub.position - 1, baseline: last.ownerClub.position, reward: money(1.2) });
  }
  const derby = comp?.clubIds.find((id) => id !== own && isDerby(state, own, id));
  if (derby) out.push({ kind: 'derby', label: `Vyhrajte obě ligová derby s klubem ${state.clubs[derby].name}`, target: 2, rivalId: derby, hard: true, reward: rep(2) });

  out.push({ kind: 'zisk', label: 'Provozní zisk sezóny bez vkladu majitele', target: 0, hard: tier === 1, reward: money(tier === 1 ? 1.5 : 1) });

  const lastAtt = state.challenges?.lastAttendance;
  if (lastAtt && lastAtt < club.stadium.capacity * 0.88) {
    const target = Math.round((lastAtt * 1.1) / 50) * 50;
    out.push({ kind: 'navsteva', label: `Zvyšte průměrnou návštěvu o 10 % (aspoň ${target.toLocaleString('cs-CZ')} diváků)`, target, baseline: Math.round(lastAtt), reward: rep(1) });
  }
  const sale = tier === 1 ? (rank < 0.4 ? 60_000_000 : 40_000_000) : tier === 2 ? 12_000_000 : 4_000_000;
  out.push({ kind: 'prodej', label: `Utržte za prodeje hráčů aspoň ${mil(sale)}`, target: sale, reward: money(1) });

  const losses = rank < 0.3 ? 1 : rank < 0.65 ? 3 : 5;
  out.push({ kind: 'pevnost', label: `Doma v lize prohrajte nejvýš ${losses}×`, target: losses, hard: rank < 0.3, reward: rep(rank < 0.3 ? 2 : 1) });
  const goals = tier === 1 && rank < 0.4 ? 15 : 12;
  out.push({ kind: 'kanonyr', label: `Váš hráč dá v sezóně aspoň ${goals} gólů`, target: goals, reward: money(1) });
  out.push({ kind: 'fanousci', label: 'Na konci sezóny mějte náladu fanoušků aspoň 70', target: 70, reward: rep(1) });
  return out;
}

/** Začátek sezóny: vylosovat tři výzvy (různých druhů). */
export function createChallenges(state: GameState): void {
  const rng = seasonRng(state, 'vyzvy');
  const pool = candidates(state);
  const picked: Challenge[] = [];
  // Aspoň jedna sportovní a jedna mimo hřiště, aby to nebylo jednotvárné.
  const sport: ChallengeKind[] = ['pohar', 'vys', 'derby', 'pevnost', 'kanonyr'];
  const take = (list: Challenge[]) => {
    if (!list.length) return;
    const c = list[Math.floor(rng.next() * list.length)];
    picked.push(c);
    pool.splice(pool.indexOf(c), 1);
  };
  take(pool.filter((c) => sport.includes(c.kind)));
  take(pool.filter((c) => !sport.includes(c.kind)));
  while (picked.length < CHALLENGE_COUNT && pool.length) take(pool);
  state.challenges = { ...(state.challenges ?? { history: [] }), season: state.season, list: picked };
  addNews(state, {
    kind: 'info',
    title: 'Vaše výzvy sezóny',
    text: `${picked.map((c) => c.label).join(' · ')}. Za každou splněnou výzvu získáte body odkazu a k tomu peníze nebo pověst. Průběh najdete v Klub › Projekty a cíle.`,
  });
}

export interface ChallengeProgress {
  ratio: number;
  text: string;
  /** Už je jasné, že je splněno / nesplněno. */
  final?: 'splneno' | 'nesplneno';
}

/** Průběh výzvy. `end` = konec sezóny (vyhodnotí i to, co jinak čeká). */
export function challengeProgress(state: GameState, c: Challenge, end = false): ChallengeProgress {
  const own = state.owner.clubId;
  const squad = squadOf(state, own);
  switch (c.kind) {
    case 'pohar': {
      const cup = state.cups.pohar;
      const mine = cup?.fixtures.filter((f) => f.homeId === own || f.awayId === own) ?? [];
      const reached = cup?.winner === own ? 7 : mine.reduce((a, f) => Math.max(a, f.round), 0);
      const out = !!cup && !cup.alive.includes(own) && cup.winner !== own;
      const text = cup?.winner === own ? 'pohár je náš!' : reached ? `${out ? 'vypadli jsme v kole' : 'hrajeme kolo'} ${['', '1. kolo', '2. kolo', 'osmifinále', 'čtvrtfinále', 'semifinále', 'finále'][reached] ?? reached}` : 'pohár ještě nezačal';
      if (reached >= c.target) return { ratio: 1, text, final: 'splneno' };
      if (out || end) return { ratio: reached / c.target, text, final: 'nesplneno' };
      return { ratio: reached / c.target, text };
    }
    case 'mladi': {
      const count = squad.filter((p) => playerAge(p, state.season) <= 21 && p.starts >= YOUNG_STARTS).length;
      const close = squad.filter((p) => playerAge(p, state.season) <= 21 && p.starts > 0 && p.starts < YOUNG_STARTS).length;
      return { ratio: count / c.target, text: `${count} z ${c.target} má ${YOUNG_STARTS}+ startů${close ? `, dalších ${close} hrálo` : ''}`, final: count >= c.target ? 'splneno' : end ? 'nesplneno' : undefined };
    }
    case 'vys': {
      const comp = playedComp(state);
      const last = state.history[state.history.length - 1];
      const final = end && last?.season === state.season ? last.ownerClub.position : undefined;
      let pos = final;
      if (pos === undefined && comp) {
        const rows = comp.fixtures.filter((f) => f.result && (f.homeId === own || f.awayId === own)).length;
        pos = rows ? livePosition(state, comp) : undefined;
      }
      const ok = pos !== undefined && pos <= c.target;
      if (end) return { ratio: ok ? 1 : 0, text: pos ? `skončili jsme ${pos}.` : 'bez umístění', final: ok ? 'splneno' : 'nesplneno' };
      return { ratio: pos ? (ok ? 1 : Math.max(0, 1 - (pos - c.target) / 8)) : 0, text: pos ? `teď ${pos}. místo (loni ${c.baseline}.)` : 'liga ještě nezačala' };
    }
    case 'derby': {
      const games = leagueFixtures(state).filter((f) => f.homeId === c.rivalId || f.awayId === c.rivalId);
      const played = games.filter((f) => f.result);
      const wins = played.filter((f) => fixtureOutcome(f, own) === 'W').length;
      const lost = played.length - wins;
      const text = played.length ? `${wins} ${wins === 1 ? 'výhra' : wins >= 2 && wins <= 4 ? 'výhry' : 'výher'} z ${played.length}` : 'derby se ještě nehrálo';
      if (lost > 0) return { ratio: wins / c.target, text, final: 'nesplneno' };
      if (wins >= c.target || (games.length > 0 && played.length === games.length)) return { ratio: 1, text, final: 'splneno' };
      return { ratio: wins / c.target, text, final: end ? 'nesplneno' : undefined };
    }
    case 'zisk': {
      const result = operatingActual(state);
      const deposits = Math.max(0, state.clubs[own].finance.season?.vklad ?? 0);
      const text = `provozně zatím ${mil(result)}${deposits > 0 ? `, vklady ${mil(deposits)}` : ', bez vkladů'}`;
      if (end) return { ratio: result >= 0 && deposits <= 0 ? 1 : 0, text, final: result >= 0 && deposits <= 0 ? 'splneno' : 'nesplneno' };
      return { ratio: deposits > 0 ? 0 : result >= 0 ? 1 : 0.5, text, final: deposits > 0 ? 'nesplneno' : undefined };
    }
    case 'navsteva': {
      const { avg, games } = homeAttendance(state);
      const text = games ? `zatím ${Math.round(avg).toLocaleString('cs-CZ')} v průměru (loni ${(c.baseline ?? 0).toLocaleString('cs-CZ')})` : 'zatím žádný domácí zápas';
      return { ratio: avg / c.target, text, final: end ? (avg >= c.target ? 'splneno' : 'nesplneno') : undefined };
    }
    case 'prodej': {
      const from = `${state.season}-07-01`;
      const sum = (state.transferLog ?? []).filter((e) => e.fromId === own && e.toId !== own && e.date >= from && e.kind !== 'hostovani').reduce((a, e) => a + e.fee, 0);
      return { ratio: sum / c.target, text: `zatím ${mil(sum)}`, final: sum >= c.target ? 'splneno' : end ? 'nesplneno' : undefined };
    }
    case 'pevnost': {
      const home = leagueFixtures(state).filter((f) => f.homeId === own && f.result);
      const lost = home.filter((f) => fixtureOutcome(f, own) === 'L').length;
      const text = `${lost}× prohra doma z ${home.length} zápasů`;
      if (lost > c.target) return { ratio: 0, text, final: 'nesplneno' };
      return { ratio: home.length ? 1 - lost / (c.target + 1) : 0, text, final: end ? 'splneno' : undefined };
    }
    case 'kanonyr': {
      const best = [...squad].sort((a, b) => b.goals - a.goals)[0];
      const goals = best?.goals ?? 0;
      return { ratio: goals / c.target, text: best && goals ? `${best.firstName} ${best.lastName}: ${goals} gólů` : 'zatím bez gólu', final: goals >= c.target ? 'splneno' : end ? 'nesplneno' : undefined };
    }
    case 'fanousci': {
      const mood = Math.round(state.clubs[own].fanMood);
      return { ratio: mood / c.target, text: `nálada teď ${mood}`, final: end ? (mood >= c.target ? 'splneno' : 'nesplneno') : undefined };
    }
  }
}

function livePosition(state: GameState, comp: Competition): number | undefined {
  // Pořadí podle bodů a skóre z odehraných zápasů (bez importu tabulek kvůli cyklům).
  const pts = new Map<string, { p: number; gd: number; gf: number }>();
  for (const id of comp.clubIds) pts.set(id, { p: 0, gd: 0, gf: 0 });
  for (const f of comp.fixtures) {
    if (!f.result) continue;
    const h = pts.get(f.homeId);
    const a = pts.get(f.awayId);
    if (!h || !a) continue;
    const { homeGoals: hg, awayGoals: ag } = f.result;
    h.gf += hg;
    a.gf += ag;
    h.gd += hg - ag;
    a.gd += ag - hg;
    if (hg > ag) h.p += 3;
    else if (hg < ag) a.p += 3;
    else {
      h.p += 1;
      a.p += 1;
    }
  }
  for (const [id, pen] of Object.entries(comp.penalties ?? {})) {
    const r = pts.get(id);
    if (r) r.p -= pen;
  }
  const order = [...pts.entries()].sort((x, y) => y[1].p - x[1].p || y[1].gd - x[1].gd || y[1].gf - x[1].gf).map(([id]) => id);
  const i = order.indexOf(state.owner.clubId);
  return i < 0 ? undefined : i + 1;
}

function rewardText(r: ChallengeReward): string {
  return [`+${r.legacy} bodů odkazu`, r.wallet ? `${mil(r.wallet)} do vaší peněženky` : '', r.reputation ? `pověst klubu +${r.reputation}` : ''].filter(Boolean).join(', ');
}

export function challengeRewardText(c: Challenge): string {
  return rewardText(c.reward);
}

function settle(state: GameState, c: Challenge, result: 'splneno' | 'nesplneno'): void {
  c.status = result;
  c.settled = state.date;
  const club = state.clubs[state.owner.clubId];
  if (result === 'nesplneno') {
    addNews(state, { kind: 'info', title: `Výzva sezóny nevyšla: ${c.label}`, text: 'Nic se neděje, příští sezóna přinese nové výzvy.' });
    return;
  }
  const r = c.reward;
  if (r.wallet) state.owner.wallet += r.wallet;
  if (r.reputation) {
    club.reputation = clamp(club.reputation + r.reputation * 0.5, 1, 99);
    state.owner.media = clamp(state.owner.media + r.reputation, 0, 100);
  }
  state.trophies = [
    ...(state.trophies ?? []),
    { season: state.season, kind: 'vyzva', text: `Výzva sezóny ${state.season}/${String(state.season + 1).slice(2)}: ${c.label}`, points: r.legacy, clubId: club.id, clubName: club.name },
  ];
  addNews(state, { kind: 'sezona', title: `Výzva splněna: ${c.label}`, text: `Odměna: ${rewardText(r)}.` });
  bumpAchievementStat(state, 'challengesDone');
}

/** Denně: vylosovat výzvy nové sezóny (i v první sezóně) a týdně vyhodnotit rozhodnuté. */
export function challengesTick(state: GameState): void {
  if (state.gameOver || state.owner.ousted) return;
  if (!state.challenges || state.challenges.season !== state.season) {
    // Losuje se po startu sezóny (1. 7.), ne v posledních dnech té minulé.
    if (state.date.slice(5) >= '06-20' && state.date.slice(5) < '07-01') return;
    createChallenges(state);
    return;
  }
  // Průběh stačí kontrolovat jednou týdně (v pondělí).
  if (new Date(`${state.date}T00:00:00Z`).getUTCDay() !== 1) return;
  for (const c of state.challenges.list) {
    if (c.status) continue;
    const p = challengeProgress(state, c);
    if (p.final) settle(state, c, p.final);
  }
}

/** Konec sezóny: vyhodnotit zbylé výzvy a uložit podklady pro příští rok. */
export function settleChallenges(state: GameState): void {
  const ch = state.challenges;
  const { avg, games } = homeAttendance(state);
  if (!ch || ch.season !== state.season) {
    if (games) state.challenges = { ...(ch ?? { season: state.season, list: [] }), lastAttendance: Math.round(avg) };
    return;
  }
  for (const c of ch.list) {
    if (c.status) continue;
    settle(state, c, challengeProgress(state, c, true).final ?? 'nesplneno');
  }
  ch.history = [{ season: state.season, done: ch.list.filter((c) => c.status === 'splneno').length, total: ch.list.length }, ...(ch.history ?? [])].slice(0, 10);
  if (games) ch.lastAttendance = Math.round(avg);
}

/** Řádky do výroční zprávy. */
export function challengeReportLines(state: GameState): string[] {
  const ch = state.challenges;
  if (!ch || ch.season !== state.season) return [];
  return ch.list.map((c) => `${c.label}: ${c.status === 'splneno' ? `splněno (${rewardText(c.reward)})` : 'nesplněno'}`);
}
