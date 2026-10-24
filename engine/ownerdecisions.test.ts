import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { createEvent, resolveEvent } from './events';
import { advanceDays, newGame } from './game';
import { activeRegions } from './foreign';
import { hasProgram } from './investments';
import {
  buyBackStadiumName,
  chooseVision,
  competitionPriorityEdge,
  dailyOwnerDecisions,
  OWNER_DECISIONS_PER_SEASON,
  strategyOverview,
  visionMaxAge,
  visionOf,
  visionPickPending,
  visionProgress,
  wageCapBlock,
} from './ownerdecisions';
import { projectOffers } from './projects';
import { createRng } from './rng';
import { squadOf } from './players';
import { renewalDemand, renewContract } from './transfers';
import type { DataPack, GameState } from './types';

const czPack = pack as DataPack;
const start = (clubId = 'slavia', seed = 5) => newGame(czPack, { clubId, ownerName: 'T', difficulty: 'stredni', seed });
const ev = (s: GameState, t: string) => s.events.find((e) => e.template === t)!;
function open(s: GameState, t: string): GameState {
  const st = structuredClone(s);
  createEvent(st, createRng(1), t);
  return st;
}

describe('W5: strategická rozhodnutí majitele', () => {
  it('vize klubu: v nové hře je v prvních krocích (ne situace), bez volby platí vyvážená; mění politiku ředitele', () => {
    const g = start();
    expect(g.events.some((e) => e.template === 'majitel-vize')).toBe(false);
    expect(visionPickPending(g)).toBeDefined();
    const picked = chooseVision(g, 'akademie');
    expect(picked.ok).toBe(true);
    expect(visionOf(picked.state)?.kind).toBe('akademie');
    expect(visionPickPending(picked.state)).toBeUndefined();
    const late = structuredClone(g);
    late.date = visionPickPending(g)!.deadline;
    dailyOwnerDecisions(late, createEvent);
    expect(visionOf(late)?.kind).toBe('vyvazena');
    // Stejná volba jako situace (stará hra, konec vize, nový trenér).
    const s0 = open(g, 'majitel-vize');
    const e = ev(s0, 'majitel-vize');
    expect(e.defaultOption).toBe('vyvazena');
    expect(e.options.map((o) => o.id)).toEqual(['vyvazena', 'akademie', 'prodejni', 'uspech']);
    const s = resolveEvent(s0, e.id, 'prodejni').state;
    expect(visionOf(s)?.kind).toBe('prodejni');
    expect(visionOf(s)?.until).toBe(`${s.season + 3}-06-30`);
    expect(s.clubs.slavia.policy.salesPolicy).toBe('prodejni');
    expect(visionMaxAge(s, 30)).toBe(26);
    expect(visionProgress(s)?.lines.some((l) => l.text.startsWith('Prodeje'))).toBe(true);
    // Vize akademie dává přednost projektům akademie a mladých.
    const a = resolveEvent(s0, e.id, 'akademie').state;
    a.strategy = undefined;
    const first = projectOffers(a).slice(0, 2).map((o) => o.id);
    expect(first.some((id) => id === 'akademie' || id === 'mladi')).toBe(true);
    // Bez rozhodnutí platí výchozí volba.
    const auto = resolveEvent(s0, e.id, e.defaultOption, true).state;
    expect(visionOf(auto)?.kind).toBe('vyvazena');
  });

  it('priorita soutěží mění sílu v zápasech (rotace)', () => {
    const s0 = open(start(), 'majitel-priorita');
    const e = ev(s0, 'majitel-priorita');
    expect(e.defaultOption).toBe('vyvazene');
    expect(competitionPriorityEdge(s0, 'liga')).toBe(0);
    const s = resolveEvent(s0, e.id, 'liga').state;
    expect(competitionPriorityEdge(s, 'liga')).toBeGreaterThan(0);
    expect(competitionPriorityEdge(s, 'pohar')).toBeLessThan(0);
  });

  it('bilanční schůzka: vyšší cíle zvednou cíl sezóny, výměna použije stávající výměnu trenéra', () => {
    const s0 = start('bohemians', 8);
    s0.date = `${s0.season + 1}-06-10`;
    s0.events = [];
    dailyOwnerDecisions(s0, createEvent);
    expect(s0.ownerDecisions?.snapshot?.season).toBe(s0.season);
    const e = ev(s0, 'majitel-bilance');
    expect(e.expires).toBe(`${s0.season + 1}-06-19`);
    expect(e.options.map((o) => o.id)).toEqual(['prodlouzit', 'cile', 'vymena']);
    const goalsState = resolveEvent(s0, e.id, 'cile').state;
    expect(goalsState.ownerDecisions?.goals?.season).toBe(s0.season + 1);
    const before = goalsState.owner.seasonGoal;
    goalsState.season += 1;
    goalsState.date = `${goalsState.season}-07-01`;
    goalsState.owner.seasonGoal = 'stred';
    dailyOwnerDecisions(goalsState, createEvent);
    expect(goalsState.owner.seasonGoal).toBe('horni');
    expect(before).toBeDefined();
    const oldCoach = s0.clubs.bohemians.staff.coachId;
    const swapped = resolveEvent(s0, e.id, 'vymena').state;
    expect(swapped.clubs.bohemians.staff.coachId).not.toBe(oldCoach);
  });

  it('platový strop blokuje prodloužení smlouvy nad strop, výjimka platí pro hvězdu', () => {
    const s0 = start();
    const squad = squadOf(s0, 'slavia').sort((a, b) => b.overall - a.overall);
    const star = squad[0];
    const avg = squad.reduce((a, p) => a + p.wage, 0) / squad.length;
    star.wage = Math.round(avg * 6);
    const s1 = open(s0, 'majitel-platy');
    const e = ev(s1, 'majitel-platy');
    expect(e.defaultOption).toBe('nechat');
    const capped = resolveEvent(s1, e.id, 'strop').state;
    const other = squad[3];
    expect(wageCapBlock(capped, capped.players[other.id], avg * 10)).toMatch(/Platový strop/);
    const r = renewContract(capped, other.id, Math.max(renewalDemand(capped, capped.players[other.id]), Math.round(avg * 10)), 3);
    expect(r.ok).toBe(false);
    const exc = resolveEvent(s1, e.id, 'vyjimka').state;
    expect(wageCapBlock(exc, exc.players[star.id], star.wage * 2)).toBeUndefined();
    expect(wageCapBlock(exc, exc.players[other.id], avg * 10)).toBeDefined();
  });

  it('názvová práva: stadion se přejmenuje, příjem jde přes sponzorskou smlouvu, lze odkoupit zpět', () => {
    const s0 = start();
    s0.clubs.slavia.sponsors = (s0.clubs.slavia.sponsors ?? []).filter((c) => c.slot !== 'stadion');
    const original = s0.clubs.slavia.stadium.name;
    const s1 = open(s0, 'majitel-nazev');
    const e = ev(s1, 'majitel-nazev');
    expect(e.defaultOption).toBe('odmitnout');
    const s = resolveEvent(s1, e.id, 'dlouha').state;
    const club = s.clubs.slavia;
    expect(club.stadium.name).toMatch(/Arena$/);
    expect(club.sponsors!.find((c) => c.slot === 'stadion')!.untilSeason).toBe(s.season + 4);
    expect(strategyOverview(s).find((l) => l.id === 'nazev')!.value).toBe(club.stadium.name);
    s.clubs.slavia.finance.balance = 1e9;
    const back = buyBackStadiumName(s);
    expect(back.ok).toBe(true);
    expect(back.state.clubs.slavia.stadium.name).toBe(original);
    expect(back.state.clubs.slavia.sponsors!.some((c) => c.slot === 'stadion')).toBe(false);
  });

  it('valná hromada nabízí reinvestici zisku: rozpočet přestupů a zázemí', () => {
    const s0 = start();
    s0.shareholders = [];
    s0.clubs.slavia.finance.season.komercni = (s0.clubs.slavia.finance.season.komercni ?? 0) + 200_000_000;
    s0.clubs.slavia.finance.balance += 200_000_000;
    const s1 = open(s0, 'valna');
    const e = ev(s1, 'valna');
    expect(e.options.some((o) => o.id === 'reinvest')).toBe(true);
    const budget = s1.clubs.slavia.policy.transferBudget;
    const wallet = s1.owner.wallet;
    const s = resolveEvent(s1, e.id, 'reinvest').state;
    expect(s.clubs.slavia.policy.transferBudget).toBeGreaterThan(budget);
    expect(s.owner.wallet).toBe(wallet);
    expect(s.ownerDecisions?.profit?.[0].choice).toBe('reinvest');
  });

  it('partnerský klub (vymyšlený): skautská síť zdarma a hostování mladých', () => {
    const s1 = open(start(), 'majitel-partner');
    const e = ev(s1, 'majitel-partner');
    const s = resolveEvent(s1, e.id, 'plne').state;
    expect(hasProgram(s, 'partner')).toBe(true);
    const region = s.ownerDecisions!.partner!.region;
    expect(activeRegions(s)).toContain(region);
    s.date = `${s.season}-08-01`;
    dailyOwnerDecisions(s, createEvent);
    expect(s.ownerDecisions!.partner!.stintSeason).toBe(s.season);
  });

  it('ženský tým a komunita: program, nový partner a výsledek žen po sezóně', () => {
    const s1 = open(start('jablonec', 4), 'majitel-komunita');
    const e = ev(s1, 'majitel-komunita');
    expect(e.defaultOption).toBe('ne');
    const s = resolveEvent(s1, e.id, 'plny').state;
    expect(hasProgram(s, 'zeny')).toBe(true);
    const bal = s.clubs.jablonec.finance.balance;
    s.date = `${s.season}-09-01`;
    dailyOwnerDecisions(s, createEvent);
    expect(s.clubs.jablonec.finance.balance).not.toBe(bal);
    s.date = `${s.season + 1}-06-19`;
    dailyOwnerDecisions(s, createEvent);
    expect(s.ownerDecisions!.community!.results).toHaveLength(1);
    expect(s.news.some((n) => n.title.startsWith('Ženský tým skončil'))).toBe(true);
  });

  it('stará uložená hra bez nových polí se načte a běží; vize přijde jako situace', { timeout: 60_000 }, () => {
    let s = start('sparta', 3);
    delete s.ownerDecisions;
    const seen = new Set<string>();
    for (let i = 0; i < 10; i++) {
      s = advanceDays(s, 7).state;
      for (const e of s.events) seen.add(e.template);
    }
    expect(s.ownerDecisions).toBeDefined();
    expect(seen.has('majitel-vize') || !!s.ownerDecisions?.vision).toBe(true);
  });

  it('za sezónu nejvýš limit strategických rozhodnutí', { timeout: 120_000 }, () => {
    let s = start('slavia', 11);
    const seen = new Set<string>();
    for (let d = 0; d < 365; d += 7) {
      s = advanceDays(s, 7).state;
      for (const e of s.events) if (e.template.startsWith('majitel-')) seen.add(e.id);
    }
    expect(seen.size).toBeGreaterThanOrEqual(2);
    expect(seen.size).toBeLessThanOrEqual(OWNER_DECISIONS_PER_SEASON + 1);
  });
});

describe('W5 × W4: platové pravidlo v týmové chemii', () => {
  it('strop zlepší spokojenost v chemii a „proč“ ho zmiňuje', async () => {
    const { teamChemistry } = await import('./chemistry');
    const s0 = start();
    const squad = squadOf(s0, 'slavia').sort((a, b) => b.overall - a.overall);
    const avg = squad.reduce((a, p) => a + p.wage, 0) / squad.length;
    squad[0].wage = Math.round(avg * 8);
    const mood = (s: GameState) => teamChemistry(s).parts.find((p) => p.key === 'nalada')!;
    const before = mood(s0);
    const capped = structuredClone(s0);
    capped.ownerDecisions = { offered: {}, season: capped.season, count: 0, wageRule: { kind: 'strop', multiple: 3, since: capped.date } };
    expect(mood(capped).value).toBeGreaterThan(before.value);
    expect(mood(capped).why).toMatch(/platový strop/);
    const exc = structuredClone(s0);
    exc.ownerDecisions = { offered: {}, season: exc.season, count: 0, wageRule: { kind: 'vyjimka', multiple: 3, since: exc.date, starName: 'X' } };
    expect(mood(exc).why).toMatch(/výjimku/);
    expect(mood(exc).value).toBe(before.value);
  });
});
