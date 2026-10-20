import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { challengeProgress, challengeReportLines, challengesTick, settleChallenges, type Challenge } from './challenges';
import { newGame } from './game';
import { legacyScore } from './surroundings';
import type { DataPack } from './types';

const czPack = pack as DataPack;

describe('výzvy sezóny', () => {
  it('na začátku hry jsou tři různé výzvy s odměnou', () => {
    for (const clubId of ['slavia', 'bohemians', 'pardubice']) {
      const s = newGame(czPack, { clubId, ownerName: 'T', difficulty: 'stredni', seed: 11 });
      const list = s.challenges!.list;
      expect(list).toHaveLength(3);
      expect(new Set(list.map((c) => c.kind)).size).toBe(3);
      expect(list.every((c) => c.reward.legacy > 0)).toBe(true);
      for (const c of list) expect(challengeProgress(s, c).text.length).toBeGreaterThan(0);
    }
  });

  it('splněná výzva přinese odměnu hned, zbytek se vyhodnotí na konci sezóny', () => {
    const s = newGame(czPack, { clubId: 'slavia', ownerName: 'T', difficulty: 'stredni', seed: 12 });
    const sale: Challenge = { kind: 'prodej', label: 'Utržte za prodeje aspoň 1 mil. Kč', target: 1_000_000, reward: { legacy: 5, wallet: 2_000_000 } };
    const fans: Challenge = { kind: 'fanousci', label: 'Nálada aspoň 70', target: 70, reward: { legacy: 5, reputation: 2 } };
    s.challenges = { season: s.season, list: [sale, fans] };
    s.transferLog = [{ date: s.date, playerId: 'x', playerName: 'Test Hráč', fromId: s.owner.clubId, toId: 'sparta', fromName: '', toName: '', fee: 3_000_000, kind: 'prestup' }];
    s.date = '2026-07-06'; // průběh se kontroluje v pondělí
    const wallet = s.owner.wallet;
    const legacy = legacyScore(s);
    challengesTick(s);
    expect(sale.status).toBe('splneno');
    expect(s.owner.wallet).toBe(wallet + 2_000_000);
    expect(legacyScore(s)).toBe(legacy + 5);
    expect(fans.status).toBeUndefined();
    s.clubs[s.owner.clubId].fanMood = 40;
    settleChallenges(s);
    expect(fans.status).toBe('nesplneno');
    expect(challengeReportLines(s)).toHaveLength(2);
    expect(s.challenges!.history?.[0]).toMatchObject({ done: 1, total: 2 });
  });
});
