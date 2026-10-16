import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { createEvent, resolveEvent } from './events';
import { advanceDays, newGame } from './game';
import { bigProjectOptions } from './investments';
import { createRng } from './rng';
import { addTrophy, businessIncome, changeCity, changeUltras, cityPermit, invest, legacyScore, lobbyMayor, setOwnSponsor, ultrasEffect, withdraw } from './surroundings';
import type { DataPack } from './types';

const start = newGame(pack as DataPack, { clubId: 'slavia', ownerName: 'T', difficulty: 'stredni', seed: 61 });

describe('etapa F: majitel a okolí', () => {
  it('investice a výkyvy podnikání', () => {
    let s = invest(start, 'safe', 50_000_000).state;
    expect(s.owner.wallet).toBe(start.owner.wallet - 50_000_000);
    s = advanceDays(s, 95).state;
    expect(s.business!.safe).toBeGreaterThan(50_000_000);
    const back = withdraw(s, 'safe').state;
    expect(back.owner.wallet).toBeGreaterThan(s.owner.wallet);
    const crisis = structuredClone(start);
    crisis.business = { mood: 'krize', safe: 0, risky: 0, ownSponsor: 0 };
    expect(businessIncome(crisis, 1_000_000)).toBeLessThan(businessIncome(start, 1_000_000));
  }, 60_000);

  it('sponzoring vlastní firmou přinese peníze klubu, ale je to šedá zóna', () => {
    const s = setOwnSponsor(start, 12_000_000).state;
    expect(s.grey.actions.length).toBeGreaterThan(start.grey.actions.length);
    const later = advanceDays(s, 35).state;
    expect(later.clubs.slavia.finance.transactions.some((t) => t.note === 'Sponzoring firmou majitele')).toBe(true);
  });

  it('převzetí: prodej ukončí hru s hodnocením', () => {
    const s = structuredClone(start);
    createEvent(s, createRng(8), 'prevzeti');
    const e = s.events.find((x) => x.template === 'prevzeti')!;
    const sold = resolveEvent(s, e.id, 'prodat').state;
    expect(sold.gameOver?.kind).toBe('prodej');
    expect(sold.owner.wallet).toBeGreaterThan(s.owner.wallet);
  });

  it('město: špatný vztah zablokuje stavbu stadionu, pozvání ho zlepší', () => {
    const s = structuredClone(start);
    changeCity(s, -40);
    expect(cityPermit(s)).toBeTruthy();
    s.clubs.slavia.finance.balance = 5_000_000_000;
    expect(bigProjectOptions(s).find((o) => o.kind === 'stadion')!.blocked).toMatch(/Primátor/);
    const lobbied = lobbyMayor(s);
    expect(lobbied.ok).toBe(true);
    expect(lobbied.state.city!.relation).toBeGreaterThan(s.city!.relation);
    expect(lobbyMayor(lobbied.state).ok).toBe(false);
  });

  it('kotel: bojkot sníží návštěvu, schůzka pomůže', () => {
    const s = structuredClone(start);
    changeUltras(s, -40);
    createEvent(s, createRng(9), 'kotel-schuzka');
    const e = s.events.find((x) => x.template === 'kotel-schuzka')!;
    const angry = resolveEvent(s, e.id, 'odmitnout').state;
    expect(ultrasEffect(angry).attendance).toBeLessThan(1);
    const happy = resolveEvent(s, e.id, 'splnit').state;
    expect(happy.ultras!.relation).toBeGreaterThan(s.ultras!.relation);
  });

  it('síň slávy počítá odkaz', () => {
    const s = structuredClone(start);
    addTrophy(s, 'titul', 'Titul');
    addTrophy(s, 'titul', 'Titul znovu (stejná sezóna se nepočítá)');
    expect(legacyScore(s)).toBe(30);
  });
});
