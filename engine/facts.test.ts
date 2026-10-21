import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { lastOwnMatch, seasonFacts } from './facts';
import { advanceDays, newGame } from './game';
import type { DataPack } from './types';

describe('fakta ze zápasů', () => {
  it('poslední zápas a sezóna se dají přečíst z odehraných zápasů', () => {
    let s = newGame(pack as DataPack, { clubId: 'bohemians', ownerName: 'T', difficulty: 'stredni', seed: 7 });
    expect(lastOwnMatch(s)).toBeUndefined();
    s = advanceDays(s, 80).state;
    const m = lastOwnMatch(s)!;
    expect(m).toBeDefined();
    expect(m.scorers.length).toBe(m.gf);
    expect(['V', 'R', 'P']).toContain(m.outcome);
    const f = seasonFacts(s);
    expect(f.form.length).toBeGreaterThan(3);
    expect(f.streak.length).toBeGreaterThan(0);
    expect(f.position).toBeGreaterThan(0);
  }, 60_000);
});
