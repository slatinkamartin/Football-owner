import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import {
  finalStandings,
  nadstavbaBaseDates,
  nadstavbaDates,
  nadstavbaShare,
  PLACEMENT_CUP_ID,
  PLACEMENT_PRIZE,
  RELEGATION_GROUP_SCHEDULE,
  TITLE_GROUP_SCHEDULE,
} from './competitions';
import { CZ_ASSOCIATION_RANK, europeAllocation, europeRun, pathChances, qualifyEurope, qualifyingNext, startEurope } from './europe';
import { advanceDays, migrateSave, newGame } from './game';
import { seasonOutlook } from './league';
import { daysUntil } from './milestones';
import { createRng } from './rng';
import { computeTable } from './standings';
import type { DataPack, GameState } from './types';

const start = newGame(pack as DataPack, { clubId: 'bohemians', ownerName: 'T', difficulty: 'stredni', seed: 5 });
const to = (s: GameState, date: string) => advanceDays(s, daysUntil(s, date)).state;
// Jedna odehraná sezóna (těsně před uzávěrkou 20. 6.) pro více testů.
const done = to(start, `${start.season + 1}-06-19`);

describe('v0.29: nadstavba podle herního modelu Chance Ligy', () => {
  it('termíny: základní část do konce dubna, nadstavba o květnových víkendech', () => {
    const base = nadstavbaBaseDates(2026, 30);
    expect(base).toHaveLength(30);
    expect(base[base.length - 1] <= '2027-04-30').toBe(true);
    expect(nadstavbaDates(2026)).toEqual(['2027-05-01', '2027-05-08', '2027-05-15', '2027-05-22', '2027-05-29']);
    // Květen 2028 má jen čtyři soboty: přidá se středa, pořád v květnu.
    const d28 = nadstavbaDates(2027);
    expect(d28).toHaveLength(5);
    expect(d28.every((d) => d >= '2028-05-01' && d <= '2028-05-30')).toBe(true);
    expect(start.competitions.cz1.reservedDates).toEqual(nadstavbaDates(start.season));
  });

  it('skupiny o titul a o záchranu hrají jednokolově podle pevného rozpisu', () => {
    const comp = done.competitions.cz1;
    expect(comp.groups?.map((g) => g.clubIds.length)).toEqual([6, 4, 6]);
    expect(comp.groups![1].playoff).toBe(true);
    const seeds = [...comp.groups![0].clubIds, ...comp.groups![1].clubIds, ...comp.groups![2].clubIds]; // pořadí po základní části
    const group = comp.fixtures.filter((f) => f.id.includes('-n'));
    expect(group).toHaveLength(30);
    expect(group.every((f) => f.date >= `${done.season + 1}-05-01` && f.date <= `${done.season + 1}-05-30`)).toBe(true);
    const base = Math.min(...group.map((f) => f.round));
    for (const [schedule] of [[TITLE_GROUP_SCHEDULE], [RELEGATION_GROUP_SCHEDULE]] as const) {
      schedule.forEach((round, r) => {
        for (const [h, a] of round) {
          const f = group.find((x) => x.homeId === seeds[h - 1] && x.awayId === seeds[a - 1]);
          expect(f, `${r + 1}. kolo ${h}–${a}`).toBeDefined();
          expect(f!.round).toBe(base + r);
          expect(f!.date).toBe(comp.reservedDates![r]);
        }
      });
    }
    // Domácí zápasy: 1.–3. tři, 4.–6. dva, 11.–13. tři, 14.–16. dva.
    const homes = (pos: number) => group.filter((f) => f.homeId === seeds[pos - 1]).length;
    expect([1, 2, 3, 4, 5, 6].map(homes)).toEqual([3, 3, 3, 2, 2, 2]);
    expect([11, 12, 13, 14, 15, 16].map(homes)).toEqual([3, 3, 3, 2, 2, 2]);
    expect([1, 4, 7, 9, 11, 16].map((p) => nadstavbaShare(p, 16).home)).toEqual([3, 2, 2, 1, 3, 2]);
    // Body se sčítají: 35 zápasů ve skupinách, 30 v play-off.
    const table = computeTable(comp, done);
    for (const r of table) expect(r.played).toBe(comp.groups![1].clubIds.includes(r.clubId) ? 30 : 35);
  });

  it('play-off o umístění: semifinále 10–7 a 9–8, finále, konečné pořadí 7.–10. a odměny', () => {
    const comp = done.competitions.cz1;
    const cup = done.cups[PLACEMENT_CUP_ID];
    expect(cup?.kind).toBe('umisteni');
    const seeds = cup.placement!.seeds;
    expect(seeds).toEqual(comp.groups![1].clubIds);
    const semi1 = cup.fixtures.filter((f) => f.round === 1);
    expect(semi1.map((f) => [f.homeId, f.awayId])).toEqual([[seeds[3], seeds[0]], [seeds[2], seeds[1]]]);
    const semi2 = cup.fixtures.filter((f) => f.round === 2);
    expect(semi2.map((f) => [f.homeId, f.awayId])).toEqual([[seeds[0], seeds[3]], [seeds[1], seeds[2]]]);
    const ties = cup.ties!;
    expect(ties).toHaveLength(3);
    expect(ties.every((t) => t.winner)).toBe(true);
    const final = ties[2];
    // Finále: 1. zápas doma hůře umístěný po základní části.
    expect(seeds.indexOf(final.upper)).toBeLessThan(seeds.indexOf(final.lower));
    const f1 = cup.fixtures.find((f) => f.round === 3)!;
    expect(f1.homeId).toBe(final.lower);
    expect(cup.fixtures.find((f) => f.round === 4)!.homeId).toBe(final.upper);
    expect(cup.fixtures.every((f) => f.result)).toBe(true);
    // Konečné pořadí.
    const order = finalStandings(comp, done).map((r) => r.clubId);
    expect(order.slice(0, 6).sort()).toEqual([...comp.groups![0].clubIds].sort());
    expect(order[6]).toBe(final.winner);
    expect(order[7]).toBe(final.winner === final.upper ? final.lower : final.upper);
    const losers = seeds.filter((id) => ![final.upper, final.lower].includes(id));
    expect(order.slice(8, 10)).toEqual(losers);
    expect(order.slice(10).sort()).toEqual([...comp.groups![2].clubIds].sort());
    // Odměny a volný los v poháru příští sezóny.
    expect(done.news.some((n) => n.title.startsWith('Play-off o umístění'))).toBe(true);
    // Klub majitele (pokud byl ve finále) má odměnu v účetnictví.
    const own = done.owner.clubId;
    if ([final.upper, final.lower].includes(own)) {
      const prize = final.winner === own ? PLACEMENT_PRIZE.winner : PLACEMENT_PRIZE.finalist;
      expect(done.clubs[own].finance.transactions.some((t) => t.amount === prize && t.note.includes('Play-off o umístění'))).toBe(true);
    }
    expect(done.cupBye).toEqual({ season: done.season + 1, clubId: final.winner });
  });

  it('nová sezóna: play-off se smaže a vítěz má v poháru volný los', () => {
    const next = to(done, `${done.season + 1}-07-02`);
    expect(next.cups[PLACEMENT_CUP_ID]).toBeUndefined();
    const winner = done.cupBye!.clubId;
    const first = next.cups.pohar.fixtures.filter((f) => f.round === 1);
    if (next.cups.pohar.alive.includes(winner) && first.length < 32) expect(first.some((f) => f.homeId === winner || f.awayId === winner)).toBe(false);
  });

  it('výhled sezóny během nadstavby drží skupiny (z 11.–16. nikdo nemá titul ani Evropu)', () => {
    const mid = to(start, `${start.season + 1}-05-10`);
    const comp = mid.competitions.cz1;
    expect(comp.groups).toBeDefined();
    const out = new Map(seasonOutlook(mid, comp, 120).map((o) => [o.clubId, o]));
    for (const id of comp.groups![2].clubIds) {
      expect(out.get(id)!.title).toBe(0);
      expect(out.get(id)!.europe).toBe(0);
    }
    for (const id of comp.groups![1].clubIds) expect(out.get(id)!.avgPosition).toBeGreaterThanOrEqual(7);
  });

  it('starší uložená hra s dvoukolovou nadstavbou (bez play-off) dohraje postaru', () => {
    const old: GameState = structuredClone(done);
    const comp = old.competitions.cz1;
    delete old.cups[PLACEMENT_CUP_ID];
    comp.groups = comp.groups!.map((g) => ({ name: g.playoff ? 'Skupina o umístění' : g.name, clubIds: g.clubIds }));
    const order = finalStandings(comp, old).map((r) => r.clubId);
    expect(order.slice(6, 10).sort()).toEqual([...comp.groups[1].clubIds].sort());
    // Uložená hra bez nových polí (cupBye, stage, playoff) se načte.
    delete old.cupBye;
    for (const e of old.europe?.entries ?? []) delete e.stage;
    const loaded = migrateSave(JSON.parse(JSON.stringify(old)));
    expect(loaded).not.toBeNull();
    const after = to(loaded!, `${old.season + 1}-07-03`);
    expect(after.season).toBe(old.season + 1);
    expect(after.cups.pohar).toBeDefined();
  });
});

describe('v0.29: evropská místa podle přístupového seznamu UEFA', () => {
  const ids = Array.from({ length: 16 }, (_, i) => `k${i + 1}`);
  const label = (x: ReturnType<typeof europeAllocation>) => x.map((e) => `${e.clubId}:${e.slot.comp}-${e.slot.stage}`);

  it('Česko na 10. místě: mistr LM ligová fáze, 2. LM 2. předkolo, 3. EL 2. předkolo, 4. KL 2. předkolo, vítěz poháru EL play-off', () => {
    expect(CZ_ASSOCIATION_RANK).toBe(10);
    expect(label(europeAllocation(ids, 'k9'))).toEqual(['k1:LM-liga', 'k2:LM-Q2', 'k3:EL-Q2', 'k4:KL-Q2', 'k9:EL-PO']);
    expect(label(europeAllocation(ids, 'x-druha-liga'))).toContain('x-druha-liga:EL-PO');
  });

  it('vítěz poháru s místem z ligy: vstupy se posunou nahoru', () => {
    const shifted = ['k1:LM-liga', 'k2:LM-Q2', 'k3:EL-PO', 'k4:EL-Q2', 'k5:KL-Q2'];
    for (const w of ['k1', 'k2', 'k3', 'k4']) expect(label(europeAllocation(ids, w))).toEqual(shifted);
    expect(label(europeAllocation(ids))).toEqual(['k1:LM-liga', 'k2:LM-Q2', 'k3:EL-Q2', 'k4:KL-Q2']);
  });

  it('qualifyEurope zapíše vstupní fázi a padáky vedou LM → EL → KL', () => {
    const s: GameState = structuredClone(start);
    const table = finalStandings(s.competitions.cz1, s);
    qualifyEurope(s, table, table[10].clubId);
    expect(s.europe!.entries.map((e) => e.stage)).toEqual(['liga', 'Q2', 'Q2', 'Q2', 'PO']);
    expect(qualifyingNext('LM', 0, false)).toEqual({ comp: 'EL', slot: 1 });
    expect(qualifyingNext('LM', 2, false)).toEqual({ league: 'EL' });
    expect(qualifyingNext('EL', 2, true)).toEqual({ league: 'EL' });
    expect(qualifyingNext('KL', 1, false)).toBeUndefined();
    expect(pathChances(60, 'LM', 'liga')).toEqual({ LM: 1 });
    const p = pathChances(68, 'LM', 'Q2');
    const total = (p.LM ?? 0) + (p.EL ?? 0) + (p.KL ?? 0);
    expect(total).toBeGreaterThan(0.5);
    expect(total).toBeLessThanOrEqual(1 + 1e-9);
    expect(pathChances(75, 'LM', 'Q2').LM!).toBeGreaterThan(pathChances(65, 'LM', 'Q2').LM!);
  });

  it('starší uložená hra: vstup bez fáze hraje jeden dvojzápas o ligovou fázi postaru', () => {
    const s: GameState = structuredClone(start);
    const own = s.europe!.entries.find((e) => e.clubId === 'slavia')!;
    s.owner.clubId = 'slavia';
    delete own.stage;
    delete s.europe!.run;
    startEurope(s, createRng(4));
    const run = europeRun(s)!;
    expect(run.slot).toBeUndefined();
    expect(run.matches).toHaveLength(2);
    expect(run.matches[0].stage.startsWith('Play-off')).toBe(true);
  });
});

describe('B-tým a mateřský klub po postupech a sestupech', () => {
  const parentTier = Object.values(start.competitions).find((x) => x.clubIds.includes('pribram'))!.tier;
  const groups = Object.values(start.competitions).filter((c) => c.tier === parentTier + 1 && (!c.region || c.region === start.clubs.pribram.region)).map((c) => c.id);
  it('test má co zkoumat', () => expect(groups.length).toBeGreaterThan(0));
  it.each(groups)('B-tým nikdy neskončí ve stejné soutěži jako mateřský klub (B-tým ve skupině %s, mateřský klub sestupuje)', (gid) => {
    const s: GameState = structuredClone(start);
    const parentComp = Object.values(s.competitions).find((c) => c.clubIds.includes('pribram'))!;
    // B-tým přesunout do zkoumané skupiny (výměnou s jiným klubem).
    const from = Object.values(s.competitions).find((c) => c.clubIds.includes('pribramb'))!;
    const target = s.competitions[gid];
    if (from !== target) {
      const other = target.clubIds.find((id) => !s.clubs[id].reserveOf && id !== s.owner.clubId)!;
      from.clubIds = from.clubIds.map((id) => (id === 'pribramb' ? other : id));
      target.clubIds = target.clubIds.map((id) => (id === other ? 'pribramb' : id));
      for (const f of [...from.fixtures, ...target.fixtures]) {
        const map = (id: string) => (id === 'pribramb' ? other : id === other ? 'pribramb' : id);
        f.homeId = map(f.homeId);
        f.awayId = map(f.awayId);
      }
    }
    expect(target.tier).toBe(parentComp.tier + 1);
    // Rychlá „sezóna“: všechny zápasy remízy, Příbram všechno prohraje (sestoupí), B-tým všechno vyhraje (chtěl by postoupit).
    for (const c of Object.values(s.competitions)) {
      for (const f of c.fixtures) {
        const g = f.homeId === 'pribram' || f.awayId === 'pribramb' ? [0, 3] : f.awayId === 'pribram' || f.homeId === 'pribramb' ? [3, 0] : [1, 1];
        f.result = { homeGoals: g[0], awayGoals: g[1], attendance: 1000, scorers: [] };
      }
    }
    s.date = `${s.season + 1}-06-19`;
    const after = advanceDays(s, 1).state;
    for (const comp of Object.values(after.competitions)) {
      for (const id of comp.clubIds) {
        const parent = after.clubs[id].reserveOf;
        if (parent) expect(comp.clubIds, `${id} v ${comp.id}`).not.toContain(parent);
      }
    }
    const all = Object.values(after.competitions).flatMap((c) => c.clubIds);
    expect(new Set(all).size).toBe(all.length);
    expect(Object.values(after.competitions).find((c) => c.clubIds.includes('pribram'))!.tier).toBe(parentComp.tier + 1);
  });
});
