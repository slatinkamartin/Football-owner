import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { advanceDays, advanceToNextMatch, newGame } from './game';
import { daysUntil, milestoneToday, nextMilestone, seasonMilestones } from './milestones';
import type { DataPack } from './types';

const start = newGame(pack as DataPack, { clubId: 'bohemians', ownerName: 'T', difficulty: 'stredni', seed: 5 });

describe('milníky sezóny', () => {
  it('sezóna má milníky v pořadí a první je start ligy', () => {
    const list = seasonMilestones(start);
    expect(list.length).toBeGreaterThan(6);
    expect([...list].sort((a, b) => (a.date < b.date ? -1 : 1)).map((m) => m.id)).toEqual(list.map((m) => m.id));
    const next = nextMilestone(start)!;
    expect(next.date > start.date).toBe(true);
    expect(['rozpocet-2026', 'liga-2026']).toContain(next.id);
  });

  it('posun na milník přistane přesně na něm a hra ho pozná', () => {
    const next = nextMilestone(start)!;
    const s = advanceDays(start, daysUntil(start, next.date)).state;
    expect(milestoneToday(s)?.id).toBe(next.id);
  });

  it('do zápasu se nepřeskočí milník', () => {
    let s = start;
    for (let i = 0; i < 6; i++) {
      const m = nextMilestone(s)!;
      const r = advanceToNextMatch(s, daysUntil(s, m.date));
      expect(r.state.date <= m.date).toBe(true);
      s = r.state;
    }
  });
});
