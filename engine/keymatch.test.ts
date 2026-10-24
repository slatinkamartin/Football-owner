import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { addDays } from './calendar';
import { advanceDays, advanceStep, newGame } from './game';
import { isRival } from './league';
import {
  coachAdviceOf,
  isKeyMatch,
  matchStakes,
  matchWindowTomorrow,
  nextOwnFixture,
  opensMatchWindow,
  setCoachAdvice,
  setLateChoice,
  stopBeforeEveryMatch,
} from './matchday';
import { lateMoment, liveChanges, liveDecisionMinute, MAX_LIVE_DECISIONS, prepOpen, prepSummary, prepValue } from './matchexperience';
import { updateSettings } from './settings';
import { decisionsLastWeek } from './situations';
import type { DataPack, Fixture, GameState } from './types';
import { isKeyEuroMatch } from './bigmatch';
import type { EuroMatch } from './europe';
import { competitionOf } from './world';

const start = newGame(pack as DataPack, { clubId: 'plzen', ownerName: 'T', difficulty: 'stredni', seed: 33 });
const OWN = 'plzen';

/**
 * Umělá nadstavba nezávislá na formátu losu: body přes odečty (záporné = přičtené), skupiny podle bodů
 * a zápasy klubu ve skupině na vyhrazených termínech.
 */
function nadstavba(order: string[], points: number[], groupNames: string[], sizes: number[], ownOpp: string[]): { s: GameState; f: Fixture } {
  const s = structuredClone(start);
  const comp = competitionOf(s, OWN)!;
  const dates = comp.reservedDates?.length ? comp.reservedDates : ['2027-05-02', '2027-05-09', '2027-05-16', '2027-05-23', '2027-05-30'];
  comp.reservedDates = dates;
  comp.fixtures = [];
  comp.penalties = Object.fromEntries(order.map((id, i) => [id, -points[i]]));
  let at = 0;
  comp.groups = groupNames.map((name, i) => {
    const g = { name, clubIds: order.slice(at, at + sizes[i]) };
    at += sizes[i];
    return g;
  });
  ownOpp.forEach((opp, i) => comp.fixtures.push({ id: `t-n${i}`, round: 31 + i, date: dates[i] ?? addDays(dates[0], 7 * i), homeId: OWN, awayId: opp }));
  s.date = addDays(dates[0], -1);
  return { s, f: comp.fixtures[0] };
}

/** 16 klubů ligy: vlastní klub na zadaném místě, ostatní v pořadí soutěže; soupeři bez derby. */
function ordered(ownIndex: number): string[] {
  const ids = competitionOf(start, OWN)!.clubIds.filter((id) => id !== OWN);
  const plain = ids.filter((id) => isRival(start, id)?.kind !== 'derby');
  const rest = ids.filter((id) => !plain.includes(id));
  const list = [...plain, ...rest];
  list.splice(ownIndex, 0, OWN);
  return list;
}

const GROUPS = ['Skupina o titul', 'Play-off o umístění', 'Skupina o záchranu'];
const pts = (top: number, step: number) => Array.from({ length: 16 }, (_, i) => Math.max(0, top - i * step));

describe('W3: klíčové zápasy nadstavby (podle skupin soutěže)', () => {
  it('skupina o titul: těsný souboj je klíčový, rozhodnutý titul ne', () => {
    const o = ordered(0);
    const close = nadstavba(o, pts(60, 2), GROUPS, [6, 4, 6], [o[1], o[2], o[3], o[4], o[5]]);
    expect(matchStakes(close.s, close.f).map((x) => x.key)).toContain('titul');
    const p = pts(60, 2);
    p[0] = 90;
    const done = nadstavba(o, p, GROUPS, [6, 4, 6], [o[1], o[2], o[3], o[4], o[5]]);
    expect(isKeyMatch(done.s, done.f)).toBe(false);
  });

  it('skupina o záchranu: souboj o baráž/sestup je klíčový, bezpečný střed ne', () => {
    const o = ordered(13);
    const fight = nadstavba(o, pts(50, 1), GROUPS, [6, 4, 6], [o[14], o[12], o[11], o[10], o[15]]);
    expect(matchStakes(fight.s, fight.f).map((x) => x.key)).toContain('zachrana');
    const p = pts(60, 1);
    p[10] = 45; // vlastní klub na 11. místě daleko před pásmem
    for (let i = 11; i < 16; i++) p[i] = 20 - i;
    const safe = ordered(10);
    const calm = nadstavba(safe, p, GROUPS, [6, 4, 6], [safe[11], safe[12], safe[13], safe[14], safe[15]]);
    expect(isKeyMatch(calm.s, calm.f)).toBe(false);
  });

  it('play-off o umístění: klíčové je jen finále, semifinále ne', () => {
    const o = ordered(6);
    const semi = nadstavba(o, pts(60, 2), GROUPS, [6, 4, 6], [o[9]]);
    const comp = competitionOf(semi.s, OWN)!;
    comp.fixtures.push({ id: 't-semi2', round: semi.f.round, date: semi.f.date, homeId: o[8], awayId: o[7] });
    expect(isKeyMatch(semi.s, semi.f)).toBe(false);
    const fin = nadstavba(o, pts(60, 2), GROUPS, [6, 4, 6], [o[8]]);
    expect(matchStakes(fin.s, fin.f).map((x) => x.key)).toEqual(['playoff']);
  });
});

describe('W3: okno před zápasem jen u klíčových zápasů', () => {
  it('běžný zápas okno neotevře, nastavení „před každým zápasem“ ano (staré hry bez pole: vypnuto)', () => {
    let s = start;
    for (let i = 0; i < 80; i++) {
      const n = nextOwnFixture(s);
      if (n && !isKeyMatch(s, n.fixture, n.cup)) break;
      s = advanceDays(s, 1).state;
    }
    const next = nextOwnFixture(s)!;
    expect(isKeyMatch(s, next.fixture, next.cup)).toBe(false);
    expect(stopBeforeEveryMatch(s)).toBe(false);
    expect(opensMatchWindow(s, next)).toBe(false);
    const every = updateSettings(s, { stops: { ...s.settings?.stops, decision: true, offer: true, offerMin: 0, injury: true, milestone: true, everyMatch: true } }).state;
    expect(opensMatchWindow(every, next)).toBe(true);
    // Staré uložené hry: settings bez everyMatch, bigMatch bez prepOffered, plán bez late.
    const old = structuredClone(s) as GameState;
    if (old.settings) delete (old.settings.stops as { everyMatch?: boolean }).everyMatch;
    expect(stopBeforeEveryMatch(old)).toBe(false);
    expect(prepOpen({ id: 'x', date: s.date, kind: 'derby' })).toBe(true);
  });

  it('posun odehraje běžný zápas sám a vrátí jeho id; před klíčovým stojí v předvečer', () => {
    const quiet = updateSettings(start, { stops: { decision: false, offer: false, offerMin: 0, injury: false, milestone: false } }).state;
    let s = quiet;
    let played = 0;
    let windows = 0;
    for (let i = 0; i < 40; i++) {
      if (matchWindowTomorrow(s)) {
        windows++;
        s = advanceDays(s, 1, true).state;
        continue;
      }
      const r = advanceStep(s);
      if (r.fixtureId) played++;
      s = r.state;
    }
    expect(played).toBeGreaterThan(3);
    expect(played).toBeGreaterThan(windows);
  }, 30_000);
});

describe('W3: jedna rada trenérovi a jeden zásah v přenosu', () => {
  it('rada trenérovi: výchozí „nechat na trenérovi“, volba se uloží (immutable)', () => {
    const id = nextOwnFixture(start)!.fixture.id;
    expect(coachAdviceOf(start, id)).toBe('trener');
    const r = setCoachAdvice(start, 'vysledek', id);
    expect(r.ok).toBe(true);
    expect(coachAdviceOf(r.state, id)).toBe('vysledek');
    expect(r.state.matchPlan?.approach).toBe('beton');
    expect(start.matchPlan?.approach).toBeUndefined();
    const back = setCoachAdvice(r.state, 'trener', id).state;
    expect(back.matchPlan?.approach).toBeUndefined();
  });

  it('jediný zásah: o poločase, když klub nevede, jinak v 75. minutě; 75. minuta podle skóre', () => {
    expect(MAX_LIVE_DECISIONS).toBe(1);
    expect(liveDecisionMinute(0, 0)).toBe(45);
    expect(liveDecisionMinute(0, 1)).toBe(45);
    expect(liveDecisionMinute(2, 1)).toBe(75);
    expect(lateMoment(1, 0).options.map((o) => o.id)).toEqual(['branit', 'nechat']);
    expect(lateMoment(0, 1).options.map((o) => o.id)).toEqual(['vabank', 'nechat']);
    expect(lateMoment(1, 1).options[0].id).toBe('vabank');
  });

  it('zásah v 75. minutě z plánu zápasu platí i bez velkého zápasu (trenér ho přijme, nebo ne)', () => {
    const f = nextOwnFixture(start)!.fixture;
    const none = { ...start, bigMatch: undefined } as GameState;
    expect(setLateChoice(none, 'nechat', f.id).matchPlan?.late).toBe('nechat');
    expect(liveChanges(setLateChoice(none, 'nechat', f.id), f)).toBeUndefined();
    let accepted = 0;
    for (let i = 0; i < 12; i++) {
      const g = { ...f, id: `${f.id}-${i}` };
      const c = liveChanges(setLateChoice(none, 'vabank', g.id), g);
      if (c) {
        accepted++;
        expect(c[0].minute).toBe(75);
      }
    }
    expect(accepted).toBeGreaterThan(0);
  });
});

describe('W3: týden velkého zápasu = jedno souhrnné rozhodnutí v týdenním limitu', () => {
  it('domácí velký zápas: jedna volba pojetí, presety se rozloží; nabídnutá volba se počítá do limitu', () => {
    let s = start;
    let checked = 0;
    for (let i = 0; i < 220 && checked < 2; i++) {
      const prevId = s.bigMatch?.id;
      s = advanceDays(s, 1).state;
      const bm = s.bigMatch;
      if (!bm || bm.id === prevId || bm.started !== s.date || !bm.home) continue;
      const sum = prepSummary(s, bm);
      if (!sum) continue;
      checked++;
      expect(sum.options.map((o) => o.id)).toEqual(['svatek', 'vedeni', 'byznys']);
      expect(prepValue(s, bm, 'plan')).toBe('vedeni');
      const party = structuredClone(s);
      party.bigMatch!.prep = { plan: 'svatek' };
      expect(prepValue(party, party.bigMatch!, 'choreo')).toBe('zaplatit');
      expect(prepValue(party, party.bigMatch!, 'tickets')).toBe('lidove');
      if (bm.prepOffered) {
        expect(s.situations?.log.some((l) => l.id === `priprava-${bm.id}`)).toBe(true);
        expect(decisionsLastWeek(s)).toBeGreaterThan(0);
      }
    }
    expect(checked).toBeGreaterThan(0);
  }, 30_000);
});

describe('W3: klíčové evropské zápasy', () => {
  const slavia = newGame(pack as DataPack, { clubId: 'slavia', ownerName: 'T', difficulty: 'stredni', seed: 5 });
  const mk = (over: Partial<EuroMatch>): EuroMatch => ({ id: 'eu-x', date: '2026-10-20', comp: 'LM', stage: 'x', home: true, opponent: { name: 'Neznámý FC', country: 'Kypr', rating: 60 }, ...over });
  function withRun(matches: EuroMatch[], points = 0): GameState {
    const s = structuredClone(slavia);
    s.europe = { ...(s.europe ?? {}), run: { season: s.season, clubId: 'slavia', comp: 'LM', phase: 'liga', matches, points, gf: 0, ga: 0 } } as GameState['europe'];
    return s;
  }
  const league = (n: number) => Array.from({ length: n }, (_, i) => mk({ id: `eu-l${i}`, date: `2026-1${Math.min(2, Math.floor(i / 3))}-0${(i % 3) + 1}` }));

  it('předkola: klíčová jen odveta; vyřazovací fáze po ligové fázi: oba zápasy', () => {
    const q1 = mk({ id: 'eu-q1', date: '2026-07-20', tie: 0, leg: 1 });
    const q2 = mk({ id: 'eu-q2', date: '2026-07-27', tie: 0, leg: 2 });
    const s = withRun([q1, q2]);
    expect(isKeyEuroMatch(s, q1)).toBe(false);
    expect(isKeyEuroMatch(s, q2)).toBe(true);
    const l = league(8);
    const k1 = mk({ id: 'eu-k1', date: '2027-02-17', tie: 1, leg: 1 });
    expect(isKeyEuroMatch(withRun([...l, k1]), k1)).toBe(true);
  });

  it('ligová fáze: špičkový soupeř ano, běžné kolo ne, poslední kola jen když jde o pásmo', () => {
    const l = league(8);
    const top = { ...l[1], opponent: { name: 'FC Barcelona', country: 'Španělsko', rating: 90 } };
    const s = withRun([l[0], top, ...l.slice(2)]);
    expect(isKeyEuroMatch(s, top)).toBe(true);
    expect(isKeyEuroMatch(s, l[2])).toBe(false);
    // Poslední kolo s 8 body ze 7 zápasů: pásmo se ještě může změnit (konec / play-off); se 2 body už ne.
    const open = withRun(l.map((m, i) => (i < 7 ? { ...m, result: { own: 1, opp: 1, scorers: [], oppMinutes: [] } } : m)) as EuroMatch[], 8);
    expect(isKeyEuroMatch(open, open.europe!.run!.matches[7])).toBe(true);
    const lost = withRun(open.europe!.run!.matches, 2);
    expect(isKeyEuroMatch(lost, lost.europe!.run!.matches[7])).toBe(false);
  });
});
