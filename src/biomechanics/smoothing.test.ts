import { describe, expect, it } from 'vitest';
import { TimeAwareEma } from './smoothing';

describe('time-aware EMA', () => {
  it('smooths normal samples and resets after a long gap', () => {
    const ema = new TimeAwareEma(100, 500);
    expect(ema.update(0, 0)).toBe(0);
    const intermediate = ema.update(10, 100)!;
    expect(intermediate).toBeGreaterThan(0);
    expect(intermediate).toBeLessThan(10);
    expect(ema.update(20, 1000)).toBe(20);
  });

  it('retains the last value for a missing sample and clears explicitly', () => {
    const ema = new TimeAwareEma(100, 500);
    ema.update(5, 0);
    expect(ema.update(null, 100)).toBe(5);
    ema.reset();
    expect(ema.update(null, 200)).toBeNull();
  });

  it('converges toward a sustained input without overshooting', () => {
    const ema = new TimeAwareEma(100, 500);
    ema.update(0, 0);
    let result = 0;
    for (let timestampMs = 50; timestampMs <= 500; timestampMs += 50) result = ema.update(10, timestampMs)!;
    expect(result).toBeGreaterThan(9.9);
    expect(result).toBeLessThanOrEqual(10);
  });
});
