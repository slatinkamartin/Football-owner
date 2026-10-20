import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { ACHIEVEMENTS, achievementCount, seasonAchievements, weeklyAchievements } from './achievements';
import { advanceToNextMatch, newGame } from './game';
import { careerFrom, newCareerGame } from './meta';
import type { DataPack, GameState } from './types';

const czPack = pack as DataPack;

describe('úspěchy a odznaky', () => {
  it('katalog má kolem 25 odznaků s rostoucími stupni', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(25);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) {
      expect([1, 3]).toContain(a.tiers.length);
      expect([...a.tiers].sort((x, y) => x - y)).toEqual(a.tiers);
    }
  });

  it('první výhra se zapíše jako odznak se zprávou', { timeout: 30000 }, () => {
    let s: GameState = newGame(czPack, { clubId: 'slavia', ownerName: 'T', difficulty: 'stredni', seed: 3 });
    expect(achievementCount(s).unlocked).toBe(0);
    for (let i = 0; i < 8 && !s.achievements?.unlocked['prvni-vyhra']; i++) {
      s = advanceToNextMatch(s).state;
      weeklyAchievements(s);
    }
    expect(s.achievements?.unlocked['prvni-vyhra']?.tier).toBe(1);
    expect(s.news.some((n) => n.title.includes('První výhra'))).toBe(true);
    // Zápasy se nepočítají dvakrát.
    const wins = s.achievements!.stats.wins;
    weeklyAchievements(s);
    expect(s.achievements!.stats.wins).toBe(wins);
  });

  it('stupně se zvyšují a odznaky se přenášejí do další kariéry', () => {
    const s: GameState = newGame(czPack, { clubId: 'bohemians', ownerName: 'T', difficulty: 'stredni', seed: 4 });
    s.achievements = { unlocked: {}, stats: { seasonsAtClub: 4, debtFreeStreak: 2 }, clubId: s.owner.clubId };
    seasonAchievements(s);
    expect(s.achievements.unlocked['vernost']?.tier).toBe(2); // 5 sezón = stříbro
    expect(s.achievements.unlocked['bez-dluhu']?.tier).toBeGreaterThanOrEqual(1);
    const career = careerFrom(s);
    expect(career.achievements?.['vernost']?.tier).toBe(2);
    const next = newCareerGame(czPack, career, { clubId: 'slavia', difficulty: 'stredni', seed: 9 });
    expect(next.achievements?.unlocked['vernost']?.tier).toBe(2);
    // Počítadla začínají v novém klubu znovu.
    expect(next.achievements?.stats.seasonsAtClub ?? 0).toBe(0);
  });
});
