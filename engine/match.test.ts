import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { advanceWeek, migrateSave, newGame } from './game';
import { isAvailable, selectLineup, simulateMatch } from './match';
import { generateSquad, squadOf } from './players';
import { createRng } from './rng';
import type { DataPack, GameState } from './types';

const czPack = pack as DataPack;

function weeks(state: GameState, n: number): GameState {
  let s = state;
  for (let i = 0; i < n; i++) s = advanceWeek(s);
  return s;
}

describe('zápasový engine', () => {
  const season = weeks(newGame(czPack, { clubId: 'bohemians', ownerName: 'Test', difficulty: 'stredni', seed: 9 }), 49);
  const played = season.competitions.cz1.fixtures.filter((f) => f.result);
  const avg = (fn: (f: (typeof played)[0]) => number) => played.reduce((a, f) => a + fn(f), 0) / played.length;

  it('statistiky ligy odpovídají realitě', () => {
    expect(avg((f) => f.result!.homeGoals + f.result!.awayGoals)).toBeGreaterThan(2.3);
    expect(avg((f) => f.result!.homeGoals + f.result!.awayGoals)).toBeLessThan(3.2);
    const d = (f: (typeof played)[0]) => f.result!.detail!;
    expect(avg((f) => d(f).home.shots + d(f).away.shots)).toBeGreaterThan(20);
    expect(avg((f) => d(f).home.shots + d(f).away.shots)).toBeLessThan(32);
    expect(avg((f) => d(f).home.yellows + d(f).away.yellows)).toBeGreaterThan(3);
    expect(avg((f) => d(f).home.reds + d(f).away.reds)).toBeLessThan(0.35);
  });

  it('góly v detailu sedí s výsledkem a držení dává 100 %', () => {
    for (const f of played) {
      const d = f.result!.detail!;
      expect(d.events.filter((e) => e.type === 'gol' && e.clubId === f.homeId)).toHaveLength(f.result!.homeGoals);
      expect(d.home.possession + d.away.possession).toBe(100);
      expect(d.home.lineup.length).toBeLessThanOrEqual(11);
    }
  });

  it('podrobnosti se ukládají jen pro soutěž klubu majitele', () => {
    expect(season.competitions.cz2.fixtures.some((f) => f.result?.detail)).toBe(false);
  });

  it('trenér rotuje: v sezóně nastoupí v základu víc než 11 hráčů', () => {
    const regulars = squadOf(season, 'bohemians').filter((p) => p.starts >= 5);
    expect(regulars.length).toBeGreaterThan(11);
  });
});

describe('zranění a tresty', () => {
  const rng = createRng(1);
  const counter = { nextId: 0 };
  const squad = generateSquad(rng, counter, 'a', 2026, 60);
  const other = generateSquad(rng, counter, 'b', 2026, 60);

  it('zraněný ani vyloučený hráč nenastoupí', () => {
    const [hurt, banned] = squad;
    hurt.injuredUntil = '2026-09-30';
    banned.suspension = 1;
    expect(isAvailable(hurt, '2026-09-01')).toBe(false);
    expect(isAvailable(hurt, '2026-10-01')).toBe(true);
    const { xi, bench } = selectLineup(squad, 'vyvazeny', false, '2026-09-01', 2026);
    expect([...xi, ...bench]).not.toContain(hurt);
    expect([...xi, ...bench]).not.toContain(banned);
  });

  it('trest se odpyká zápasem klubu', () => {
    const banned = squad[1];
    simulateMatch(rng, { id: 'a', players: squad }, { id: 'b', players: other }, 0, { date: '2026-09-01', season: 2026 });
    expect(banned.suspension).toBe(0);
  });
});

describe('uložené hry', () => {
  it('verze 3 se převede na nový engine', () => {
    const s = newGame(czPack, { clubId: 'bohemians', ownerName: 'Test', difficulty: 'stredni', seed: 2 });
    const old = structuredClone(s) as unknown as Record<string, unknown> & { version: number };
    old.version = 3;
    for (const p of Object.values((old as unknown as GameState).players)) {
      delete (p as Partial<typeof p>).fitness;
    }
    const migrated = migrateSave(old)!;
    expect(migrated.version).toBe(s.version);
    expect(Object.values(migrated.players).every((p) => p.fitness === 100 && p.suspension === 0)).toBe(true);
  });
});
