import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { afterMatchday, poolPlayoffKey, startPoolPlayoffs } from './competitions';
import { europeRun } from './europe';
import { euroOpponentSquad, liveFixture, nextLiveTarget } from './euromatch';
import { lastOwnMatch, matchFacts } from './facts';
import { matchFactLine } from './fanvoice';
import { advanceDays, newGame } from './game';
import { simulateMatch } from './match';
import { setHalftime } from './matchday';
import { euroMatchTomorrow } from './matchexperience';
import { clubPrices, newCareerGame, sharePurchasePrice, type Career } from './meta';
import { squadOf } from './players';
import { createRng } from './rng';
import { ownerPledges } from './situations';
import type { DataPack, Fixture, GameState } from './types';

const czPack = pack as DataPack;
const start = newGame(czPack, { clubId: 'slavia', ownerName: 'T', difficulty: 'stredni', seed: 11 });

/** Posun na předvečer prvního evropského zápasu. */
function euroEve(s: GameState): GameState {
  for (let i = 0; i < 60 && !euroMatchTomorrow(s); i++) s = advanceDays(s, 1).state;
  return s;
}

describe('V4 D3: neproměněné penalty', () => {
  it('neproměněná penalta je událost se statistikou a fakty', () => {
    const rng = createRng(5);
    const a = squadOf(start, 'slavia');
    const b = squadOf(start, 'sparta');
    let found: Fixture | undefined;
    for (let i = 0; i < 400 && !found; i++) {
      const r = simulateMatch(rng, { id: 'slavia', players: structuredClone(a) }, { id: 'sparta', players: structuredClone(b) }, 10_000, { date: start.date, season: start.season, detail: true });
      if (r.detail!.events.some((e) => e.type === 'penalta-mimo' && e.clubId === 'slavia')) found = { id: 'x', round: 1, date: start.date, homeId: 'slavia', awayId: 'sparta', result: r };
    }
    expect(found).toBeDefined();
    const d = found!.result!.detail!;
    const ev = d.events.find((e) => e.type === 'penalta-mimo')!;
    expect(['chytil brankář', 'mimo branku']).toContain(ev.note);
    expect(d.home.pensMissed).toBeGreaterThan(0);
    const facts = matchFacts(start, found!, '1. liga')!;
    expect(facts.missedPenalty?.minute).toBe(ev.minute);
    expect(matchFactLine(facts)).toContain('Neproměněná penalta');
  });
});

describe('V4 D2: evropské zápasy po minutách', () => {
  const eve = euroEve(start);
  const target = nextLiveTarget(eve, true)!;

  it('zápas se odehraje po minutách, výsledek sedí se střelci a fakta jsou z něj', () => {
    expect(target.id.startsWith('eu-')).toBe(true);
    const played = advanceDays(eve, 1).state;
    const m = europeRun(played)!.matches.find((x) => x.id === target.id)!;
    expect(m.result?.match?.detail?.events.length).toBeGreaterThan(0);
    expect(m.result!.scorers.length).toBe(m.result!.own);
    expect(m.result!.oppMinutes.length).toBe(m.result!.opp);
    const f = liveFixture(played, m.id)!;
    expect([f.homeId, f.awayId]).toContain('slavia');
    const facts = lastOwnMatch(played)!;
    expect(facts.fixtureId).toBe(m.id);
    expect(facts.opponentName).toBe(m.opponent.name);
    // Karty z Evropy se do ligy nepřenášejí.
    for (const p of squadOf(played, 'slavia')) expect(p.suspension).toBe(squadOf(eve, 'slavia').find((x) => x.id === p.id)?.suspension ?? 0);
  });

  it('rozhodnutí o poločase je poctivé: první poločas stejný, druhý se může změnit', () => {
    const base = advanceDays(eve, 1).state;
    const alt = advanceDays(setHalftime(eve, 'riskovat', target.id).state, 1).state;
    const ev = (s: GameState) => liveFixture(s, target.id)!.result!.detail!.events;
    expect(ev(alt).filter((e) => e.minute <= 45)).toEqual(ev(base).filter((e) => e.minute <= 45));
    // Plán evropského zápasu se po zápase smaže.
    expect(alt.matchPlan?.fixtureId).not.toBe(target.id);
  });

  it('kádr soupeře je stejný pro oba zápasy a odpovídá jeho síle', () => {
    const m = europeRun(eve)!.matches[0];
    const a = euroOpponentSquad(m, eve.season);
    const b = euroOpponentSquad(m, eve.season);
    expect(a.map((p) => p.lastName)).toEqual(b.map((p) => p.lastName));
    const top = a.map((p) => p.overall).sort((x, y) => y - x).slice(0, 14);
    expect(Math.abs(top.reduce((x, y) => x + y, 0) / 14 - m.opponent.rating)).toBeLessThan(3);
  });
});

describe('V4 D4: starší sliby na kartě slibů', () => {
  it('sliby z pohovoru jsou v jednom přehledu se stavem', () => {
    const s = structuredClone(start);
    s.promises = [
      { id: 'sl1', kind: 'rozpocet', role: 'reditel', value: s.clubs.slavia.policy.transferBudget, until: `${s.season + 1}-06-30`, made: s.date },
      { id: 'sl2', kind: 'posila', role: 'trener', position: 'FW', bar: 99, until: `${s.season}-08-31`, made: s.date, known: squadOf(s, 'slavia').map((p) => p.id), done: 'poruseno', resolved: s.date },
    ];
    const { active, done } = ownerPledges(s);
    const budget = active.find((v) => v.pledge.id === 'sl1')!;
    expect(budget.legacy).toBe(true);
    expect(budget.pledge.text).toContain('Rozpočet na přestupy');
    expect(budget.status.label).toContain('Rozpočet');
    expect(done.find((v) => v.pledge.id === 'sl2')?.pledge.status).toBe('poruseno');
  });
});

describe('V4 D5: baráž vítězů skupin ČFL', () => {
  it('vítězové ČFL A a B hrají dvojzápas, vítěz postupuje', () => {
    const s = structuredClone(start);
    // Odehrané skupiny (výsledky dosadit: domácí vždy vyhrají).
    for (const id of ['cz3a', 'cz3b']) for (const f of s.competitions[id].fixtures) f.result = { homeGoals: 1, awayGoals: 0, attendance: 500, scorers: [] };
    startPoolPlayoffs(s);
    const cup = s.cups[poolPlayoffKey('cfl')]!;
    expect(cup).toBeDefined();
    expect(cup.fixtures.length).toBe(2);
    const t = cup.ties![0];
    expect(s.competitions.cz3a.clubIds.includes(t.upper) !== s.competitions.cz3a.clubIds.includes(t.lower)).toBe(true);
    s.date = cup.fixtures[1].date;
    cup.fixtures[0].result = { homeGoals: 2, awayGoals: 0, attendance: 1000, scorers: [] };
    cup.fixtures[1].result = { homeGoals: 1, awayGoals: 0, attendance: 1000, scorers: [] };
    afterMatchday(s, createRng(1));
    // Celkem 2:1 pro klub, který hrál první zápas doma (dolní).
    expect(cup.winner).toBe(t.lower);
  });
});

describe('V4 D7: kupní cena klubu', () => {
  it('ceny podle hodnoty klubu, kariéra platí podle podílu', () => {
    const prices = clubPrices(czPack, 'stredni');
    expect(prices.slavia).toBeGreaterThan(prices.budejovice);
    expect(prices.slavia).toBeGreaterThan(100_000_000);
    const career: Career = { name: 'K', wallet: 2_000_000_000, media: 60, league: 50, trophies: [], clubs: [] };
    const g = newCareerGame(czPack, career, { clubId: 'budejovice', difficulty: 'stredni', ownerShare: 0.6, seed: 2, price: prices.budejovice });
    expect(g.owner.wallet).toBe(career.wallet - sharePurchasePrice(prices.budejovice, 0.6));
  });
});
