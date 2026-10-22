import { describe, expect, it } from 'vitest';
import { createSampleSession, isSampleShot } from './sampleSession';

describe('sample session', () => {
  it('produces a full round of complete shots from the real capture engine', () => {
    const shots = createSampleSession(1_800_000_000_000);
    expect(shots).toHaveLength(12);
    for (const shot of shots) {
      expect(isSampleShot(shot)).toBe(true);
      expect(shot.preReleaseFrames.length).toBeGreaterThan(0);
      expect(shot.postReleaseFrames.length).toBeGreaterThan(0);
      expect(shot.summary.holdShoulderVariationDeg.available).toBe(true);
      expect(shot.actualResult?.score).toBeGreaterThanOrEqual(0);
      expect(shot.actualResult?.score).toBeLessThanOrEqual(10);
    }
  });

  it('is deterministic so the demo looks the same on every visit', () => {
    const scores = (seed: number) => createSampleSession(seed).map((shot) => shot.actualResult?.score);
    expect(scores(1)).toEqual(scores(2));
  });

  it('gives steadier holds better scores on average', () => {
    const shots = createSampleSession(1);
    const steady = shots.filter((shot) => (shot.summary.holdShoulderVariationDeg.value ?? 99) < 0.6);
    const shaky = shots.filter((shot) => (shot.summary.holdShoulderVariationDeg.value ?? 0) >= 0.6);
    const mean = (list: typeof shots) => list.reduce((sum, shot) => sum + (shot.actualResult?.score ?? 0), 0) / list.length;
    expect(steady.length).toBeGreaterThan(0);
    expect(shaky.length).toBeGreaterThan(0);
    expect(mean(steady)).toBeGreaterThan(mean(shaky));
  });
});
