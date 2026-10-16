import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { weeklyBriefing } from './briefing';
import { resolveEvent } from './events';
import { advanceDays, advanceUntil, newGame } from './game';
import { pulseAfterAction, pulseRows } from './pulse';
import { squadOf } from './players';
import { decisiveness, dramaFactor, updateSettings } from './settings';
import { activeStories, weeklyStories } from './stories';
import type { DataPack, GameState } from './types';
import { competitionOf } from './world';

const start = newGame(pack as DataPack, { clubId: 'bohemians', ownerName: 'T', difficulty: 'stredni', seed: 11 });
const always = { next: () => 0 };

function withLosses(s: GameState, n: number): GameState {
  const x = structuredClone(s);
  const comp = competitionOf(x, 'bohemians')!;
  const mine = comp.fixtures.filter((f) => f.homeId === 'bohemians' || f.awayId === 'bohemians').sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, n);
  for (const f of mine) f.result = { homeGoals: f.homeId === 'bohemians' ? 0 : 2, awayGoals: f.homeId === 'bohemians' ? 2 : 0, attendance: 1000, scorers: [] };
  x.date = mine[n - 1].date;
  return x;
}

describe('etapa A: příběhy, nálady, porada, tempo, nastavení', () => {
  it('krize po třech prohrách: rozhodnutí a čekání na tři zápasy', () => {
    let s = withLosses(start, 3);
    weeklyStories(s, always);
    const story = activeStories(s).find((x) => x.kind === 'krize')!;
    expect(story).toBeDefined();
    const e = s.events.find((x) => x.storyId === story.id)!;
    s = resolveEvent(s, e.id, 'ultimatum').state;
    const after = s.stories!.find((x) => x.id === story.id)!;
    expect(after.waiting).toBe('zapasy');
    expect(after.matchesLeft).toBe(3);
    expect(s.events.some((x) => x.storyId === story.id)).toBe(false);
  });

  it('spor v kabině se po dvou týdnech vyhodnotí', () => {
    let s = structuredClone(start);
    for (const p of squadOf(s, 'bohemians')) p.morale = 30;
    weeklyStories(s, always);
    const story = activeStories(s).find((x) => x.kind === 'kabina')!;
    expect(story).toBeDefined();
    s = resolveEvent(s, s.events.find((x) => x.storyId === story.id)!.id, 'trest').state;
    s = advanceDays(s, 21).state;
    expect(s.stories!.find((x) => x.id === story.id)!.done).toBe(true);
  });

  it('panel tlaku zapisuje důvody změn', () => {
    const s = advanceDays(start, 60).state;
    expect(s.pulse!.history.length).toBeGreaterThan(4);
    expect(s.pulse!.causes.length).toBeGreaterThan(0);
    expect(pulseRows(s)).toHaveLength(4);
    // Rozhodnutí v rozhraní: důvod z nové zprávy.
    const next = structuredClone(s);
    next.clubs.bohemians.fanMood += 5;
    next.news.unshift({ date: next.date, kind: 'info', title: 'Test akce' });
    const logged = pulseAfterAction(s, next);
    expect(logged.pulse!.causes[0].reason).toBe('Test akce');
  });

  it('porada: na začátku sezóny připomene rozpočet', () => {
    const tasks = weeklyBriefing(start);
    expect(tasks.some((t) => t.id === 'rozpocet')).toBe(true);
    expect(tasks.length).toBeLessThanOrEqual(5);
  });

  it('hrát do konce měsíce a do konce sezóny', () => {
    const quiet = updateSettings(start, { stops: { decision: false, offer: false, offerMin: 0, injury: false, milestone: false } }).state;
    const month = advanceUntil(quiet, 'mesic');
    expect(month.state.date.endsWith('-01')).toBe(true);
    const season = advanceUntil(quiet, 'sezona');
    expect(season.state.date.slice(5)).toBe('06-30');
    // S výchozími zastaveními se hra zastaví dřív a řekne proč.
    const stopped = advanceUntil(start, 'sezona');
    expect(stopped.reason).toBeTruthy();
    expect(stopped.state.date < season.state.date).toBe(true);
  }, 60_000);

  it('nastavení mění četnost dramat a náhodu', () => {
    const drama = updateSettings(start, { drama: 'drama', randomness: 'vysoka' }).state;
    expect(dramaFactor(drama)).toBeGreaterThan(dramaFactor(start));
    expect(decisiveness(drama)).toBeLessThan(decisiveness(start));
  });
});
