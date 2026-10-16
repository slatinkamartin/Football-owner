import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { activeOverdraft, applyGrant, lendToClub, licenceProblems, repayOwnerLoan, sellTvAdvance, setOverdraft, tvAdvanceOffer } from './financing';
import { balanceSheet, investmentLoanOffer, takeLoan } from './finance';
import { advanceDays, newGame, updatePolicy } from './game';
import { squadOf } from './players';
import { acceptOffer, executeTransfer } from './transfers';
import { DEFAULT_SPLIT, sectionRoomFor, sectionsOf, sectionUsage, setWageSection, wageCommitments, wageMorale } from './wages';
import { projectOptions, startProject } from './facilities';
import type { DataPack, GameState } from './types';

const czPack = pack as DataPack;
const start = newGame(czPack, { clubId: 'bohemians', ownerName: 'T', difficulty: 'snadna', seed: 9 });

describe('mzdové sekce', () => {
  it('strop se dělí do sekcí a hráči jsou zařazení', () => {
    const usage = sectionUsage(start);
    expect(usage.map((u) => u.section)).toEqual(['opory', 'zaklad', 'rotace', 'mladi']);
    expect(usage.find((u) => u.section === 'opory')!.players).toBe(6);
    const cap = usage.reduce((a, u) => a + u.cap, 0);
    expect(cap).toBeGreaterThan(0);
    expect(usage[0].cap / cap).toBeCloseTo(DEFAULT_SPLIT.opory, 1);
    expect(wageCommitments(start)[0].amount).toBeGreaterThan(0);
  });

  it('malá sekce zablokuje drahý podpis a ruční přeřazení se projeví', () => {
    const s = updatePolicy(start, { wageSplit: { opory: 0.05, zaklad: 0.55, rotace: 0.3, mladi: 0.1 } });
    const star = Object.values(s.players).filter((p) => p.clubId !== 'bohemians' && p.clubId).sort((a, b) => b.overall - a.overall)[0];
    expect(sectionRoomFor(s, star, star.wage).room).toBeLessThan(0);
    const p = squadOf(s, 'bohemians').sort((a, b) => b.overall - a.overall)[0];
    const moved = setWageSection(s, p.id, 'rotace');
    expect(sectionsOf(moved).get(p.id)).toBe('rotace');
    expect(sectionUsage(moved).find((u) => u.section === 'rotace')!.players).toBe(sectionUsage(s).find((u) => u.section === 'rotace')!.players);
  });

  it('opora, která bere méně než hráč z rotace, ztrácí morálku', () => {
    const s: GameState = structuredClone(start);
    const squad = squadOf(s, 'bohemians').sort((a, b) => b.overall - a.overall);
    for (const p of squad) p.morale = 60;
    squad[squad.length - 1].wage = squad[0].wage * 3;
    wageMorale(s);
    expect(s.players[squad[0].id].morale).toBeLessThan(60);
  });
});

describe('financování', () => {
  it('půjčka majitele se vrací a licence ji bere jako vlastní zdroje', () => {
    const r = lendToClub(start, 20_000_000);
    expect(r.ok).toBe(true);
    expect(r.state.owner.wallet).toBe(start.owner.wallet - 20_000_000);
    expect(balanceSheet(r.state).ownerLoan).toBe(20_000_000);
    const back = repayOwnerLoan(r.state, 5_000_000);
    expect(back.state.ownerLoan!.remaining).toBe(15_000_000);
    expect(back.state.owner.wallet).toBe(r.state.owner.wallet + 5_000_000);
  });

  it('kontokorent: minus v limitu se nepočítá do insolvence, platí se úrok', () => {
    let s = setOverdraft(start, true).state;
    const limit = activeOverdraft(s);
    expect(limit).toBeGreaterThan(0);
    s = structuredClone(s);
    s.clubs.bohemians.finance.balance = -limit / 2;
    s = advanceDays(s, 31).state;
    expect(s.clubs.bohemians.finance.monthsNegative).toBe(0);
    expect(s.clubs.bohemians.finance.transactions.some((t) => t.note.startsWith('Kontokorent'))).toBe(true);
  });

  it('záloha na TV peníze a investiční úvěr na stavbu', () => {
    const tv = tvAdvanceOffer(start);
    const r = sellTvAdvance(start);
    expect(r.state.clubs.bohemians.finance.balance).toBe(start.clubs.bohemians.finance.balance + tv);
    expect(tvAdvanceOffer(r.state)).toBe(0);
    expect(investmentLoanOffer(start)).toBe(0);
    const opt = projectOptions(start).filter((o) => !o.blocked).sort((a, b) => b.cost - a.cost)[0];
    const built = startProject(start, opt.label).state;
    const offer = investmentLoanOffer(built);
    expect(offer).toBeGreaterThan(0);
    expect(takeLoan(built, offer, 'investicni').loans[0].kind).toBe('investicni');
  });

  it('žádost o dotaci se do dvou měsíců rozhodne', () => {
    const r = applyGrant(start, 'energie');
    expect(r.ok).toBe(true);
    expect(applyGrant(r.state, 'energie').ok).toBe(false);
    const later = advanceDays(r.state, 62).state;
    expect(later.grants![0].result).toBeDefined();
  });
});

describe('přestupy a licence', () => {
  it('splátky odstupného: polovina hned, zbytek se doplatí', () => {
    const s: GameState = structuredClone(start);
    const seller = Object.values(s.competitions).find((c) => c.tier === 1)!.clubIds.find((id) => id !== 'bohemians')!;
    const p = squadOf(s, seller)[0];
    const before = s.clubs.bohemians.finance.balance;
    executeTransfer(s, p, 'bohemians', 10_000_000, p.wage, 3, { instalments: true });
    expect(s.clubs.bohemians.finance.balance).toBe(before - 5_000_000);
    expect(balanceSheet(s).payables).toBe(5_000_000);
    const later = advanceDays(s, 370).state;
    expect(later.payments!.filter((x) => x.from === 'bohemians')).toHaveLength(0);
  });

  it('podíl z dalšího prodeje přinese peníze při dalším přestupu', () => {
    const s: GameState = structuredClone(start);
    const p = squadOf(s, 'bohemians')[0];
    const buyer = Object.values(s.competitions).find((c) => c.tier === 1)!.clubIds.find((id) => id !== 'bohemians')!;
    s.market.offers = [{ id: 'o1', playerId: p.id, buyerId: buyer, fee: 10_000_000, expires: '2030-01-01', advice: 'prijmout', note: '' }];
    const sold = acceptOffer(s, 'o1', true).state;
    expect(sold.players[p.id].sellOn?.clubId).toBe('bohemians');
    const balance = sold.clubs.bohemians.finance.balance;
    const other = Object.values(sold.competitions).find((c) => c.tier === 1)!.clubIds.find((id) => id !== 'bohemians' && id !== buyer)!;
    executeTransfer(sold, sold.players[p.id], other, 20_000_000, 100_000, 3);
    expect(sold.clubs.bohemians.finance.balance).toBe(balance + 4_000_000);
  });

  it('licence neprojde se záporným kapitálem', () => {
    const s: GameState = structuredClone(start);
    s.clubs.bohemians.finance.balance = -500_000_000;
    expect(licenceProblems(s).length).toBeGreaterThan(0);
  });
});
