import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { addDays } from './calendar';
import { deservedRelations, monthlyRelationReversion, agendaOf, agendaSlots, PRIORITY_CEILING, softGain, weekStartOf, type AgendaUse, dailyAgenda, focusHuntTarget, lastMonthSummary, meetingView, monthPriorities, monthSummary, personalMeeting, planForPriority, routineView, runPrioritiesToday, setMonthPriorities, setRoutine } from './agenda';
import { monthAdvice, weeklyAdvice } from './advisor';
import { cityOf, ultrasOf } from './surroundings';
import { easeAdd, easeGain } from './ease';
import { characters, characterTemplates, meetCharacter, weeklyCharacterRequest } from './characters';
import { TEMPLATES } from './events';
import { advanceDays, newGame } from './game';
import { huntTargets, personalPitchMut, scoutTrip, setHuntPlan } from './hunt';
import { planEffect } from './matchday';
import { nextOwnFixture } from './matchday';
import { addOwnerXp, ownerLevel, OWNER_LEVELS } from './ownerlevel';
import { squadOf } from './players';
import { activeProjects, pickProjects, projectAgendaProgress, projectOffers, updateProjects } from './projects';
import { setTrainingPlan, trainingMatchBonus, trainingPlan } from './training';
import { scouted } from './transfers';
import type { DataPack, GameState } from './types';

/** Projde jeden celý týden (od příštího pondělí) a vrátí akce priorit. Mutuje stav. */
function runWeek(s: GameState): AgendaUse[] {
  const mon = addDays(weekStartOf(s.date), 7);
  const out: AgendaUse[] = [];
  for (let i = 0; i < 7; i++) {
    s.date = addDays(mon, i);
    out.push(...runPrioritiesToday(s));
  }
  return out;
}

const fresh = (clubId = 'jablonec', seed = 5): GameState => newGame(pack as DataPack, { clubId, ownerName: 'T', difficulty: 'stredni', seed, ownerShare: 1 });

describe('W2: měsíční priority majitele', () => {
  it('nová hra: vedení navrhne 3 priority, majitel je potvrdí (immutable), max 3 / min 2', () => {
    const s = fresh();
    const mp = monthPriorities(s);
    expect(mp.by).toBe('vedeni');
    expect(mp.priorities).toHaveLength(3);
    expect(mp.max).toBe(3);
    expect(setMonthPriorities(s, ['media']).ok).toBe(false);
    expect(setMonthPriorities(s, ['media', 'kabina', 'sponzori', 'radnice']).ok).toBe(false);
    const r = setMonthPriorities(s, ['kabina', 'sponzori', 'media']);
    expect(r.ok).toBe(true);
    expect(monthPriorities(s).by).toBe('vedeni');
    expect(monthPriorities(r.state).by).toBe('majitel');
    expect(monthPriorities(r.state).priorities).toEqual(['kabina', 'sponzori', 'media']);
  });

  it('během měsíce provádí vedení akce samo a mění data; majitel nic nekliká', () => {
    let s = fresh();
    s.owner.trust.trener = 30;
    s.owner.media = 30;
    s = setMonthPriorities(s, ['kabina', 'radnice', 'media']).state;
    const city = cityOf(s).relation;
    const before = { trust: s.owner.trust.trener, media: s.owner.media };
    s = advanceDays(s, 14).state;
    const log = monthPriorities(s).log.length ? monthPriorities(s).log : s.agenda!.months![0].summary.lines;
    expect(log.length).toBeGreaterThan(0);
    expect(s.owner.trust.trener).toBeGreaterThan(before.trust);
    expect(s.owner.media).toBeGreaterThan(before.media);
    expect(cityOf(s).relation).toBeGreaterThan(city);
  });

  it('každá priorita nejvýš jednou týdně; vedení samo jen polovinu', () => {
    const own = setMonthPriorities(fresh(), ['kabina', 'sponzori', 'media']).state;
    own.date = '2026-09-06';
    own.agenda!.month = '2026-09';
    own.agenda!.log = [];
    const days = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'];
    let n = 0;
    for (const d of days) {
      own.date = d;
      n += runPrioritiesToday(own).length;
    }
    expect(n).toBe(3);
    const auto = fresh();
    auto.date = '2026-09-06';
    agendaOf(auto).month = '2026-09';
    let m = 0;
    for (let w = 0; w < 4; w++)
      for (const d of days) {
        auto.date = addDays(d, 7 * w);
        m += runPrioritiesToday(auto).filter((u) => u.actionId !== 'nic').length;
      }
    expect(m).toBeLessThanOrEqual(7);
    expect(m).toBeGreaterThan(0);
  });

  it('1. výběr a jedna změna zdarma, další změna spálí týden', () => {
    let s = fresh();
    s = setMonthPriorities(s, ['kabina', 'sponzori']).state;
    expect(monthPriorities(s).changeCost).toBe('zdarma');
    s = setMonthPriorities(s, ['kabina', 'media']).state;
    expect(monthPriorities(s).changeCost).toBe('tyden');
    expect(monthPriorities(s).burnUntil).toBeUndefined();
    const r = setMonthPriorities(s, ['radnice', 'media']);
    expect(r.ok).toBe(true);
    expect(r.message).toContain('7 dní');
    expect(monthPriorities(r.state).burnUntil).toBe(addDays(s.date, 7));
    s = r.state;
    s.date = addDays(s.date, 3);
    expect(runPrioritiesToday(s)).toHaveLength(0);
    expect(setMonthPriorities(s, ['radnice', 'media']).ok).toBe(false);
  });

  it('konec měsíce: shrnutí, nové priority od vedení (nebo ponechané)', () => {
    let s = fresh();
    s = setMonthPriorities(s, ['radnice', 'fanousci']).state;
    const month = s.date.slice(0, 7);
    const toNext = Math.round((Date.parse(`${addDays(`${month}-28`, 7).slice(0, 7)}-01`) - Date.parse(s.date)) / 86_400_000);
    s = advanceDays(s, toNext + 1).state;
    const sum = lastMonthSummary(s)!;
    expect(sum.month).toBe(month);
    expect(sum.title).toContain('Konec měsíce');
    expect(sum.lines[0]).toContain('Radnice a stadion');
    expect(sum.deltas.some((d) => d.label === 'Vztah s městem' && d.value > 0)).toBe(true);
    expect(monthSummary(s, month)).toEqual(sum);
    expect(monthPriorities(s).by).toBe('vedeni');
    // ponechat i na další měsíc
    let k = setMonthPriorities(fresh(), ['radnice', 'fanousci'], { keep: true }).state;
    k = advanceDays(k, toNext + 1).state;
    expect(monthPriorities(k).by).toBe('majitel');
    expect(monthPriorities(k).priorities).toEqual(['radnice', 'fanousci']);
  });

  it('osobní schůzka: jedna týdně zdarma', () => {
    const s = fresh();
    const r = personalMeeting(s, 'kotel', 'dialog');
    expect(r.ok).toBe(true);
    expect(meetingView(r.state).free).toBe(false);
    expect(personalMeeting(r.state, 'trener', 'podpora').ok).toBe(false);
    const later = advanceDays(r.state, 7).state;
    expect(meetingView(later).free).toBe(true);
  });

  it('cíl lovu: přednostní skauting', () => {
    const s = fresh();
    const ids = Object.values(s.players).filter((p) => p.clubId && p.clubId !== s.owner.clubId && !p.clubId.startsWith('zahr')).sort((a, b) => b.overall - a.overall).slice(10, 13).map((p) => p.id);
    s.watchlist = ids;
    const f = focusHuntTarget(s, ids[2]);
    expect(f.ok).toBe(true);
    expect(planForPriority(f.state, 'prestupy', 0)).toEqual({ action: 'skauting', target: ids[2] });
  });
});

describe('W2 kalibrace: strop vztahů z priorit', () => {
  it('softGain klesá a končí na stropu; priority nevytáhnou důvěru nad ~78', () => {
    expect(softGain(20, 5)).toBe(5);
    expect(softGain(40, 5)).toBeGreaterThan(softGain(70, 5));
    expect(softGain(70, 5)).toBeLessThan(5);
    expect(softGain(77, 5)).toBeLessThanOrEqual(1);
    expect(softGain(80, 5)).toBe(0);
    let s = setMonthPriorities(fresh(), ['kabina', 'radnice', 'fanousci']).state;
    s.owner.trust.trener = 74;
    for (let w = 0; w < 8; w++) runWeek(s);
    expect(s.owner.trust.trener).toBeLessThanOrEqual(PRIORITY_CEILING);
    expect(cityOf(s).relation).toBeLessThanOrEqual(Math.max(PRIORITY_CEILING, cityOf(fresh()).relation));
    const hi = fresh();
    hi.owner.trust.trener = 90;
    const r = personalMeeting(hi, 'trener', 'podpora');
    expect(r.state.owner.trust.trener).toBe(90);
  });

  it('rádce nedoporučí kabinu při vysoké důvěře bez důvodu', () => {
    const s = fresh();
    s.owner.trust.trener = 85;
    for (const p of squadOf(s, s.owner.clubId)) p.morale = 70;
    expect(monthAdvice(s).priorities.map((p) => p.id)).not.toContain('kabina');
  });
});

describe('W2 kalibrace: tlumení nad ~80 a měsíční návrat k zasloužené úrovni', () => {
  it('easeGain: pod 80 naplno, nad 80 tlumeně, ztráty beze změny', () => {
    expect(easeGain(50, 10)).toBe(10);
    expect(easeGain(85, 10)).toBeLessThan(4);
    expect(easeGain(98, 10)).toBeLessThan(1);
    expect(easeGain(90, -5)).toBe(-5);
    expect(easeAdd(95, 20)).toBeLessThan(100);
  });

  it('vysoká důvěra bez výsledků se měsíčně vrací, ne skokem', () => {
    const s = fresh();
    s.owner.trust.trener = 98;
    s.ultras = { ...ultrasOf(s), relation: 98 };
    const d = deservedRelations(s);
    expect(d.trener).toBeLessThan(70);
    monthlyRelationReversion(s);
    expect(s.owner.trust.trener).toBeLessThan(98);
    expect(s.owner.trust.trener).toBeGreaterThan(90);
    expect(ultrasOf(s).relation).toBeLessThan(98);
  });
});

describe('V1 A2 / W2: rádce doporučí priority z dat', () => {
  it('nejvýš 3 rady s důvodem; nová hra doporučí projekty; nízká důvěra → kabina', () => {
    const s = fresh();
    const a = weeklyAdvice(s);
    expect(a.length).toBeGreaterThan(0);
    expect(a.length).toBeLessThanOrEqual(3);
    for (const x of a) expect(x.reason.length).toBeGreaterThan(5);
    expect(a.some((x) => x.tab === 'projekty')).toBe(true);
    s.owner.trust.trener = 20;
    const m = monthAdvice(s);
    expect(m.priorities[0].id).toBe('kabina');
    expect(m.priorities[0].reason).toContain('20');
    expect(setMonthPriorities(s, m.priorities.map((p) => p.id)).ok).toBe(true);
  });
});

describe('V1 A3: rutina podřízeným', () => {
  it('drobná rozhodnutí vyřídí vedení; bez výběru priorit pracuje vedení samo', () => {
    let s = setRoutine(fresh(), true).state;
    expect(routineView(s).auto).toBe(true);
    const e = TEMPLATES.travnik ? 'travnik' : 'noc';
    s.events.push({ id: 'e999', template: e, date: s.date, expires: addDays(s.date, 14), title: 'Test', text: '', defaultOption: 'x', options: [{ id: 'x', label: 'X', hint: '' }, { id: 'y', label: 'Y', hint: '' }] });
    dailyAgenda(s);
    expect(s.events.some((x) => x.id === 'e999')).toBe(false);
    expect(monthPriorities(s).by).toBe('vedeni');
    expect(routineView(s).items.find((i) => i.label.startsWith('Priority měsíce'))!.on).toBe(true);
    const ran = runWeek(s);
    expect(ran.some((u) => u.routine)).toBe(true);
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
    const st2 = setMonthPriorities(st, ['sponzori', 'media']).state;
    const ran = runWeek(st2);
    expect(ran.find((u) => u.priority === 'sponzori')!.result).toContain('Silní partneři');
    const p = activeProjects(st2)[0];
    expect(p.steps[2].text).toContain('1/2 z priorit');
    // vynucené splnění kroků
    const s3 = st2;
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
    const r = scoutTrip(s, target.id);
    expect(r.ok).toBe(true);
    const t1 = huntTargets(r.state)[0];
    expect(t1.trips).toBe(1);
    expect(t1.error).toBeLessThanOrEqual(t0.error);
    expect(Math.abs(scouted(r.state, target).overall - target.overall)).toBeLessThanOrEqual(Math.abs(scouted(s, target).overall - target.overall) + 1);
    expect(scoutTrip(s, 'neexistuje').ok).toBe(false);
    const plan = setHuntPlan(s, ['FW'], 5_000_000);
    expect(plan.state.hunt!.plan!.positions).toEqual(['FW']);
    const pitch = structuredClone(s);
    expect(personalPitchMut(pitch, target.id).ok).toBe(true);
    expect(pitch.tips!.some((t) => t.playerId === target.id)).toBe(true);
    // přes prioritu: vedení jede na skautskou cestu za cílem lovu samo
    const pr = setMonthPriorities(s, ['prestupy', 'media']).state;
    const ran = runWeek(pr);
    expect(ran.find((u) => u.priority === 'prestupy')?.actionId).toBe('skauting');
    expect(huntTargets(pr)[0].trips).toBe(1);
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
      st.staff[st.clubs[st.owner.clubId].staff.coachId].youthFocus = true;
      st = setMonthPriorities(st, ['mladez', 'media']).state;
      runWeek(st);
      expect(st.training!.accepted).toBe(true);
    }
  });
});

describe('V1 A9: úroveň majitele', () => {
  it('XP zvedají úroveň a 4. prioritu měsíce', () => {
    const s = fresh();
    expect(ownerLevel(s).level).toBe(1);
    expect(ownerLevel(s).nextUnlocks.length).toBeGreaterThan(0);
    addOwnerXp(s, OWNER_LEVELS[2].xp);
    expect(ownerLevel(s).level).toBeGreaterThanOrEqual(3);
    expect(agendaSlots(s)).toBe(4);
    expect(monthPriorities(s).max).toBe(4);
    expect(setMonthPriorities(s, ['kabina', 'sponzori', 'media', 'radnice']).ok).toBe(true);
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
    expect(() => [monthPriorities(s), weeklyAdvice(s), monthAdvice(s), characters(s), projectOffers(s), trainingPlan(s), huntTargets(s), ownerLevel(s), monthSummary(s), lastMonthSummary(s), routineView(s), meetingView(s)]).not.toThrow();
    expect(squadOf(s, s.owner.clubId).length).toBeGreaterThan(0);
  });

  it('W2: stará hra s týdenní agendou se převede, nevyužitá agenda se zahodí', () => {
    const s = fresh();
    const week = weekStartOf(s.date);
    // tvar V1 (týdenní agenda) bez nových polí
    s.agenda = {
      week,
      used: [{ slot: 1, actionId: 'kotel', result: 'Setkání s kotlem', date: s.date }],
      history: [{ week: addDays(week, -7), used: [], summary: { week: addDays(week, -7), title: 'Týden', lines: [], deltas: [] } }],
      auto: true,
      boosted: ['x1'],
      routineCount: 2,
    } as unknown as GameState['agenda'];
    expect(() => [monthPriorities(s), weeklyAdvice(s), routineView(s), monthSummary(s), lastMonthSummary(s), meetingView(s)]).not.toThrow();
    expect(monthPriorities(s).by).toBe('vedeni');
    expect(lastMonthSummary(s)).toBeUndefined();
    const r = setMonthPriorities(s, ['kabina', 'media']);
    expect(r.ok).toBe(true);
    const a = r.state.agenda!;
    expect(a.used).toBeUndefined();
    expect(a.history).toBeUndefined();
    expect(a.auto).toBe(true);
    expect(a.boosted).toEqual(['x1']);
    const later = advanceDays(s, 40).state;
    expect(later.agenda!.month).toBe(later.date.slice(0, 7));
    expect(later.agenda!.used).toBeUndefined();
    expect(lastMonthSummary(later)!.lines.length).toBeGreaterThan(0);
  });
});
