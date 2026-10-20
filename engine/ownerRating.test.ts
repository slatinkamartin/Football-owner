import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { advanceWeek, newGame } from './game';
import { gradeOf, ownerRatingNow, rateOwners } from './ownerRating';
import type { DataPack, GameState } from './types';
import { competitionOf } from './world';

const start = newGame(pack as DataPack, { clubId: 'bohemians', ownerName: 'T', difficulty: 'stredni', seed: 11 });
const weeks = (s: GameState, n: number) => {
  for (let i = 0; i < n; i++) s = advanceWeek(s);
  return s;
};

describe('hodnocení majitele', () => {
  it('známky jdou podle skóre', () => {
    expect(gradeOf(90)).toBe('A');
    expect(gradeOf(50)).toBe('C');
    expect(gradeOf(5)).toBe('F');
  });

  it('na začátku hodnotí všechny majitele soutěže kolem průměru', () => {
    const rows = rateOwners(start, competitionOf(start, 'bohemians')!);
    expect(rows).toHaveLength(competitionOf(start, 'bohemians')!.clubIds.length);
    for (const r of rows) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(r.parts.results).toBe(50);
    }
    expect(ownerRatingNow(start)?.of).toBe(rows.length);
  });

  it('na konci sezóny přijde známka, pořadí a zápis do výroční zprávy', () => {
    const mid = weeks(start, 20);
    const now = ownerRatingNow(mid)!;
    expect(now.rank).toBeGreaterThanOrEqual(1);
    expect(mid.ownerRatingStart?.season).toBe(2026);
    const end = weeks(mid, 31);
    const rec = end.ownerRatings?.find((r) => r.season === 2026);
    expect(rec).toBeDefined();
    expect(['A', 'B', 'C', 'D', 'E', 'F']).toContain(rec!.grade);
    expect(rec!.rank).toBeLessThanOrEqual(rec!.of);
    const report = end.seasonReports?.find((r) => r.season === 2026);
    expect(report?.ownerGrade).toBe(rec!.grade);
    expect(report?.ownerRank?.rank).toBe(rec!.rank);
    expect(end.news.some((n) => n.title.startsWith('Hodnocení majitele za sezónu'))).toBe(true);
  }, 120_000);
});
