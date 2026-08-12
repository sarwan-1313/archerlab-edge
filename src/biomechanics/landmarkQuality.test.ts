import { describe, expect, it } from 'vitest';
import type { PoseLandmark } from '../types/pose';
import { isLandmarkUsable, validateLandmarks } from './landmarkQuality';

const good: PoseLandmark = { x: 0.5, y: 0.5, z: 0, visibility: 0.9, presence: 0.95 };

describe('landmark quality gates', () => {
  it('accepts visible finite landmarks', () => expect(isLandmarkUsable(good)).toBe(true));
  it('rejects low visibility and presence', () => {
    expect(isLandmarkUsable({ ...good, visibility: 0.2 })).toBe(false);
    expect(isLandmarkUsable({ ...good, presence: 0.2 })).toBe(false);
  });
  it('rejects missing and invalid coordinates with a reason', () => {
    expect(validateLandmarks([], [{ index: 11, label: 'Shoulder' }]).reason).toContain('unavailable');
    expect(validateLandmarks([{ ...good, x: Number.NaN }], [{ index: 0, label: 'Nose' }]).reason).toContain('invalid');
    expect(validateLandmarks([{ ...good, z: Number.POSITIVE_INFINITY }], [{ index: 0, label: 'Nose' }]).reason).toContain('invalid');
  });
});
