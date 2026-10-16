import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { signSponsor, sponsorMonthly } from './sponsors';
import { projectOptions, startProject } from './facilities';
import { balanceSheet, commercialMonthly, loanOffers, monthlyLoans, takeLoan } from './finance';
import { advanceWeek, newGame } from './game';
import type { DataPack, GameState } from './types';

const czPack = pack as DataPack;
const weeks = (s: GameState, n: number) => {
  for (let i = 0; i < n; i++) s = advanceWeek(s);
  return s;
};
const start = newGame(czPack, { clubId: 'bohemians', ownerName: 'Test', difficulty: 'snadna', seed: 41 });

describe('stadion a zázemí', () => {
  it('stavba se zaplatí hned, dokončí se v termínu a zapíše se do rozvahy', () => {
    const option = projectOptions(start).find((o) => o.kind === 'vip')!;
    const r = startProject(start, option.label);
    expect(r.ok).toBe(true);
    expect(r.state.clubs.bohemians.finance.balance).toBe(start.clubs.bohemians.finance.balance - option.cost);
    expect(balanceSheet(r.state).buildings).toBe(option.cost);
    expect(startProject(r.state, option.label).ok).toBe(false);
    const done = weeks(r.state, option.weeks + 1);
    expect(done.clubs.bohemians.facilities.vip).toBe(start.clubs.bohemians.facilities.vip + option.value);
    expect(done.projects).toHaveLength(0);
    expect(done.clubs.bohemians.finance.accounting!.buildingDepreciation).toBeGreaterThan(0);
  });

  it('lepší vybavení nesníží komerční příjmy (investice se vyplatí)', () => {
    const s = structuredClone(start);
    const before = commercialMonthly(s.clubs.bohemians, 1);
    s.clubs.bohemians.facilities.catering = 3;
    s.clubs.bohemians.stadium.capacity += 3000;
    expect(commercialMonthly(s.clubs.bohemians, 1)).toBe(before);
  });
});

describe('úvěr', () => {
  it('čerpání přidá peníze, splátky snižují dluh a úroky jdou do nákladů', () => {
    const amount = loanOffers(start)[0];
    const s = takeLoan(start, amount);
    expect(s.clubs.bohemians.finance.balance).toBe(start.clubs.bohemians.finance.balance + amount);
    expect(loanOffers(s)).toHaveLength(0);
    monthlyLoans(s);
    expect(s.loans[0].remaining).toBeLessThan(amount);
    expect(s.clubs.bohemians.finance.accounting!.interest).toBeGreaterThan(0);
  });
});

describe('situace k rozhodnutí', () => {
  it('sponzorská místa: část obsazená, na volná přijdou nabídky, podpis zvedne příjmy', () => {
    const s = structuredClone(start);
    expect(s.clubs.bohemians.sponsors?.length).toBe(3);
    const offers = s.sponsorOffers ?? [];
    expect(offers.length).toBeGreaterThanOrEqual(8);
    const naming = offers.find((o) => o.slot === 'stadion')!;
    const before = sponsorMonthly(s).contracts;
    const r = signSponsor(s, naming.id);
    expect(r.ok).toBe(true);
    expect(sponsorMonthly(r.state).contracts).toBeGreaterThan(before);
    expect(r.state.clubs.bohemians.stadium.name).toContain('Arena');
    expect(r.state.sponsorOffers!.some((o) => o.slot === 'stadion')).toBe(false);
    const bonus = offers.find((o) => o.style === 'bonus')!;
    expect(bonus.bonus!.amount).toBeGreaterThan(0);
    expect(bonus.annual).toBeLessThan(offers.find((o) => o.slot === bonus.slot && o.style === 'jistota')!.annual);
  });
});

describe('přestupy v lize', () => {
  it('kluby si během letního okna kupují hráče mezi sebou', () => {
    const s = weeks(start, 9);
    const domestic = s.market.history.filter((h) => h.fee > 0 && s.clubs[h.fromId] && s.clubs[h.toId] && h.toId !== 'bohemians');
    expect(domestic.length).toBeGreaterThan(10);
  });
});
