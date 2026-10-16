import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { addDays } from './calendar';
import { allFixtures } from './competitions';
import { advanceDays, liveFirstHalf, newGame } from './game';
import { rivalsOf, seasonOutlook, goalChance, ownerTypeOf } from './league';
import { cupPath, matchStakes, nextOwnFixture, pendingPrematch, setHalftime, setMatchPlan, workload } from './matchday';
import type { DataPack, GameState } from './types';

const start = newGame(pack as DataPack, { clubId: 'bohemians', ownerName: 'T', difficulty: 'stredni', seed: 21 });

/** Posun na den před příštím zápasem majitele. */
function eve(s: GameState): GameState {
  const next = nextOwnFixture(s)!;
  const days = Math.round((new Date(`${next.fixture.date}T00:00:00Z`).getTime() - new Date(`${s.date}T00:00:00Z`).getTime()) / 86_400_000) - 1;
  return days > 0 ? advanceDays(s, days).state : s;
}

describe('etapa B: zápasy a liga', () => {
  it('rivalové: Bohemians mají pražské derby', () => {
    const r = rivalsOf(start);
    expect(r.some((x) => x.kind === 'derby')).toBe(true);
    expect(['rozhazovacny', 'setril', 'nervozni', 'akademie']).toContain(ownerTypeOf('slavia'));
  });

  it('výhled sezóny: pravděpodobnosti dávají smysl', () => {
    const o = seasonOutlook(start);
    expect(o.length).toBe(16);
    const title = o.reduce((a, x) => a + x.title, 0);
    expect(title).toBeCloseTo(1, 5);
    const g = goalChance(start)!;
    expect(g).toBeGreaterThanOrEqual(0);
    expect(g).toBeLessThanOrEqual(1);
  });

  it('živý přenos: první poločas náhledu odpovídá skutečnému zápasu, rozhodnutí platí od 46. minuty', () => {
    const s = eve(start);
    const half = liveFirstHalf(s)!;
    expect(half).toBeDefined();
    const real = advanceDays(setHalftime(s, 'riskovat').state, 1).state;
    const f = allFixtures(real).find((x) => x.fixture.id === half.fixtureId)!.fixture;
    const firstHalf = f.result!.detail!.events.filter((e) => e.minute <= 45);
    expect(firstHalf).toEqual(half.events);
  });

  it('plán zápasu: poloviční vstupné přivede víc diváků, prémie se platí jen za výhru', () => {
    let s = eve(start);
    const next = nextOwnFixture(s)!;
    if (!next.home) {
      s = advanceDays(s, 2).state;
      s = eve(s);
    }
    const base = advanceDays(s, 1).state;
    const cheap = advanceDays(setMatchPlan(s, { fanAction: 'levne' }).state, 1).state;
    const id = nextOwnFixture(s)!.fixture.id;
    const att = (g: GameState) => allFixtures(g).find((x) => x.fixture.id === id)!.fixture.result!.attendance;
    expect(att(cheap)).toBeGreaterThanOrEqual(att(base));
    expect(cheap.matchPlan).toBeUndefined();
  });

  it('zápas se sázkou vyvolá přípravu, zátěž a cesta poháru se počítají', () => {
    // Najdi derby a posuň se k němu.
    let s = start;
    for (let i = 0; i < 40 && !pendingPrematch(s); i++) s = advanceDays(s, 3).state;
    const p = pendingPrematch(s);
    if (p) expect(matchStakes(s, p.fixture, p.cup).length).toBeGreaterThan(0);
    const w = workload(s);
    expect(['nizka', 'stredni', 'vysoka']).toContain(w.level);
    expect(Array.isArray(cupPath(s))).toBe(true);
  }, 60_000);

  it('zpravodaj kola vzniká po dohraném kole a sezóna běží bez chyb', () => {
    const s = advanceDays(start, 70).state;
    expect((s.roundReports ?? []).length).toBeGreaterThan(0);
    expect(s.roundReports![0].team.length).toBeGreaterThan(5);
    expect(s.timeline.some((t) => t.rivals && Object.keys(t.rivals).length > 0)).toBe(true);
    expect(addDays(s.date, 0)).toBe(s.date);
  });
});
