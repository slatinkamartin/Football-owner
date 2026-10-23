import { addDays, dayOfWeek } from './calendar';
import { book } from './finance';
import { doubleRoundRobin } from './fixtures';
import type { Rng } from './rng';
import { computeTable, type TableRow } from './standings';
import type { Competition, Cup, Fixture, GameState } from './types';
import { addNews, clubLabel, tierOf } from './world';

// ---------- Nadstavba ----------

/** Konečné pořadí: při nadstavbě nejdřív skupina o titul, pak o umístění, pak o záchranu (body se sčítají). */
export function finalStandings(comp: Competition, state?: GameState): TableRow[] {
  const table = computeTable(comp, state);
  if (!comp.groups) return table;
  return comp.groups.flatMap((g) => table.filter((r) => g.clubIds.includes(r.clubId)));
}

/** Základní část odehrána: soutěž se rozdělí do skupin a rozlosuje se nadstavba. */
export function startGroups(state: GameState, comp: Competition, rng: Rng): void {
  const ids = computeTable(comp, state).map((r) => r.clubId);
  const n = ids.length;
  if (n < 12 || !comp.reservedDates?.length) return;
  comp.groups = [
    { name: 'Skupina o titul', clubIds: ids.slice(0, 6) },
    ...(n > 12 ? [{ name: 'Skupina o umístění', clubIds: ids.slice(6, n - 6) }] : []),
    { name: 'Skupina o záchranu', clubIds: ids.slice(n - 6) },
  ];
  const base = Math.max(...comp.fixtures.map((f) => f.round));
  let i = 0;
  for (const group of comp.groups) {
    for (const p of doubleRoundRobin(group.clubIds, rng)) {
      comp.fixtures.push({
        id: `${comp.id}-${state.season}-n${i++}`,
        round: base + p.round,
        date: comp.reservedDates[p.round - 1],
        homeId: p.homeId,
        awayId: p.awayId,
      });
    }
  }
  const own = comp.groups.find((g) => g.clubIds.includes(state.owner.clubId));
  addNews(state, {
    kind: 'sezona',
    title: `${comp.name}: začíná nadstavba`,
    text: own ? `Váš klub hraje ve skupině „${own.name}“. Body ze základní části se započítávají.` : undefined,
  });
}

export function baseSeasonDone(comp: Competition): boolean {
  return comp.fixtures.length > 0 && comp.fixtures.every((f) => f.result);
}

// ---------- Vyřazovací zápasy ----------

/** Vítěz vyřazovacího zápasu nebo dvojzápasu; při shodě rozhodnou penalty (zapíšou se do posledního zápasu). */
function decideTie(rng: Rng, fixtures: Fixture[], a: string, b: string): string {
  let ga = 0;
  let gb = 0;
  for (const f of fixtures) {
    const r = f.result!;
    ga += f.homeId === a ? r.homeGoals : r.awayGoals;
    gb += f.homeId === b ? r.homeGoals : r.awayGoals;
  }
  if (ga !== gb) return ga > gb ? a : b;
  const last = fixtures[fixtures.length - 1];
  let ph = 0;
  let pa = 0;
  for (let i = 0; i < 5; i++) {
    if (rng.chance(0.76)) ph++;
    if (rng.chance(0.76)) pa++;
  }
  while (ph === pa) {
    if (rng.chance(0.76)) ph++;
    if (rng.chance(0.76)) pa++;
  }
  last.result!.penalties = [ph, pa];
  return ph > pa ? last.homeId : last.awayId;
}

// ---------- Baráž ----------

/** Po skončení soutěží: kluby z konce vyšší soutěže hrají dvojzápas s kluby z čela nižší. */
export function startPlayoffs(state: GameState): void {
  for (const comp of Object.values(state.competitions)) {
    if (!comp.playoff) continue;
    const lower = state.competitions[comp.playoff.vs];
    if (!lower || !baseSeasonDone(comp) || !baseSeasonDone(lower)) continue;
    const upperTable = finalStandings(comp, state);
    // B-týmy nesmí do nejvyšší soutěže, místo nich jde další v pořadí.
    const eligible = finalStandings(lower, state)
      .slice(lower.promote)
      .filter((r) => !(comp.tier === 1 && state.clubs[r.clubId].reserveOf));
    const ties: NonNullable<Cup['ties']> = [];
    comp.playoff.upper.forEach((pos, i) => {
      const upper = upperTable[pos - 1]?.clubId;
      const lowerRow = eligible[comp.playoff!.lower[i] - lower.promote - 1];
      if (upper && lowerRow) ties.push({ upper, lower: lowerRow.clubId });
    });
    if (!ties.length) continue;
    const year = state.season + 1;
    const first = `${year}-06-10`;
    const second = `${year}-06-13`;
    const cup: Cup = {
      id: 'baraz',
      name: `Baráž: ${comp.name}`,
      kind: 'baraz',
      fixtures: ties.flatMap((t, i) => [
        { id: `baraz-${state.season}-${i}-1`, round: 1, date: first, homeId: t.lower, awayId: t.upper },
        { id: `baraz-${state.season}-${i}-2`, round: 2, date: second, homeId: t.upper, awayId: t.lower },
      ]),
      rounds: [{ name: 'Baráž', date: first, secondLeg: second }],
      alive: ties.flatMap((t) => [t.upper, t.lower]),
      nextRound: 1,
      ties,
    };
    state.cups.baraz = cup;
    addNews(state, {
      kind: 'sezona',
      title: `${cup.name}: ${ties.map((t) => `${clubLabel(state, t.upper)} – ${clubLabel(state, t.lower)}`).join(', ')}`,
      text: 'Dvojzápas 10. a 13. 6. Vítěz hraje příští sezónu vyšší soutěž.',
    });
  }
}

/** Klíč baráže vítězů skupin v state.cups. */
export function poolPlayoffKey(pool: string): string {
  return `baraz-${pool}`;
}

/**
 * V4: Baráž o postup mezi vítězi skupin (ČFL A a B). Skupiny sdílí jedno postupové místo:
 * jejich vítězové hrají dvojzápas, vítěz postupuje (dřív rozhodovaly body na zápas).
 * Domácí v odvetě je vítěz s lepším průměrem bodů.
 */
export function startPoolPlayoffs(state: GameState): void {
  const pools = new Map<string, Competition[]>();
  for (const c of Object.values(state.competitions)) if (c.promotePool) pools.set(c.promotePool, [...(pools.get(c.promotePool) ?? []), c]);
  for (const [pool, groups] of pools) {
    if (groups.length < 2 || groups[0].promote >= groups.length || state.cups[poolPlayoffKey(pool)]) continue;
    if (!groups.every(baseSeasonDone)) continue;
    const targetTier = groups[0].tier - 1;
    const eligible = (id: string) => {
      const club = state.clubs[id];
      return !club.reserveOf || (targetTier !== 1 && tierOf(state, club.reserveOf) !== targetTier);
    };
    const winners = groups
      .map((g) => finalStandings(g, state).find((r) => eligible(r.clubId)))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .sort((a, b) => b.points / Math.max(1, b.played) - a.points / Math.max(1, a.played) || b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst));
    if (winners.length < 2) continue;
    const [upper, lower] = [winners[0].clubId, winners[1].clubId];
    const year = state.season + 1;
    const first = `${year}-06-10`;
    const second = `${year}-06-13`;
    const name = `Baráž o postup: ${groups.map((g) => g.name).join(' – ')}`;
    const cup: Cup = {
      id: poolPlayoffKey(pool),
      name,
      kind: 'baraz',
      pool,
      fixtures: [
        { id: `${poolPlayoffKey(pool)}-${state.season}-1`, round: 1, date: first, homeId: lower, awayId: upper },
        { id: `${poolPlayoffKey(pool)}-${state.season}-2`, round: 2, date: second, homeId: upper, awayId: lower },
      ],
      rounds: [{ name: 'Baráž o postup', date: first, secondLeg: second }],
      alive: [upper, lower],
      nextRound: 1,
      ties: [{ upper, lower }],
    };
    state.cups[cup.id] = cup;
    const own = [upper, lower].includes(state.owner.clubId);
    addNews(state, {
      kind: own ? 'sezona' : 'info',
      title: `${name}: ${clubLabel(state, upper)} – ${clubLabel(state, lower)}`,
      text: `Vítězové skupin hrají dvojzápas o jedno postupové místo (10. a 13. 6.). Vítěz hraje příští sezónu vyšší soutěž.${own ? ' Váš klub je ve hře!' : ''}`,
    });
  }
}

function resolvePoolPlayoff(state: GameState, cup: Cup, rng: Rng): void {
  const t = cup.ties?.[0];
  if (!t || t.winner || !cup.fixtures.every((f) => f.result)) return;
  t.winner = decideTie(rng, cup.fixtures, t.upper, t.lower);
  cup.winner = t.winner;
  const loser = t.winner === t.upper ? t.lower : t.upper;
  const own = [t.upper, t.lower].includes(state.owner.clubId);
  addNews(state, {
    kind: own ? 'sezona' : 'info',
    title: t.winner === state.owner.clubId ? `Baráž vyhrána: ${clubLabel(state, t.winner)} postupuje!` : `Baráž: ${clubLabel(state, t.winner)} postupuje, ${clubLabel(state, loser)} zůstává`,
  });
}

function resolvePlayoffs(state: GameState, cup: Cup, rng: Rng): void {
  if (!cup.ties || cup.ties.every((t) => t.winner) || !cup.fixtures.every((f) => f.result)) return;
  for (const t of cup.ties) {
    const legs = cup.fixtures.filter((f) => [f.homeId, f.awayId].includes(t.upper) && [f.homeId, f.awayId].includes(t.lower));
    t.winner = decideTie(rng, legs, t.upper, t.lower);
    const stays = t.winner === t.upper;
    addNews(state, {
      kind: [t.upper, t.lower].includes(state.owner.clubId) ? 'sezona' : 'info',
      title: stays
        ? `Baráž: ${clubLabel(state, t.upper)} se udržel, ${clubLabel(state, t.lower)} nepostoupil`
        : `Baráž: ${clubLabel(state, t.lower)} postupuje na úkor ${clubLabel(state, t.upper)}`,
    });
  }
}

// ---------- Pohár ----------

export const CUP_ROUNDS: { name: string; md: string; spring: boolean; prize: number }[] = [
  { name: '1. kolo', md: '08-25', spring: false, prize: 300_000 },
  { name: '2. kolo', md: '09-22', spring: false, prize: 600_000 },
  { name: 'Osmifinále', md: '10-27', spring: false, prize: 1_000_000 },
  { name: 'Čtvrtfinále', md: '03-09', spring: true, prize: 2_000_000 },
  { name: 'Semifinále', md: '04-13', spring: true, prize: 3_000_000 },
  { name: 'Finále', md: '05-12', spring: true, prize: 10_000_000 },
];
export const CUP_FINALIST_PRIZE = 4_000_000;

/** Pohár se hraje v úterý, aby se nekryl s ligovými koly (sobota a středa). */
function tuesdayFrom(iso: string): string {
  let d = iso;
  while (dayOfWeek(d) !== 2) d = addDays(d, 1);
  return d;
}

export function setupCup(state: GameState, rng: Rng): void {
  const participants = Object.values(state.competitions)
    .flatMap((c) => c.clubIds)
    .filter((id) => !state.clubs[id].reserveOf)
    .sort((a, b) => state.clubs[b].reputation - state.clubs[a].reputation);
  const byes = Math.max(0, 64 - participants.length);
  const cup: Cup = {
    id: 'pohar',
    name: 'Domácí pohár',
    kind: 'pohar',
    fixtures: [],
    rounds: CUP_ROUNDS.map((r) => ({ name: r.name, date: tuesdayFrom(`${r.spring ? state.season + 1 : state.season}-${r.md}`) })),
    alive: participants,
    nextRound: 0,
  };
  state.cups.pohar = cup;
  drawCupRound(state, cup, rng, participants.slice(byes));
}

/** Los kola: domácí prostředí má klub z nižší soutěže, finále hraje první vylosovaný. */
function drawCupRound(state: GameState, cup: Cup, rng: Rng, pool: string[]): void {
  const round = cup.nextRound;
  const date = cup.rounds[round].date;
  const teams = [...pool];
  for (let i = teams.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [teams[i], teams[j]] = [teams[j], teams[i]];
  }
  const final = round === cup.rounds.length - 1;
  for (let i = 0; i + 1 < teams.length; i += 2) {
    let [home, away] = [teams[i], teams[i + 1]];
    if (!final && tierOf(state, away) > tierOf(state, home)) [home, away] = [away, home];
    cup.fixtures.push({ id: `pohar-${state.season}-${round}-${i / 2}`, round: round + 1, date, homeId: home, awayId: away });
  }
  cup.nextRound = round + 1;
  const ownFixture = cup.fixtures.find((f) => f.round === round + 1 && [f.homeId, f.awayId].includes(state.owner.clubId));
  if (ownFixture) {
    addNews(state, {
      kind: 'info',
      title: `Pohár, ${cup.rounds[round].name}: ${clubLabel(state, ownFixture.homeId)} – ${clubLabel(state, ownFixture.awayId)}`,
      text: `Hraje se ${date.split('-').reverse().join('. ')}.`,
    });
  }
}

function resolveCupRound(state: GameState, cup: Cup, rng: Rng): void {
  const round = cup.nextRound;
  const fixtures = cup.fixtures.filter((f) => f.round === round);
  if (!fixtures.length || !fixtures.every((f) => f.result) || cup.winner) return;
  const info = CUP_ROUNDS[round - 1];
  const losers = new Set<string>();
  for (const f of fixtures) {
    const winner = decideTie(rng, [f], f.homeId, f.awayId);
    const loser = winner === f.homeId ? f.awayId : f.homeId;
    losers.add(loser);
    book(state, winner, 'pohar', info.prize, `Pohár: postup přes ${clubLabel(state, loser)} (${info.name})`);
    if (round === CUP_ROUNDS.length) {
      cup.winner = winner;
      book(state, loser, 'pohar', CUP_FINALIST_PRIZE, 'Pohár: finalista');
      addNews(state, { kind: 'sezona', title: `Vítězem poháru je ${state.clubs[winner].name}`, fixtureId: f.id });
    }
    if ([winner, loser].includes(state.owner.clubId) && round < CUP_ROUNDS.length) {
      const r = f.result!;
      const pens = r.penalties ? ` (penalty ${r.penalties[0]}:${r.penalties[1]})` : '';
      addNews(state, {
        kind: winner === state.owner.clubId ? 'sezona' : 'varovani',
        title: winner === state.owner.clubId ? `Pohár: postup do dalšího kola${pens}` : `Pohár: vyřazení v kole ${info.name}${pens}`,
        fixtureId: f.id,
      });
    }
  }
  cup.alive = cup.alive.filter((id) => !losers.has(id));
  if (!cup.winner && round < cup.rounds.length) drawCupRound(state, cup, rng, cup.alive);
}

/** Po odehraných zápasech dne: vyhodnotit kola poháru a baráže. */
export function afterMatchday(state: GameState, rng: Rng): void {
  const cup = state.cups.pohar;
  if (cup && cup.fixtures.some((f) => f.date === state.date)) resolveCupRound(state, cup, rng);
  const playoff = state.cups.baraz;
  if (playoff && playoff.fixtures.some((f) => f.date === state.date)) resolvePlayoffs(state, playoff, rng);
  for (const c of Object.values(state.cups)) if (c.pool && c.fixtures.some((f) => f.date === state.date)) resolvePoolPlayoff(state, c, rng); // V4
}

export function allFixtures(state: GameState): { fixture: Fixture; name: string; tier: number; cup?: Cup; comp?: Competition }[] {
  const list: { fixture: Fixture; name: string; tier: number; cup?: Cup; comp?: Competition }[] = [];
  for (const comp of Object.values(state.competitions)) for (const f of comp.fixtures) list.push({ fixture: f, name: comp.name, tier: comp.tier, comp });
  for (const cup of Object.values(state.cups)) for (const f of cup.fixtures) list.push({ fixture: f, name: cup.name, tier: tierOf(state, f.homeId), cup });
  return list;
}
