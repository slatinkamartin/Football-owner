import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { advanceDays, newGame } from './game';
import { europeRun } from './europe';
import { daysUntil } from './milestones';
import { cupBadge, cupBadgeParts, cupBracket, cupHistory, cupPathView, drawPreview, europeView, matchOdds, prizeView, seasonCardData, stageChances } from './cupview';
import type { DataPack, GameState } from './types';

const start = newGame(pack as DataPack, { clubId: 'slavia', ownerName: 'T', difficulty: 'stredni', seed: 11 });
const to = (s: GameState, date: string) => advanceDays(s, daysUntil(s, date)).state;
const autumn = to(start, `${start.season}-10-02`);
const winter = to(autumn, `${start.season + 1}-02-05`);

describe('V3: domácí pohár', () => {
  it('cesta pohárem má všechna kola, šance klesají a prémie odpovídají účtu', () => {
    const path = cupPathView(start)!;
    expect(path.steps).toHaveLength(6);
    expect(path.participates).toBe(true);
    expect(path.earned).toBe(0);
    const ch = path.steps.map((s) => s.chance ?? 0);
    for (let i = 1; i < ch.length; i++) expect(ch[i]).toBeLessThanOrEqual(ch[i - 1] + 1e-9);
    expect(path.winChance).toBeGreaterThan(0);
    expect(path.winChance).toBeLessThan(1);

    const later = cupPathView(autumn)!;
    expect(later.steps.some((s) => s.status === 'postup' || s.status === 'vyrazeni')).toBe(true);
    const booked = autumn.clubs.slavia.finance.transactions.filter((t) => t.category === 'pohar').reduce((a, t) => a + t.amount, 0);
    expect(later.earned).toBe(booked);
    expect(prizeView(autumn).cup?.earned).toBe(booked);
  });

  it('pavouk ukazuje vylosovaná kola, váš zápas první a zaměření na vaše kolo', () => {
    const b = cupBracket(autumn)!;
    expect(b.rounds).toHaveLength(6);
    const drawn = b.rounds.filter((r) => r.drawn);
    expect(drawn.length).toBeGreaterThanOrEqual(2);
    for (const r of drawn) if (r.matches.some((m) => m.own)) expect(r.matches[0].own).toBe(true);
    expect(b.rounds[b.focus].matches.some((m) => m.own)).toBe(true);
    // Odehraný zápas má vítěze (případně po penaltách).
    expect(b.rounds[0].matches.filter((m) => m.score).every((m) => m.winnerId)).toBe(true);
  });

  it('pohárová historie se zapisuje a starší hra bez historie funguje', () => {
    expect(autumn.cupHistory?.some((e) => e.season === autumn.season && e.clubId === 'slavia')).toBe(true);
    const old = structuredClone(autumn);
    delete old.cupHistory;
    expect(cupHistory(old)[0].season).toBe(old.season);
  });

  it('los: před dalším kolem možní soupeři podle soutěží se šancemi', () => {
    const path = cupPathView(autumn)!;
    const prev = drawPreview(autumn).find((d) => d.key === 'pohar');
    if (path.alive && path.next?.status === 'dalsi' && path.next.index < 5) {
      expect(prev).toBeDefined();
      const total = prev!.pots.flatMap((p) => p.clubs).reduce((a, c) => a + (c.p ?? 0), 0);
      expect(total).toBeGreaterThan(0.3);
    } else expect(prev).toBeUndefined();
  });
});

describe('V3: Evropa', () => {
  it('předkola s padáky a šance na ligovou fázi', () => {
    // v0.29: Slavia jako mistr hraje rovnou ligovou fázi, předkola hraje Sparta (2. předkolo LM).
    const sparta = newGame(pack as DataPack, { clubId: 'sparta', ownerName: 'T', difficulty: 'stredni', seed: 11 });
    const v = europeView(sparta)!;
    expect(v.qualifying).toHaveLength(1);
    expect(v.qualifying[0].parachute).toMatch(/padák|konec/i);
    expect(v.chain[0].comp).toBe(v.entry);
    const p = v.chances.filter((c) => c.key.startsWith('liga-')).reduce((a, c) => a + c.p, 0);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThanOrEqual(1);
    expect(drawPreview(sparta).some((d) => d.key === 'liga')).toBe(true);
  });

  it('ligová fáze: tabulka 36 s pásmy, karty soupeřů, konečné pořadí sedí s hrou', () => {
    const run = europeRun(winter)!;
    const v = europeView(winter)!;
    if (!run.leagueComp) {
      expect(v.league).toBeUndefined();
      return;
    }
    const lg = v.league!;
    expect(lg.table).toHaveLength(36);
    expect(lg.table.filter((r) => r.own)).toHaveLength(1);
    expect(lg.table[0].zone).toBe('osmifinale');
    expect(lg.table[35].zone).toBe('vyrazeni');
    expect(lg.opponents).toHaveLength(run.leagueComp === 'KL' ? 6 : 8);
    for (const o of lg.opponents) expect(o.odds.win + o.odds.draw + o.odds.loss).toBeCloseTo(1, 3);
    if (lg.final) expect(lg.pos).toBe(run.rank);
    // Seřazeno podle bodů.
    for (let i = 1; i < 36; i++) expect(lg.table[i].points).toBeLessThanOrEqual(lg.table[i - 1].points);
    expect(v.spring?.rounds).toHaveLength(5);
  });

  it('kurzy zápasu: silnější tým má větší šanci', () => {
    const a = matchOdds(75, 70, true);
    const b = matchOdds(70, 75, false);
    expect(a.win).toBeGreaterThan(b.win);
  });
});

describe('V3: štítek, cache, karta sezóny', () => {
  it('štítek do hlavičky je krátký text', () => {
    const t = cupBadge(start);
    expect(t).toBeTruthy();
    expect(t!.length).toBeLessThan(60);
    expect(cupBadgeParts(start).some((p) => p.kind === 'evropa')).toBe(true);
  });

  it('šance se počítají jednou za den (cache)', () => {
    const s = to(start, `${start.season}-07-20`);
    const a = stageChances(s);
    const t0 = performance.now();
    const b = stageChances(s);
    expect(performance.now() - t0).toBeLessThan(20);
    expect(b).toBe(a);
  });

  it('karta sezóny má klub, soutěž a výsledky', () => {
    const c = seasonCardData(winter);
    expect(c.clubName.length).toBeGreaterThan(2);
    expect(c.position).toBeGreaterThan(0);
    expect(c.cup.length).toBeGreaterThan(2);
    expect(c.label).toBe(`${winter.season}/${String(winter.season + 1).slice(2)}`);
  });
});
