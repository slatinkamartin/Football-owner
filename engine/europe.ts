import { europeVenueFactor } from './venue';
import { book } from './finance';
import { squadOf } from './players';
import type { Rng } from './rng';
import type { EuropeCompetition, EuropeEntry, GameState } from './types';
import { addNews, clamp, clubLabel } from './world';

/**
 * Evropské poháry českých klubů. Zápasy se nehrají, výsledek předkol se vyhodnotí podle síly kádru
 * na konci srpna. Ligová fáze přináší velké peníze (vyplácí se září až prosinec) a pověst.
 */

export const EUROPE_LABEL: Record<EuropeCompetition | 'predkola', string> = {
  LM: 'Liga mistrů',
  EL: 'Evropská liga',
  KL: 'Konferenční liga',
  predkola: 'vyřazení v předkolech',
};

/** Peníze za ligovou fázi (základ, k tomu bonus za výsledky až +50 %). */
const LEAGUE_PHASE: Record<EuropeCompetition, number> = { LM: 400_000_000, EL: 120_000_000, KL: 75_000_000 };
/** Peníze za účast v předkolech. */
const QUALIFYING: Record<EuropeCompetition, number> = { LM: 25_000_000, EL: 15_000_000, KL: 10_000_000 };
/** Podíl evropských peněz, který jde hráčům jako prémie. */
export const EUROPE_BONUS_SHARE = 0.15;

/** Rozsah evropských peněz před předkoly: jen předkola, nebo ligová fáze s nejlepšími výsledky. */
export function europeRange(entry: EuropeCompetition): { low: number; high: number } {
  return { low: QUALIFYING[entry], high: QUALIFYING[entry] + LEAGUE_PHASE[entry] * 1.5 };
}

/** Síla kádru, při které má klub poloviční šanci projít do ligové fáze. */
const THRESHOLD: Record<EuropeCompetition, number> = { LM: 71, EL: 67, KL: 63.5 };
const NEXT: Record<EuropeCompetition, EuropeCompetition | undefined> = { LM: 'EL', EL: 'KL', KL: undefined };

/** Síla do Evropy: průměr 14 nejlepších hráčů. */
export function europeStrength(state: GameState, clubId: string): number {
  const best = squadOf(state, clubId).map((p) => p.overall).sort((a, b) => b - a).slice(0, 14);
  return best.length ? best.reduce((a, b) => a + b, 0) / best.length : 40;
}

export function leaguePhaseChance(strength: number, comp: EuropeCompetition): number {
  return 1 / (1 + Math.exp(-(strength - THRESHOLD[comp]) / 2));
}

/** Konec sezóny: kdo z 1. ligy hraje příští rok Evropu (1. a 2. LM, 3. a vítěz poháru EL, 4. KL). */
export function qualifyEurope(state: GameState, table: { clubId: string }[], cupWinner?: string): void {
  if (!table.length) return;
  const slots: EuropeCompetition[] = ['LM', 'LM', 'EL', 'KL'];
  const entries: EuropeEntry[] = table.slice(0, 4).map((r, i) => ({ season: state.season + 1, clubId: r.clubId, entry: slots[i], result: 'predkola', revenue: 0 }));
  if (cupWinner && !entries.some((e) => e.clubId === cupWinner) && table.some((r) => r.clubId === cupWinner)) {
    entries.push({ season: state.season + 1, clubId: cupWinner, entry: 'EL', result: 'predkola', revenue: 0 });
  } else if (table[4]) {
    entries.push({ season: state.season + 1, clubId: table[4].clubId, entry: 'KL', result: 'predkola', revenue: 0 });
  }
  state.europe = { season: state.season + 1, entries };
}

/** Začátek sezóny: zpráva, kdo hraje předkola. */
export function startEurope(state: GameState, _rng: Rng): void {
  const eu = state.europe;
  if (!eu || eu.season !== state.season) return;
  const own = eu.entries.find((e) => e.clubId === state.owner.clubId);
  if (own) {
    // Odhad do rozpočtu: peníze za předkola plus vážená šance na ligovou fázi.
    own.revenue = expectedRevenue(state, own.clubId, own.entry);
    addNews(state, {
      kind: 'sezona',
      title: `Hrajete předkola: ${EUROPE_LABEL[own.entry]}`,
      text: `Šance na ligovou fázi podle síly kádru asi ${Math.round(leaguePhaseChance(europeStrength(state, own.clubId), own.entry) * 100)} %. Předkola se rozhodnou do konce srpna.`,
    });
  }
}

function expectedRevenue(state: GameState, clubId: string, entry: EuropeCompetition): number {
  const s = europeStrength(state, clubId);
  let left = 1;
  let total = QUALIFYING[entry];
  for (let c: EuropeCompetition | undefined = entry; c; c = NEXT[c]) {
    const p = leaguePhaseChance(s, c);
    total += left * p * LEAGUE_PHASE[c] * 1.2;
    left *= 1 - p;
  }
  return Math.round(total / 1_000_000) * 1_000_000;
}

/** Konec srpna: výsledky předkol, peníze za účast, pověst a nálada fanoušků. */
export function resolveEurope(state: GameState, rng: Rng): void {
  const eu = state.europe;
  if (!eu || eu.season !== state.season || eu.resolved) return;
  const lines: string[] = [];
  for (const e of eu.entries) {
    const club = state.clubs[e.clubId];
    if (!club) continue;
    const s = europeStrength(state, e.clubId);
    let result: EuropeCompetition | 'predkola' = 'predkola';
    for (let c: EuropeCompetition | undefined = e.entry; c; c = NEXT[c]) {
      if (rng.chance(leaguePhaseChance(s, c))) {
        result = c;
        break;
      }
    }
    e.result = result;
    book(state, e.clubId, 'evropa', QUALIFYING[e.entry], `Evropské poháry: předkola (${EUROPE_LABEL[e.entry]})`);
    book(state, e.clubId, 'platy', -QUALIFYING[e.entry] * EUROPE_BONUS_SHARE, 'Prémie hráčům za evropské poháry');
    e.revenue = QUALIFYING[e.entry];
    if (result !== 'predkola') {
      // Bez stadionu kategorie 3 hraje klub domácí zápasy jinde a přijde o část příjmů.
      const venue = e.clubId === state.owner.clubId ? europeVenueFactor(club) : 1;
      e.revenue += Math.round((LEAGUE_PHASE[result] * (1 + rng.next() * 0.5) * venue) / 1_000_000) * 1_000_000;
      club.reputation = clamp(club.reputation + (result === 'LM' ? 2 : result === 'EL' ? 1.5 : 1), 1, 99);
      club.fanMood = clamp(club.fanMood + 8, 0, 100);
    } else {
      club.reputation = clamp(club.reputation + 0.5, 1, 99);
    }
    lines.push(`${clubLabel(state, e.clubId)}: ${result === 'predkola' ? EUROPE_LABEL.predkola : `ligová fáze – ${EUROPE_LABEL[result]}`}`);
  }
  eu.resolved = true;
  state.europeHistory = [...(state.europeHistory ?? []), ...eu.entries].slice(-30);
  const own = eu.entries.find((e) => e.clubId === state.owner.clubId);
  addNews(state, {
    kind: own ? 'sezona' : 'info',
    title: own
      ? own.result === 'predkola'
        ? 'Evropa: vypadli jsme v předkolech'
        : `Evropa: postup do ligové fáze (${EUROPE_LABEL[own.result]})!`
      : 'Čeští kluby v evropských pohárech',
    text: lines.join(' · '),
  });
}

/** Září až prosinec: výplata peněz za ligovou fázi po částech. */
export function monthlyEurope(state: GameState): void {
  const eu = state.europe;
  const month = Number(state.date.slice(5, 7));
  if (!eu?.resolved || eu.season !== state.season || ![10, 11, 12, 1].includes(month)) return;
  for (const e of eu.entries) {
    if (e.result === 'predkola') continue;
    const part = Math.round((e.revenue - QUALIFYING[e.entry]) / 4);
    book(state, e.clubId, 'evropa', part, `Evropské poháry: ${EUROPE_LABEL[e.result]}`);
    book(state, e.clubId, 'platy', -part * EUROPE_BONUS_SHARE, 'Prémie hráčům za evropské poháry');
  }
}
