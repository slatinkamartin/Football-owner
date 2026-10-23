import { homeAdvantage, ownTeamSpirit } from './atmosphere';
import { allFixtures } from './competitions';
import { europeRun, type EuroMatch, type EuroRun } from './europe';
import { matchFacts, type OwnMatchFacts } from './facts';
import { simulateMatch } from './match';
import { halftimeAdjust, planEffect, nextOwnFixture } from './matchday';
import { liveChanges } from './matchexperience';
import { REGION_NAMES } from './names';
import { squadOf } from './players';
import { createRng, type Rng } from './rng';
import { decisiveness } from './settings';
import { coachBonus, coachOf } from './staff';
import type { Fixture, GameState, MatchResult, Player, Position, ScoutRegion } from './types';
import { clubLabel, hash01 } from './world';

/**
 * V4: Evropské zápasy klubu majitele jako poctivý zápas po minutách (engine/match.ts simulateMatch).
 * Soupeř dostane vygenerovaný kádr podle své síly (stejný v obou zápasech dvojzápasu), vaši hráči
 * hrají skutečně (sestava, únava, zranění, morálka). Rozhodnutí v přenosu (poločas, vabank) platí
 * stejně jako u domácích zápasů, protože zápas běží přes stejné MatchOptions (halftime, changes).
 * Karty z Evropy se do domácích soutěží nepřenášejí (UEFA trestá zvlášť).
 */

/** Předpona id soupeře v simulaci (není to klub ve hře). */
export const EURO_OPP_PREFIX = 'euo:';

/**
 * Kalibrace (engine/zzsim/v4_euro.test.ts): evropské zápasy rozhoduje kvalita víc než domácí (decisive),
 * kádr soupeře má průměr 14 nejlepších = rating + offset. Šance na postup z předkol i body v ligové fázi
 * tak zhruba odpovídají dřívějšímu modelu.
 */
export const EURO_TUNING = { decisive: 2.5, offset: 1.8 };
/** Trenér soupeře (body síly). */
const OPP_COACH = 1.5;
/** Domácí prostředí soupeře, když hrajete venku (vyprodaný evropský stadion). */
const OPP_HOME_EDGE = 7.4;
/** Návštěva na stadionu soupeře (jen pro statistiku). */
const OPP_CROWD = 28_000;

const COUNTRY_REGION: Record<string, ScoutRegion> = {
  Španělsko: 'amerika', Portugalsko: 'amerika',
  Anglie: 'velke', Německo: 'velke', Francie: 'velke', Itálie: 'velke', Nizozemsko: 'velke', Belgie: 'velke', Švýcarsko: 'velke', Rakousko: 'velke', Skotsko: 'velke', Irsko: 'velke',
  Dánsko: 'sever', Norsko: 'sever', Švédsko: 'sever', Finsko: 'sever',
  Chorvatsko: 'balkan', Srbsko: 'balkan', Řecko: 'balkan', Turecko: 'balkan', Kypr: 'balkan', Rumunsko: 'balkan', Bulharsko: 'balkan', Slovinsko: 'balkan',
};

export function euroOppId(m: Pick<EuroMatch, 'opponent'>): string {
  return `${EURO_OPP_PREFIX}${m.opponent.name}`;
}

function seedOf(text: string): number {
  return Math.floor(hash01(text) * 10_000) * 100_000 + Math.floor(hash01(`${text}#`) * 100_000);
}

const SHAPE: Position[] = ['GK', 'GK', 'DF', 'DF', 'DF', 'DF', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'MF', 'MF', 'MF', 'MF', 'FW', 'FW', 'FW', 'FW'];

/** Kádr evropského soupeře (deterministický podle soupeře a sezóny, pro oba zápasy dvojzápasu stejný). */
export function euroOpponentSquad(m: Pick<EuroMatch, 'opponent'>, season: number): Player[] {
  const rng = createRng(seedOf(`eu-squad-${season}-${m.opponent.name}`));
  const names = REGION_NAMES[COUNTRY_REGION[m.opponent.country] ?? 'okoli'];
  const raw = SHAPE.map((pos, i) => ({ pos, ovr: rng.normal(0, 3) - (i % 2 ? 1.5 : 0) - (pos === 'GK' && i === 1 ? 4 : 0) }));
  // Posun tak, aby průměr 14 nejlepších seděl na sílu soupeře.
  const top = raw.map((r) => r.ovr).sort((a, b) => b - a).slice(0, 14);
  const shift = m.opponent.rating + EURO_TUNING.offset - top.reduce((a, b) => a + b, 0) / top.length;
  const clubId = euroOppId(m);
  const used = new Set<string>();
  return raw.map((r, i) => {
    let first = rng.pick(names.first);
    let last = rng.pick(names.last);
    for (let k = 0; k < 4 && used.has(`${first} ${last}`); k++) {
      first = rng.pick(names.first);
      last = rng.pick(names.last);
    }
    used.add(`${first} ${last}`);
    const overall = Math.round(Math.max(40, Math.min(95, r.ovr + shift)));
    return {
      id: `${clubId}#${i}`,
      firstName: first,
      lastName: last,
      birthYear: season - rng.int(19, 33),
      position: r.pos,
      overall,
      potential: overall,
      clubId,
      wage: 0,
      contractUntil: season + 2,
      goals: 0, apps: 0, starts: 0, minutes: 0, assists: 0, yellows: 0, reds: 0,
      ratingSum: 0, ratingCount: 0,
      fitness: 94,
      suspension: 0,
      morale: 65,
      recent: [],
      career: [],
      transfers: [],
      nationality: m.opponent.country,
    } satisfies Player;
  });
}

/** Evropský zápas jako „zápas“ ve tvaru Fixture (pro přenos, fakta a náhled). Vy jste domácí i na neutrální půdě. */
export function euroFixture(state: GameState, m: EuroMatch, clubId = state.owner.clubId): Fixture {
  const ownHome = m.home || !!m.neutral;
  const opp = euroOppId(m);
  const f: Fixture = { id: m.id, round: 0, date: m.date, homeId: ownHome ? clubId : opp, awayId: ownHome ? opp : clubId };
  const r = m.result;
  if (r?.match) {
    const pens = r.penalties ? (ownHome ? r.penalties : ([r.penalties[1], r.penalties[0]] as [number, number])) : undefined;
    f.result = { ...r.match, penalties: pens };
  }
  return f;
}

function medical(state: GameState, clubId: string): { injuryRisk: number; recovery: number } {
  const m = state.clubs[clubId].facilities?.medical ?? 3;
  return { injuryRisk: 1.25 - 0.08 * m, recovery: 1.2 - 0.07 * m };
}

export interface EuroSim {
  match: MatchResult;
  own: number;
  opp: number;
  scorers: { playerId: string; minute: number }[];
  oppMinutes: number[];
}

/**
 * Odehraje evropský zápas po minutách. `extra` = body síly navíc (příprava evropského večera, výjezd fanoušků).
 * Volby majitele: plán zápasu (MatchPlan s id evropského zápasu), poločas a vabank z přenosu.
 */
export function simulateEuroMatch(state: GameState, rng: Rng, run: EuroRun, m: EuroMatch, extra = 0): EuroSim {
  const clubId = run.clubId;
  const club = state.clubs[clubId];
  const f = euroFixture(state, m, clubId);
  const ownHome = f.homeId === clubId;
  const squad = squadOf(state, clubId);
  // Karty z domácích soutěží v Evropě neplatí a evropské se nepřenášejí.
  const discipline = new Map(squad.map((p) => [p.id, { s: p.suspension, y: p.yellows, r: p.reds }]));
  for (const p of squad) p.suspension = 0;
  const plan = planEffect(state, f);
  const coach = coachOf(state, clubId);
  const half = halftimeAdjust(state, f);
  const ownSide = {
    id: clubId,
    players: squad,
    bonus: coachBonus(coach) + ownTeamSpirit(state) + plan.bonus + extra,
    style: plan.style ?? coach?.style,
    youthFocus: coach?.youthFocus,
    ...medical(state, clubId),
  };
  const oppSide = { id: euroOppId(m), players: euroOpponentSquad(m, run.season), bonus: OPP_COACH, style: 'vyvazeny' as const };
  const homeEdge = m.neutral ? 0 : ownHome ? homeAdvantage(club, club.stadium.capacity, club.stadium.capacity) + plan.homeEdge : OPP_HOME_EDGE;
  const result = simulateMatch(rng, ownHome ? ownSide : oppSide, ownHome ? oppSide : ownSide, ownHome && !m.neutral ? club.stadium.capacity : m.neutral ? 60_000 : OPP_CROWD, {
    date: state.date,
    season: state.season,
    decisive: decisiveness(state) * EURO_TUNING.decisive,
    detail: true,
    homeEdge,
    halftime: half ? (ownHome ? { home: half } : { away: half }) : undefined,
    changes: liveChanges(state, f),
  });
  for (const p of squad) {
    const d = discipline.get(p.id)!;
    p.suspension = d.s;
    p.yellows = d.y;
    p.reds = d.r;
  }
  const own = ownHome ? result.homeGoals : result.awayGoals;
  const opp = ownHome ? result.awayGoals : result.homeGoals;
  return {
    match: result,
    own,
    opp,
    scorers: result.scorers.filter((s) => s.clubId === clubId).map((s) => ({ playerId: s.playerId, minute: s.minute })),
    oppMinutes: result.scorers.filter((s) => s.clubId !== clubId).map((s) => s.minute),
  };
}

// ---------- Fakta a jména pro texty a přenos ----------

/** Fakta o odehraném evropském zápasu (stejný tvar jako u domácích zápasů). */
export function euroMatchFacts(state: GameState, m: EuroMatch): OwnMatchFacts | undefined {
  if (!m.result?.match) return undefined;
  const f = euroFixture(state, m);
  const facts = matchFacts(state, f, m.stage);
  if (!facts) return undefined;
  const own = clubLabel(state, state.owner.clubId);
  const r = f.result!;
  const home = f.homeId === state.owner.clubId ? own : m.opponent.name;
  const away = f.homeId === state.owner.clubId ? m.opponent.name : own;
  const pens = r.penalties ? ` (pen. ${r.penalties[0]}:${r.penalties[1]})` : '';
  return { ...facts, opponentName: m.opponent.name, scoreline: `${home} – ${away} ${r.homeGoals}:${r.awayGoals}${pens}` };
}

/** Poslední odehraný evropský zápas klubu majitele s fakty (pro fakta „poslední zápas“). */
export function lastEuroFacts(state: GameState): OwnMatchFacts | undefined {
  const run = europeRun(state);
  if (!run) return undefined;
  const last = run.matches.filter((x) => x.result?.match && x.date <= state.date).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  return last ? euroMatchFacts(state, last) : undefined;
}

/** Zápas klubu majitele podle id: domácí (Fixture), nebo evropský převedený na Fixture. */
export function liveFixture(state: GameState, id: string): Fixture | undefined {
  if (id.startsWith('eu-')) {
    const run = state.europe?.run;
    const m = run?.matches.find((x) => x.id === id);
    return m && run ? euroFixture(state, m, run.clubId) : undefined;
  }
  return allFixtures(state).find((x) => x.fixture.id === id)?.fixture;
}

/** Jméno týmu v přenosu (klub ve hře, nebo evropský soupeř). */
export function liveClubName(state: GameState, clubId: string): string {
  return clubId.startsWith(EURO_OPP_PREFIX) ? clubId.slice(EURO_OPP_PREFIX.length) : clubLabel(state, clubId);
}

/** Jméno hráče v zápase (i hráče evropského soupeře, který ve hře není). */
export function livePlayerName(state: GameState, f: Fixture | undefined, playerId: string | undefined): string {
  if (!playerId) return '';
  const p = state.players[playerId];
  if (p) return `${p.firstName} ${p.lastName}`;
  const d = f?.result?.detail;
  const line = d && [...d.home.lineup, ...d.home.bench, ...d.away.lineup, ...d.away.bench].find((l) => l.id === playerId);
  return line?.name ?? '';
}

/** Příští zápas pro přenos: evropský (euro = true), nebo domácí. */
export function nextLiveTarget(state: GameState, euro = false): { id: string; date: string } | undefined {
  if (euro) {
    const m = europeRun(state)?.matches.filter((x) => !x.result && x.date > state.date).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
    return m ? { id: m.id, date: m.date } : undefined;
  }
  const next = nextOwnFixture(state);
  return next ? { id: next.fixture.id, date: next.fixture.date } : undefined;
}
