import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { approveBudget, budgetChanged, changeImpact, policyImpact, forecastSeason, leagueBenchmarks, multiYearOutlook } from './budget';
import { advanceDays, migrateSave, newGame, updatePolicy } from './game';
import { campBonus, communityEffect, fanshopDetail, maintenanceMonthly } from './operations';
import { budgetRemaining } from './transfers';
import type { DataPack } from './types';
import { answerEventOffer, eventOfferTick } from './venue';
import { createRng } from './rng';

const start = newGame(pack as DataPack, { clubId: 'bohemians', ownerName: 'T', difficulty: 'stredni', seed: 5 });
const line = (s: typeof start, k: string) => forecastSeason(s).lines.find((l) => l.key === k)!.amount;

describe('řádky rozpočtu a jejich dopad', () => {
  it('fanshop: nová kolekce zvedne tržby, drahé ceny víc vynesou', () => {
    const base = fanshopDetail(start);
    expect(base.net).toBeGreaterThan(0);
    expect(fanshopDetail(updatePolicy(start, { newKit: true })).net).toBeGreaterThan(base.net);
    expect(fanshopDetail(updatePolicy(start, { merchPrice: 'vysoka' })).gross).toBeGreaterThan(base.gross);
  });

  it('akce na stadionu: přijatá nabídka je ve výhledu a přinese peníze', () => {
    const s = structuredClone(start);
    for (let i = 0; i < 10 && !(s.eventOffers ?? []).length; i++) eventOfferTick(s, createRng(i));
    const offer = s.eventOffers![0];
    const accepted = answerEventOffer(s, offer.id, true).state;
    expect(line(accepted, 'akce')).toBeGreaterThan(0);
    const later = advanceDays(accepted, 45).state;
    expect(later.clubs.bohemians.finance.season.akce).toBeGreaterThan(0);
  });

  it('údržba, soustředění, bezpečnost a komunita mění výdaje i hru', () => {
    const club = start.clubs.bohemians;
    expect(maintenanceMonthly({ ...club, policy: { ...club.policy, maintenance: 'nizka' } }, 1)).toBeLessThan(maintenanceMonthly(club, 1));
    expect(line(updatePolicy(start, { summerCamp: 'zahranici' }), 'soustredeni')).toBeLessThan(line(start, 'soustredeni'));
    expect(line(updatePolicy(start, { security: 'vysoka' }), 'bezpecnost')).toBeLessThan(line(start, 'bezpecnost'));
    expect(communityEffect({ ...club, policy: { ...club.policy, community: 0 } }, 1)).toBe(-1);
    // Bonus jen za zaplacené soustředění: přepnutí po zaplacení nic nepřinese.
    const cheap = advanceDays(updatePolicy(start, { summerCamp: 'zadne' }), 12).state;
    const switched = updatePolicy(cheap, { summerCamp: 'zahranici' });
    switched.date = `${switched.season}-08-10`;
    expect(campBonus(switched)).toBeLessThan(0);
    const paid = advanceDays(updatePolicy(start, { summerCamp: 'zahranici' }), 12).state;
    paid.date = `${paid.season}-08-10`;
    expect(campBonus(paid)).toBeGreaterThan(0);
    const after = advanceDays(updatePolicy(start, { summerCamp: 'zahranici' }), 12).state;
    expect(after.clubs.bohemians.finance.season.soustredeni).toBeLessThan(0);
  });

  it('prodejní klub dostane víc nabídek než klub, který drží kádr', () => {
    const count = (policy: 'drzet' | 'prodejni') => {
      let s = updatePolicy(start, { salesPolicy: policy, autoSquad: false });
      let n = 0;
      const seen = new Set<string>();
      for (let i = 0; i < 8; i++) {
        s = advanceDays(s, 7).state;
        for (const o of s.market.offers) if (!seen.has(o.id)) seen.add(o.id), n++;
      }
      return n;
    };
    expect(count('prodejni')).toBeGreaterThan(count('drzet'));
  });

  it('dopad neschválené změny ukazuje jen rozdíl nastavení', () => {
    const s = approveBudget(start).state;
    const i = changeImpact(updatePolicy(s, { maintenance: 'vysoka' }))!;
    expect(i.after).toBeLessThan(i.before);
    expect(changeImpact(s)).toBeUndefined();
  });

  it('drahé ceny se ve výhledu projeví poklesem nálady a dopad změny jde spočítat', () => {
    const i = policyImpact(start, { cateringPrice: 'vysoka', merchPrice: 'vysoka' });
    expect(i.moodYear).toBeLessThan(-10);
    const neutral = policyImpact(start, { maintenance: 'bezna' });
    expect(neutral.result).toBe(0);
    expect(budgetChanged(updatePolicy(approveBudget(start).state, { maintenance: 'bezna' }))).toBe(false);
  });

  it('prodejní klub: ředitel sám neprodá opory', () => {
    const core = Object.values(start.players).filter((p) => p.clubId === 'bohemians').sort((a, b) => b.overall - a.overall).slice(0, 6).map((p) => p.id);
    // Bez peněz na nákupy zůstanou opory oporami (posily by je jinak mohly odsunout).
    let s = updatePolicy(start, { salesPolicy: 'prodejni', transferBudget: 0 });
    for (let i = 0; i < 10; i++) s = advanceDays(s, 7).state;
    for (const id of core) expect(s.players[id].clubId).toBe('bohemians');
  });

  it('minimální rezerva omezí peníze na přestupy', () => {
    const balance = start.clubs.bohemians.finance.balance;
    expect(budgetRemaining(updatePolicy(start, { cashReserve: balance - 1_000_000 }))).toBeLessThanOrEqual(1_000_000);
  });

  it('srovnání s ligou a závazky na tři roky', () => {
    const b = leagueBenchmarks(start);
    expect(b.platy.clubs).toBe(start.competitions[Object.keys(start.competitions).find((id) => start.competitions[id].clubIds.includes('bohemians'))!].clubIds.length);
    expect(b.platy.rank).toBeGreaterThanOrEqual(1);
    const f = multiYearOutlook(start);
    expect(f).toHaveLength(3);
    expect(f[0].wages).toBeLessThan(0);
    expect(f[2].players).toBeLessThanOrEqual(f[0].players);
  });

  it('uložená hra verze 9 dostane nové kategorie', () => {
    const old = structuredClone(start) as unknown as Record<string, unknown> & { version: number };
    old.version = 9;
    for (const c of Object.values((old as unknown as typeof start).clubs)) delete (c.finance.season as Partial<typeof c.finance.season>).fanshop;
    const m = migrateSave(old)!;
    expect(m.version).toBe(11);
    expect(m.clubs.bohemians.finance.season.fanshop).toBe(0);
    expect(() => advanceDays(m, 40)).not.toThrow();
  });
});
