import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { forecastSeason } from './budget';
import { effectiveCapacity } from './facilities';
import { buyLoanee, foreignBlocked, foreignPrice, foreignView, nonEuCount, NON_EU_LIMIT, setNetwork, signForeign, watchTarget } from './foreign';
import { advanceDays, newGame, updatePolicy } from './game';
import { bigProjectOptions, commercialIncomeMonthly, hasProgram, startBigProject, startProgram, stopProgram } from './investments';
import { effective } from './match';
import { squadOf } from './players';
import { budgetRemaining, releasePlayer } from './transfers';
import type { DataPack, GameState } from './types';

const start = newGame(pack as DataPack, { clubId: 'slavia', ownerName: 'T', difficulty: 'stredni', seed: 3 });
const rich = (s: GameState) => {
  const x = structuredClone(s);
  x.clubs.slavia.finance.balance = 3_000_000_000;
  x.clubs.slavia.policy.transferBudget = 2_000_000_000;
  x.clubs.slavia.policy.wageMultiplier = 2;
  return x;
};

describe('zahraniční trh', () => {
  it('skautská síť vyhledá hráče a stojí peníze ve výhledu', () => {
    const r = setNetwork(start, 'balkan', true);
    expect(r.ok).toBe(true);
    const targets = r.state.foreign!.targets.filter((t) => t.region === 'balkan');
    expect(targets.length).toBe(5);
    const line = (s: GameState) => forecastSeason(s).lines.find((l) => l.key === 'skautsit')!.amount;
    expect(line(r.state)).toBeLessThan(0);
    expect(line(start)).toBe(0);
    const off = setNetwork(r.state, 'balkan', false);
    expect(off.state.foreign!.targets.some((t) => t.region === 'balkan')).toBe(false);
  });

  it('odhad skautů obsahuje skutečnost a sledováním se zúží', () => {
    let s = setNetwork(start, 'afrika', true).state;
    const t = s.foreign!.targets[0];
    const before = foreignView(s, t);
    expect(before.lo).toBeLessThanOrEqual(t.player.overall);
    expect(before.hi).toBeGreaterThanOrEqual(t.player.overall);
    s = watchTarget(s, t.id, true).state;
    s = advanceDays(s, 35).state;
    const after = foreignView(s, s.foreign!.targets.find((x) => x.id === t.id)!);
    expect(after.hi - after.lo).toBeLessThan(before.hi - before.lo);
  });

  it('podpis: hráč přijde, platí se odstupné, agent a povolení, zabydluje se', () => {
    let s = rich(setNetwork(start, 'amerika', true).state);
    const t = [...s.foreign!.targets].sort((a, b) => a.fee - b.fee)[0];
    const price = foreignPrice(s, t);
    expect(foreignBlocked(s, t, price)).toBeUndefined();
    const before = s.clubs.slavia.finance.balance;
    const r = signForeign(s, t.id);
    expect(r.ok).toBe(true);
    s = r.state;
    const p = s.players[t.player.id];
    expect(p.clubId).toBe('slavia');
    expect(p.nonEu).toBe(true);
    expect(p.adapt).toBeGreaterThan(0);
    expect(s.clubs.slavia.finance.balance).toBe(before - price.total);
    expect(price.permit).toBeGreaterThan(0);
    // Zabydlování snižuje výkon a během měsíců mizí.
    const raw = { ...p, adapt: undefined };
    expect(effective(p)).toBeLessThan(effective(raw));
    const later = advanceDays(s, 200).state;
    expect(later.players[p.id].adapt ?? 0).toBeLessThan(p.adapt!);
  });

  it('limit hráčů mimo EU', () => {
    const s = rich(setNetwork(start, 'afrika', true).state);
    for (const p of squadOf(s, 'slavia').slice(0, NON_EU_LIMIT)) p.nonEu = true;
    expect(nonEuCount(s)).toBe(NON_EU_LIMIT);
    const t = s.foreign!.targets[0];
    expect(foreignBlocked(s, t)).toMatch(/mimo EU/);
  });

  it('hostování: bez odstupného, opce, návrat po sezóně', () => {
    let s = rich(setNetwork(start, 'velke', true).state);
    const t = s.foreign!.targets[0];
    expect(t.loan).toBeDefined();
    s = signForeign(s, t.id).state;
    expect(s.players[t.player.id].loan).toBeDefined();
    // Návrat na konci sezóny.
    const end = advanceDays(s, 370).state;
    expect(end.players[t.player.id]).toBeUndefined();
    // Opce: zůstane natrvalo.
    const bought = buyLoanee(s, t.player.id);
    expect(bought.ok).toBe(true);
    expect(bought.state.players[t.player.id].loan).toBeUndefined();
    expect(advanceDays(bought.state, 370).state.players[t.player.id]?.clubId).toBe('slavia');
  }, 60_000);

  it('hostování lze předčasně ukončit', () => {
    let s = rich(setNetwork(start, 'velke', true).state);
    const t = s.foreign!.targets[0];
    s = signForeign(s, t.id).state;
    // Předčasné ukončení hostování.
    expect(releasePlayer(s, t.player.id).state.players[t.player.id]).toBeUndefined();
  });

  it('ředitel nakupuje v cizině, když to politika dovolí', () => {
    let s = rich(setNetwork(setNetwork(start, 'balkan', true).state, 'sever', true).state);
    s = updatePolicy(s, { directorMarket: 'zahranici' });
    const spent = budgetRemaining(s);
    const after = advanceDays(s, 50).state;
    const foreigners = squadOf(after, 'slavia').filter((p) => p.nationality);
    expect(foreigners.length).toBeGreaterThan(0);
    expect(budgetRemaining(after)).toBeLessThan(spent);
  }, 30_000);
});

describe('velké investice a programy', () => {
  it('nový stadion: splátky během stavby, provizorium, po dokončení větší kapacita', () => {
    let s = rich(start);
    const option = bigProjectOptions(s).find((o) => o.kind === 'stadion')!;
    expect(option.blocked).toBeUndefined();
    expect(option.grant).toBeGreaterThan(0);
    const cap = s.clubs.slavia.stadium.capacity;
    const r = startBigProject(s, 'stadion');
    expect(r.ok).toBe(true);
    s = r.state;
    expect(effectiveCapacity(s, s.clubs.slavia)).toBeLessThan(cap);
    expect(forecastSeason(s).lines.find((l) => l.key === 'investice')!.amount).toBeLessThan(0);
    s = advanceDays(s, 120).state;
    expect(s.bigProjects![0].paid).toBeGreaterThan(0);
    const asset = s.clubs.slavia.finance.assets!.find((a) => a.projectId);
    expect(asset!.value).toBe(s.bigProjects![0].paid);
    s = advanceDays(s, 1200).state;
    expect(s.bigProjects!.length).toBe(0);
    expect(s.clubs.slavia.stadium.capacity).toBe(option.capacity);
    expect(s.clubs.slavia.facilities.newStadium).toBe(true);
  }, 120_000);

  it('komerční areál přináší nájem', () => {
    const r = startBigProject(rich(start), 'komercni');
    expect(r.ok).toBe(true);
    const s = advanceDays(r.state, 700).state;
    expect(s.clubs.slavia.facilities.commercial).toBeGreaterThan(0);
    expect(commercialIncomeMonthly(s)).toBeGreaterThan(0);
    expect(forecastSeason(s).lines.find((l) => l.key === 'areal')!.amount).toBeGreaterThan(0);
    expect(s.clubs.slavia.finance.transactions.some((t) => t.category === 'areal')).toBe(true);
  }, 60_000);

  it('programy: roční náklad, partnerský klub zdarma otevře region', () => {
    let s = startProgram(start, 'partner', 'afrika').state;
    expect(hasProgram(s, 'partner')).toBe(true);
    expect(forecastSeason(s).lines.find((l) => l.key === 'programy')!.amount).toBeLessThan(0);
    s = setNetwork(s, 'afrika', true).state;
    expect(forecastSeason(s).lines.find((l) => l.key === 'skautsit')!.amount).toBe(0);
    const mood = s.clubs.slavia.fanMood;
    const women = stopProgram(startProgram(s, 'zeny').state, 'zeny').state;
    expect(women.clubs.slavia.fanMood).toBeLessThan(mood);
  });
});
