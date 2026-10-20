import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { advanceDays, newGame } from './game';
import { europeRun, findEuroMatch, leaguePhaseRank, nextEuroMatch } from './europe';
import { daysUntil } from './milestones';
import type { DataPack, GameState } from './types';

const start = newGame(pack as DataPack, { clubId: 'slavia', ownerName: 'T', difficulty: 'stredni', seed: 11 });
const to = (s: GameState, date: string) => advanceDays(s, daysUntil(s, date)).state;

describe('evropské večery', () => {
  it('klub v Evropě má los předkola se skutečným soupeřem a termíny', () => {
    const run = europeRun(start)!;
    expect(run).toBeDefined();
    expect(run.matches.length).toBe(2);
    expect(run.matches[0].opponent.name.length).toBeGreaterThan(2);
    expect(run.matches.every((m) => m.date > start.date && m.date <= `${start.season}-08-27`)).toBe(true);
    expect(nextEuroMatch(start)?.id).toBe(run.matches[0].id);
  });

  it('předkola se odehrají do konce srpna a rozhodnou o ligové fázi', () => {
    const s = to(start, `${start.season}-08-29`);
    const run = europeRun(s)!;
    const qual = run.matches.filter((m) => m.stage.startsWith('Play-off') && m.tie !== undefined && m.date <= `${s.season}-08-27`);
    expect(qual.length).toBeGreaterThanOrEqual(2);
    expect(qual.every((m) => m.result)).toBe(true);
    const entry = s.europe!.entries.find((e) => e.clubId === 'slavia')!;
    expect(entry.result).toBe(run.leagueComp ?? 'predkola');
    // Domácí evropský večer je vyprodaný a přinese vstupné.
    const home = qual.find((m) => m.home)!;
    expect(home.result!.attendance).toBe(s.clubs.slavia.stadium.capacity);
    expect(home.result!.gate).toBeGreaterThan(0);
    expect(s.clubs.slavia.finance.transactions.some((t) => t.note.startsWith('Evropský večer'))).toBe(true);
    // Náhled zápasu najde výsledek, novinky na zápas odkazují.
    expect(findEuroMatch(s, home.id)?.match.result).toBeDefined();
    expect(s.news.some((n) => n.fixtureId === home.id)).toBe(true);
    if (run.leagueComp) expect(run.matches.filter((m) => m.tie === undefined).length).toBe(run.leagueComp === 'KL' ? 6 : 8);
  });

  it('odhad pořadí ligové fáze: víc bodů = lepší místo', () => {
    expect(leaguePhaseRank('LM', 18, 6)).toBeLessThanOrEqual(8);
    expect(leaguePhaseRank('LM', 12, 0)).toBeGreaterThan(8);
    expect(leaguePhaseRank('LM', 12, 0)).toBeLessThanOrEqual(24);
    expect(leaguePhaseRank('KL', 3, -5)).toBeGreaterThan(24);
    for (let p = 0; p < 18; p++) expect(leaguePhaseRank('EL', p + 1, 0)).toBeLessThanOrEqual(leaguePhaseRank('EL', p, 0));
  });

  it('stará uložená hra bez evropské cesty funguje dál (náhodné vyhodnocení)', () => {
    const old = structuredClone(start);
    delete old.europe!.run;
    const s = to(old, `${start.season}-08-29`);
    expect(s.europe!.resolved).toBe(true);
    expect(s.europe!.run).toBeUndefined();
  });
});
