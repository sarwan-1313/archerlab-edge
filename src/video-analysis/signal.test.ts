import { describe, expect, it } from 'vitest';
import { coefficientOfVariation, fillShortGaps, indexAtTime, indicesBetween, linearSlope, medianSmooth, rmsSpread2, zeroPhaseSmooth } from './signal';

describe('signal helpers', () => {
  it('bridges short gaps and leaves long ones', () => {
    const times = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
    const values = [0, null, 2, 3, null, null, null, null, null, 9];
    const filled = fillShortGaps(times, values, 0.25);
    expect(filled[1]).toBeCloseTo(1, 6);
    expect(filled[4]).toBeNull();
    expect(filled[8]).toBeNull();
  });

  it('removes a single-frame spike with a centred median', () => {
    const times = [0, 0.04, 0.08, 0.12, 0.16];
    const smoothed = medianSmooth(times, [1, 1, 50, 1, 1], 0.045);
    expect(smoothed[2]).toBe(1);
  });

  it('does not shift a step in time (zero-phase)', () => {
    const times = Array.from({ length: 40 }, (_, index) => index / 24);
    const values = times.map((t) => (t < 0.8 ? 0 : 1));
    const smoothed = zeroPhaseSmooth(times, values, { medianHalfWindowS: 0.045, meanHalfWindowS: 0.07, maxInterpolationGapS: 0.25 });
    const crossing = smoothed.findIndex((value) => (value ?? 0) >= 0.5);
    expect(Math.abs(times[crossing] - 0.8)).toBeLessThan(1 / 24 + 1e-9);
  });

  it('finds the nearest sample and time windows', () => {
    const times = [0, 0.5, 1, 1.5, 2];
    expect(indexAtTime(times, 1.2)).toBe(2);
    expect(indexAtTime(times, 1.3)).toBe(3);
    expect(indicesBetween(times, 0.4, 1.6)).toEqual([1, 2, 3]);
  });

  it('measures slope, spread and variation', () => {
    expect(linearSlope([0, 1, 2, 3], [1, 3, 5, 7])).toBeCloseTo(2, 6);
    expect(rmsSpread2([{ x: -1, y: 0 }, { x: 1, y: 0 }])).toBeCloseTo(1, 6);
    expect(coefficientOfVariation([10, 10, 10])).toBe(0);
    expect(coefficientOfVariation([1])).toBeNull();
  });
});
