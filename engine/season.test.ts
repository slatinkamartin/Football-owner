import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { finalStandings } from './competitions';
import { balanceSheet, monthlyAmortization, profitAndLoss } from './finance';
import { advanceToNextMatch, advanceWeek, newGame } from './game';
import { squadOf } from './players';
import { acceptOffer, executeTransfer } from './transfers';
import type { DataPack, GameState } from './types';

const czPack = pack as DataPack;
const weeks = (s: GameState, n: number) => {
  for (let i = 0; i < n; i++) s = advanceWeek(s);
  return s;
};

describe('soutěže', () => {
  const start = newGame(czPack, { clubId: 'bohemians', ownerName: 'Test', difficulty: 'stredni', seed: 31 });
  const endOfSeason = weeks(start, 51); // 23. 6., po baráži a před novou sezónou

  it('pohár má vítěze a hraje se v úterý', () => {
    const cup = endOfSeason.cups.pohar;
    expect(cup.winner).toBeDefined();
    expect(cup.fixtures.every((f) => new Date(`${f.date}T00:00:00Z`).getUTCDay() === 2)).toBe(true);
    expect(cup.fixtures.filter((f) => f.round === 6)).toHaveLength(1);
  });

  it('baráž se odehrála a vítězové hrají v nové sezóně správnou soutěž', () => {
    const ties = endOfSeason.cups.baraz!.ties!;
    expect(ties).toHaveLength(2);
    expect(ties.every((t) => t.winner)).toBe(true);
    const next = weeks(endOfSeason, 2);
    for (const t of ties) {
      const loser = t.winner === t.upper ? t.lower : t.upper;
      expect(next.competitions.cz1.clubIds).toContain(t.winner);
      expect(next.competitions.cz1.clubIds).not.toContain(loser);
    }
    expect(next.competitions.cz1.clubIds).toHaveLength(16);
    expect(next.competitions.cz2.clubIds).toHaveLength(16);
  });

  it('konečné pořadí respektuje skupiny nadstavby', () => {
    const comp = endOfSeason.competitions.cz1;
    const order = finalStandings(comp, endOfSeason).map((r) => r.clubId);
    expect(order.slice(0, 6).sort()).toEqual([...comp.groups![0].clubIds].sort());
  });
});

describe('hráči', () => {
  const start = newGame(czPack, { clubId: 'bohemians', ownerName: 'Test', difficulty: 'stredni', seed: 32 });

  it('hodnocení nepřekročí potenciál a sezóna se zapíše do kariéry', () => {
    const after = weeks(start, 53);
    for (const p of Object.values(after.players)) expect(p.overall).toBeLessThanOrEqual(Math.max(p.potential, 99));
    const own = squadOf(after, 'bohemians').filter((p) => p.career.length);
    expect(own.length).toBeGreaterThan(15);
    expect(own[0].career[0].season).toBe(2026);
    expect(Math.max(...own.map((p) => p.trend?.length ?? 0))).toBeGreaterThan(6);
  }, 30_000);

  it('do zápasu: hra se zastaví po zápase klubu majitele', () => {
    const r = advanceToNextMatch(start);
    expect(r.fixtureId).toBeDefined();
    expect(r.state.date).toBe('2026-07-25');
  });
});

describe('účetnictví', () => {
  const start = newGame(czPack, { clubId: 'bohemians', ownerName: 'Test', difficulty: 'stredni', seed: 33 });

  it('koupený hráč se odepisuje po dobu smlouvy a prodej ukáže zisk', () => {
    const s = structuredClone(start);
    const p = squadOf(s, 'sparta')[10];
    executeTransfer(s, p, 'bohemians', 12_000_000, 100_000, 2);
    expect(p.bookValue).toBe(12_000_000);
    monthlyAmortization(s);
    expect(p.bookValue).toBe(12_000_000 - 12_000_000 / 24);
    expect(balanceSheet(s).registrations).toBe(Math.round(p.bookValue!));

    s.market.offers.push({ id: 'o1', playerId: p.id, buyerId: 'slavia', fee: 15_000_000, expires: '2026-07-30', advice: 'prijmout', note: '' });
    const sold = acceptOffer(s, 'o1').state;
    const acc = sold.clubs.bohemians.finance.accounting!;
    expect(acc.saleProfit).toBe(15_000_000 - (12_000_000 - 500_000));
    expect(acc.amortization).toBe(500_000);
    expect(profitAndLoss(sold.clubs.bohemians.finance.season, acc).beforeTax).toBeTypeOf('number');
  });
});
