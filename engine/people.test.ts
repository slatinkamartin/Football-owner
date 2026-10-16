import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { advanceWeek, newGame } from './game';
import { squadOf } from './players';
import {
  candidates,
  coachBonus,
  coachOf,
  directorOf,
  fireStaff,
  giveAdvice,
  hireStaff,
  isInterested,
  setSeasonGoal,
} from './staff';
import {
  acceptOffer,
  budgetRemaining,
  interest,
  offerFee,
  offerTerms,
  releasePlayer,
  renewContract,
  renewalDemand,
  startNegotiation,
} from './transfers';
import { academyBonus, candidates as staffCandidates, commercialFactor, financeFactor, hireStaff as hire } from './staff';
import type { DataPack, GameState } from './types';
import { FREE } from './world';

const czPack = pack as DataPack;

function weeks(state: GameState, n: number): GameState {
  let s = state;
  for (let i = 0; i < n; i++) s = advanceWeek(s);
  return s;
}

/** Hráč z jiného klubu, který by do klubu majitele přestoupil. */
function target(state: GameState, fromClub: string): string {
  const p = squadOf(state, fromClub).find((x) => interest(state, x, state.owner.clubId).ok)!;
  return p.id;
}

describe('lidé', () => {
  const start = newGame(czPack, { clubId: 'bohemians', ownerName: 'Test', difficulty: 'stredni', seed: 11 });

  it('každý klub má trenéra, klub majitele i ředitele, trh má volné hráče', () => {
    for (const comp of Object.values(start.competitions)) {
      for (const id of comp.clubIds) expect(coachOf(start, id)).toBeDefined();
    }
    expect(directorOf(start, 'bohemians')).toBeDefined();
    expect(Object.values(start.players).filter((p) => p.clubId === FREE).length).toBeGreaterThanOrEqual(60);
    expect(candidates(start, 'trener').length).toBeGreaterThanOrEqual(14);
  });

  it('bez trenéra je tým slabší', () => {
    expect(coachBonus(undefined)).toBeLessThan(coachBonus(coachOf(start, 'bohemians')));
  });

  it('odvolání trenéra stojí odstupné a nový trenér nastoupí', () => {
    const fired = fireStaff(start, 'trener');
    expect(fired.ok).toBe(true);
    expect(fired.state.clubs.bohemians.staff.coachId).toBe('');
    expect(fired.state.clubs.bohemians.finance.balance).toBeLessThan(start.clubs.bohemians.finance.balance);

    const pick = candidates(fired.state, 'trener').find((c) => isInterested(c, fired.state.clubs.bohemians))!;
    const hired = hireStaff(fired.state, pick.id, 2);
    expect(hired.ok).toBe(true);
    expect(hired.state.clubs.bohemians.staff.coachId).toBe(pick.id);
    expect(hired.state.staff[pick.id].clubId).toBe('bohemians');
  });

  it('špičkový trenér nejde do malého klubu', () => {
    const small = newGame(czPack, { clubId: 'kozlovice', ownerName: 'Test', difficulty: 'stredni', seed: 3 });
    const star = { ...candidates(small, 'trener')[0], ability: 90 };
    expect(isInterested(star, small.clubs.kozlovice)).toBe(false);
  });

  it('nereálný cíl sníží důvěru trenéra', () => {
    const r = setSeasonGoal(start, 'titul');
    expect(r.state.owner.seasonGoal).toBe('titul');
    expect(r.state.owner.trust.trener).toBeLessThan(start.owner.trust.trener);
  });

  it('rady trenérovi mají ochrannou lhůtu', () => {
    const first = giveAdvice(start, 'mladi');
    const second = giveAdvice(first.state, 'utok');
    expect(second.ok).toBe(false);
    expect(second.state).toBe(first.state);
  });
});

describe('přestupy', () => {
  const start = newGame(czPack, { clubId: 'slavia', ownerName: 'Test', difficulty: 'stredni', seed: 21 });

  it('vyjednávání: odstupné, smlouva, peníze a hráč se přesunou', () => {
    const playerId = target(start, 'pardubice');
    let r = startNegotiation(start, playerId);
    expect(r.ok).toBe(true);
    const n = r.state.market.negotiation!;
    expect(n.stage).toBe('klub');

    r = offerFee(r.state, 10_000);
    expect(r.state.market.negotiation!.stage).toBe('klub');
    expect(r.state.market.negotiation!.roundsLeft).toBe(2);

    r = offerFee(r.state, n.minFee);
    expect(r.state.market.negotiation!.stage).toBe('hrac');

    const before = r.state;
    r = offerTerms(r.state, n.minWage, 3);
    expect(r.state.market.negotiation!.stage).toBe('hotovo');
    const p = r.state.players[playerId];
    expect(p.clubId).toBe('slavia');
    expect(p.wage).toBe(n.minWage);
    expect(p.contractUntil).toBe(start.season + 3);
    expect(r.state.market.spent).toBe(n.minFee);
    expect(r.state.clubs.slavia.finance.balance).toBe(before.clubs.slavia.finance.balance - n.minFee - n.minWage * 2);
    expect(r.state.clubs.pardubice.finance.balance).toBe(before.clubs.pardubice.finance.balance + n.minFee);
  });

  it('nabídka nad rozpočet neprojde', () => {
    const r = startNegotiation(start, target(start, 'plzen'));
    const over = offerFee(r.state, budgetRemaining(r.state) + 1_000_000);
    expect(over.ok).toBe(false);
    expect(over.state).toBe(r.state);
  });

  it('volný hráč: jedná se rovnou o smlouvě', () => {
    const fa = Object.values(start.players).find((p) => p.clubId === FREE && interest(start, p, 'slavia').ok)!;
    const r = startNegotiation(start, fa.id);
    expect(r.state.market.negotiation!.stage).toBe('hrac');
    expect(r.state.market.negotiation!.minFee).toBe(0);
  });

  it('mimo přestupní okno se nejedná', () => {
    const september = weeks(start, 10);
    expect(startNegotiation(september, target(september, 'pardubice')).ok).toBe(false);
  });

  it('prodej hráče přinese peníze a polovinu do rozpočtu', () => {
    const p = squadOf(start, 'slavia')[5];
    const s = structuredClone(start);
    s.market.offers.push({ id: 'o1', playerId: p.id, buyerId: 'sparta', fee: 20_000_000, expires: '2026-07-20', advice: 'prijmout', note: '' });
    const r = acceptOffer(s, 'o1');
    expect(r.state.players[p.id].clubId).toBe('sparta');
    expect(r.state.clubs.slavia.finance.balance).toBe(s.clubs.slavia.finance.balance + 20_000_000);
    expect(r.state.market.earned).toBe(10_000_000);
  });

  it('nevyřešená smlouva na konci sezóny vyprší, prodloužená ne', { timeout: 30000 }, () => {
    const s = structuredClone(start);
    const [a, b] = squadOf(s, 'slavia').sort((x, y) => x.overall - y.overall);
    a.contractUntil = s.season + 1;
    b.contractUntil = s.season + 1;
    const renewed = renewContract(s, b.id, renewalDemand(s, b) + 1000, 3);
    expect(renewed.ok).toBe(true);
    expect(renewContract(s, b.id, 1000, 3).ok).toBe(false);
    const after = weeks(renewed.state, 52);
    expect(after.players[a.id]?.clubId ?? FREE).not.toBe('slavia');
    expect(after.players[b.id].clubId).toBe('slavia');
  });

  it('po zavření okna má klub dost hráčů', () => {
    let s = start;
    for (const p of squadOf(start, 'slavia').slice(0, 12)) s = releasePlayer(s, p.id).state;
    expect(squadOf(s, 'slavia').length).toBe(12);
    s = weeks(s, 10);
    expect(squadOf(s, 'slavia').length).toBeGreaterThanOrEqual(18);
    expect(squadOf(s, 'slavia').filter((p) => p.position === 'GK').length).toBeGreaterThanOrEqual(2);
  });
});

describe('další ředitelé', () => {
  it('obchodní a finanční ředitel zvednou příjmy a sníží náklady', () => {
    let s = newGame(pack as DataPack, { clubId: 'bohemians', ownerName: 'T', difficulty: 'snadna', seed: 3 });
    expect(commercialFactor(s)).toBe(1);
    for (const role of ['obchodni', 'financni', 'akademie', 'media'] as const) {
      const c = staffCandidates(s, role).find((x) => x.ability > 45 && x.ability - (20 + s.clubs.bohemians.reputation * 0.6) <= 15);
      expect(c).toBeTruthy();
      const r = hire(s, c!.id, 2);
      expect(r.ok).toBe(true);
      s = r.state;
    }
    expect(commercialFactor(s)).toBeGreaterThan(1);
    expect(financeFactor(s)).toBeLessThan(1);
    expect(academyBonus(s, 'bohemians')).toBeGreaterThan(0);
    expect(s.clubs.bohemians.staff.mediaId).toBeTruthy();
  });
});
