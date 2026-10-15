import type { Rng } from './rng';

export interface Pairing {
  round: number;
  homeId: string;
  awayId: string;
}

/**
 * Dvoukolový systém každý s každým. Kanonické rozlosování (kruhová metoda s pravidlem
 * pro domácí prostředí podle de Werry), takže se domácí a venkovní zápasy téměř pravidelně střídají.
 * Při lichém počtu týmů má v každém kole jeden tým volno.
 */
export function doubleRoundRobin(clubIds: string[], rng: Rng): Pairing[] {
  const teams: (string | null)[] = [...clubIds];
  for (let i = teams.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [teams[i], teams[j]] = [teams[j], teams[i]];
  }
  if (teams.length % 2 === 1) teams.push(null);

  const n = teams.length;
  const m = n - 1;
  const fixed = teams[m];
  const firstHalf: Pairing[] = [];
  const add = (round: number, home: string | null, away: string | null) => {
    if (home !== null && away !== null) firstHalf.push({ round, homeId: home, awayId: away });
  };

  for (let r = 0; r < m; r++) {
    // Pevný tým hraje s týmem r, doma střídavě.
    if (r % 2 === 0) add(r + 1, teams[r], fixed);
    else add(r + 1, fixed, teams[r]);
    for (let k = 1; k < n / 2; k++) {
      const a = teams[(r + k) % m];
      const b = teams[(r - k + m) % m];
      if (k % 2 === 1) add(r + 1, a, b);
      else add(r + 1, b, a);
    }
  }

  const secondHalf = firstHalf.map((p) => ({
    round: p.round + m,
    homeId: p.awayId,
    awayId: p.homeId,
  }));
  return [...firstHalf, ...secondHalf];
}
