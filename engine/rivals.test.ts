import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { advanceToNextMatch, newGame } from './game';
import { NATURE_LABEL, natureOf, realManagement, resolveRivalEvent, rivalBoard, rivalOverbid, topRivals } from './rivals';
import { startNegotiation, offerFee } from './transfers';
import type { DataPack, GameState } from './types';

const start = newGame(pack as DataPack, { clubId: 'bohemians', ownerName: 'T', difficulty: 'snadna', seed: 7 });

describe('vedení soupeřů', () => {
  it('skutečné vedení je jen fakt z dat, kluby bez údajů nic neukazují', () => {
    expect(realManagement('sparta')?.owner).toBe('Daniel Křetínský');
    expect(realManagement('sparta')?.source).toContain('wikipedia');
    expect(realManagement('olomouc')).toBeUndefined();
    expect(Object.keys(NATURE_LABEL)).toContain(natureOf('slavia'));
    expect(natureOf('slavia')).toBe(natureOf('slavia'));
  });

  it('pražské derby je mezi největšími rivaly a vztah s ním je chladný', () => {
    const top = topRivals(start, 3);
    expect(top).toHaveLength(3);
    const derby = top.find((r) => r.clubId === 'slavia' || r.clubId === 'sparta')!;
    expect(derby).toBeDefined();
    expect(derby.rivalry).toBeGreaterThanOrEqual(40);
    expect(derby.relation).toBeLessThan(0);
  });

  it('vzájemný zápas zvedne rivalitu a zapíše poslední střet', () => {
    const r = advanceToNextMatch(start);
    const s = advanceToNextMatch(r.state).state; // odehraje zápas
    const played = Object.values(s.competitions).flatMap((c) => c.fixtures).filter((f) => f.result && (f.homeId === 'bohemians' || f.awayId === 'bohemians'));
    expect(played.length).toBeGreaterThan(0);
    const opp = played[0].homeId === 'bohemians' ? played[0].awayId : played[0].homeId;
    const e = s.rivalBoards?.clubs[opp];
    expect(e?.last?.text).toMatch(/zápas|derby/);
    expect(e!.rivalry).toBeGreaterThan(rivalBoard(start, opp).rivalry);
  });

  it('vedení soupeře může přebít nabídku a musíte dorovnat', () => {
    const own = start.owner.clubId;
    const level = Object.values(start.players).filter((p) => p.clubId === own).map((p) => p.overall).sort((a, b) => b - a).slice(0, 11);
    const bar = level.reduce((a, x) => a + x, 0) / level.length;
    const targets = Object.values(start.players).filter((p) => p.clubId && p.clubId !== own && p.overall >= bar - 3).slice(0, 80);
    let hit: GameState | undefined;
    for (const p of targets) {
      const r = startNegotiation(start, p.id);
      if (!r.ok || r.state.market.negotiation?.rival || r.state.market.negotiation?.stage !== 'klub') continue;
      const s = structuredClone(r.state);
      const msg = rivalOverbid(s, s.market.negotiation!, s.market.negotiation!.askingFee);
      if (msg) {
        expect(msg).toMatch(/přebilo/);
        hit = s;
        break;
      }
    }
    expect(hit).toBeDefined();
    const neg = hit!.market.negotiation!;
    expect(neg.rival).toBeDefined();
    expect(hit!.news[0].title).toMatch(/^Vedení klubu .* přebilo/);
    expect(hit!.rivalBoards!.clubs[neg.rival!.clubId].last?.text).toMatch(/přebili/);
    // Původní částka už nestačí, dorovnání ano.
    hit!.clubs[own].policy.transferBudget = 10_000_000_000;
    expect(offerFee(hit!, neg.askingFee).state.market.negotiation?.stage).toBe('klub');
    expect(offerFee(hit!, Math.ceil(neg.rival!.fee * 1.03)).state.market.negotiation?.stage).toBe('hrac');
  });

  it('lákání sponzora: bez dorovnání sponzor odejde, sleva ho udrží', () => {
    const s = structuredClone(start);
    const club = s.clubs[s.owner.clubId];
    const contract = (club.sponsors ?? []).find((c) => c.slot !== 'generalni')!;
    expect(contract).toBeDefined();
    const event = { id: 'e-test', template: 'rival-sponzor', date: s.date, expires: s.date, title: 't', text: 't', options: [], defaultOption: 'odejit', amount: contract.annual };
    const prep = (st: GameState) => {
      st.rivalBoards = { clubs: {}, pending: { 'e-test': { clubId: 'slavia', slot: contract.slot } } };
      return st;
    };
    const a = prep(structuredClone(s));
    resolveRivalEvent(a, event, 'odejit');
    expect(a.clubs[a.owner.clubId].sponsors!.some((c) => c.slot === contract.slot)).toBe(false);
    expect(a.rivalBoards!.clubs.slavia.rivalry).toBeGreaterThan(rivalBoard(s, 'slavia').rivalry);
    const b = prep(structuredClone(s));
    resolveRivalEvent(b, event, 'sleva');
    const kept = b.clubs[b.owner.clubId].sponsors!.find((c) => c.slot === contract.slot)!;
    expect(kept.annual).toBeLessThan(contract.annual);
    expect(kept.annual).toBeGreaterThan(contract.annual * 0.8);
  });
});
