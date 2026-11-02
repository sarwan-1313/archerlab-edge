// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  LITE_MODE_KEY, SLOW_TIMING_MS, applyLiteMode, assessDevice, dismissLiteSuggestion, readDeviceSignals, readLiteChoice,
  readSuggestionDismissed, runTimingTest, shouldSuggestLite, writeLiteMode,
} from './liteMode';

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.lite;
});

describe('assessDevice', () => {
  it('treats a 2 GB phone as low-end on memory alone', () => {
    const result = assessDevice({ deviceMemoryGb: 2, cores: 8, timingMs: 8 });
    expect(result.lowEnd).toBe(true);
    expect(result.reasons).toEqual(['about 2 GB of memory']);
  });

  it('treats less than 2 GB as low-end too', () => {
    expect(assessDevice({ deviceMemoryGb: 1 }).lowEnd).toBe(true);
    expect(assessDevice({ deviceMemoryGb: 0.5 }).lowEnd).toBe(true);
  });

  it('does not flag 4 GB or more with a quick timing test', () => {
    expect(assessDevice({ deviceMemoryGb: 4, cores: 8, timingMs: 10 })).toEqual({ lowEnd: false, reasons: [] });
    expect(assessDevice({ deviceMemoryGb: 8, cores: 4, timingMs: 12 }).lowEnd).toBe(false);
  });

  it('flags a slow timing test even when memory is unknown (Safari and Firefox do not report it)', () => {
    const result = assessDevice({ deviceMemoryGb: null, cores: 8, timingMs: SLOW_TIMING_MS + 1 });
    expect(result.lowEnd).toBe(true);
    expect(result.reasons).toEqual(['a slow processor in a quick speed test']);
  });

  it('does not count a timing test exactly at the threshold', () => {
    expect(assessDevice({ timingMs: SLOW_TIMING_MS }).lowEnd).toBe(false);
  });

  it('does not flag few cores on their own, since many mid-range phones report 4', () => {
    expect(assessDevice({ deviceMemoryGb: 4, cores: 4, timingMs: 10 }).lowEnd).toBe(false);
    expect(assessDevice({ cores: 2 }).lowEnd).toBe(false);
  });

  it('mentions the core count when it adds to another sign', () => {
    expect(assessDevice({ deviceMemoryGb: 2, cores: 4, timingMs: 80 }).reasons).toEqual([
      'about 2 GB of memory', 'a slow processor in a quick speed test', '4 processor cores',
    ]);
  });

  it('ignores missing, zero and nonsense values', () => {
    expect(assessDevice({}).lowEnd).toBe(false);
    expect(assessDevice({ deviceMemoryGb: 0, cores: 0, timingMs: 0 }).lowEnd).toBe(false);
    expect(assessDevice({ deviceMemoryGb: Number.NaN, cores: undefined, timingMs: Number.POSITIVE_INFINITY }).lowEnd).toBe(false);
  });
});

describe('runTimingTest', () => {
  it('returns the median of its runs', () => {
    // Each run reads the clock twice: runs of 30, 90 and 50 ms.
    const ticks = [0, 30, 100, 190, 200, 250];
    let call = 0;
    expect(runTimingTest(() => ticks[call++], 3)).toBe(50);
    expect(call).toBe(6);
  });

  it('finishes quickly on this machine', () => {
    expect(runTimingTest()).toBeLessThan(1000);
  });
});

describe('readDeviceSignals', () => {
  it('reads deviceMemory and hardwareConcurrency, and skips the timing test when asked', () => {
    Object.defineProperty(navigator, 'deviceMemory', { value: 2, configurable: true });
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 4, configurable: true });
    expect(readDeviceSignals(false)).toEqual({ deviceMemoryGb: 2, cores: 4, timingMs: null });
    delete (navigator as { deviceMemory?: number }).deviceMemory;
  });

  it('reports unknown memory as null', () => {
    expect(readDeviceSignals(false).deviceMemoryGb).toBeNull();
  });
});

describe('the Lite mode choice', () => {
  const lowEnd = assessDevice({ deviceMemoryGb: 2 });

  it('is unset until the athlete chooses, and then suggested only on a low-end device', () => {
    expect(readLiteChoice()).toBeNull();
    expect(shouldSuggestLite(lowEnd, readLiteChoice(), readSuggestionDismissed())).toBe(true);
    expect(shouldSuggestLite(assessDevice({ deviceMemoryGb: 8 }), null, false)).toBe(false);
  });

  it('stops suggesting once turned on, turned off or dismissed', () => {
    writeLiteMode(true);
    expect(localStorage.getItem(LITE_MODE_KEY)).toBe('1');
    expect(shouldSuggestLite(lowEnd, readLiteChoice(), false)).toBe(false);
    writeLiteMode(false);
    expect(readLiteChoice()).toBe(false);
    expect(shouldSuggestLite(lowEnd, readLiteChoice(), false)).toBe(false);
    localStorage.clear();
    dismissLiteSuggestion();
    expect(shouldSuggestLite(lowEnd, readLiteChoice(), readSuggestionDismissed())).toBe(false);
  });

  it('marks the document so animations can be cut', () => {
    writeLiteMode(true);
    expect(document.documentElement.dataset.lite).toBe('on');
    writeLiteMode(false);
    expect(document.documentElement.dataset.lite).toBeUndefined();
    localStorage.setItem(LITE_MODE_KEY, '1');
    applyLiteMode();
    expect(document.documentElement.dataset.lite).toBe('on');
  });
});
