import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { daysUntil } from './milestones';
import { advanceDays, advanceStep, newGame, nextStep, ownMatchTomorrow } from './game';
import { matchStakes, matchWindowTomorrow, nextOwnFixture, opponentScout } from './matchday';
import { updateSettings } from './settings';
import type { DataPack } from './types';

const start = newGame(pack as DataPack, { clubId: 'olomouc', ownerName: 'T', difficulty: 'stredni', seed: 21 });
const quiet = updateSettings(start, { stops: { decision: false, offer: false, offerMin: 0, injury: false, milestone: true } }).state;

describe('jedno tlačítko posunu a zápasový milník', () => {
  it('krok nikdy nepřeskočí klíčový zápas klubu, běžný odehraje sám, a je nejvýš týden', () => {
    let s = quiet;
    let auto = 0;
    for (let i = 0; i < 60; i++) {
      if (matchWindowTomorrow(s)) {
        // Zápas se hraje až po volbě majitele (jen výsledek): posun o den.
        const before = nextOwnFixture(s)!.fixture.id;
        s = advanceDays(s, 1, true).state;
        expect(nextOwnFixture(s)?.fixture.id).not.toBe(before);
        continue;
      }
      const next = nextOwnFixture(s);
      const from = s.date;
      const r = advanceStep(s);
      s = r.state;
      expect(daysUntil({ ...s, date: from }, s.date)).toBeLessThanOrEqual(7);
      // W3: klíčový zápas se bez majitele neodehraje; běžný odehraje posun sám a vrátí jeho id (pro souhrn).
      if (next && nextOwnFixture(s)?.fixture.id !== next.fixture.id) {
        expect(r.fixtureId).toBe(next.fixture.id);
        expect(matchStakes(s, next.fixture, next.cup)).toEqual([]);
        auto++;
      }
    }
    expect(auto).toBeGreaterThan(0);
  }, 60_000);

  it('popisek kroku a informace o soupeři', () => {
    let s = quiet;
    for (let i = 0; i < 10 && !ownMatchTomorrow(s); i++) s = advanceStep(s).state;
    if (!ownMatchTomorrow(s)) s = advanceDays(s, Math.max(0, daysUntil(s, nextOwnFixture(s)!.fixture.date) - 1)).state;
    expect(ownMatchTomorrow(s)).toBeDefined();
    const opp = ownMatchTomorrow(s)!.opponentId;
    const scout = opponentScout(s, opp);
    expect(scout.strength).toBeGreaterThan(0);
    expect(scout.ownStrength).toBeGreaterThan(0);
    expect(['zapas', 'milnik', 'tyden', 'deadline']).toContain(nextStep(start).kind);
  }, 60_000);
});
