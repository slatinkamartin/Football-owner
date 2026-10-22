import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { addDays } from './calendar';
import { resolveEvent } from './events';
import { advanceDays, newGame } from './game';
import { nextOwnFixture } from './matchday';
import { backlash, dailySocial, pendingPostMatch, postMatchOptions, resolvePostMatch, rivalryStory, setSocialTone, socialOf } from './social';
import { candidates, hireStaff } from './staff';
import type { DataPack, GameState } from './types';

const start = newGame(pack as DataPack, { clubId: 'bohemians', ownerName: 'T', difficulty: 'snadna', seed: 11 });

/** Posune hru na předvečer dalšího zápasu a označí ho jako velký (derby). */
function eveOfBigMatch(s: GameState): GameState {
  const next = nextOwnFixture(s)!;
  const days = Math.round((Date.parse(next.fixture.date) - Date.parse(s.date)) / 86_400_000) - 1;
  const eve = days > 0 ? advanceDays(s, days).state : structuredClone(s);
  eve.social = { ...socialOf(eve), watch: { id: next.fixture.id, date: next.fixture.date, kind: 'derby', home: next.home, opponentName: 'Soupeř', opponentId: next.opponentId, label: 'derby', competition: next.name } };
  return eve;
}

describe('sociální sítě a krok po zápase', () => {
  it('po velkém zápase čeká krok s třemi titulky, potvrzení přidá příspěvek a zprávu', () => {
    const eve = eveOfBigMatch(start);
    const after = advanceDays(eve, 1).state;
    const p = pendingPostMatch(after)!;
    expect(p).toBeDefined();
    expect(p.headlines).toHaveLength(3);
    expect(p.until > after.date).toBe(true);
    const opts = postMatchOptions(after, p);
    expect(opts.steps.length).toBeGreaterThanOrEqual(2);
    expect(opts.posts.map((x) => x.id)).toContain('nic');
    // R2: návrhy příspěvků z faktů zápasu (skóre) jsou vidět předem.
    expect(opts.posts.filter((x) => x.id !== 'nic').every((x) => !!x.text && /\d+:\d+/.test(x.text))).toBe(true);
    const r = resolvePostMatch(after, opts.steps[0].id, opts.posts[0].id);
    expect(r.ok).toBe(true);
    expect(pendingPostMatch(r.state)).toBeUndefined();
    expect(r.state.news[0].title).toMatch(/^Po zápase/);
    if (opts.posts[0].id !== 'nic') expect(r.state.social!.posts.length).toBeGreaterThan(0);
    // Komentáře píšou jen vymyšlené přezdívky.
    for (const post of r.state.social!.posts) for (const c of post.comments) expect(c.name.startsWith('@')).toBe(true);
  });

  it('bez volby se po dvou dnech použijí výchozí volby', () => {
    const after = advanceDays(eveOfBigMatch(start), 1).state;
    expect(pendingPostMatch(after)).toBeDefined();
    const later = advanceDays(after, 2).state;
    expect(pendingPostMatch(later)).toBeUndefined();
    expect(later.news.some((n) => n.title.startsWith('Po zápase') && n.text?.includes('výchozí'))).toBe(true);
  });

  it('paměť rivality vypráví příběh do zápasu', () => {
    const s = structuredClone(start);
    s.social = { ...socialOf(s), rivalry: { slavia: { w: 1, d: 0, l: 1, games: [{ date: `${s.season}-10-05`, gf: 0, ga: 4, home: false, comp: 'liga' }, { date: `${s.season}-08-01`, gf: 2, ga: 1, home: true, comp: 'liga' }], legends: [] } } };
    s.date = `${s.season + 1}-03-01`;
    expect(rivalryStory(s, 'slavia')).toBe('Odveta za podzimní 0:4.');
    // Odehrané zápasy se ukládají do paměti.
    const after = advanceDays(start, 40).state;
    const mem = Object.values(after.social?.rivalry ?? {});
    expect(mem.reduce((a, m) => a + m.w + m.d + m.l, 0)).toBeGreaterThan(0);
  });

  it('kauza: nejvýš jedna za 6 týdnů, správce sítí ji vyřeší sám', () => {
    const s = structuredClone(start);
    expect(backlash(s, 'ceny', 'Test.')).toBe(true);
    const ev = s.events.find((e) => e.template === 'social-kauza')!;
    expect(ev.options.map((o) => o.id)).toEqual(['omluvit', 'vysvetlit', 'ignorovat']);
    expect(backlash(s, 'derby', 'Znovu.')).toBe(false);
    const mood = s.clubs[s.owner.clubId].fanMood;
    const r = resolveEvent(s, ev.id, 'omluvit');
    expect(r.state.clubs[s.owner.clubId].fanMood).toBeGreaterThan(mood);

    // Se správcem sítí situace nevznikne, kauza se uhasí rovnou.
    const t = structuredClone(start);
    t.date = addDays(t.date, 1);
    dailySocial(t);
    t.date = `${t.date.slice(0, 8)}01`;
    dailySocial(t); // 1. den v měsíci doplní kandidáty
    const pick = candidates(t, 'site').find((c) => c.ability < 70)!;
    expect(pick).toBeDefined();
    const hired = hireStaff(t, pick.id, 2).state;
    const before = hired.events.length;
    expect(backlash(hired, 'prodej', 'Prodali oporu.')).toBe(true);
    expect(hired.events.length).toBe(before);
    expect(hired.news[0].title).toMatch(/správce sítí/);
  });

  it('velká posila: volba ohlášení videem s rizikem úniku', () => {
    const s = structuredClone(start);
    const buy = Object.values(s.players).filter((p) => p.clubId !== s.owner.clubId && p.clubId).sort((a, b) => b.overall - a.overall)[0];
    buy.clubId = s.owner.clubId;
    s.transferLog = [{ date: s.date, playerId: buy.id, playerName: `${buy.firstName} ${buy.lastName}`, overall: buy.overall, fromId: 'slavia', toId: s.owner.clubId, fromName: 'Slavia', toName: 'Bohemians', fee: 30_000_000, kind: 'prestup' }];
    s.date = addDays(s.date, 1);
    dailySocial(s);
    const ev = s.events.find((e) => e.template === 'social-posila')!;
    expect(ev).toBeDefined();
    const followers = s.social!.followers;
    const r = resolveEvent(s, ev.id, 'video');
    expect(r.state.social!.followers).toBeGreaterThan(followers);
    expect(r.state.social!.posts[0].text).toMatch(/Vítej/);
  });

  it('kontroverzní tón přinese víc sledujících, ale zhorší vztah se svazem', () => {
    const base = structuredClone(start);
    base.date = `${base.season}-07-31`;
    const run = (tone: 'profesionalni' | 'kontroverzni') => {
      const s = setSocialTone(base, tone).state;
      s.date = `${s.season}-08-01`;
      dailySocial(s);
      return s;
    };
    const pro = run('profesionalni');
    const contro = run('kontroverzni');
    expect(contro.social!.followers).toBeGreaterThan(pro.social!.followers);
    expect(contro.owner.league).toBeLessThan(pro.owner.league);
    expect(pro.social!.history).toHaveLength(1);
  });
});
