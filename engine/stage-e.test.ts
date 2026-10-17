import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { createEvent, resolveEvent } from './events';
import { loanOffers, loanRate } from './finance';
import { ffpBlocksSigning, ffpStatus, financialRating, pickSideGoals, scenarioSummary, seasonFfp, sideGoalProgress, sideGoalsPending } from './finplus';
import { advanceDays, newGame } from './game';
import { createRng } from './rng';
import { startNegotiation } from './transfers';
import type { DataPack } from './types';

const start = newGame(pack as DataPack, { clubId: 'bohemians', ownerName: 'T', difficulty: 'stredni', seed: 51 });

describe('etapa E: finance', () => {
  it('vedlejší cíle vzniknou na začátku a na konci sezóny se vyhodnotí', () => {
    // Na začátku je nabídka 5–6 cílů, vybrané zatím žádné.
    const pending = sideGoalsPending(start)!;
    expect(pending.offer.length).toBeGreaterThanOrEqual(5);
    expect(pending.offer.length).toBeLessThanOrEqual(6);
    expect(start.sideGoals?.goals.length).toBe(0);
    // Bez spolumajitelů se cíl akcionářů nenabízí.
    if (!start.shareholders.length) expect(pending.offer.some((g) => g.giver === 'akcionari')).toBe(false);
    const p = sideGoalProgress(start, pending.offer[1]);
    expect(p.value).toBeGreaterThanOrEqual(0);
    // Výběr: 1 je málo, 4 moc, 2 je v pořádku.
    expect(pickSideGoals(start, [pending.offer[0].kind]).ok).toBe(false);
    expect(pickSideGoals(start, pending.offer.slice(0, 4).map((g) => g.kind)).ok).toBe(false);
    const picked = pickSideGoals(start, [pending.offer[0].kind, pending.offer[2].kind]);
    expect(picked.ok).toBe(true);
    expect(picked.state.sideGoals!.goals.map((g) => g.kind)).toEqual([pending.offer[0].kind, pending.offer[2].kind]);
    expect(sideGoalsPending(picked.state)).toBeUndefined();
    // Když majitel nevybere, po třech týdnech se vyberou doporučené (se zprávou).
    const auto = advanceDays(start, 25).state;
    expect(sideGoalsPending(auto)).toBeUndefined();
    expect(auto.sideGoals!.goals.length).toBeGreaterThanOrEqual(2);
    expect(auto.sideGoals!.goals.every((g) => g.recommended)).toBe(true);
    expect(auto.news.some((n) => n.title.startsWith('Vedlejší cíle sezóny vybrány'))).toBe(true);
    const end = advanceDays(start, 355).state;
    const prev = end.sideGoals!.season === end.season ? end.sideGoals! : undefined;
    // Po přelomu sezóny jsou nové cíle, staré se vyhodnotily ve zprávách.
    expect(end.news.some((n) => n.title.startsWith('Vedlejší cíle sezóny'))).toBe(true);
    expect(end.rating).toBeDefined();
    expect(end.opHistory?.length).toBe(1);
    void prev;
  }, 120_000);

  it('scénáře co když: vyšší mzdový strop zhorší výsledek', () => {
    const { base, scenarios } = scenarioSummary(start);
    const wages = scenarios.find((s) => s.kind === 'mzdy')!;
    expect(wages.plan!.result).toBeLessThan(base.result);
    const crisis = scenarios.find((s) => s.kind === 'krize')!;
    expect(crisis.plan!.result).toBeLessThanOrEqual(base.result);
  });

  it('rating mění úrok a s F banka nepůjčí', () => {
    const r = financialRating(start);
    expect(['A', 'B', 'C', 'D', 'E', 'F']).toContain(r.grade);
    const a = structuredClone(start);
    a.rating = { season: a.season, grade: 'A', score: 90 };
    const f = structuredClone(start);
    f.rating = { season: f.season, grade: 'F', score: 5 };
    expect(loanRate(a)).toBeLessThan(loanRate(start));
    expect(loanRate(f)).toBeGreaterThan(loanRate(start));
    expect(loanOffers(f)).toEqual([]);
  });

  it('fair play: opakované ztráty omezí přestupy', () => {
    const s = structuredClone(start);
    s.opHistory = [{ season: s.season - 2, result: -500_000_000, deposits: 0 }, { season: s.season - 1, result: -500_000_000, deposits: 0 }];
    expect(ffpStatus(s).ok).toBe(false);
    s.clubs.bohemians.finance.season.vstupne = -800_000_000;
    seasonFfp(s);
    seasonFfp(s);
    expect(s.ffp!.restrictedSeason).toBe(s.season + 1);
    s.season += 1;
    s.market.history.unshift({ date: `${s.season}-07-05`, playerName: 'A', fromId: 'sparta', toId: 'bohemians', fee: 1 }, { date: `${s.season}-07-06`, playerName: 'B', fromId: 'sparta', toId: 'bohemians', fee: 1 });
    expect(ffpBlocksSigning(s)).toBeTruthy();
    const target = Object.values(s.players).find((p) => p.clubId === 'pardubice')!;
    s.date = `${s.season}-07-10`;
    expect(startNegotiation(s, target.id).ok).toBe(false);
  });

  it('šok: dražší energie a úsporný režim', () => {
    const s = structuredClone(start);
    createEvent(s, createRng(7), 'sok-energie');
    const e = s.events.find((x) => x.template === 'sok-energie')!;
    const x = resolveEvent(s, e.id, 'usporny').state;
    expect(x.clubs.bohemians.policy.maintenance).toBe('nizka');
    expect(x.clubs.bohemians.finance.balance).toBeLessThan(s.clubs.bohemians.finance.balance);
  });
});
