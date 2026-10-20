import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { advanceDays, newGame } from './game';
import { resolveEvent } from './events';
import { daysUntil } from './milestones';
import { closeYouthIntake, createYouthIntake } from './people';
import { createRng } from './rng';
import { intlNominations, intlValueFactor, playerStory } from './stars';
import { playerValue } from './transfers';
import { squadOf } from './players';
import type { DataPack, GameState } from './types';

const start = newGame(pack as DataPack, { clubId: 'slavia', ownerName: 'T', difficulty: 'stredni', seed: 7 });
const to = (s: GameState, date: string) => advanceDays(s, daysUntil(s, date)).state;

describe('hvězdy s příběhem', () => {
  it('reprezentační sraz: nominace, starty, vyšší hodnota', () => {
    const noms = intlNominations(start);
    expect(noms.senior.length).toBeGreaterThan(5);
    expect(noms.senior.length).toBeLessThanOrEqual(23);
    expect(noms.senior.every((p) => !p.nationality)).toBe(true);
    expect(noms.foreign.every((p) => p.nationality && p.overall >= 72)).toBe(true);
    const s = to(start, `${start.season}-09-12`);
    const capped = Object.values(s.players).filter((p) => (p.intl?.caps ?? 0) > 0);
    expect(capped.length).toBeGreaterThan(3);
    const p = capped[0];
    expect(intlValueFactor(p, s.date)).toBeGreaterThan(1);
    const plain = { ...p, intl: undefined };
    expect(playerValue(s, p)).toBeGreaterThanOrEqual(playerValue(s, plain));
    expect(playerStory(s, p).international).toBe(true);
    expect(s.news.some((n) => /reprezenta/i.test(n.title))).toBe(true);
  });

  it('odchovanci z přijímaček mají příznak a sbírají milníky', () => {
    const s0 = structuredClone(start);
    createYouthIntake(s0, createRng(3), s0.season, 50, 3, 0);
    expect(s0.youthIntake).toBeDefined();
    const s1 = closeYouthIntake(s0).state;
    const academy = squadOf(s1, 'slavia').filter((p) => p.academy === 'slavia');
    expect(academy.length).toBeGreaterThan(0);
    academy[0].apps = 1;
    academy[0].goals = 1;
    const s2 = advanceDays(s1, 1).state;
    const p = s2.players[academy[0].id];
    expect(p.milestones?.map((m) => m.key)).toEqual(expect.arrayContaining(['start1', 'gol1']));
    expect(s2.news.some((n) => n.playerId === p.id && /Odchovanec/.test(n.title))).toBe(true);
  });

  it('letní zájem velké ligy: zpráva, nabídka a slib odchodu za rok', () => {
    let s = structuredClone(start);
    const star = squadOf(s, 'slavia').sort((a, b) => b.overall - a.overall)[0];
    star.overall = 75;
    star.birthYear = s.season - 24;
    s.stars = { summer: { season: s.season + 1, playerId: star.id, buyerId: 'zahr:bologna', fee: 200_000_000, stage: 'zajem' } };
    s = to(s, `${s.season + 1}-07-04`);
    const ev = s.events.find((e) => e.template === 'hvezda-velkaliga');
    expect(ev).toBeDefined();
    expect(ev!.options.map((o) => o.id)).toEqual(['prodat', 'smlouva', 'zarok']);
    const r = resolveEvent(s, ev!.id, 'zarok');
    expect(r.ok).toBe(true);
    expect(r.state.stars?.promise?.playerId).toBe(star.id);
    expect(r.state.stars?.promise?.season).toBe(s.season + 1);
    const sold = resolveEvent(s, ev!.id, 'prodat').state;
    expect(sold.players[star.id]?.clubId ?? 'pryc').not.toBe('slavia');
  });
});
