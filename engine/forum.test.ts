import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { lastOwnMatch, seasonFacts } from './facts';
import { clubPostText, factVoices, matchFactLine, vMin } from './fanvoice';
import { dailyForum, forumReplyOptions, forumThreads, replyForum, type ForumThread } from './forum';
import { advanceDays, newGame } from './game';
import { coachOf } from './staff';
import type { DataPack, GameState } from './types';

const start = newGame(pack as DataPack, { clubId: 'bohemians', ownerName: 'T', difficulty: 'stredni', seed: 5 });
let season: GameState | undefined;
const played = () => (season ??= advanceDays(start, 120).state);

describe('R2: texty z faktů', () => {
  it('zpráva o výsledku, příspěvek klubu a komentáře citují skutečné dění', () => {
    const s = played();
    const m = lastOwnMatch(s)!;
    const sf = seasonFacts(s);
    const line = matchFactLine(m, sf);
    for (const g of m.scorers) expect(line).toContain(`${g.minute}.`);
    expect(line).not.toMatch(/\.\./);
    const post = clubPostText(m, sf);
    expect(post).toContain(m.scoreline);
    const voices = factVoices(s, 'x', m.outcome === 'V' ? 'pos' : 'neg', m, sf, 3);
    expect(voices.length).toBeGreaterThanOrEqual(2);
    expect(new Set(voices.map((v) => v.persona)).size).toBe(voices.length);
    for (const v of voices) expect(v.name.startsWith('@')).toBe(true);
    // Zpráva o výsledku v novinkách nese fakta (střelce s minutou).
    const news = s.news.find((n) => n.kind === 'vysledek' && n.fixtureId === m.fixtureId)!;
    if (m.scorers.length) expect(news.text).toContain('Góly:');
    expect(vMin(4)).toBe('ve 4. minutě');
    expect(vMin(87)).toBe('v 87. minutě');
  }, 60_000);
});

describe('R2: fórum fanoušků', () => {
  it('vlákna vznikají z dat, mají náladu, příspěvky a nejvýš 4 otevřená', () => {
    const s = played();
    const ts = s.forum?.threads ?? [];
    expect(ts.length + (s.forum?.archive.length ?? 0)).toBeGreaterThan(0);
    expect(ts.filter((t) => !t.closed).length).toBeLessThanOrEqual(4);
    for (const t of ts) {
      expect(t.posts).toBeGreaterThan(0);
      expect(t.mood).toBeGreaterThanOrEqual(0);
      expect(t.mood).toBeLessThanOrEqual(100);
      for (const p of t.last) if (p.persona !== 'majitel') expect(p.name.startsWith('@')).toBe(true);
      // Vlákno o hráči cituje jeho jméno.
      if (t.subjectName && !t.closed) expect(t.title + t.last.map((p) => p.text).join(' ')).toContain(t.subjectName.split(' ').pop()!);
    }
    expect(forumThreads(s).length).toBeLessThanOrEqual(4);
  }, 60_000);

  it('málo minut mladých otevře vlákno; slib v odpovědi je slib majitele a změní data', () => {
    const s = structuredClone(played());
    const thread: ForumThread = { id: 'fv-test', key: 'mladi', topic: 'mladi', title: 'Proč nehraje odchovanec?', opened: s.date, updated: s.date, mood: 40, posts: 20, last: [], heat: 45, fingerprint: 'x' };
    s.forum = { threads: [thread], archive: [] };
    const coach = coachOf(s, s.owner.clubId)!;
    coach.youthFocus = false;
    const opts = forumReplyOptions(s, 'fv-test');
    expect(opts.map((o) => o.id)).toEqual(['uklidnit', 'slib', 'razantne']);
    const slib = opts.find((o) => o.id === 'slib')!;
    expect(slib.promise?.metric).toBe('youthMinutes');
    const before = s.situations?.promises.length ?? 0;
    const r = replyForum(s, 'fv-test', 'slib');
    expect(r.ok).toBe(true);
    expect(r.state.situations!.promises.length).toBe(before + 1);
    expect(coachOf(r.state, r.state.owner.clubId)!.youthFocus).toBe(true);
    const t = r.state.forum!.threads[0];
    expect(t.reply?.option).toBe('slib');
    expect(t.mood).toBeGreaterThan(40);
    expect(t.last.some((p) => p.persona === 'majitel')).toBe(true);
    // Jen jedna odpověď na vlákno.
    expect(replyForum(r.state, 'fv-test', 'uklidnit').ok).toBe(false);
    expect(forumReplyOptions(r.state, 'fv-test')).toEqual([]);
  }, 60_000);

  it('vlákno, jehož téma přestalo platit, se uzavře s vysvětlením', () => {
    const s = structuredClone(played());
    // Vlákno o vítězné sérii, která (u tohoto stavu) neběží → po dni zápasu/pondělí se uzavře.
    const sf = seasonFacts(s);
    if (sf.streak.kind === 'V' && sf.streak.length >= 4) return;
    s.forum = { threads: [{ id: 'fv-c', key: 'chvala', topic: 'chvala', title: 'Věříme trenérovi!', opened: s.date, updated: s.date, mood: 80, posts: 10, last: [], heat: 40, fingerprint: 'x' }], archive: [] };
    let t = s;
    for (let i = 0; i < 8 && !t.forum!.threads[0]?.closed; i++) {
      t = advanceDays(t, 1).state;
      dailyForum(t);
    }
    const th = [...t.forum!.threads, ...t.forum!.archive].find((x) => x.id === 'fv-c')!;
    expect(th.closed).toBeDefined();
    expect(th.resolution).toBeTruthy();
  }, 60_000);
});
