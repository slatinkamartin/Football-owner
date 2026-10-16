import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { advanceDays } from './game';
import { careerAllows, careerFrom, evaluateScenario, newCareerGame, newScenarioGame, scenarioStatus } from './meta';
import type { DataPack } from './types';

const czPack = pack as DataPack;

describe('etapa H: celek hry', () => {
  it('scénář záchrana: klub začíná v minusu s úvěrem', () => {
    const s = newScenarioGame(czPack, 'zachrana', { ownerName: 'T', difficulty: 'stredni', seed: 81 });
    expect(s.owner.clubId).toBe('zlin');
    expect(s.clubs.zlin.finance.balance).toBeLessThan(0);
    expect(s.loans.length).toBe(1);
    expect(scenarioStatus(s)!.done).toBe(false);
  });

  it('scénář Evropa: město je spolumajitel', () => {
    const s = newScenarioGame(czPack, 'evropa', { ownerName: 'T', difficulty: 'stredni', seed: 82 });
    expect(s.owner.share).toBeCloseTo(0.51);
    expect(s.shareholders.some((x) => x.kind === 'mesto')).toBe(true);
  });

  it('po sezóně přijde výroční zpráva a scénář se vyhodnotí', () => {
    let s = newScenarioGame(czPack, 'vzestup', { ownerName: 'T', difficulty: 'stredni', seed: 83 });
    s = advanceDays(s, 366).state;
    expect(s.seasonReports?.length).toBe(1);
    const r = s.seasonReports![0];
    expect(r.position).toBeGreaterThan(0);
    expect(r.clubName).toBeTruthy();
    // Vynucené splnění: klub v 1. lize.
    const x = structuredClone(s);
    const top = Object.values(x.competitions).find((c) => c.tier === 1)!;
    const lower = Object.values(x.competitions).find((c) => c.clubIds.includes(x.owner.clubId))!;
    lower.clubIds = lower.clubIds.filter((id) => id !== x.owner.clubId);
    top.clubIds.push(x.owner.clubId);
    evaluateScenario(x);
    expect(x.scenario!.result!.stars).toBe(3);
    expect(x.trophies!.some((t) => t.kind === 'scenar')).toBe(true);
  }, 120_000);

  it('kariéra přenese peníze a odkaz, velké kluby chtějí úspěchy', () => {
    const s = newScenarioGame(czPack, 'zachrana', { ownerName: 'Karel', difficulty: 'stredni', seed: 84 });
    s.owner.wallet = 777_000_000;
    s.trophies = [{ season: 2026, kind: 'pohar', text: 'Pohár', points: 15 }];
    s.gameOver = { date: s.date, kind: 'prodej', reason: 'prodáno' };
    const career = careerFrom(s);
    expect(career.clubs.length).toBe(1);
    expect(careerAllows(career, 90)).toBeTruthy();
    expect(careerAllows(career, 50)).toBeUndefined();
    const next = newCareerGame(czPack, career, { clubId: 'bohemians', difficulty: 'stredni', seed: 85 });
    expect(next.owner.wallet).toBe(777_000_000);
    expect(next.owner.name).toBe('Karel');
    expect(next.trophies!.length).toBe(1);
  });
});
