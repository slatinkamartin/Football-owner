import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { addDays } from './calendar';
import { AGENDA_ACTIONS, agendaSlots, dailyAgenda, lastWeekSummary, planAgendaAction, routineView, setRoutine, weekAgenda, weekStartOf, weekSummary } from './agenda';
import { weeklyAdvice } from './advisor';
import { characters, characterTemplates, meetCharacter, weeklyCharacterRequest } from './characters';
import { TEMPLATES } from './events';
import { advanceDays, newGame } from './game';
import { huntTargets, scoutTrip, setHuntPlan } from './hunt';
import { planEffect } from './matchday';
import { nextOwnFixture } from './matchday';
import { addOwnerXp, ownerLevel, OWNER_LEVELS } from './ownerlevel';
import { squadOf } from './players';
import { activeProjects, pickProjects, projectAgendaProgress, projectOffers, updateProjects } from './projects';
import { setTrainingPlan, trainingMatchBonus, trainingPlan } from './training';
import { scouted } from './transfers';
import type { DataPack, GameState } from './types';

const fresh = (clubId = 'jablonec', seed = 5): GameState => newGame(pack as DataPack, { clubId, ownerName: 'T', difficulty: 'stredni', seed, ownerShare: 1 });

describe('V1 A1: týdenní agenda', () => {
  it('3 sloty, akce se provede hned a mění data', () => {
    const s = fresh();
    const ag = weekAgenda(s);
    expect(ag.slots).toBe(3);
    expect(ag.options.map((o) => o.id)).toEqual(AGENDA_ACTIONS.map((a) => a.id));
    const before = s.owner.trust.trener;
    const r = planAgendaAction(s, 'trener', 'podpora');
    expect(r.ok).toBe(true);
    expect(r.state.owner.trust.trener).toBeGreaterThan(before);
    expect(s.owner.trust.trener).toBe(before); // immutable
    expect(weekAgenda(r.state).used).toHaveLength(1);
    expect(weekAgenda(r.state).used[0].result).toContain('důvěra trenéra');
  });

  it('po vyčerpání slotů další akce nejde; stejná akce dvakrát ne', () => {
    let s = fresh();
    s = planAgendaAction(s, 'kotel').state;
    expect(planAgendaAction(s, 'kotel').ok).toBe(false);
    s = planAgendaAction(s, 'radnice').state;
    s = planAgendaAction(s, 'trenink').state;
    const r = planAgendaAction(s, 'media', 'klid');
    expect(r.ok).toBe(false);
    expect(r.message).toContain('vyčerpané');
  });

  it('nevyužité akce propadnou s novým týdnem a vznikne shrnutí', () => {
    let s = fresh();
    s = planAgendaAction(s, 'radnice').state;
    const week = weekStartOf(s.date);
    s = advanceDays(s, 8).state;
    expect(weekStartOf(s.date)).not.toBe(week);
    expect(weekAgenda(s).used).toHaveLength(0);
    const sum = lastWeekSummary(s)!;
    expect(sum.week).toBe(week);
    expect(sum.lines.join(' ')).toContain('radnici');
    expect(sum.deltas.some((d) => d.label === 'Vztah s městem' && d.value > 0)).toBe(true);
    expect(weekSummary(s, week)).toEqual(sum);
  });
});

describe('V1 A2: rádce', () => {
  it('nejvýš 3 rady s důvodem; nová hra doporučí projekty', () => {
    const s = fresh();
    const a = weeklyAdvice(s);
    expect(a.length).toBeGreaterThan(0);
    expect(a.length).toBeLessThanOrEqual(3);
    for (const x of a) expect(x.reason.length).toBeGreaterThan(5);
    expect(a.some((x) => x.tab === 'projekty')).toBe(true);
    s.owner.trust.trener = 20;
    expect(weeklyAdvice(s).some((x) => x.actionId === 'trener')).toBe(true);
    for (const x of weeklyAdvice(s).filter((y) => y.actionId)) expect(planAgendaAction(s, x.actionId!, x.target).ok).toBe(true);
  });
});

describe('V1 A3: rutina podřízeným', () => {
  it('drobná rozhodnutí vyřídí vedení a nevyužité akce doplní rutinou', () => {
    let s = setRoutine(fresh(), true).state;
    expect(routineView(s).auto).toBe(true);
    const e = TEMPLATES.travnik ? 'travnik' : 'noc';
    s.events.push({ id: 'e999', template: e, date: s.date, expires: addDays(s.date, 14), title: 'Test', text: '', defaultOption: 'x', options: [{ id: 'x', label: 'X', hint: '' }, { id: 'y', label: 'Y', hint: '' }] });
    dailyAgenda(s);
    expect(s.events.some((x) => x.id === 'e999')).toBe(false);
    s = advanceDays(s, 8).state;
    expect(s.agenda!.history[0].used.some((u) => u.routine)).toBe(true);
  });
});

describe('V1 A4/A5: postavy', () => {
  it('postavy z dat, schůzka mění vztah a ukládá paměť', () => {
    const s = fresh();
    const cs = characters(s);
    const roles = cs.map((c) => c.role);
    for (const r of ['trener', 'reditel', 'kapitan', 'kotel', 'starosta']) expect(roles).toContain(r);
    const k = cs.find((c) => c.id === 'kotel')!;
    const r = meetCharacter(s, 'kotel', 'dialog');
    expect(r.ok).toBe(true);
    const k2 = characters(r.state).find((c) => c.id === 'kotel')!;
    expect(k2.relation).toBeGreaterThan(k.relation);
    expect(k2.history).toHaveLength(1);
    // kapitán je skutečný hráč ze soupisky
    const cap = cs.find((c) => c.role === 'kapitan')!;
    expect(s.players[cap.playerId!].clubId).toBe(s.owner.clubId);
  });

  it('sponzor při špatném vztahu příspěvek nedá, při dobrém ano', () => {
    const s = fresh();
    if (!characters(s).some((c) => c.id === 'sponzor')) return;
    s.sponsorRelations = { generalni: 40 };
    expect(meetCharacter(s, 'sponzor', 'posila').ok).toBe(false);
    s.sponsorRelations = { generalni: 85 };
    const budget = s.clubs[s.owner.clubId].policy.transferBudget;
    const r = meetCharacter(s, 'sponzor', 'posila');
    expect(r.ok).toBe(true);
    expect(r.state.clubs[s.owner.clubId].policy.transferBudget).toBeGreaterThan(budget);
  });

  it('požadavek postavy vznikne jen v týdenním limitu a má resolver', () => {
    const s = fresh();
    s.sponsorRelations = { generalni: 90 };
    weeklyCharacterRequest(s);
    const ev = s.events.find((e) => e.template.startsWith('char-'));
    expect(ev).toBeTruthy();
    expect(TEMPLATES[ev!.template]).toBeTruthy();
    expect(Object.keys(characterTemplates())).toContain(ev!.template);
    weeklyCharacterRequest(s);
    expect(s.events.filter((e) => e.template.startsWith('char-'))).toHaveLength(1);
  });
});

describe('V1 A6: projekty', () => {
  it('nabídka ~6, výběr 1–3, agenda plní kroky, splnění odmění', () => {
    let seed = 1;
    while (!projectOffers(fresh('jablonec', seed)).some((o) => o.id === 'sponzori') && seed < 30) seed++;
    const s = fresh('jablonec', seed);
    const offers = projectOffers(s);
    expect(offers.length).toBeGreaterThanOrEqual(5);
    expect(pickProjects(s, offers.slice(0, 4).map((o) => o.id)).ok).toBe(false);
    const r = pickProjects(s, ['sponzori']);
    expect(r.ok).toBe(true);
    expect(projectOffers(r.state)).toHaveLength(0);
    const st = r.state;
    const r2 = planAgendaAction(st, 'sponzor', 'generalni');
    expect(r2.message).toContain('Silní partneři');
    const p = activeProjects(r2.state)[0];
    expect(p.steps[2].text).toContain('1/2');
    // vynucené splnění kroků
    const s3 = r2.state;
    projectAgendaProgress(s3, 'sponzor');
    s3.sponsorRelations = { ...s3.sponsorRelations, generalni: 90 };
    const club = s3.clubs[s3.owner.clubId];
    club.sponsors = ['generalni', 'dres', 'stadion'].map((slot) => ({ slot: slot as 'generalni', name: slot, annual: 1_000_000, untilSeason: s3.season + 1 }));
    const bal = club.finance.balance;
    const xp = ownerLevel(s3).xp;
    updateProjects(s3);
    expect(activeProjects(s3, true)[0].status).toBe('splneno');
    expect(club.finance.balance).toBeGreaterThan(bal);
    expect(ownerLevel(s3).xp).toBeGreaterThan(xp);
  });
});

describe('V1 A7: lov', () => {
  it('skautská cesta zpřesní odhad', () => {
    const s = fresh();
    const target = Object.values(s.players).filter((p) => p.clubId && p.clubId !== s.owner.clubId && !p.clubId.startsWith('zahr')).sort((a, b) => b.overall - a.overall)[10];
    s.watchlist = [target.id];
    const t0 = huntTargets(s)[0];
    expect(t0.playerId).toBe(target.id);
    const r = planAgendaAction(s, 'skauting', target.id);
    expect(r.ok).toBe(true);
    const t1 = huntTargets(r.state)[0];
    expect(t1.trips).toBe(1);
    expect(t1.error).toBeLessThanOrEqual(t0.error);
    expect(Math.abs(scouted(r.state, target).overall - target.overall)).toBeLessThanOrEqual(Math.abs(scouted(s, target).overall - target.overall) + 1);
    expect(scoutTrip(s, 'neexistuje').ok).toBe(false);
    const plan = setHuntPlan(s, ['FW'], 5_000_000);
    expect(plan.state.hunt!.plan!.positions).toEqual(['FW']);
    const pitch = planAgendaAction(s, 'prestup', target.id);
    expect(pitch.ok).toBe(true);
    expect(pitch.state.tips!.some((t) => t.playerId === target.id)).toBe(true);
  });
});

describe('V1 A8: trénink', () => {
  it('přijatý plán zvedne sílu v zápase (planEffect)', () => {
    const s = fresh();
    s.owner.trust.trener = 100;
    const coach = s.staff[s.clubs[s.owner.clubId].staff.coachId];
    coach.ego = 1;
    const r = setTrainingPlan(s, { focus: 'utok', intensity: 'vysoka' });
    expect(r.ok).toBe(true);
    expect(trainingPlan(r.state).accepted).toBe(true);
    const next = nextOwnFixture(r.state);
    if (next) {
      expect(trainingMatchBonus(r.state, next.fixture)).toBeGreaterThan(0.8);
      expect(planEffect(r.state, next.fixture).bonus).toBeGreaterThan(planEffect(s, next.fixture).bonus);
    }
  });

  it('nízká důvěra: trenér může odmítnout, návštěva tréninku plán prosadí', () => {
    const s = fresh();
    s.owner.trust.trener = 0;
    s.staff[s.clubs[s.owner.clubId].staff.coachId].ego = 20;
    let st = setTrainingPlan(s, { focus: 'utok' }).state;
    if (!st.training!.accepted) {
      st = planAgendaAction(st, 'trenink').state;
      expect(st.training!.accepted).toBe(true);
    }
  });
});

describe('V1 A9: úroveň majitele', () => {
  it('XP zvedají úroveň a 4. slot agendy', () => {
    const s = fresh();
    expect(ownerLevel(s).level).toBe(1);
    expect(ownerLevel(s).nextUnlocks.length).toBeGreaterThan(0);
    addOwnerXp(s, OWNER_LEVELS[2].xp);
    expect(ownerLevel(s).level).toBeGreaterThanOrEqual(3);
    expect(agendaSlots(s)).toBe(4);
  });
});

describe('V1: staré uložené hry', () => {
  it('bez nových polí se vše načte a funguje', () => {
    const s = fresh();
    delete s.agenda;
    delete s.characters;
    delete s.strategy;
    delete s.training;
    delete s.hunt;
    delete s.ownerXp;
    expect(() => [weekAgenda(s), weeklyAdvice(s), characters(s), projectOffers(s), trainingPlan(s), huntTargets(s), ownerLevel(s), weekSummary(s), routineView(s)]).not.toThrow();
    expect(squadOf(s, s.owner.clubId).length).toBeGreaterThan(0);
  });
});
