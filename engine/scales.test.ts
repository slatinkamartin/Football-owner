import { describe, expect, it } from 'vitest';
import { facilityScore, homeEdgeScore, ratingScore, toScore } from './scales';

describe('jednotná škála 0–100', () => {
  it('převádí vnitřní jednotky na 0–100 a drží meze', () => {
    expect(ratingScore(6.8)).toBe(68);
    expect(ratingScore(10)).toBe(100);
    expect(facilityScore(3, 5)).toBe(60);
    expect(facilityScore(2, 3)).toBe(67);
    expect(homeEdgeScore(3)).toBe(0);
    expect(homeEdgeScore(8.6)).toBe(100);
    expect(homeEdgeScore(12)).toBe(100);
    expect(toScore(-5, 0, 10)).toBe(0);
  });
});
