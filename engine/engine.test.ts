import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { roundDates } from './calendar';
import { doubleRoundRobin } from './fixtures';
import { advanceWeek, injectCapital, newGame, updatePolicy } from './game';
import { competitionOf } from './world';
import { simulateMatch } from './match';
import { validatePack } from './pack';
import { generateSquad } from './players';
import { createRng } from './rng';
import { computeTable } from './standings';
import type { DataPack, GameState } from './types';

const czPack = pack as DataPack;

function playSeasons(state: GameState, weeks: number): GameState {
  let s = state;
  for (let i = 0; i < weeks; i++) s = advanceWeek(s);
  return s;
}

describe('datový balíček', () => {
  it('je platný', () => {
    expect(validatePack(czPack)).toEqual([]);
  });
});

describe('rozpis zápasů', () => {
  it.each([16, 17, 18])('každý s každým dvakrát (%i týmů)', (n) => {
    const ids = Array.from({ length: n }, (_, i) => `t${i}`);
    const pairings = doubleRoundRobin(ids, createRng(1));
    expect(pairings).toHaveLength(n * (n - 1));
    const seen = new Set(pairings.map((p) => `${p.homeId}-${p.awayId}`));
    expect(seen.size).toBe(n * (n - 1));
    // Nikdo nehraje v jednom kole dvakrát.
    for (const round of new Set(pairings.map((p) => p.round))) {
      const teams = pairings.filter((p) => p.round === round).flatMap((p) => [p.homeId, p.awayId]);
      expect(new Set(teams).size).toBe(teams.length);
    }
  });

  it.each([16, 18])('domácí a venkovní zápasy se střídají (%i týmů)', (n) => {
    const ids = Array.from({ length: n }, (_, i) => `t${i}`);
    const pairings = doubleRoundRobin(ids, createRng(3)).sort((a, b) => a.round - b.round);
    for (const id of ids) {
      const venues = pairings.filter((p) => p.homeId === id || p.awayId === id).map((p) => (p.homeId === id ? 'H' : 'A'));
      const longest = Math.max(...venues.join('').split(/(?<=H)(?=A)|(?<=A)(?=H)/).map((s) => s.length));
      expect(longest).toBeLessThanOrEqual(3);
      const homes = venues.filter((v) => v === 'H').length;
      expect(homes).toBe(n - 1);
    }
  });

  it('termíny kol jsou seřazené a v sezóně', () => {
    for (const rounds of [30, 34, 32]) {
      const dates = roundDates(2026, rounds);
      expect(dates).toHaveLength(rounds);
      expect([...dates].sort()).toEqual(dates);
      expect(dates[0] >= '2026-07-25').toBe(true);
      expect(dates[rounds - 1] <= '2027-06-10').toBe(true);
    }
  });
});

describe('simulace zápasu', () => {
  it('je opakovatelná se stejným seedem', () => {
    const make = () => {
      const counter = { nextId: 0 };
      const rng = createRng(42);
      const home = generateSquad(rng, counter, 'a', 2026, 60);
      const away = generateSquad(rng, counter, 'b', 2026, 55);
      return simulateMatch(rng, { id: 'a', players: home }, { id: 'b', players: away }, 1000);
    };
    expect(make()).toEqual(make());
  });

  it('silnější tým dlouhodobě vyhrává častěji', () => {
    const rng = createRng(7);
    const counter = { nextId: 0 };
    const strong = generateSquad(rng, counter, 'a', 2026, 70);
    const weak = generateSquad(rng, counter, 'b', 2026, 50);
    let wins = 0;
    let losses = 0;
    for (let i = 0; i < 400; i++) {
      // Mezi zápasy hráči regenerují a vyléčí se (v sezóně se o to stará kalendář).
      for (const p of [...strong, ...weak]) Object.assign(p, { fitness: 100, injuredUntil: undefined, suspension: 0 });
      const r = simulateMatch(rng, { id: 'a', players: strong }, { id: 'b', players: weak }, 0);
      if (r.homeGoals > r.awayGoals) wins++;
      if (r.homeGoals < r.awayGoals) losses++;
    }
    expect(wins).toBeGreaterThan(losses * 3);
  });
});

describe('průběh hry', () => {
  const start = newGame(czPack, { clubId: 'bohemians', ownerName: 'Test', difficulty: 'stredni', seed: 123 });

  it('založí svět a rozlosuje sezónu', () => {
    expect(Object.keys(start.clubs)).toHaveLength(czPack.clubs.length);
    expect(start.competitions.cz1.fixtures).toHaveLength(16 * 15);
    expect(start.competitions.cz3c.fixtures).toHaveLength(18 * 17);
  });

  it('je deterministický', () => {
    const a = playSeasons(start, 10);
    const b = playSeasons(start, 10);
    expect(a.competitions.cz1.fixtures).toEqual(b.competitions.cz1.fixtures);
  });

  it('odehraje dvě celé sezóny včetně postupů a sestupů', () => {
    const afterOne = playSeasons(start, 53);
    expect(afterOne.season).toBe(2027);
    expect(afterOne.history).toHaveLength(1);

    // Všechny zápasy minulé sezóny se odehrály (nová sezóna je čerstvě rozlosovaná).
    for (const comp of Object.values(afterOne.competitions)) {
      expect(comp.fixtures.every((f) => !f.result)).toBe(true);
    }
    expect(afterOne.competitions.cz1.clubIds).toHaveLength(16);
    expect(afterOne.competitions.cz2.clubIds).toHaveLength(16);
    expect(afterOne.competitions.cz3c.clubIds).toHaveLength(18);
    expect(afterOne.competitions.cz3m.clubIds).toHaveLength(16);

    // B-týmy nehrají nejvyšší soutěž ani soutěž s mateřským klubem.
    for (const comp of Object.values(afterOne.competitions)) {
      for (const id of comp.clubIds) {
        const parent = afterOne.clubs[id].reserveOf;
        if (!parent) continue;
        expect(comp.tier).toBeGreaterThan(1);
        expect(comp.clubIds).not.toContain(parent);
      }
    }
    // Každý klub hraje právě jednu soutěž.
    const all = Object.values(afterOne.competitions).flatMap((c) => c.clubIds);
    expect(new Set(all).size).toBe(all.length);

    const afterTwo = playSeasons(afterOne, 53);
    expect(afterTwo.season).toBe(2028);
    expect(afterTwo.history).toHaveLength(2);
    expect(competitionOf(afterTwo, 'bohemians')).toBeDefined();
    for (const club of Object.values(afterTwo.clubs)) expect(Number.isFinite(club.finance.balance)).toBe(true);
  });

  it('tabulka po odehrané sezóně sedí', () => {
    const almostDone = playSeasons(start, 49); // těsně před koncem sezóny (20. 6.)
    const table = computeTable(almostDone.competitions.cz1, almostDone);
    expect(table.every((r) => r.played === 30)).toBe(true);
    const totalPoints = table.reduce((s, r) => s + r.points, 0);
    const draws = table.reduce((s, r) => s + r.drawn, 0) / 2;
    expect(totalPoints).toBe(240 * 3 - draws);
  });

  it('vklad majitele přesune peníze do klubu', () => {
    const before = start.clubs.bohemians.finance.balance;
    const after = injectCapital(start, 10_000_000);
    expect(after.clubs.bohemians.finance.balance).toBe(before + 10_000_000);
    expect(after.owner.wallet).toBe(start.owner.wallet - 10_000_000);
    expect(injectCapital(start, start.owner.wallet + 1)).toBe(start);
  });

  it('bez peněz klub zkrachuje', () => {
    let s = updatePolicy(start, { wageMultiplier: 1.5, ticketPrice: 5000 });
    s = { ...s, clubs: { ...s.clubs, bohemians: { ...s.clubs.bohemians, finance: { ...s.clubs.bohemians.finance, balance: -50_000_000 } } } };
    s = playSeasons(s, 20);
    expect(s.gameOver).toBeDefined();
  });
});
