import { describe, expect, it } from 'vitest';
import { levelAgreement, matchShots, median, precisionRecall, ranks, spearman } from './stats';

describe('matchShots', () => {
  it('pairs each expected release with the nearest detection within the tolerance', () => {
    const match = matchShots([1.02, 5.5, 9.97], [1, 10], 0.1);
    expect(match.pairs).toEqual([[0, 0], [2, 1]]);
    expect(match.truePositives).toBe(2);
    expect(match.falsePositives).toBe(1);
    expect(match.falseNegatives).toBe(0);
    expect(match.errorsMs.map((ms) => Math.round(ms))).toEqual([20, -30]);
  });

  it('uses each detection once, giving it to the closest expected shot', () => {
    const match = matchShots([2.0], [1.95, 2.02], 0.1);
    expect(match.pairs).toEqual([[0, 1]]);
    expect(match.falseNegatives).toBe(1);
  });

  it('counts misses outside the tolerance', () => {
    const match = matchShots([3.3], [3], 0.1);
    expect(match.truePositives).toBe(0);
    expect(match.falsePositives).toBe(1);
    expect(match.falseNegatives).toBe(1);
  });
});

describe('precisionRecall', () => {
  it('pools true and false positives over every fixture', () => {
    const a = matchShots([1, 2, 3], [1, 2, 3], 0.1);
    const b = matchShots([1, 7], [1, 4], 0.1);
    expect(precisionRecall([a, b])).toEqual({ precision: 4 / 5, recall: 4 / 5 });
  });

  it('is null when there is nothing to count', () => {
    expect(precisionRecall([])).toEqual({ precision: null, recall: null });
  });
});

describe('median', () => {
  it('handles odd and even counts and nothing', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe('spearman', () => {
  it('is 1 for any increasing relation and -1 for a decreasing one', () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 40, 80])).toBeCloseTo(1, 9);
    expect(spearman([1, 2, 3, 4], [9, 7, 3, 1])).toBeCloseTo(-1, 9);
  });

  it('averages the ranks of ties', () => {
    expect(ranks([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
    // Ratings 1–5 tie a lot: compare with a hand-worked value (Pearson on the tied ranks).
    expect(spearman([1, 2, 2, 3, 5], [40, 55, 50, 70, 90])).toBeCloseTo(0.9747, 4);
  });

  it('is null when it is undefined', () => {
    expect(spearman([1, 2], [1, 2])).toBeNull();
    expect(spearman([3, 3, 3], [1, 2, 3])).toBeNull();
    expect(spearman([1, 2, 3], [1, 2])).toBeNull();
  });
});

describe('levelAgreement', () => {
  it('counts exact and within-one-level agreement, skipping missing levels', () => {
    expect(levelAgreement([
      { engine: 'advanced', coach: 'advanced' },
      { engine: 'intermediate', coach: 'advanced' },
      { engine: 'beginner', coach: 'elite' },
      { engine: null, coach: 'elite' },
    ])).toEqual({ exact: 1 / 3, withinOne: 2 / 3, count: 3 });
    expect(levelAgreement([])).toEqual({ exact: null, withinOne: null, count: 0 });
  });
});
