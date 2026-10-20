import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { monthlyLongEffects, weeklyBigDecisions } from './bigdecisions';
import { createEvent, resolveEvent } from './events';
import { advanceWeek, newGame } from './game';
import { createRng } from './rng';
import type { DataPack, GameState } from './types';

const czPack = pack as DataPack;

describe('velká rozhodnutí', () => {
  it('prodej stadionu městu: peníze hned a měsíční nájem jako dlouhodobý efekt', () => {
    const s0 = newGame(czPack, { clubId: 'bohemians', ownerName: 'T', difficulty: 'stredni', seed: 21 });
    createEvent(s0, createRng(1), 'velke-stadion-mesto');
    const ev = s0.events.find((e) => e.template === 'velke-stadion-mesto')!;
    expect(ev.options.map((o) => o.id)).toEqual(['prijmout', 'odmitnout']);
    expect(ev.defaultOption).toBe('odmitnout');
    const before = s0.clubs.bohemians.finance.balance;
    const s = resolveEvent(s0, ev.id, 'prijmout').state;
    expect(s.clubs.bohemians.finance.balance).toBeGreaterThan(before);
    const effect = s.longEffects!.find((e) => e.kind === 'najem-stadionu')!;
    expect(effect.monthly).toBeLessThan(0);
    expect(effect.until > `${s.season + 9}-01-01`).toBe(true);
    s.date = '2026-08-01';
    const bal = s.clubs.bohemians.finance.balance;
    monthlyLongEffects(s);
    expect(s.clubs.bohemians.finance.balance).toBe(bal + effect.monthly!);
    expect(s.achievements?.unlocked['velke-rozhodnuti']).toBeDefined();
    // Stadion už jednou prodaný se znovu nenabízí.
    const again = structuredClone(s);
    createEvent(again, createRng(2), 'velke-stadion-mesto');
    expect(again.events.some((e) => e.template === 'velke-stadion-mesto')).toBe(false);
  });

  it('investiční fond si bere podíl z prodejů hráčů', () => {
    const s0 = newGame(czPack, { clubId: 'slavia', ownerName: 'T', difficulty: 'stredni', seed: 22 });
    createEvent(s0, createRng(1), 'velke-fond');
    const ev = s0.events.find((e) => e.template === 'velke-fond')!;
    const s = resolveEvent(s0, ev.id, 'prijmout').state;
    weeklyBigDecisions(s, () => undefined); // nastaví kurzor prodejů
    s.date = '2026-07-10';
    s.transferLog = [{ date: s.date, playerId: 'x', playerName: 'Test Hráč', fromId: 'slavia', toId: 'sparta', fromName: '', toName: '', fee: 10_000_000, kind: 'prestup' }, ...(s.transferLog ?? [])];
    const bal = s.clubs.slavia.finance.balance;
    weeklyBigDecisions(s, () => undefined);
    expect(s.clubs.slavia.finance.balance).toBe(bal - 3_000_000);
  });

  it('za sezónu přijdou nejvýš dvě velká rozhodnutí', { timeout: 60000 }, () => {
    let s: GameState = newGame(czPack, { clubId: 'sparta', ownerName: 'T', difficulty: 'stredni', seed: 7 });
    const offered: string[] = [];
    for (let w = 0; w < 50; w++) {
      s = advanceWeek(s);
      for (const e of s.events.filter((x) => x.template.startsWith('velke-') && !offered.includes(x.id))) offered.push(e.id);
    }
    expect(offered.length).toBeLessThanOrEqual(2);
    expect(s.bigDecisions?.count ?? 0).toBeLessThanOrEqual(2);
  });
});
