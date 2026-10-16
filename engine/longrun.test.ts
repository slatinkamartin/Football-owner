import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { forecastSeason, prepareBudget } from './budget';
import { wageBudgetMonthly } from './finance';
import { advanceDays, newGame } from './game';
import { marketValue, squadOf } from './players';
import { directorOf, ensureInterimStaff, goalTarget, realisticGoal, expectedPosition } from './staff';
import { createRng } from './rng';
import type { DataPack } from './types';
import { competitionOf } from './world';

const start = (clubId = 'bohemians') => newGame(pack as DataPack, { clubId, ownerName: 'T', difficulty: 'stredni', seed: 5, ownerShare: 1 });

describe('dlouhodobá stabilita klubu', () => {
  it('chybějící ředitel se nahradí zastupujícím', () => {
    const s = structuredClone(start());
    const club = s.clubs.bohemians;
    s.staff[club.staff.directorId].clubId = '';
    club.staff.directorId = '';
    ensureInterimStaff(s, createRng(1));
    const d = directorOf(s, 'bohemians')!;
    expect(d).toBeDefined();
    expect(d.interim).toBe(true);
  });

  it('navržený cíl je dosažitelný (cílové místo není nad očekávaným)', () => {
    const s = start();
    const comp = competitionOf(s, 'bohemians')!;
    expect(goalTarget(realisticGoal(s, 'bohemians'), comp)).toBeGreaterThanOrEqual(expectedPosition(s, 'bohemians'));
  });

  it('důvěra se bez zásahu majitele po roce nepropadne k nule', () => {
    const s = advanceDays(start(), 330).state;
    expect(s.owner.trust.trener).toBeGreaterThan(20);
    expect(directorOf(s, 'bohemians')).toBeDefined();
  });

  it('návrh rozpočtu vždy pokryje podepsané smlouvy', () => {
    const s = structuredClone(start('opava'));
    for (const p of squadOf(s, 'opava')) p.wage *= 3;
    prepareBudget(s);
    const bill = squadOf(s, 'opava').reduce((a, p) => a + p.wage, 0);
    expect(wageBudgetMonthly(s.clubs.opava)).toBeGreaterThanOrEqual(bill * 0.99);
  });

  it('hvězda české ligy nestojí víc než nízké desítky milionů eur', () => {
    const s = start('slavia');
    const p = { ...squadOf(s, 'slavia')[0], overall: 85, potential: 90, birthYear: s.season - 21 };
    expect(marketValue(p, s.season)).toBeLessThan(25_000_000 * 25);
  });

  it('Evropa má ve výhledu rozsah a hráči dostávají prémie', () => {
    const s = structuredClone(start('slavia'));
    s.europe = { season: s.season, entries: [{ season: s.season, clubId: 'slavia', entry: 'LM', result: 'predkola', revenue: 300_000_000 }] };
    const plan = forecastSeason(s);
    expect(plan.europeRange!.high).toBeGreaterThan(plan.europeRange!.low);
    const after = advanceDays(s, 60).state;
    expect(after.clubs.slavia.finance.transactions.some((t) => t.note.includes('Prémie hráčům za evropské poháry'))).toBe(true);
  });
});
