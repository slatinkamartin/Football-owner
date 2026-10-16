import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { advanceDays, advanceUntil, newGame } from './game';
import { agentFeeFactor, agentOf, closeDomino, deadlineDay, monthlyAgents, settleConditionals, toggleWatch, watchReport } from './market';
import { createRng } from './rng';
import { squadOf } from './players';
import { acceptOffer, askingPrice, offerFee, offerTerms, startNegotiation } from './transfers';
import type { DataPack, GameState } from './types';

const start = newGame(pack as DataPack, { clubId: 'slavia', ownerName: 'T', difficulty: 'stredni', seed: 41 });
const rich = (s: GameState) => {
  const x = structuredClone(s);
  x.clubs.slavia.policy.transferBudget = 2_000_000_000;
  x.clubs.slavia.policy.wageMultiplier = 2;
  x.clubs.slavia.finance.balance = 3_000_000_000;
  return x;
};

/** Najde hráče ligy, o kterého se přetahuje konkurence. */
function contested(s: GameState): { state: GameState; id: string } | undefined {
  for (const p of Object.values(s.players).filter((x) => x.clubId && x.clubId !== 'slavia' && s.clubs[x.clubId]).sort((a, b) => b.overall - a.overall).slice(0, 60)) {
    const r = startNegotiation(s, p.id);
    if (r.ok && r.state.market.negotiation?.rival) return { state: r.state, id: p.id };
  }
  return undefined;
}

describe('etapa D: přestupy', () => {
  it('konkurence: prodávající chce přeplatit konkurenční nabídku', () => {
    const c = contested(rich(start));
    expect(c).toBeDefined();
    const n = c!.state.market.negotiation!;
    const low = offerFee(c!.state, n.minFee);
    if (n.rival!.fee * 1.02 > n.minFee) expect(low.state.market.negotiation!.stage).toBe('klub');
    const high = offerFee(c!.state, Math.ceil((n.rival!.fee * 1.05) / 10_000) * 10_000 + n.minFee);
    expect(high.state.market.negotiation!.stage).toBe('hrac');
  });

  it('výstupní klauzule a doplatek se zapíšou při podpisu', () => {
    const s = rich(start);
    const p = Object.values(s.players).filter((x) => x.clubId && x.clubId !== 'slavia' && s.clubs[x.clubId]).sort((a, b) => b.overall - a.overall)[30];
    let x = startNegotiation(s, p.id).state;
    x.market.negotiation!.rival = undefined;
    x = offerFee(x, x.market.negotiation!.askingFee * 2, false, true).state;
    expect(x.market.negotiation!.conditional).toBe(true);
    x = offerTerms(x, x.market.negotiation!.minWage * 2, 3, true).state;
    expect(x.players[p.id].clubId).toBe('slavia');
    expect(x.players[p.id].releaseClause).toBeGreaterThan(0);
    expect(x.conditionals!.length).toBe(1);
    // Doplatek se zaplatí na začátku další sezóny, když klub hraje Evropu.
    const y = structuredClone(x);
    y.season += 1;
    const before = y.clubs.slavia.finance.balance;
    settleConditionals(y, false, true);
    expect(y.clubs.slavia.finance.balance).toBeLessThan(before);
    expect(y.conditionals!.length).toBe(0);
  });

  it('deadline day: hra se zastaví a nabídky platí den', () => {
    const r = advanceUntil(start, 'sezona');
    let s = r.state;
    // Hrát dál, dokud nenastane deadline day.
    for (let i = 0; i < 20 && !deadlineDay(s); i++) s = advanceUntil(s, 'sezona').state;
    expect(deadlineDay(s)).toBeDefined();
    expect(s.date.slice(5)).toBe('08-29');
  }, 120_000);

  it('domino: prodej opory bez náhrady zklame fanoušky', () => {
    const s = structuredClone(start);
    const star = squadOf(s, 'slavia').sort((a, b) => b.overall - a.overall)[0];
    s.market.offers.push({ id: 'o-test', playerId: star.id, buyerId: 'zahr:westham', fee: 300_000_000, expires: '2026-07-20', advice: 'prijmout', note: '' });
    const x = acceptOffer(s, 'o-test').state;
    expect(x.domino?.soldName).toBeTruthy();
    const mood = x.clubs.slavia.fanMood;
    closeDomino(x);
    expect(x.clubs.slavia.fanMood).toBeLessThan(mood);
  });

  it('agenti a sledovaní hráči', () => {
    const p = Object.values(start.players).find((x) => x.clubId === 'sparta')!;
    expect(agentFeeFactor(start, p.id)).toBeGreaterThan(0);
    expect(agentOf(start, p.id).name).toBeTruthy();
    const s = toggleWatch(start, p.id).state;
    expect(watchReport(s).length).toBe(1);
    const x = structuredClone(s);
    for (const a of (x.agents = x.agents ?? [])) a.relation = 90;
    monthlyAgents(x, createRng(5));
    expect(askingPrice(x, p)).toBeGreaterThan(0);
  });

  it('sezóna s trhem běží bez chyb', () => {
    const s = advanceDays(rich(start), 120).state;
    expect(s.gameOver).toBeUndefined();
  }, 60_000);
});
