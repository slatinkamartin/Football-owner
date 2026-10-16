import { describe, expect, it } from 'vitest';
import { facilityStars, homeEdgeScore, ratingText, toScore } from './scales';

describe('škály v rozhraní', () => {
  it('převádí vnitřní jednotky na 0–100 a drží meze', () => {
    expect(ratingText(6.8)).toBe('6,8');
    expect(ratingText(6.857, 2)).toBe('6,86');
    expect(facilityStars(3, 'other')).toEqual({ stars: 3, max: 5 });
    expect(facilityStars(0, 'catering')).toEqual({ stars: 1, max: 4 });
    expect(homeEdgeScore(3)).toBe(0);
    expect(homeEdgeScore(8.6)).toBe(100);
    expect(homeEdgeScore(12)).toBe(100);
    expect(toScore(-5, 0, 10)).toBe(0);
  });
});
