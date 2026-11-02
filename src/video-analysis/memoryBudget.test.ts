import { describe, expect, it } from 'vitest';
import { DEFAULT_BUDGET, LOW_MEMORY_BUDGET, cappedFps, memoryBudget } from './memoryBudget';

describe('memoryBudget', () => {
  it('uses the low-memory budget on 2 GB or less, or in Lite mode', () => {
    expect(memoryBudget(2, false)).toBe(LOW_MEMORY_BUDGET);
    expect(memoryBudget(1, false)).toBe(LOW_MEMORY_BUDGET);
    expect(memoryBudget(8, true)).toBe(LOW_MEMORY_BUDGET);
  });

  it('uses the default budget otherwise, including when memory is unknown', () => {
    expect(memoryBudget(4, false)).toBe(DEFAULT_BUDGET);
    expect(memoryBudget(null, false)).toBe(DEFAULT_BUDGET);
    expect(memoryBudget(undefined, false)).toBe(DEFAULT_BUDGET);
  });
});

describe('cappedFps', () => {
  it('keeps the preset rate when the range fits', () => {
    expect(cappedFps(24, 120, LOW_MEMORY_BUDGET.maxFrames)).toBe(24);
  });

  it('samples a long range more sparsely so it stays within the frame cap', () => {
    const fps = cappedFps(24, 600, LOW_MEMORY_BUDGET.maxFrames);
    expect(fps).toBeCloseTo(4.8);
    expect(fps * 600).toBeLessThanOrEqual(LOW_MEMORY_BUDGET.maxFrames);
  });

  it('leaves the rate alone for empty ranges or caps', () => {
    expect(cappedFps(12, 0, 100)).toBe(12);
    expect(cappedFps(12, 60, 0)).toBe(12);
  });
});
