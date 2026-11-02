import { describe, expect, it } from 'vitest';
import { audioSkipReason, defaultRange, onsetsInRange, rangeLength, rangeProblem, sourceRange } from './range';

const onset = (t: number) => ({ t, strength: 1, peakDb: -10, centroidHz: 3000, decayS: 0.05 });

describe('analysed range', () => {
  it('selects short clips whole and long ones up to 15 minutes', () => {
    expect(defaultRange(95)).toEqual({ start: 0, end: 95 });
    expect(defaultRange(15 * 60)).toEqual({ start: 0, end: 900 });
    expect(defaultRange(40 * 60)).toEqual({ start: 0, end: 900 });
  });

  it('applies the 15-minute limit to the selection, not the file', () => {
    expect(rangeProblem({ start: 1200, end: 2100 }, 3600)).toBeNull();
    expect(rangeProblem({ start: 0, end: 901 }, 3600)).toMatch(/up to 15 minutes/);
    expect(rangeProblem({ start: 10, end: 11 }, 60)).toMatch(/at least 2 seconds/);
    expect(rangeProblem({ start: 10, end: 70 }, 60)).toMatch(/outside the video/);
    expect(rangeProblem({ start: -1, end: 30 }, 60)).toMatch(/outside the video/);
  });

  it('treats reports without a range as the whole clip', () => {
    expect(sourceRange({ durationS: 42 })).toEqual({ start: 0, end: 42 });
    expect(sourceRange({ durationS: 42, range: { start: 5, end: 30 } })).toEqual({ start: 5, end: 30 });
    expect(rangeLength({ start: 5, end: 30 })).toBe(25);
  });

  it('keeps only the sounds inside the range', () => {
    expect(onsetsInRange([onset(1), onset(5), onset(30), onset(31)], { start: 5, end: 30 }).map((item) => item.t)).toEqual([5, 30]);
  });

  it('skips audio decoding for files over 30 minutes', () => {
    expect(audioSkipReason(30 * 60)).toBeNull();
    expect(audioSkipReason(30 * 60 + 1)).toMatch(/longer than 30 minutes/);
  });
});
