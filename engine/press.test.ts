import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { lastOwnMatch, seasonFacts, type OwnMatchFacts } from './facts';
import { advanceDays, newGame } from './game';
import { narrativeAfterMatch, recordStatement } from './narrative';
import { answerPressConference, effectHint, maybePressConference, pressCandidates, PRESS_TEMPLATE } from './press';
import { squadOf } from './players';
import { activePromises } from './situations';
import { coachOf } from './staff';
import { expireEvents } from './events';
import { addDays } from './calendar';
import type { DataPack, GameState } from './types';

function base(): { s: GameState; m: OwnMatchFacts } {
  let s = newGame(pack as DataPack, { clubId: 'bohemians', ownerName: 'T', difficulty: 'stredni', seed: 11 });
  s = advanceDays(s, 75).state;
  s.events = [];
  s.press = {};
  if (s.situations) s.situations.log = [];
  s.eventLog = {};
  const m = lastOwnMatch(s)!;
  s.date = m.date;
  return { s, m };
}

describe('tisková konference z fakt', () => {
  const { s: s0, m: m0 } = base();
  const squad = squadOf(s0, s0.owner.clubId).sort((a, b) => b.overall - a.overall);
  const red = squad[3];
  const early = squad[5];
  // Výrazný zápas: červená, brzké střídání, vysoká prohra.
  const m: OwnMatchFacts = { ...m0, gf: 0, ga: 4, outcome: 'P', reds: [{ playerId: red.id, name: `${red.firstName} ${red.lastName}`, minute: 38 }], earlySub: { playerId: early.id, name: '', minute: 27 }, scorers: [] };

  it('otázky citují fakta (jména, minuty, skóre) a mají 2–3 odpovědi s dopadem', () => {
    const c = pressCandidates(s0, m, seasonFacts(s0));
    const topics = c.map((x) => x.q.topic);
    expect(topics).toContain('cervena');
    expect(topics).toContain('stridani');
    expect(topics).toContain('debakl');
    const q = c.find((x) => x.q.topic === 'cervena')!.q;
    expect(q.text).toContain(red.lastName);
    expect(q.text).toContain('38.');
    expect(c.find((x) => x.q.topic === 'stridani')!.q.text).toContain('27.');
    for (const x of c) {
      expect(x.q.answers.length).toBeGreaterThanOrEqual(2);
      expect(x.q.answers.length).toBeLessThanOrEqual(3);
      expect(x.q.answers.some((a) => a.id === x.q.defaultAnswer)).toBe(true);
    }
    expect(effectHint({ media: 2, coach: -3 })).toBe('Média +2, trenér −3.');
  });

  it('jedna situace s nejvýš 3 otázkami, nejvýš jednou týdně; odpovědi mají dopad, výroky a sliby', () => {
    const s = structuredClone(s0);
    const conf = maybePressConference(s, m)!;
    expect(conf).toBeDefined();
    expect(conf.questions.length).toBeGreaterThanOrEqual(2);
    expect(conf.questions.length).toBeLessThanOrEqual(3);
    expect(s.events.filter((e) => e.template === PRESS_TEMPLATE)).toHaveLength(1);
    // Druhá tiskovka ve stejném týdnu nevznikne.
    expect(maybePressConference(s, m)).toBeUndefined();
    const qs = conf.questions;
    const answers: Record<string, string> = {};
    for (const q of qs) answers[q.id] = q.topic === 'stridani' ? 'vykon' : q.topic === 'debakl' ? 'ultimatum' : q.defaultAnswer;
    const moraleBefore = s.players[early.id].morale;
    const r = answerPressConference(s, answers);
    expect(r.ok).toBe(true);
    expect(r.state.events.some((e) => e.template === PRESS_TEMPLATE)).toBe(false);
    expect(r.state.press?.current).toBeUndefined();
    const st = r.state.narrative?.statements ?? [];
    if (qs.some((q) => q.topic === 'stridani')) {
      expect(r.state.players[early.id].morale).toBeLessThan(moraleBefore);
      expect(st.some((x) => x.kind === 'kritika-hrace' && x.playerId === early.id && x.source === 'majitel')).toBe(true);
    }
    expect(r.state.news[0].title).toContain('Tisková konference');
  });

  it('bez rozhodnutí platí výchozí odpovědi', () => {
    const s = structuredClone(s0);
    const conf = maybePressConference(s, m)!;
    s.date = addDays(s.date, 4);
    expectBefore(s);
    expireEvents(s);
    expect(s.events.some((e) => e.template === PRESS_TEMPLATE)).toBe(false);
    expect(s.press?.history?.[0].lines.length).toBe(conf.questions.length);
  });

  it('slib z tiskovky se zaregistruje přes R1 (podpora trenéra)', () => {
    const s = structuredClone(s0);
    const sf = { ...seasonFacts(s), winless: 4 };
    const c = pressCandidates(s, { ...m, reds: [], earlySub: undefined }, sf).find((x) => x.q.topic === 'serie');
    expect(c).toBeDefined();
    const trener = c!.q.answers.find((a) => a.id === 'trener');
    if (!coachOf(s, s.owner.clubId) || !trener) return;
    expect(trener.promise?.metric).toBe('coachKept');
    s.press = { current: { eventId: 'ex', fixtureId: m.fixtureId, date: s.date, title: 'T', questions: [{ ...c!.q, id: 'q1', asker: 'x' }] } };
    s.events.push({ id: 'ex', template: PRESS_TEMPLATE, date: s.date, expires: addDays(s.date, 3), title: 'T', text: '', options: [{ id: 'odpovedi', label: 'a', hint: '' }], defaultOption: 'odpovedi' });
    const before = s.owner.trust.trener;
    const r = answerPressConference(s, { q1: 'trener' });
    expect(r.state.owner.trust.trener).toBeGreaterThan(before);
    expect(activePromises(r.state).some((p) => p.source === 'tiskovka' && p.metric === 'coachKept')).toBe(true);
    expect(r.state.narrative?.statements.some((x) => x.kind === 'podpora-trenera')).toBe(true);
  });
});

function expectBefore(s: GameState) {
  expect(s.events.some((e) => e.template === PRESS_TEMPLATE)).toBe(true);
}

describe('navazující příběhy', () => {
  const { s: s0, m: m0 } = base();
  const fw = squadOf(s0, s0.owner.clubId).sort((a, b) => b.overall - a.overall)[0];

  it('gól kritizovaného hráče: „Kdo říkal, že … nedává góly?“', () => {
    const s = structuredClone(s0);
    recordStatement(s, { source: 'novinari', origin: 'noviny', kind: 'kritika-hrace', playerId: fw.id, quote: `${fw.lastName} zapomněl, kde stojí brána`, date: addDays(m0.date, -10) });
    const m: OwnMatchFacts = { ...m0, fixtureId: 'novy', scorers: [{ playerId: fw.id, name: '', minute: 63, penalty: false }] };
    const h = narrativeAfterMatch(s, m);
    expect(h[0]?.title).toBe(`Kdo říkal, že ${fw.lastName} nedává góly?`);
    expect(h[0].text).toContain('63.');
    expect(s.news[0].title).toBe(h[0].title);
    // Na stejný zápas se nenaváže dvakrát.
    expect(narrativeAfterMatch(s, m)).toHaveLength(0);
  });

  it('podpora trenéra, který pak odešel: „vydržela jen …“', () => {
    const s = structuredClone(s0);
    recordStatement(s, { source: 'majitel', origin: 'tiskovka', kind: 'podpora-trenera', quote: 'Trenér má mou plnou podporu', coachId: 'nekdo-jiny', date: addDays(m0.date, -14) });
    s.narrative!.statements[s.narrative!.statements.length - 1].seen = 1;
    const media = s.owner.media;
    const h = narrativeAfterMatch(s, { ...m0, fixtureId: 'novy2' });
    expect(h[0]?.title).toBe('Slíbená podpora trenérovi vydržela jen dva zápasy');
    expect(s.owner.media).toBeLessThan(media);
  });

  it('nejvýš dva titulky po zápase', () => {
    const s = structuredClone(s0);
    const sq = squadOf(s, s.owner.clubId).slice(0, 4);
    for (const p of sq) recordStatement(s, { source: 'fanousci', origin: 'forum', kind: 'kritika-hrace', playerId: p.id, quote: 'Ať jde ven', date: addDays(m0.date, -7) });
    const h = narrativeAfterMatch(s, { ...m0, fixtureId: 'novy3', scorers: sq.map((p, i) => ({ playerId: p.id, name: '', minute: 10 + i, penalty: false })) });
    expect(h.length).toBe(2);
  });
});

describe('tiskovka v běžné hře', () => {
  it('za půl sezóny nejvýš jedna tiskovka týdně a navazující titulky z dat', () => {
    let s = newGame(pack as DataPack, { clubId: 'bohemians', ownerName: 'T', difficulty: 'stredni', seed: 7 });
    const dates: string[] = [];
    for (let i = 0; i < 14; i++) {
      s = advanceDays(s, 10).state;
      for (const r of s.press?.history ?? []) if (!dates.includes(r.date)) dates.push(r.date);
      const c = s.press?.current;
      if (c && !dates.includes(c.date)) dates.push(c.date);
    }
    dates.sort();
    for (let i = 1; i < dates.length; i++) expect(addDays(dates[i - 1], 7) <= dates[i]).toBe(true);
    expect(dates.length).toBeGreaterThan(0);
    expect(dates.length).toBeLessThanOrEqual(12);
  }, 30_000);
});
