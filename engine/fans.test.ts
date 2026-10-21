import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { awayTripEdge, awayTripOption, celebrate, commitmentDecide, councilDecide, dailyFans, ideaCost, openPoll, setAwayTrip } from './fans';
import { advanceDays, newGame } from './game';
import { addTrophy } from './surroundings';
import type { BigMatch } from './bigmatch';
import type { DataPack, Fixture, GameState } from './types';

const czPack = pack as DataPack;
const game = (seed = 21, clubId = 'slavia') => newGame(czPack, { clubId, ownerName: 'T', difficulty: 'stredni', seed });
const own = (s: GameState) => s.clubs[s.owner.clubId];

describe('fanoušci průběžně (W3)', () => {
  it('fanouškovská rada navrhne nápad 4. v měsíci; přijetí stojí peníze a zvedne náladu, odložení jde jen jednou', () => {
    const s = game();
    s.date = '2026-09-04';
    dailyFans(s);
    const c = s.fans!.council!;
    expect(c).toBeDefined();
    c.idea = 'tribuna';
    c.legend = 'Josef Novák';
    const mood = own(s).fanMood;
    const balance = own(s).finance.balance;
    const r = councilDecide(s, 'prijmout');
    expect(r.ok).toBe(true);
    expect(own(r.state).fanMood).toBeGreaterThan(mood);
    expect(own(r.state).finance.balance).toBe(balance - ideaCost(s, 'tribuna'));
    expect(r.state.fans!.council).toBeUndefined();
    // Odložení: podruhé už nejde a po termínu se nápad odmítne sám.
    const p = councilDecide(s, 'odlozit');
    expect(p.state.fans!.council!.postponed).toBe(true);
    expect(councilDecide(p.state, 'odlozit').ok).toBe(false);
    const t = structuredClone(p.state);
    t.date = t.fans!.council!.deadline;
    dailyFans(t);
    expect(t.fans!.council?.idea).not.toBe('tribuna');
    expect(t.fans!.ideasDone!.tribuna).toBe(t.date);
  });

  it('přijatá hymna otevře anketu; závazek z ankety jde splnit nebo porušit (porušení = peníze, ale horší nálada)', () => {
    const s = game(22);
    s.date = '2026-09-04';
    s.fans = { council: { idea: 'hymna', offered: s.date, deadline: '2026-09-18' } };
    const r = councilDecide(s, 'prijmout');
    const poll = r.state.fans!.poll!;
    expect(poll.kind).toBe('hymna');
    expect(poll.options.reduce((a, o) => a + o.share, 0)).toBe(100);
    const t = structuredClone(r.state);
    t.date = poll.closes;
    dailyFans(t);
    expect(t.fans!.poll!.winner).toBeDefined();
    const c = t.fans!.commitment!;
    expect(c.kind).toBe('hymna');
    const keep = commitmentDecide(t, 'splnit');
    const broke = commitmentDecide(t, 'porusit');
    expect(own(broke.state).fanMood).toBeLessThan(own(keep.state).fanMood);
    expect(own(broke.state).finance.balance).toBeGreaterThan(own(keep.state).finance.balance);
    // Bez rozhodnutí se po termínu závazek splní sám.
    const auto = structuredClone(t);
    auto.date = c.due;
    dailyFans(auto);
    expect(auto.fans!.commitment).toBeUndefined();
    expect(auto.fans!.log![0].text).toContain('splněn');
  });

  it('hráč měsíce se volí z hráčů s nejlepšími známkami a prodej porušuje slib', () => {
    let s = game(23);
    s = advanceDays(s, 75).state; // do září: odehrané zápasy se známkami
    s.date = `${s.date.slice(0, 7)}-02`;
    s.fans = { ...(s.fans ?? {}), poll: undefined };
    expect(openPoll(s, 'hrac')).toBe(true);
    const poll = s.fans!.poll!;
    expect(poll.options.length).toBeGreaterThanOrEqual(2);
    expect(poll.options.every((o) => s.players[o.playerId!]?.clubId === s.owner.clubId)).toBe(true);
    s.date = poll.closes;
    dailyFans(s);
    const promise = s.fans!.promises!.find((x) => x.from === s.date)!;
    expect(promise).toBeDefined();
    const mood = own(s).fanMood;
    s.transferLog = [...(s.transferLog ?? []), { date: s.date, playerId: promise.playerId, playerName: promise.name, fromId: s.owner.clubId, toId: 'sparta', fromName: '', toName: '', fee: 1, kind: 'prestup' }];
    dailyFans(s);
    expect(own(s).fanMood).toBeLessThan(mood);
    expect(s.fans!.promises!.some((x) => x.playerId === promise.playerId)).toBe(false);
  });

  it('výjezd na venkovní derby ubere domácím výhodu a po zápase se zaplatí', () => {
    const s = game(24);
    const opp = Object.keys(s.clubs).find((id) => id !== s.owner.clubId)!;
    const f: Fixture = { id: 'test-derby', round: 1, date: '2026-09-10', homeId: opp, awayId: s.owner.clubId };
    s.date = '2026-09-07';
    const big: BigMatch = { id: f.id, date: f.date, kind: 'derby', home: false, opponentName: 'Soupeř', opponentId: opp, label: 'derby: Soupeř', competition: 'Liga' };
    const opt = awayTripOption(s, big)!;
    expect(opt.options.map((o) => o.id)).toEqual(['nic', 'autobusy', 'vlak']);
    expect(awayTripOption(s, { ...big, home: true })).toBeUndefined();
    const vlak = opt.options.find((o) => o.id === 'vlak')!;
    s.fans = { trip: { matchId: f.id, date: f.date, choice: 'vlak', fans: vlak.fans, cost: vlak.cost, label: big.label } };
    expect(awayTripEdge(s, f)).toBeGreaterThan(0);
    expect(awayTripEdge(s, { ...f, id: 'jiny' })).toBe(0);
    // setAwayTrip bez velkého zápasu nic neudělá.
    expect(setAwayTrip(game(25), 'vlak').ok).toBe(false);
  });

  it('po trofeji fanoušci chtějí oslavu; velká stojí víc a víc zvedne náladu, bez volby skromná', () => {
    const s = game(26);
    s.date = '2027-06-21';
    dailyFans(s); // zapamatuje si stávající síň slávy
    addTrophy(s, 'pohar', 'Vítěz domácího poháru 2026/27');
    dailyFans(s);
    expect(s.fans!.celebration?.reason).toBe('pohár');
    const big = celebrate(s, 'velka');
    const none = celebrate(s, 'zadna');
    expect(own(big.state).fanMood).toBeGreaterThan(own(none.state).fanMood);
    expect(big.state.fans!.celebration).toBeUndefined();
    const auto = structuredClone(s);
    auto.date = s.fans!.celebration!.deadline;
    dailyFans(auto);
    expect(auto.fans!.celebration).toBeUndefined();
    expect(auto.news.some((n) => n.title.startsWith('Oslava'))).toBe(true);
  });

  it('celá sezóna s fanoušky běží bez chyb a výchozí volby se použijí samy', () => {
    let s = game(27);
    s = advanceDays(s, 200).state;
    expect(s.fans).toBeDefined();
    expect((s.fans!.pollCount ?? 0)).toBeGreaterThan(0);
    expect((s.fans!.log ?? []).length).toBeGreaterThan(0);
  });
});
