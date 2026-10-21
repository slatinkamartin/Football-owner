import { addDays } from './calendar';
import { nextEuroMatch, type EuroMatch } from './europe';
import { matchStakes, nextOwnFixture, type OwnFixture } from './matchday';
import type { GameState } from './types';
import { clubLabel } from './world';

/**
 * Velký zápas: derby, evropský zápas, souboj o čelo, šestibodový zápas o záchranu, pohár od čtvrtfinále
 * a baráž. Kolem něj se staví týden přípravy, zážitek v zápase a reakce po něm.
 * Společné rozhraní pro přípravu (lístky, choreo, bezpečnost), přenos, sociální sítě a fanoušky.
 */

export type BigMatchKind = 'derby' | 'evropa' | 'titul' | 'zachrana' | 'pohar' | 'baraz';

export interface BigMatch {
  /** Id zápasu (ligový/pohárový fixture nebo evropský zápas „eu-…“). */
  id: string;
  date: string;
  kind: BigMatchKind;
  home: boolean;
  opponentName: string;
  /** Id soupeře, pokud je to český klub. */
  opponentId?: string;
  /** Krátký popisek, např. „derby se Spartou“. */
  label: string;
  /** Soutěž (pro zobrazení). */
  competition: string;
}

export const BIG_MATCH_LABEL: Record<BigMatchKind, string> = {
  derby: 'Derby',
  evropa: 'Evropský večer',
  titul: 'Souboj o čelo',
  zachrana: 'Zápas o záchranu',
  pohar: 'Pohárová bitva',
  baraz: 'Baráž',
};

function fromFixture(state: GameState, next: OwnFixture): BigMatch | undefined {
  const stakes = matchStakes(state, next.fixture, next.cup);
  if (!stakes.length) return undefined;
  const order: Stake['key'][] = ['derby', 'titul', 'zachrana', 'pohar'];
  const top = [...stakes].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))[0];
  const kind: BigMatchKind = next.cup && next.cup.kind !== 'pohar' ? 'baraz' : (top.key as BigMatchKind);
  return {
    id: next.fixture.id,
    date: next.fixture.date,
    kind,
    home: next.home,
    opponentId: next.opponentId,
    opponentName: clubLabel(state, next.opponentId),
    label: top.label,
    competition: next.name,
  };
}
type Stake = ReturnType<typeof matchStakes>[number];

function fromEuro(e: EuroMatch): BigMatch {
  return {
    id: e.id,
    date: e.date,
    kind: 'evropa',
    home: e.home && !e.neutral,
    opponentName: e.opponent.name,
    label: `${e.stage}: ${e.opponent.name}`,
    competition: e.comp,
  };
}

/** Nejbližší velký zápas klubu majitele v příštích `days` dnech (výchozí týden). */
export function upcomingBigMatch(state: GameState, days = 7): BigMatch | undefined {
  const limit = addDays(state.date, days);
  const out: BigMatch[] = [];
  const next = nextOwnFixture(state);
  if (next && next.fixture.date <= limit) {
    const b = fromFixture(state, next);
    if (b) out.push(b);
  }
  const euro = nextEuroMatch(state);
  if (euro && euro.date <= limit) out.push(fromEuro(euro));
  return out.sort((a, b) => (a.date < b.date ? -1 : 1))[0];
}

/** Je zápas s tímto id velký zápas (pro přenos a reakce po zápase)? */
export function isBigMatchId(state: GameState, id: string): boolean {
  return state.bigMatch?.id === id || id.startsWith('eu-');
}

/** Dní do zápasu (0 = dnes). */
export function daysToBigMatch(state: GameState, m: BigMatch): number {
  return Math.round((new Date(`${m.date}T00:00:00Z`).getTime() - new Date(`${state.date}T00:00:00Z`).getTime()) / 86_400_000);
}
