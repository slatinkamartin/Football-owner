import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { projectOptions, startProject } from './facilities';
import { advanceDays, newGame, updatePolicy } from './game';
import { startBigProject } from './investments';
import { createRng } from './rng';
import { matchdayExtras } from './stadium';
import { answerEventOffer, conditionOf, eventOfferTick, europeVenueFactor, monthlyCondition, sectorEffect, setSectors, stadiumCategory } from './venue';
import type { DataPack } from './types';

const start = newGame(pack as DataPack, { clubId: 'slavia', ownerName: 'T', difficulty: 'stredni', seed: 71 });

describe('etapa G: stadion', () => {
  it('sektory mění prostředí, návštěvu a cenu lístku', () => {
    const big = setSectors(start, { kotel: 'velky', rodina: 'velky' }).state;
    const e = sectorEffect(big.clubs.slavia);
    expect(e.homeEdge).toBeGreaterThan(0);
    expect(e.attendance).toBeGreaterThan(1);
    expect(e.ticketFactor).toBeLessThan(1);
    expect(matchdayExtras(big.clubs.slavia, 10_000, 1)).toBeGreaterThan(matchdayExtras(start.clubs.slavia, 10_000, 1));
  });

  it('vylepšení dne zápasu se postaví a fungují', () => {
    const s = structuredClone(start);
    s.clubs.slavia.finance.balance = 1_000_000_000;
    const fan = projectOptions(s).find((o) => o.kind === 'fanzona')!;
    const r = startProject(s, fan.label);
    expect(r.ok).toBe(true);
    const later = advanceDays(r.state, 70).state;
    expect(later.clubs.slavia.facilities.extras).toContain('fanzona');
    expect(projectOptions(later).find((o) => o.kind === 'fanzona')!.blocked).toBeTruthy();
  }, 60_000);

  it('bez údržby stadion chátrá a klesne kategorie', () => {
    const s = updatePolicy(start, { maintenance: 'nizka' });
    const cond = conditionOf(s.clubs.slavia);
    for (let i = 0; i < 24; i++) monthlyCondition(s, createRng(i));
    expect(conditionOf(s.clubs.slavia)).toBeLessThan(cond);
    expect(stadiumCategory(start.clubs.slavia).category).toBeGreaterThanOrEqual(3);
    const ruined = structuredClone(start);
    ruined.clubs.slavia.facilities.condition = 30;
    expect(stadiumCategory(ruined.clubs.slavia).category).toBeLessThan(3);
    expect(europeVenueFactor(ruined.clubs.slavia)).toBeLessThan(1);
  });

  it('levný dodavatel je levnější, ale častěji se prodraží', () => {
    const s = structuredClone(start);
    s.clubs.slavia.finance.balance = 5_000_000_000;
    const cheap = startBigProject(s, 'komercni', 'levny').state.bigProjects![0];
    const safe = startBigProject(s, 'komercni', 'spolehlivy').state.bigProjects![0];
    expect(cheap.cost).toBeLessThan(safe.cost);
  });

  it('nabídky akcí: přijmout a odmítnout', () => {
    const s = structuredClone(start);
    for (let i = 0; i < 10 && !(s.eventOffers ?? []).length; i++) eventOfferTick(s, createRng(100 + i));
    const o = s.eventOffers![0];
    expect(answerEventOffer(s, o.id, false).state.eventOffers!.length).toBe(s.eventOffers!.length - 1);
    expect(answerEventOffer(s, o.id, true).state.eventOffers![0].accepted).toBe(true);
  });
});
