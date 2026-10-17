import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { daysUntil } from './milestones';
import { advanceDays, advanceStep, newGame, nextStep, ownMatchTomorrow } from './game';
import { nextOwnFixture, opponentScout } from './matchday';
import { updateSettings } from './settings';
import type { DataPack } from './types';

const start = newGame(pack as DataPack, { clubId: 'olomouc', ownerName: 'T', difficulty: 'stredni', seed: 21 });
const quiet = updateSettings(start, { stops: { decision: false, offer: false, offerMin: 0, injury: false, milestone: true } }).state;

describe('jedno tlačítko posunu a zápasový milník', () => {
  it('krok nikdy nepřeskočí zápas klubu a je nejvýš týden', () => {
    let s = quiet;
    for (let i = 0; i < 60; i++) {
      if (ownMatchTomorrow(s)) {
        // Zápas se hraje až po volbě majitele (jen výsledek): posun o den.
        const before = nextOwnFixture(s)!.fixture.id;
        s = advanceDays(s, 1, true).state;
        expect(nextOwnFixture(s)?.fixture.id).not.toBe(before);
        continue;
      }
      const next = nextOwnFixture(s);
      const from = s.date;
      s = advanceStep(s).state;
      expect(daysUntil({ ...s, date: from }, s.date)).toBeLessThanOrEqual(7);
      // Žádný zápas klubu se neodehrál bez majitele.
      if (next) expect(nextOwnFixture(s)?.fixture.id).toBe(next.fixture.id);
    }
  }, 60_000);

  it('popisek kroku a informace o soupeři', () => {
    let s = quiet;
    for (let i = 0; i < 10 && !ownMatchTomorrow(s); i++) s = advanceStep(s).state;
    expect(ownMatchTomorrow(s)).toBeDefined();
    const opp = ownMatchTomorrow(s)!.opponentId;
    const scout = opponentScout(s, opp);
    expect(scout.strength).toBeGreaterThan(0);
    expect(scout.ownStrength).toBeGreaterThan(0);
    expect(['zapas', 'milnik', 'tyden', 'deadline']).toContain(nextStep(start).kind);
  }, 60_000);
});
