import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { prizeMoney } from './finance';
import { advanceWeek, migrateSave, newGame } from './game';
import { CZK_PER_EUR, squadOf } from './players';
import { acceptOffer, playerValue, wageDemand } from './transfers';
import type { DataPack, GameState } from './types';
import { FOREIGN_PREFIX, FREE } from './world';

const czPack = pack as DataPack;
const start = newGame(czPack, { clubId: 'bohemians', ownerName: 'Test', difficulty: 'stredni', seed: 2 });

const squadValueEur = (s: GameState, id: string) =>
  squadOf(s, id).reduce((sum, p) => sum + playerValue(s, p), 0) / CZK_PER_EUR;
const wages = (s: GameState, id: string) => squadOf(s, id).map((p) => p.wage).sort((a, b) => a - b);
const median = (xs: number[]) => xs[Math.floor(xs.length / 2)];

describe('kalibrace podle české ligy', () => {
  it('hodnoty kádrů odpovídají Transfermarktu', () => {
    expect(squadValueEur(start, 'slavia')).toBeGreaterThan(70_000_000);
    expect(squadValueEur(start, 'slavia')).toBeLessThan(160_000_000);
    expect(squadValueEur(start, 'banik')).toBeGreaterThan(8_000_000);
    expect(squadValueEur(start, 'banik')).toBeLessThan(35_000_000);
    expect(squadValueEur(start, 'horniredice')).toBeLessThan(2_000_000);
  });

  it('platy odpovídají úrovni soutěže', () => {
    expect(Math.max(...wages(start, 'slavia'))).toBeGreaterThan(800_000);
    expect(median(wages(start, 'bohemians'))).toBeGreaterThan(100_000);
    expect(median(wages(start, 'bohemians'))).toBeLessThan(250_000);
    expect(median(wages(start, 'zizkov'))).toBeLessThan(70_000);
    expect(median(wages(start, 'horniredice'))).toBeLessThan(20_000);
  });

  it('lepší umístění přinese víc peněz', () => {
    expect(prizeMoney(1, 1, 16)).toBeGreaterThan(prizeMoney(1, 16, 16));
    expect(prizeMoney(2, 1, 16)).toBeGreaterThan(prizeMoney(2, 16, 16));
  });
});

describe('zahraniční trh', () => {
  it('prodej do zahraničí přinese peníze a hráč z ligy zmizí', () => {
    const s = structuredClone(start);
    const p = squadOf(s, 'bohemians').sort((a, b) => b.overall - a.overall)[0];
    s.market.offers.push({ id: 'o1', playerId: p.id, buyerId: `${FOREIGN_PREFIX}celtic`, fee: 30_000_000, expires: '2026-07-20', advice: 'prijmout', note: '' });
    const r = acceptOffer(s, 'o1');
    expect(r.ok).toBe(true);
    expect(r.state.players[p.id]).toBeUndefined();
    expect(r.state.clubs.bohemians.finance.balance).toBe(s.clubs.bohemians.finance.balance + 30_000_000);
    expect(r.message).toContain('Celtic');
  });

  it('volnému hráči časem klesají nároky', () => {
    const s = structuredClone(start);
    const fa = Object.values(s.players).find((p) => p.clubId === FREE)!;
    fa.wage = 500_000;
    const before = wageDemand(s, fa, 'bohemians');
    let later = s;
    for (let i = 0; i < 10; i++) later = advanceWeek(later);
    const after = later.players[fa.id] ? wageDemand(later, later.players[fa.id], 'bohemians') : 0;
    expect(after).toBeLessThan(before);
  });
});

describe('uložené hry', () => {
  it('starší verze 2 se převede a dostane tržní platy', () => {
    const old = structuredClone(start) as unknown as Record<string, unknown> & { version: number };
    old.version = 2;
    const migrated = migrateSave(old)!;
    expect(migrated.version).toBe(start.version);
    expect(migrated.news.map((n) => n.title)).toContain('Nová ekonomika');
    expect(migrateSave({ ...old, version: 1 })).toBeNull();
  });
});
