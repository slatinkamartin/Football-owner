import { seasonLabel } from './calendar';
import { finalStandings } from './competitions';
import { annualCosts } from './finance';
import type { Grade } from './finplus';
import type { Competition, FinanceCategory, GameState } from './types';
import { addNews, clamp, clubLabel, competitionOf } from './world';
import { ownerDecisionsRatingBonus } from './ownerdecisions'; // W5

/**
 * Hodnocení majitele: známka A–F a pořadí mezi majiteli soutěže. Všichni majitelé se hodnotí stejně
 * z dat klubů: výsledky proti očekávání (umístění vs. pověst), finance, fanoušci a pověst.
 */

export interface OwnerRatingParts {
  /** Výsledky proti očekávání 0–100. */
  results: number;
  finance: number;
  fans: number;
  reputation: number;
}

export interface OwnerRatingRow {
  clubId: string;
  score: number;
  grade: Grade;
  parts: OwnerRatingParts;
  position: number;
  /** Očekávané umístění podle pověsti. */
  expected: number;
  /** Odehrané zápasy (0 = sezóna ještě nezačala). */
  played: number;
}

export interface OwnerRatingRecord {
  season: number;
  clubId: string;
  competitionId: string;
  grade: Grade;
  score: number;
  rank: number;
  of: number;
  parts: OwnerRatingParts;
  /** Nejlépe hodnocený majitel soutěže (klub). */
  bestClubId?: string;
}

export const OWNER_RATING_WEIGHTS: Record<keyof OwnerRatingParts, number> = { results: 0.4, finance: 0.25, fans: 0.2, reputation: 0.15 };
export const OWNER_RATING_LABEL: Record<keyof OwnerRatingParts, string> = { results: 'Výsledky proti očekávání', finance: 'Finance', fans: 'Fanoušci', reputation: 'Pověst klubu' };

export function gradeOf(score: number): Grade {
  return score >= 72 ? 'A' : score >= 60 ? 'B' : score >= 48 ? 'C' : score >= 38 ? 'D' : score >= 28 ? 'E' : 'F';
}

const NOT_OPERATING: FinanceCategory[] = ['prestupy', 'investice', 'dane', 'uver', 'vklad'];

/** Jak velká část sezóny uplynula (0,1–1), aby průběžné finance nebyly podhodnocené. */
function seasonShare(state: GameState): number {
  const [y, m, d] = state.date.split('-').map(Number);
  const months = (y - state.season) * 12 + (m - 7) + d / 30;
  return clamp(months / 12, 0.1, 1);
}

/** Ohodnotí všechny majitele soutěže (seřazeno od nejlepšího). */
export function rateOwners(state: GameState, comp: Competition): OwnerRatingRow[] {
  const table = finalStandings(comp, state).filter((r) => state.clubs[r.clubId]);
  const n = table.length;
  if (n < 2) return [];
  const start = state.ownerRatingStart?.season === state.season ? state.ownerRatingStart.reputation : undefined;
  const repStart = (id: string) => start?.[id] ?? state.clubs[id].reputation;
  const byRep = [...table].sort((a, b) => repStart(b.clubId) - repStart(a.clubId) || a.clubId.localeCompare(b.clubId)).map((r) => r.clubId);
  const games = Math.max(1, (n - 1) * 2);
  const share = seasonShare(state);
  const cupWinner = state.cups.pohar?.winner;
  const rows = table.map((row, i) => {
    const club = state.clubs[row.clubId];
    const position = i + 1;
    const expected = byRep.indexOf(row.clubId) + 1;
    // Výsledky: o kolik míst lépe než podle pověsti, trofeje, postup a sestup. Na začátku sezóny se váží k průměru.
    let results = 50 + ((expected - position) / (n - 1)) * 100;
    if (position === 1) results += 10;
    if (comp.tier > 1 && position <= comp.promote) results += 8;
    if (position > n - comp.relegate) results -= 10;
    const weight = Math.min(1, row.played / Math.min(10, games));
    results = 50 + (results - 50) * weight + (cupWinner === row.clubId ? 8 : 0);
    // Finance: provozní výsledek a polovina salda přestupů vůči ročním nákladům, záporný zůstatek a úvěry.
    const costs = Math.max(1, annualCosts(club, comp.tier));
    const season = club.finance.season;
    const operating = Object.entries(season).filter(([k]) => !NOT_OPERATING.includes(k as FinanceCategory)).reduce((a, [, v]) => a + v, 0);
    const margin = (operating + 0.5 * (season.prestupy ?? 0)) / costs / share;
    let finance = 50 + margin * 150;
    if (club.finance.balance < 0) finance -= Math.min(25, (-club.finance.balance / costs) * 50);
    if (row.clubId === state.owner.clubId) finance -= Math.min(15, (state.loans.reduce((a, l) => a + l.remaining, 0) / costs) * 20);
    // Fanoušci: nálada a zaplněnost stadionu.
    const home = comp.fixtures.filter((f) => f.homeId === row.clubId && f.result);
    const fill = home.length ? home.reduce((a, f) => a + f.result!.attendance, 0) / home.length / Math.max(1, club.stadium.capacity) : undefined;
    const fans = fill === undefined ? club.fanMood : club.fanMood * 0.6 + Math.min(1, fill) * 100 * 0.4;
    // Pověst: změna od začátku sezóny.
    const reputation = 50 + (club.reputation - repStart(row.clubId)) * 6;
    const parts: OwnerRatingParts = {
      results: Math.round(clamp(results, 0, 100)),
      finance: Math.round(clamp(finance, 0, 100)),
      fans: Math.round(clamp(fans, 0, 100)),
      reputation: Math.round(clamp(reputation, 0, 100)),
    };
    const score = Math.round((Object.keys(parts) as (keyof OwnerRatingParts)[]).reduce((a, k) => a + parts[k] * OWNER_RATING_WEIGHTS[k], 0)) + ownerDecisionsRatingBonus(state, row.clubId); // W5: vize a reinvestice
    return { clubId: row.clubId, score, grade: gradeOf(score), parts, position, expected, played: row.played };
  });
  return rows.sort((a, b) => b.score - a.score || a.position - b.position);
}

/** Průběžný odhad hodnocení majitele (pro kartu na záložce Majitel). */
export function ownerRatingNow(state: GameState): { row: OwnerRatingRow; rank: number; of: number; rows: OwnerRatingRow[] } | undefined {
  const comp = competitionOf(state, state.owner.clubId);
  if (!comp) return undefined;
  const rows = rateOwners(state, comp);
  const idx = rows.findIndex((r) => r.clubId === state.owner.clubId);
  if (idx < 0) return undefined;
  return { row: rows[idx], rank: idx + 1, of: rows.length, rows };
}

/** Každý den: na začátku sezóny si zapamatuje pověst klubů (měřítko očekávání). */
export function ownerRatingTick(state: GameState): void {
  if (state.ownerRatingStart?.season === state.season) return;
  state.ownerRatingStart = { season: state.season, reputation: Object.fromEntries(Object.values(state.clubs).map((c) => [c.id, Math.round(c.reputation * 10) / 10])) };
}

/** Konec sezóny (před postupy a sestupy): známka majitele a pořadí v soutěži. */
export function seasonOwnerRatings(state: GameState): void {
  const now = ownerRatingNow(state);
  if (!now) return;
  const comp = competitionOf(state, state.owner.clubId)!;
  const record: OwnerRatingRecord = {
    season: state.season,
    clubId: state.owner.clubId,
    competitionId: comp.id,
    grade: now.row.grade,
    score: now.row.score,
    rank: now.rank,
    of: now.of,
    parts: now.row.parts,
    bestClubId: now.rows[0]?.clubId,
  };
  state.ownerRatings = [...(state.ownerRatings ?? []).filter((r) => r.season !== state.season), record].slice(-15);
  const best = now.rows[0] && now.rows[0].clubId !== state.owner.clubId ? ` Nejlépe hodnocené je vedení klubu ${clubLabel(state, now.rows[0].clubId)} (${now.rows[0].grade}).` : ' Jste nejlépe hodnoceným majitelem soutěže.';
  addNews(state, {
    kind: 'sezona',
    title: `Hodnocení majitele za sezónu ${seasonLabel(state.season)}: ${record.grade} (${record.rank}. z ${record.of})`,
    text: `Výsledky ${record.parts.results}, finance ${record.parts.finance}, fanoušci ${record.parts.fans}, pověst ${record.parts.reputation} ze 100.${best}`,
  });
}
