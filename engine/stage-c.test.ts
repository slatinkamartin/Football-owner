import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { createEvent, resolveEvent } from './events';
import { advanceDays, newGame } from './game';
import { checkPromises, closeYouthIntake, createYouthIntake, delegationOf, hireWithInterview, interviewFit, toggleYouth, updateDelegation, youthView } from './people';
import { createRng } from './rng';
import { squadOf } from './players';
import { candidates, isInterested } from './staff';
import { directorSignings } from './transfers';
import type { DataPack } from './types';

const start = newGame(pack as DataPack, { clubId: 'bohemians', ownerName: 'T', difficulty: 'stredni', seed: 31 });

describe('etapa C: lidé', () => {
  it('žádost o přidání: přidat zvedne plat i morálku', () => {
    const s = structuredClone(start);
    const p = squadOf(s, 'bohemians').sort((a, b) => b.overall - a.overall)[0];
    p.wage = 5_000;
    p.contractUntil = s.season + 3;
    createEvent(s, createRng(1), 'zadost-plat');
    const e = s.events.find((x) => x.template === 'zadost-plat')!;
    expect(e).toBeDefined();
    const after = resolveEvent(s, e.id, 'pridat').state;
    expect(after.players[e.playerId!].wage).toBeGreaterThan(5_000);
    expect(after.players[e.playerId!].morale).toBeGreaterThan(s.players[e.playerId!].morale);
  });

  it('požadavek trenéra na posilu: nesplněný slib srazí důvěru', () => {
    const s = structuredClone(start);
    createEvent(s, createRng(2), 'pozadavek-posila');
    const e = s.events.find((x) => x.template === 'pozadavek-posila')!;
    let x = resolveEvent(s, e.id, 'slib').state;
    expect(x.promises!.length).toBe(1);
    const trust = x.owner.trust.trener;
    x.date = '2026-09-02';
    checkPromises(x);
    expect(x.promises![0].done).toBe('poruseno');
    expect(x.owner.trust.trener).toBeLessThan(trust);
  });

  it('přijímačky dorostu: výběr, limit a podpis', () => {
    const s = structuredClone(start);
    createYouthIntake(s, createRng(3), s.season + 1, 45, 3, 0);
    const it = s.youthIntake!;
    expect(it.candidates.length).toBeGreaterThanOrEqual(4);
    const v = youthView(s, it.candidates[0]);
    expect(v.potLo).toBeLessThanOrEqual(it.candidates[0].potential);
    let x = toggleYouth(s, it.candidates[0].id).state;
    x = toggleYouth(x, it.candidates[1].id).state;
    expect(toggleYouth(x, it.candidates[2].id).ok).toBe(false);
    x = closeYouthIntake(x).state;
    expect(x.players[it.candidates[0].id].clubId).toBe('bohemians');
    expect(x.players[it.candidates[2].id].clubId).toBe('');
    expect(x.youthIntake).toBeUndefined();
  });

  it('pohovor: odpovědi mění výchozí důvěru a slib rozpočtu se hlídá', () => {
    const coach = candidates(start, 'trener').find((c) => isInterested(c, start.clubs.bohemians))!;
    const good = interviewFit(start, coach.id, { youth: coach.youthFocus ? 'mladi' : 'vysledky', budget: 'navysit' });
    const bad = interviewFit(start, coach.id, { youth: coach.youthFocus ? 'vysledky' : 'mladi', budget: 'setrit' });
    expect(good.trust).toBeGreaterThan(bad.trust);
    const r = hireWithInterview(start, coach.id, 2, { youth: 'vyvazene', budget: 'udrzet' });
    expect(r.ok).toBe(true);
    const x = structuredClone(r.state);
    expect(x.promises!.some((p) => p.kind === 'rozpocet')).toBe(true);
    x.clubs.bohemians.policy.transferBudget = 0;
    const before = x.owner.trust.trener;
    checkPromises(x);
    expect(x.owner.trust.trener).toBeLessThan(before);
  });

  it('pravomoci: bez plné pravomoci ředitel nenakupuje', () => {
    const s = updateDelegation(start, { director: 'stredni' }).state;
    expect(delegationOf(s.clubs.bohemians).director).toBe('stredni');
    const x = structuredClone(s);
    x.clubs.bohemians.policy.transferBudget = 500_000_000;
    const before = squadOf(x, 'bohemians').length;
    directorSignings(x, createRng(4));
    expect(squadOf(x, 'bohemians').length).toBe(before);
  });

  it('sezóna s lidmi proběhne a na konci se otevřou přijímačky', () => {
    const s = advanceDays(start, 366).state;
    expect(s.youthIntake?.candidates.length ?? 0).toBeGreaterThan(0);
    const later = advanceDays(s, 20).state;
    expect(later.youthIntake).toBeUndefined();
  }, 120_000);
});
