import { addDays, dayOfWeek } from './calendar';
import { book } from './finance';
import { doubleRoundRobin } from './fixtures';
import type { Rng } from './rng';
import { computeTable, type TableRow } from './standings';
import type { Competition, Cup, Fixture, GameState } from './types';
import { addNews, clubLabel, tierOf } from './world';

// ---------- Nadstavba ----------
//
// W1 v0.29: herní model Chance Ligy (2026/27). Po 30 kolech základní části:
// - skupina o titul (1.–6.) a skupina o záchranu (11.–16.) hrají jednokolově 5 kol podle pevného rozpisu,
//   body ze základní části zůstávají;
// - 7.–10. hraje play-off o umístění (vyřazovací dvojzápasy, semifinále 10–7 a 9–8, pak finále);
//   vítěz je 7., poražený finalista 8., poražení semifinalisté 9. a 10. (9. ten výše po základní části).
// Termíny: víkendy v květnu. Starší uložené hry s dvoukolovou nadstavbou dohrají postaru.

/** Pevný rozpis skupiny o titul: čísla = místo po základní části, první je domácí. */
export const TITLE_GROUP_SCHEDULE: [number, number][][] = [
  [[2, 4], [3, 5], [6, 1]],
  [[4, 5], [3, 6], [1, 2]],
  [[5, 6], [1, 4], [2, 3]],
  [[5, 1], [6, 2], [3, 4]],
  [[1, 3], [2, 5], [4, 6]],
];
/** Pevný rozpis skupiny o záchranu (11.–16. po základní části). */
export const RELEGATION_GROUP_SCHEDULE: [number, number][][] = [
  [[16, 11], [12, 14], [13, 15]],
  [[11, 12], [13, 16], [14, 15]],
  [[11, 14], [12, 13], [15, 16]],
  [[15, 11], [16, 12], [13, 14]],
  [[11, 13], [12, 15], [14, 16]],
];
/** Klíč play-off o umístění v state.cups. */
export const PLACEMENT_CUP_ID = 'umisteni';
/** Odměny finalistům play-off o umístění. */
export const PLACEMENT_PRIZE = { winner: 3_000_000, finalist: 1_500_000 };
const PLACEMENT_ROUNDS = ['Semifinále, 1. zápas', 'Semifinále, odveta', 'Finále, 1. zápas', 'Finále, odveta'];

function saturdays(from: string, to: string): string[] {
  const out: string[] = [];
  let d = from;
  while (dayOfWeek(d) !== 6) d = addDays(d, 1);
  for (; d <= to; d = addDays(d, 7)) out.push(d);
  return out;
}

function spreadDates(slots: string[], count: number): string[] {
  if (count <= slots.length) return Array.from({ length: count }, (_, i) => slots[Math.floor((i * slots.length) / count)]);
  const extra = slots.slice(0, count - slots.length).map((s) => addDays(s, 4));
  return [...slots, ...extra].sort();
}

/** Termíny základní části soutěže s nadstavbou: podzim 17 kol, jaro do konce dubna (květen patří nadstavbě). */
export function nadstavbaBaseDates(season: number, rounds: number): string[] {
  const autumnCount = Math.min(rounds, Math.ceil(rounds / 2) + 2);
  const autumn = saturdays(`${season}-07-25`, `${season}-11-28`);
  const spring = saturdays(`${season + 1}-02-01`, `${season + 1}-04-26`);
  return [...spreadDates(autumn, autumnCount), ...spreadDates(spring, rounds - autumnCount)];
}

/** Pět termínů nadstavby: soboty 1.–30. 5. (když jsou v květnu jen čtyři, přidá se středa po první sobotě). */
export function nadstavbaDates(season: number): string[] {
  const sats = saturdays(`${season + 1}-05-01`, `${season + 1}-05-30`);
  if (sats.length < 5) sats.push(addDays(sats[0], 4));
  return sats.sort().slice(0, 5);
}

/** Je nadstavba podle pravidel v0.29 (play-off o umístění místo skupiny)? */
export function isPlacementFormat(comp: Competition): boolean {
  return !!comp.groups?.some((g) => g.playoff);
}

/** Play-off o umístění dané soutěže (pokud je rozlosované). */
export function placementCup(state: GameState | undefined, comp: Competition): Cup | undefined {
  const cup = state?.cups[PLACEMENT_CUP_ID];
  return cup?.placement?.compId === comp.id ? cup : undefined;
}

/** Pořadí 7.–10. podle play-off: vítěz, (rozehraní), poražený finalista, poražení semifinalisté; shoda = místo po základní části. */
function placementOrder(cup: Cup | undefined, seeds: string[]): string[] {
  if (!cup?.ties) return seeds;
  const final = cup.ties[2];
  const stage = (id: string): number => {
    if (final?.winner) return final.winner === id ? 0 : [final.upper, final.lower].includes(id) ? 2 : 3;
    if (final && [final.upper, final.lower].includes(id)) return 1;
    const semi = cup.ties!.slice(0, 2).find((t) => [t.upper, t.lower].includes(id));
    return semi?.winner && semi.winner !== id ? 3 : 1;
  };
  return [...seeds].sort((a, b) => stage(a) - stage(b) || seeds.indexOf(a) - seeds.indexOf(b));
}

/**
 * Konečné pořadí. Při nadstavbě nejdřív skupina o titul, pak 7.–10. (play-off podle výsledku,
 * u starších her skupina o umístění), pak skupina o záchranu (body se sčítají).
 */
export function finalStandings(comp: Competition, state?: GameState): TableRow[] {
  const table = computeTable(comp, state);
  if (!comp.groups) return table;
  return comp.groups.flatMap((g) => {
    if (!g.playoff) return table.filter((r) => g.clubIds.includes(r.clubId));
    const cup = placementCup(state, comp);
    const order = placementOrder(cup, cup?.placement?.seeds ?? g.clubIds);
    return order.map((id) => table.find((r) => r.clubId === id)!).filter(Boolean);
  });
}

/** Odhad zápasů a domácích zápasů v nadstavbě podle místa (rozpočet). */
export function nadstavbaShare(position: number, size: number): { matches: number; home: number } {
  if (size !== 16) return { matches: 5, home: 3 };
  if (position <= 3 || (position >= 11 && position <= 13)) return { matches: 5, home: 3 };
  if (position <= 6 || position >= 14) return { matches: 5, home: 2 };
  // Play-off: dvojzápas semifinále a s poloviční šancí finále.
  return { matches: 3, home: position <= 8 ? 2 : 1 };
}

function scheduleGroup(state: GameState, comp: Competition, ids: string[], schedule: [number, number][][], offset: number, base: number, dates: string[], next: () => number): void {
  schedule.forEach((round, r) => {
    for (const [h, a] of round) {
      comp.fixtures.push({
        id: `${comp.id}-${state.season}-n${next()}`,
        round: base + r + 1,
        date: dates[r] ?? addDays(dates[dates.length - 1], 7 * (r - dates.length + 1)),
        homeId: ids[h - 1 - offset],
        awayId: ids[a - 1 - offset],
      });
    }
  });
}

/** Základní část odehrána: soutěž se rozdělí do skupin a rozlosuje se nadstavba. */
export function startGroups(state: GameState, comp: Competition, rng: Rng): void {
  const ids = computeTable(comp, state).map((r) => r.clubId);
  const n = ids.length;
  if (n < 12 || !comp.reservedDates?.length) return;
  const base = Math.max(...comp.fixtures.map((f) => f.round));
  let i = 0;
  const next = () => i++;
  if (n === 16) {
    const dates = comp.reservedDates;
    comp.groups = [
      { name: 'Skupina o titul', clubIds: ids.slice(0, 6) },
      { name: 'Play-off o umístění', clubIds: ids.slice(6, 10), playoff: true },
      { name: 'Skupina o záchranu', clubIds: ids.slice(10) },
    ];
    scheduleGroup(state, comp, ids.slice(0, 6), TITLE_GROUP_SCHEDULE, 0, base, dates, next);
    scheduleGroup(state, comp, ids.slice(10), RELEGATION_GROUP_SCHEDULE, 10, base, dates, next);
    startPlacementPlayoff(state, comp, ids.slice(6, 10), dates);
  } else {
    // Jiná velikost soutěže: starší model (dvoukolové skupiny).
    comp.groups = [
      { name: 'Skupina o titul', clubIds: ids.slice(0, 6) },
      ...(n > 12 ? [{ name: 'Skupina o umístění', clubIds: ids.slice(6, n - 6) }] : []),
      { name: 'Skupina o záchranu', clubIds: ids.slice(n - 6) },
    ];
    for (const group of comp.groups) {
      for (const p of doubleRoundRobin(group.clubIds, rng)) {
        comp.fixtures.push({ id: `${comp.id}-${state.season}-n${next()}`, round: base + p.round, date: comp.reservedDates[p.round - 1], homeId: p.homeId, awayId: p.awayId });
      }
    }
  }
  const own = comp.groups.find((g) => g.clubIds.includes(state.owner.clubId));
  addNews(state, {
    kind: 'sezona',
    title: `${comp.name}: začíná nadstavba`,
    text: own
      ? own.playoff
        ? 'Váš klub hraje play-off o umístění (7.–10. místo): semifinále na dva zápasy, pak finále. Vítěz získá volný los do 2. kola poháru a odměnu.'
        : `Váš klub hraje ve skupině „${own.name}“. ${n === 16 ? 'Hraje se jednokolově, 5 kol. ' : ''}Body ze základní části se započítávají.`
      : undefined,
  });
}

function placementLegs(state: GameState, cup: Cup, upper: string, lower: string, round: number): void {
  // 1. zápas doma hůře umístěný po základní části, odveta doma lépe umístěný.
  cup.fixtures.push({ id: `${PLACEMENT_CUP_ID}-${state.season}-${round}-${cup.fixtures.length}`, round, date: cup.rounds[round - 1].date, homeId: lower, awayId: upper });
  cup.fixtures.push({ id: `${PLACEMENT_CUP_ID}-${state.season}-${round + 1}-${cup.fixtures.length}`, round: round + 1, date: cup.rounds[round].date, homeId: upper, awayId: lower });
}

/** Play-off o umístění: semifinále 10–7 a 9–8 (odvety 7–10 a 8–9). */
function startPlacementPlayoff(state: GameState, comp: Competition, seeds: string[], dates: string[]): void {
  const day = (k: number) => dates[k] ?? addDays(dates[dates.length - 1], 7 * (k - dates.length + 1));
  const cup: Cup = {
    id: PLACEMENT_CUP_ID,
    name: `Play-off o umístění: ${comp.name}`,
    kind: 'umisteni',
    fixtures: [],
    rounds: PLACEMENT_ROUNDS.map((name, k) => ({ name, date: day(k) })),
    alive: [...seeds],
    nextRound: 2,
    ties: [
      { upper: seeds[0], lower: seeds[3] },
      { upper: seeds[1], lower: seeds[2] },
    ],
    placement: { compId: comp.id, seeds: [...seeds] },
  };
  for (const t of cup.ties!) placementLegs(state, cup, t.upper, t.lower, 1);
  state.cups[PLACEMENT_CUP_ID] = cup;
}

function resolvePlacement(state: GameState, cup: Cup, rng: Rng): void {
  const ties = cup.ties ?? [];
  const seeds = cup.placement?.seeds ?? [];
  const legsOf = (t: { upper: string; lower: string }) => cup.fixtures.filter((f) => [f.homeId, f.awayId].includes(t.upper) && [f.homeId, f.awayId].includes(t.lower));
  const own = state.owner.clubId;
  for (const t of ties) {
    const legs = legsOf(t);
    if (t.winner || legs.length < 2 || !legs.every((f) => f.result)) continue;
    t.winner = decideTie(rng, legs, t.upper, t.lower);
    const loser = t.winner === t.upper ? t.lower : t.upper;
    cup.alive = cup.alive.filter((id) => id !== loser);
    const final = ties.indexOf(t) === 2;
    if (final) {
      cup.winner = t.winner;
      book(state, t.winner, 'tv', PLACEMENT_PRIZE.winner, 'Play-off o umístění: vítěz (7. místo)');
      book(state, loser, 'tv', PLACEMENT_PRIZE.finalist, 'Play-off o umístění: finalista (8. místo)');
      state.cupBye = { season: state.season + 1, clubId: t.winner };
      const mine = [t.winner, loser].includes(own);
      addNews(state, {
        kind: mine ? 'sezona' : 'info',
        title: t.winner === own ? 'Play-off o umístění vyhráno: 7. místo!' : `Play-off o umístění: vyhrál ${clubLabel(state, t.winner)}`,
        text: `${clubLabel(state, t.winner)} končí 7., ${clubLabel(state, loser)} 8. Vítěz dostane ${(PLACEMENT_PRIZE.winner / 1e6).toLocaleString('cs-CZ')} mil. Kč a v příští sezóně volný los do 2. kola poháru, finalista ${(PLACEMENT_PRIZE.finalist / 1e6).toLocaleString('cs-CZ')} mil. Kč.`,
      });
    } else if ([t.upper, t.lower].includes(own)) {
      addNews(state, {
        kind: t.winner === own ? 'sezona' : 'info',
        title: t.winner === own ? 'Play-off o umístění: postup do finále' : 'Play-off o umístění: konec v semifinále',
        text: t.winner === own ? 'Ve finále hrajete o 7. místo, volný los v poháru a odměnu.' : 'Sezónu končíte na 9. nebo 10. místě: z poražených semifinalistů je 9. ten, kdo byl po základní části výš.',
      });
    }
  }
  if (ties.length === 2 && ties.every((t) => t.winner)) {
    // Finále: 1. zápas doma hůře umístěný po základní části.
    const [a, b] = ties.map((t) => t.winner!).sort((x, y) => seeds.indexOf(x) - seeds.indexOf(y));
    const fin = { upper: a, lower: b };
    ties.push(fin);
    placementLegs(state, cup, a, b, 3);
    cup.nextRound = 4;
    if ([a, b].includes(own)) {
      const opp = a === own ? b : a;
      addNews(state, { kind: 'info', title: `Finále play-off o umístění: ${clubLabel(state, b)} – ${clubLabel(state, a)}`, text: `Soupeř: ${clubLabel(state, opp)}. 1. zápas ${cup.rounds[2].date.split('-').slice(1).reverse().map(Number).join('. ')}., odveta ${cup.rounds[3].date.split('-').slice(1).reverse().map(Number).join('. ')}.` });
    }
  }
}

/**
 * W1 v0.29: odhad konečného pořadí v jedné simulaci zbytku sezóny (výhled šancí). Body `pts` už obsahují
 * nasimulované zbývající zápasy soutěže; nadstavba, která ještě není rozlosovaná, a play-off o umístění se dosimulují.
 */
export function projectedOrder(state: GameState, comp: Competition, pts: Map<string, number>, gd: Map<string, number>, strength: Map<string, number>, rng: Rng): string[] {
  const byPts = (ids: string[]) => [...ids].sort((a, b) => pts.get(b)! - pts.get(a)! || gd.get(b)! - gd.get(a)! || rng.next() - 0.5);
  const str = (id: string) => strength.get(id) ?? 50;
  const tie = (upper: string, lower: string) => (rng.next() < 1 / (1 + Math.exp(-(str(upper) - str(lower) + 1.5) * 0.14)) ? upper : lower);
  const playoff = (seeds: string[], cup?: Cup): string[] => {
    const ties = cup?.ties ?? [];
    const semis = [0, 1].map((i) => ties[i]?.winner ?? tie(seeds[i], seeds[3 - i]));
    const [a, b] = [...semis].sort((x, y) => seeds.indexOf(x) - seeds.indexOf(y));
    const champ = ties[2]?.winner ?? tie(a, b);
    const losers = seeds.filter((id) => !semis.includes(id));
    return [champ, champ === a ? b : a, ...losers];
  };
  const n = comp.clubIds.length;
  if (comp.format !== 'nadstavba' || n < 12) return byPts(comp.clubIds);
  if (!comp.groups) {
    if (!comp.reservedDates?.length) return byPts(comp.clubIds);
    const ids = byPts(comp.clubIds);
    if (n !== 16) return ids;
    const sim = (schedule: [number, number][][]) => {
      for (const round of schedule) {
        for (const [h, a] of round) {
          const home = ids[h - 1];
          const away = ids[a - 1];
          const d = (str(home) - str(away) + 4) * 0.11;
          const ph = 0.74 / (1 + Math.exp(-d));
          const x = rng.next();
          if (x < ph) pts.set(home, pts.get(home)! + 3);
          else if (x < ph + 0.26) {
            pts.set(home, pts.get(home)! + 1);
            pts.set(away, pts.get(away)! + 1);
          } else pts.set(away, pts.get(away)! + 3);
        }
      }
    };
    sim(TITLE_GROUP_SCHEDULE);
    sim(RELEGATION_GROUP_SCHEDULE);
    return [...byPts(ids.slice(0, 6)), ...playoff(ids.slice(6, 10)), ...byPts(ids.slice(10))];
  }
  return comp.groups.flatMap((g) => {
    if (!g.playoff) return byPts(g.clubIds);
    const cup = placementCup(state, comp);
    return playoff(cup?.placement?.seeds ?? g.clubIds, cup);
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
  // W1 v0.29: vítěz play-off o umístění má volný los do 2. kola.
  const bye = state.cupBye?.season === state.season ? state.cupBye.clubId : undefined;
  if (bye && participants.includes(bye) && byes > 0) {
    const had = participants.indexOf(bye) < byes;
    participants.splice(participants.indexOf(bye), 1);
    participants.unshift(bye);
    if (bye === state.owner.clubId) addNews(state, { kind: 'info', title: 'Pohár: volný los do 2. kola', text: had ? 'Za vítězství v play-off o umístění máte volný los (ten byste měli i podle pověsti).' : 'Za vítězství v play-off o umístění nehrajete 1. kolo poháru.' });
  }
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
  const placement = state.cups[PLACEMENT_CUP_ID];
  if (placement?.kind === 'umisteni' && placement.fixtures.some((f) => f.date === state.date)) resolvePlacement(state, placement, rng); // W1 v0.29
}

export function allFixtures(state: GameState): { fixture: Fixture; name: string; tier: number; cup?: Cup; comp?: Competition }[] {
  const list: { fixture: Fixture; name: string; tier: number; cup?: Cup; comp?: Competition }[] = [];
  for (const comp of Object.values(state.competitions)) for (const f of comp.fixtures) list.push({ fixture: f, name: comp.name, tier: comp.tier, comp });
  for (const cup of Object.values(state.cups)) for (const f of cup.fixtures) list.push({ fixture: f, name: cup.name, tier: tierOf(state, f.homeId), cup });
  return list;
}
