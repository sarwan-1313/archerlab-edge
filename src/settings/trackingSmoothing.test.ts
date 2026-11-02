import { beforeEach, describe, expect, it } from 'vitest';
import { TRACKING_SMOOTHING_KEY, readTrackingSmoothing, writeTrackingSmoothing } from './trackingSmoothing';

describe('tracking smoothing setting', () => {
  beforeEach(() => { localStorage.clear(); });

  it('remembers the choice on this device', () => {
    writeTrackingSmoothing('steady');
    expect(readTrackingSmoothing()).toBe('steady');
    expect(localStorage.getItem(TRACKING_SMOOTHING_KEY)).toBe('steady');
    writeTrackingSmoothing('off');
    expect(readTrackingSmoothing()).toBe('off');
    writeTrackingSmoothing('balanced');
    expect(readTrackingSmoothing()).toBe('balanced');
  });
});
