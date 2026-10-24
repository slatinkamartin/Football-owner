import { addDays } from './calendar';
import { allFixtures } from './competitions';
import { EURO_CLUBS, europeRun, leaguePhaseRank, nextEuroMatch, type EuroMatch } from './europe';
import { matchStakes, type OwnFixture } from './matchday';
import type { GameState } from './types';
import { clubLabel } from './world';

/**
 * Velký zápas: derby, evropský zápas, souboj o čelo, šestibodový zápas o záchranu, pohár od čtvrtfinále
 * a baráž, W3: rozhodující zápasy nadstavby a finále play-off o umístění. Kolem něj se staví týden přípravy, zážitek v zápase a reakce po něm.
 * Společné rozhraní pro přípravu (lístky, choreo, bezpečnost), přenos, sociální sítě a fanoušky.
 */

export type BigMatchKind = 'derby' | 'evropa' | 'titul' | 'zachrana' | 'pohar' | 'baraz' | 'playoff';

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
  playoff: 'Finále o umístění',
};

function fromFixture(state: GameState, next: OwnFixture): BigMatch | undefined {
  const stakes = matchStakes(state, next.fixture, next.cup);
  if (!stakes.length) return undefined;
  const order: Stake['key'][] = ['derby', 'titul', 'zachrana', 'pohar', 'playoff'];
  const top = [...stakes].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))[0];
  const kind: BigMatchKind = top.key === 'playoff' ? 'playoff' : next.cup && next.cup.kind !== 'pohar' ? 'baraz' : (top.key as BigMatchKind);
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

// ---------- W3: které evropské zápasy jsou klíčové ----------

/** Pásmo v ligové fázi: 0 = top 8 (osmifinále), 1 = 9.–24. (play-off), 2 = konec. */
const euroZone = (rank: number) => (rank <= 8 ? 0 : rank <= 24 ? 1 : 2);

/**
 * Klíčový evropský zápas (okno před zápasem, týden přípravy, krok po zápase):
 * - vyřazovací fáze po ligové fázi (play-off, osmifinále…, finále): oba zápasy;
 * - předkola: jen rozhodující odveta;
 * - ligová fáze: soupeř z evropské špičky (úroveň 1), nebo poslední dvě kola, dokud se může změnit pásmo
 *   (top 8 / 9.–24. / konec).
 */
export function isKeyEuroMatch(state: GameState, m: EuroMatch): boolean {
  const run = europeRun(state);
  const all = run?.matches ?? [];
  const league = all.filter((x) => x.tie === undefined).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (m.tie !== undefined) {
    const knockout = league.length > 0 && league[0].date < m.date;
    if (knockout || m.neutral) return true;
    return m.leg !== 1;
  }
  if (EURO_CLUBS.find((c) => c.name === m.opponent.name)?.level === 1) return true;
  const idx = league.findIndex((x) => x.id === m.id);
  if (idx < 0 || idx < league.length - 2 || !run) return false;
  const left = league.filter((x) => !x.result).length;
  const gd = run.gf - run.ga;
  // Nejhorší případ: už žádný bod; nejlepší: všechno vyhrát. Pásmo se může změnit, když se liší.
  const worst = leaguePhaseRank(run.comp, run.points, gd - left);
  const best = leaguePhaseRank(run.comp, run.points + 3 * left, gd + 2 * left);
  return euroZone(best) !== euroZone(worst);
}

/** Nejbližší velký zápas klubu majitele v příštích `days` dnech (výchozí týden). */
export function upcomingBigMatch(state: GameState, days = 7): BigMatch | undefined {
  const limit = addDays(state.date, days);
  const out: BigMatch[] = [];
  const own = state.owner.clubId;
  // Všechny vlastní zápasy v okně (velký zápas může přijít i po jiném, běžném zápase).
  const mine = allFixtures(state)
    .filter((x) => !x.fixture.result && x.fixture.date > state.date && x.fixture.date <= limit && (x.fixture.homeId === own || x.fixture.awayId === own))
    .sort((a, b) => (a.fixture.date < b.fixture.date ? -1 : 1));
  for (const x of mine) {
    const home = x.fixture.homeId === own;
    const b = fromFixture(state, { fixture: x.fixture, name: x.name, cup: x.cup, home, opponentId: home ? x.fixture.awayId : x.fixture.homeId });
    if (b) {
      out.push(b);
      break;
    }
  }
  const euro = nextEuroMatch(state);
  if (euro && euro.date <= limit && isKeyEuroMatch(state, euro)) out.push(fromEuro(euro)); // W3: jen klíčové evropské zápasy
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
