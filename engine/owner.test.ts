import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { createEvent, resolveEvent } from './events';
import { projectOptions, startProject } from './facilities';
import { loanOffers, takeLoan } from './finance';
import { askingPrice } from './transfers';
import { discover, greyAction, monthlyGrey, ownerCommercialFactor } from './grey';
import { advanceDays, migrateSave, newGame } from './game';
import {
  buyShares,
  callExtraordinaryAgm,
  clubValuation,
  increaseCapital,
  mediaCampaign,
  previewVote,
  sellStake,
  sharePrice,
} from './ownership';
import { createRng } from './rng';
import { computeTable } from './standings';
import type { DataPack, GameState } from './types';

const czPack = pack as DataPack;
const partial = newGame(czPack, { clubId: 'bohemians', ownerName: 'Test', difficulty: 'snadna', seed: 7, ownerShare: 0.35 });
const majority = newGame(czPack, { clubId: 'bohemians', ownerName: 'Test', difficulty: 'snadna', seed: 7, ownerShare: 0.6 });
const sole = newGame(czPack, { clubId: 'bohemians', ownerName: 'Test', difficulty: 'snadna', seed: 7 });

const unhappy = (s: GameState) => {
  const c = structuredClone(s);
  for (const x of c.shareholders) x.satisfaction = 10;
  return c;
};

describe('spolumajitelé', () => {
  it('zbytek akcií patří spolumajitelům', () => {
    expect(sole.shareholders).toHaveLength(0);
    const total = partial.owner.share + partial.shareholders.reduce((a, s) => a + s.share, 0);
    expect(total).toBeCloseTo(1, 2);
    expect(partial.shareholders.length).toBeGreaterThanOrEqual(2);
    expect(clubValuation(partial)).toBeGreaterThan(50_000_000);
  });

  it('velké rozhodnutí potřebuje souhlas akcionářů', () => {
    const angry = unhappy(partial);
    const big = projectOptions(angry).filter((o) => !o.blocked).sort((a, b) => b.cost - a.cost)[0];
    expect(big.cost).toBeGreaterThanOrEqual(20_000_000);
    expect(previewVote(angry, 'stavba', big.cost).passes).toBe(false);
    expect(startProject(angry, big.label).ok).toBe(false);
    // Nad 50 mil. Kč je potřeba dvoutřetinová většina, 60 % majitele nestačí.
    expect(previewVote(unhappy(majority), 'stavba', 30_000_000).passes).toBe(true);
    expect(previewVote(unhappy(majority), 'stavba', 60_000_000).passes).toBe(false);
    // Úvěr stačí nadpoloviční většina, kterou majitel s 60 % má.
    const loan = loanOffers(angry)[0];
    expect(takeLoan(unhappy(majority), loan).loans).toHaveLength(1);
    expect(takeLoan(unhappy(partial), loan).loans).toHaveLength(0);
    // Jediný majitel nikoho nepotřebuje.
    expect(startProject(sole, big.label).ok).toBe(true);
  });

  it('nákup akcií od spolumajitele, navýšení kapitálu a prodej podílu', () => {
    const seller = partial.shareholders.find((s) => sharePrice(partial, s, 0.05) !== null)!;
    const r = buyShares(partial, seller.id, 0.05);
    expect(r.ok).toBe(true);
    expect(r.state.owner.share).toBeCloseTo(0.4, 3);
    expect(r.state.owner.wallet).toBe(partial.owner.wallet - sharePrice(partial, seller, 0.05)!);

    const happy = structuredClone(partial);
    for (const s of happy.shareholders) s.satisfaction = 70;
    const cap = increaseCapital(happy, 50_000_000);
    expect(cap.ok).toBe(true);
    expect(cap.state.owner.share).toBeGreaterThan(happy.owner.share);
    expect(cap.state.clubs.bohemians.finance.balance).toBe(happy.clubs.bohemians.finance.balance + 50_000_000);
    expect(increaseCapital(unhappy(partial), 50_000_000).ok).toBe(false);

    const sold = sellStake(sole, 1);
    expect(sold.state.gameOver?.kind).toBe('prodej');
    expect(sold.state.owner.wallet).toBeGreaterThan(sole.owner.wallet);
  });

  it('valná hromada vyplatí dividendu a nespokojení akcionáři majitele odvolají', () => {
    const s = unhappy(partial);
    s.date = '2026-06-20';
    s.clubs.bohemians.finance.season.komercni += 20_000_000;
    s.clubs.bohemians.finance.balance += 20_000_000;
    createEvent(s, createRng(1), 'valna');
    const agm = s.events.find((e) => e.template === 'valna')!;
    expect(agm.options.map((o) => o.id)).toContain('pul');
    const r = resolveEvent(s, agm.id, 'pul');
    expect(r.state.owner.wallet).toBeGreaterThan(s.owner.wallet);
    expect(r.state.agm).toHaveLength(1);
    expect(r.state.owner.ousted).toBeTruthy();
    // Odvolaný majitel nemůže stavět a situace za něj řeší představenstvo.
    const opt = projectOptions(r.state).find((o) => !o.blocked)!;
    expect(startProject(r.state, opt.label).ok).toBe(false);
    // Nákupem většiny se vrátí.
    let back = r.state;
    back.owner.wallet = 10_000_000_000;
    for (const sh of [...back.shareholders]) {
      if (back.owner.share > 0.5) break;
      if (sharePrice(back, sh, sh.share) === null) continue;
      back = buyShares(back, sh.id, sh.share).state;
    }
    expect(back.owner.share).toBeGreaterThan(0.5);
    expect(back.owner.ousted).toBeUndefined();
  });

  it('s většinou majitele odvolat nelze; mimořádná valná hromada a kampaň', () => {
    const s = unhappy(majority);
    s.date = '2026-06-20';
    createEvent(s, createRng(1), 'valna');
    const r = resolveEvent(s, s.events.find((e) => e.template === 'valna')!.id, 'nic');
    expect(r.state.owner.ousted).toBeUndefined();

    const out = structuredClone(partial);
    out.owner.ousted = { since: '2025-06-01' };
    const c = mediaCampaign(out);
    expect(c.ok).toBe(true);
    expect(c.state.owner.media).toBeGreaterThan(out.owner.media);
    for (const x of out.shareholders) x.satisfaction = 80;
    const agm = callExtraordinaryAgm(out);
    expect(agm.ok).toBe(true);
    expect(agm.state.owner.ousted).toBeUndefined();
    expect(callExtraordinaryAgm({ ...agm.state, owner: { ...agm.state.owner, ousted: { since: agm.state.date, lastAttempt: agm.state.date } } }).ok).toBe(false);
  });

  it('odvolaný majitel: představenstvo hraje dál a rozhoduje za něj', () => {
    const s = structuredClone(partial);
    s.owner.ousted = { since: s.date };
    const later = advanceDays(s, 60).state;
    expect(later.gameOver).toBeUndefined();
    expect(later.events.filter((e) => e.template !== 'navrat')).toHaveLength(0);
  });
});

describe('šedá zóna a pověst', () => {
  it('odhalení přinese kauzu, pokutu, vratky a odečet bodů; opakování zákaz činnosti', () => {
    const s = structuredClone(partial);
    greyAction(s, { label: 'Obcházení výchovného za talent', severity: 12, points: 3, gain: 1_000_000 }, 12);
    const before = s.clubs.bohemians.finance.balance;
    discover(s);
    expect(s.gameOver).toBeUndefined();
    expect(s.grey.scandalUntil).toBeTruthy();
    expect(s.owner.media).toBeLessThan(partial.owner.media);
    expect(s.clubs.bohemians.finance.balance).toBeLessThan(before - 1_300_000);
    const comp = Object.values(s.competitions).find((c) => c.clubIds.includes('bohemians'))!;
    expect(computeTable(comp, s).find((r) => r.clubId === 'bohemians')!.points).toBe(-3);
    expect(ownerCommercialFactor(s)).toBeLessThan(0.9);
    expect(s.owner.ousted).toBeUndefined();
    // Další kauzy přes hranici závažnosti: svaz zakáže činnost, hra ale pokračuje.
    greyAction(s, { label: 'Platy přes obrazová práva', severity: 10 }, 8);
    greyAction(s, { label: 'Zakázka pro firmu majitele', severity: 10, minority: true }, 10);
    greyAction(s, { label: 'Sponzor s pochybným původem peněz', severity: 8 }, 10);
    discover(s);
    expect(s.gameOver).toBeUndefined();
    expect(s.owner.ousted?.banUntil).toBeTruthy();
    expect(projectOptions(s).length).toBeGreaterThan(0);
    const later = advanceDays(s, 370).state;
    expect(later.owner.ousted?.banUntil).toBeUndefined();
  }, 60_000);

  it('riziko časem klesá a bez prohřešků k odhalení nedojde', () => {
    const s = structuredClone(sole);
    s.grey.exposure = 20;
    const rng = createRng(3);
    for (let i = 0; i < 10; i++) monthlyGrey(s, rng);
    expect(s.grey.exposure).toBe(0);
    expect(s.grey.scandalUntil).toBeUndefined();
  });

  it('potajmu oslovený hráč je levnější a nové situace jdou vyřešit', () => {
    let s = structuredClone(sole);
    s.date = '2026-11-02';
    createEvent(s, createRng(5), 'tapping');
    const e = s.events.find((x) => x.template === 'tapping')!;
    const p = s.players[e.playerId!];
    const before = askingPrice(s, p);
    s = resolveEvent(s, e.id, 'schuzka').state;
    expect(askingPrice(s, s.players[p.id])).toBeLessThan(before);
    expect(s.grey.exposure).toBe(10);
    for (const t of ['obrazova-prava', 'spriznena-firma', 'kontroverzni-sponzor', 'navstevnost', 'mladez-odkup', 'lobbing', 'naming', 'charita', 'vyjezd', 'investor-nabidka', 'svaz-bezpecnost', 'trener-nabidka', 'rozhovor', 'kauza-hrac']) {
      const x = structuredClone(s);
      createEvent(x, createRng(9), t);
      const ev = x.events.find((y) => y.template === t);
      if (!ev) continue;
      for (const o of ev.options) expect(resolveEvent(x, ev.id, o.id).ok).toBe(true);
    }
  });

  it('uložená hra verze 6 se převede', () => {
    const old = structuredClone(sole) as unknown as Record<string, unknown> & { version: number };
    old.version = 6;
    delete old.shareholders;
    delete old.grey;
    delete old.agm;
    const m = migrateSave(old)!;
    expect(m.version).toBe(sole.version);
    expect(m.shareholders).toEqual([]);
    expect(m.grey.exposure).toBe(0);
  });
});
