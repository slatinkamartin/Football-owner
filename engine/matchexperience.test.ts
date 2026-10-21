import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { allFixtures } from './competitions';
import { advanceDays, newGame } from './game';
import {
  bigMatchCountdown,
  bigMatchWeekStarted,
  crowdLevel,
  liveChanges,
  markEuroDrawSeen,
  pendingEuroDraw,
  prepDecisions,
  prepValue,
  recordLiveChoice,
  setBigMatchPrep,
} from './matchexperience';
import { ultrasOf } from './surroundings';
import type { DataPack, GameState } from './types';

const start = newGame(pack as DataPack, { clubId: 'bohemians', ownerName: 'T', difficulty: 'stredni', seed: 21 });

/** První domácí velký zápas: den, kdy začal jeho týden, a předchozí den. */
function findHomeBigWeek(): { before: GameState; week: GameState } {
  let s = start;
  for (let i = 0; i < 200; i++) {
    const next = advanceDays(s, 1).state;
    const bm = next.bigMatch;
    if (bm && bm.home && !bm.settled && bm.started === next.date && !bm.id.startsWith('eu-')) return { before: s, week: next };
    s = next;
  }
  throw new Error('Žádný domácí velký zápas');
}

const { before, week } = findHomeBigWeek();

function eveOf(s: GameState): GameState {
  let x = s;
  while (x.bigMatch && x.date < x.bigMatch.date && x.bigMatch.date !== advanceDays(x, 0).state.date) {
    const d = Math.round((new Date(`${x.bigMatch.date}T00:00:00Z`).getTime() - new Date(`${x.date}T00:00:00Z`).getTime()) / 86_400_000);
    if (d <= 1) break;
    x = advanceDays(x, 1).state;
  }
  return x;
}

describe('W1: týden velkého zápasu', () => {
  it('odpočet: napětí, lístky, nálada a krátká rozhodnutí s výchozí volbou', () => {
    expect(before.bigMatch?.id).not.toBe(week.bigMatch!.id);
    const c = bigMatchCountdown(week)!;
    expect(c).toBeDefined();
    expect(c.hype).toBeGreaterThan(0);
    expect(c.hype).toBeLessThanOrEqual(100);
    expect(c.demand?.pct).toBeGreaterThan(0);
    const keys = prepDecisions(week, week.bigMatch!).map((d) => d.key);
    expect(keys).toEqual(expect.arrayContaining(['tickets', 'alloc', 'choreo']));
    expect(prepValue(week, week.bigMatch!, 'choreo')).toBe('fanousci');
    expect(week.news.some((n) => n.title.startsWith('Začíná týden'))).toBe(true);
    // Zastavení posunu jen v den začátku týdne (u derby, Evropy a baráže), ne každý den.
    if (week.bigMatch!.lastStop === week.date) expect(bigMatchWeekStarted(week, before.bigMatch?.id)).toMatch(/Začíná týden/);
    expect(bigMatchWeekStarted(advanceDays(week, 1).state, week.bigMatch!.id)).toBeUndefined();
  });

  it('volby přípravy se po zápase vyúčtují (choreo stojí peníze a potěší kotel)', () => {
    const paid = setBigMatchPrep(week, 'choreo', 'zaplatit');
    expect(paid.ok).toBe(true);
    expect(setBigMatchPrep(week, 'choreo', 'nesmysl').ok).toBe(false);
    const days = Math.round((new Date(`${week.bigMatch!.date}T00:00:00Z`).getTime() - new Date(`${week.date}T00:00:00Z`).getTime()) / 86_400_000);
    const a = advanceDays(paid.state, days).state;
    const b = advanceDays(week, days).state;
    expect(a.bigMatch!.settled).toBe(true);
    expect(a.bigMatch!.result).toBeDefined();
    expect(a.bigMatch!.report!.some((r) => r.startsWith('Choreo kotle'))).toBe(true);
    expect(a.bigMatch!.moments).toContain('Velké choreo kotle');
    expect(ultrasOf(a).relation).toBeGreaterThan(ultrasOf(b).relation);
  });

  it('bod zlomu je poctivý: do 75. minuty stejný zápas, vabank platí od 76. minuty', () => {
    const eve = eveOf(week);
    const id = eve.bigMatch!.id;
    const f0 = allFixtures(eve).find((x) => x.fixture.id === id)!.fixture;
    const choice = recordLiveChoice(eve, 'vabank', 75, 'vabank');
    expect(liveChanges(choice, f0)?.some((c) => c.minute === 75)).toBe(true);
    const plain = advanceDays(eve, 1).state;
    const bold = advanceDays(choice, 1).state;
    const ev = (g: GameState) => allFixtures(g).find((x) => x.fixture.id === id)!.fixture.result!.detail!.events;
    expect(ev(bold).filter((e) => e.minute <= 75)).toEqual(ev(plain).filter((e) => e.minute <= 75));
    expect(bold.bigMatch!.moments!.some((m) => m.startsWith('Vabank'))).toBe(true);
  });

  it('hlasitost kotle: vlastní gól ji zvedne, gól soupeře srazí', () => {
    const base = 60;
    expect(crowdLevel(base, [{ minute: 10, own: true }], 11)).toBeGreaterThan(base);
    expect(crowdLevel(base, [{ minute: 10, own: false }], 11)).toBeLessThan(base);
    expect(crowdLevel(base, [], 30)).toBe(base);
  });

  it('evropský los čeká na odkrytí a po něm zmizí', () => {
    const slavia = newGame(pack as DataPack, { clubId: 'slavia', ownerName: 'T', difficulty: 'stredni', seed: 21 });
    const d = pendingEuroDraw(slavia);
    expect(d?.opponents.length).toBeGreaterThan(0);
    expect(pendingEuroDraw(markEuroDrawSeen(slavia))).toBeUndefined();
  });
});
