import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { addDays } from './calendar';
import { maybeCreateEvent, resolveEvent, TEMPLATES } from './events';
import { advanceDays, newGame } from './game';
import { squadOf } from './players';
import { createRng } from './rng';
import { activePromises, addPromise, checkOwnerPromises, dailySituations, decisionBudgetLeft, promiseStatus, situationCandidates, SITUATION_KINDS, weeklyDecisionLimit } from './situations';
import { coachOf } from './staff';
import type { DataPack, GameEvent, GameState } from './types';

const fresh = (clubId = 'jablonec', seed = 5): GameState => newGame(pack as DataPack, { clubId, ownerName: 'T', difficulty: 'stredni', seed, ownerShare: 1 });

describe('R1: sliby majitele', () => {
  it('addPromise má stabilní tvar a promiseStatus měří data', () => {
    const s = fresh();
    const p = squadOf(s, s.owner.clubId)[0];
    const pr = addPromise(s, { kind: 'smlouva', text: 'Nová smlouva', metric: 'contractSigned', target: 1, until: addDays(s.date, 30), playerId: p.id });
    expect(pr.status).toBe('bezi');
    expect(activePromises(s).map((x) => x.id)).toContain(pr.id);
    expect(promiseStatus(s, pr).status).toBe('bezi');
    p.contractUntil += 2;
    const mood = p.morale;
    checkOwnerPromises(s);
    expect(pr.status).toBe('splneno');
    expect(s.news[0].title).toContain('Slib splněn');
    expect(p.morale).toBeGreaterThan(mood);
    expect(activePromises(s)).toHaveLength(0);
  });

  it('nesplněný slib po termínu zhorší náladu toho, komu byl dán', () => {
    const s = fresh();
    const pr = addPromise(s, { kind: 'posila', text: 'Útočník do konce okna', metric: 'signing', target: 1, until: s.date, position: 'FW', stake: 'fanousci' });
    const before = s.clubs[s.owner.clubId].fanMood;
    s.date = addDays(s.date, 1);
    checkOwnerPromises(s);
    expect(pr.status).toBe('poruseno');
    expect(s.clubs[s.owner.clubId].fanMood).toBeLessThan(before);
    expect(s.news[0].title).toContain('Nesplněný slib');
  });

  it('podpora trenéra se poruší, když trenér skončí dřív', () => {
    const s = fresh();
    const pr = addPromise(s, { kind: 'podpora-trenera', text: 'Podpora trenéra', metric: 'coachKept', target: 1, until: addDays(s.date, 60) });
    expect(pr.staffId).toBe(coachOf(s, s.owner.clubId)!.id);
    const trust = s.owner.trust.trener;
    s.clubs[s.owner.clubId].staff.coachId = '';
    checkOwnerPromises(s);
    expect(pr.status).toBe('poruseno');
    expect(s.owner.trust.trener).toBeLessThan(trust);
  });
});

describe('R1: týdenní limit rozhodnutí', () => {
  it('náhodné situace nepřijdou, když už týden rozhodnutí má', () => {
    const s = fresh();
    s.events = [];
    const dummy: GameEvent = { id: 'x1', template: 'rozhovor', date: s.date, expires: addDays(s.date, 7), title: 'x', text: 'x', options: [{ id: 'a', label: 'a', hint: '' }, { id: 'b', label: 'b', hint: '' }], defaultOption: 'a' };
    s.events.push(dummy);
    expect(decisionBudgetLeft(s)).toBe(weeklyDecisionLimit(s) - 1);
    const rng = createRng(1);
    for (let i = 0; i < 50; i++) maybeCreateEvent(s, rng);
    // Jen naléhavé situace (váha ≥ 50) by mohly projít; běžné náhodné ne.
    expect(s.events.filter((e) => e.id !== 'x1' && (TEMPLATES[e.template]?.weight(s) ?? 0) < 50)).toHaveLength(0);
  });

  it('situace z dat vznikají jen v rámci limitu a vždy citují fakt', () => {
    let s = fresh('jablonec', 11);
    const created: { e: GameEvent; before: number }[] = [];
    const seen = new Set<string>();
    for (let d = 0; d < 110; d++) {
      const prevLog = (s.situations?.log ?? []).filter((l) => l.date >= addDays(s.date, -5));
      s = advanceDays(s, 1).state;
      for (const e of s.events) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        if (e.template.startsWith('sit-')) created.push({ e, before: new Set([...prevLog.map((l) => l.id), ...s.events.filter((x) => x.id !== e.id && x.date >= addDays(s.date, -6)).map((x) => x.id)]).size });
      }
    }
    expect(created.length).toBeGreaterThan(0);
    for (const { e, before } of created) {
      const fact = String(e.data?.fact ?? '');
      expect(fact.length).toBeGreaterThan(5);
      expect(e.text.toLowerCase()).toContain(fact.toLowerCase().slice(0, 25));
      expect(/\d/.test(e.text)).toBe(true);
      expect(e.options.length).toBeGreaterThanOrEqual(2);
      expect(e.options.length).toBeLessThanOrEqual(3);
      expect(before).toBeLessThan(weeklyDecisionLimit(s));
    }
  }, 30_000);
});

describe('R1: katalog situací', () => {
  it('katalog má aspoň 25 druhů a každé rozhodnutí má šablonu', () => {
    expect(SITUATION_KINDS.length).toBeGreaterThanOrEqual(25);
    for (const id of ['sucho', 'cervena', 'bez-vyhry', 'odchovanec', 'agent', 'verdikt', 'venku', 'hattrick', 'debakl', 'zraneni-okno']) expect(TEMPLATES[`sit-${id}`]).toBeDefined();
  });

  it('volba „víc minut pro mladé“ změní pokyn trenéra a zaregistruje měřený slib', () => {
    const s = fresh();
    const p = squadOf(s, s.owner.clubId)[0];
    coachOf(s, s.owner.clubId)!.youthFocus = false;
    s.events = [{ id: 'e999', template: 'sit-odchovanec', date: s.date, expires: addDays(s.date, 6), title: 'Gól odchovance', text: 'x', playerId: p.id, options: [{ id: 'minuty', label: 'a', hint: '' }, { id: 'pochvala', label: 'b', hint: '' }], defaultOption: 'pochvala', data: { youth: 100 } }];
    const r = resolveEvent(s, 'e999', 'minuty');
    expect(r.ok).toBe(true);
    expect(coachOf(r.state, r.state.owner.clubId)!.youthFocus).toBe(true);
    const pr = activePromises(r.state).find((x) => x.metric === 'youthMinutes');
    expect(pr?.target).toBe(450);
    expect(pr?.matches).toBe(5);
  });

  it('bez zápasu a mimo pondělí nevznikne nic; kandidáti nesou fakt', () => {
    let s = fresh();
    s = advanceDays(s, 60).state;
    for (const c of situationCandidates(s)) expect(c.fact.length).toBeGreaterThan(5);
    const n = s.events.length;
    const copy = structuredClone(s);
    // Den, kdy se nehrálo a není pondělí: žádná nová situace.
    while (new Date(`${copy.date}T00:00:00Z`).getUTCDay() === 1) copy.date = addDays(copy.date, 1);
    copy.date = addDays(copy.date, 0);
    const own = copy.owner.clubId;
    const playedYesterday = Object.values(copy.competitions).some((c) => c.fixtures.some((f) => f.result && f.date === addDays(copy.date, -1) && (f.homeId === own || f.awayId === own)));
    if (!playedYesterday) {
      dailySituations(copy);
      expect(copy.events.length).toBe(n);
    }
  }, 30_000);
});
