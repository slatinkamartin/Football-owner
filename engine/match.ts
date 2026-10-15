import { bestEleven, teamStrength } from './players';
import type { Rng } from './rng';
import type { MatchResult, Player, Position } from './types';

const BASE_GOALS = 1.3;
const STRENGTH_FACTOR = 0.06;
const HOME_ADVANTAGE = 0.15;

const SCORER_WEIGHT: Record<Position, number> = { GK: 0.02, DF: 0.8, MF: 2.5, FW: 5 };

/** Očekávané góly (Poissonův model) podle rozdílu síly týmů a domácího prostředí. */
export function expectedGoals(homeStrength: number, awayStrength: number): [number, number] {
  const diff = (homeStrength - awayStrength) * STRENGTH_FACTOR;
  return [
    BASE_GOALS * Math.exp(diff / 2 + HOME_ADVANTAGE),
    BASE_GOALS * Math.exp(-diff / 2 - HOME_ADVANTAGE / 2),
  ];
}

function pickScorer(rng: Rng, xi: Player[]): Player | undefined {
  const weights = xi.map((p) => SCORER_WEIGHT[p.position] * (p.overall / 50));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng.next() * total;
  for (let i = 0; i < xi.length; i++) {
    r -= weights[i];
    if (r <= 0) return xi[i];
  }
  return xi[xi.length - 1];
}

export function simulateMatch(
  rng: Rng,
  home: { id: string; players: Player[] },
  away: { id: string; players: Player[] },
  attendance: number,
): MatchResult {
  const [lh, la] = expectedGoals(teamStrength(home.players), teamStrength(away.players));
  const homeGoals = rng.poisson(lh);
  const awayGoals = rng.poisson(la);
  const homeXi = bestEleven(home.players);
  const awayXi = bestEleven(away.players);
  for (const p of [...homeXi, ...awayXi]) p.apps += 1;

  const scorers: MatchResult['scorers'] = [];
  const addGoals = (count: number, clubId: string, xi: Player[]) => {
    for (let i = 0; i < count; i++) {
      const scorer = pickScorer(rng, xi);
      if (!scorer) continue;
      scorer.goals += 1;
      scorers.push({ playerId: scorer.id, clubId, minute: rng.int(1, 90) });
    }
  };
  addGoals(homeGoals, home.id, homeXi);
  addGoals(awayGoals, away.id, awayXi);
  scorers.sort((a, b) => a.minute - b.minute);

  return { homeGoals, awayGoals, attendance, scorers };
}
