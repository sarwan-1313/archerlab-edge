import { describe, expect, it } from 'vitest';
import type { PoseLandmark, PoseResult } from '../types/pose';
import { HOLD_MS, PoseSmoother, SMOOTHING_PRESETS, trackingQuality } from './poseSmoothing';

const FRAME_MS = 50;

/** A body of 33 points all at (x, y), at the given time, with the given visibility. */
function frame(t: number, x: number, y = 0.5, visibility = 0.95, detected = true): PoseResult {
  const point = (): PoseLandmark => ({ x, y, z: 0, visibility });
  const landmarks = detected ? Array.from({ length: 33 }, point) : [];
  return { landmarks, worldLandmarks: landmarks.map((p) => ({ ...p })), timestamp: t, athleteDetected: detected, averageVisibility: visibility };
}

const spread = (values: number[]) => { const mean = values.reduce((a, b) => a + b, 0) / values.length; return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length); };

describe('steadier live tracking', () => {
  it('calms jitter on a point that is held still', () => {
    const smoother = new PoseSmoother();
    const raw: number[] = []; const smooth: number[] = [];
    for (let i = 0; i < 80; i += 1) {
      const x = 0.5 + (i % 2 ? 0.01 : -0.01);
      raw.push(x);
      smooth.push(smoother.smooth(frame(i * FRAME_MS, x), SMOOTHING_PRESETS.balanced).landmarks[16].x);
    }
    expect(spread(smooth.slice(20))).toBeLessThan(spread(raw.slice(20)) * 0.4);
    const steady = new PoseSmoother();
    const steadier = Array.from({ length: 80 }, (_, i) => steady.smooth(frame(i * FRAME_MS, 0.5 + (i % 2 ? 0.01 : -0.01)), SMOOTHING_PRESETS.steady).landmarks[16].x);
    expect(spread(steadier.slice(20))).toBeLessThan(spread(smooth.slice(20)));
  });

  it('does not lag far behind fast movement', () => {
    const smoother = new PoseSmoother();
    let last = 0; let target = 0;
    for (let i = 0; i <= 20; i += 1) { // 0.2 → 0.8 in one second
      target = 0.2 + 0.03 * i;
      last = smoother.smooth(frame(i * FRAME_MS, target), SMOOTHING_PRESETS.balanced).landmarks[0].x;
    }
    expect(target - last).toBeLessThan(0.05);
    expect(target - last).toBeGreaterThanOrEqual(0);
  });

  it('holds a point the model is unsure of instead of letting it jump, then lets go', () => {
    const smoother = new PoseSmoother();
    for (let i = 0; i < 10; i += 1) smoother.smooth(frame(i * FRAME_MS, 0.4), SMOOTHING_PRESETS.balanced);
    const held = smoother.smooth(frame(10 * FRAME_MS, 0.9, 0.5, 0.1), SMOOTHING_PRESETS.balanced).landmarks[5];
    expect(held.x).toBeCloseTo(0.4, 2);
    // A mid-confidence point that teleports is a glitch too.
    expect(smoother.smooth(frame(11 * FRAME_MS, 0.9, 0.5, 0.5), SMOOTHING_PRESETS.balanced).landmarks[5].x).toBeCloseTo(0.4, 2);
    // Unsure for too long: the raw value comes back.
    const late = smoother.smooth(frame(10 * FRAME_MS + HOLD_MS + 200, 0.9, 0.5, 0.1), SMOOTHING_PRESETS.balanced).landmarks[5];
    expect(late.x).toBeCloseTo(0.9, 2);
  });

  it('starts fresh after the athlete has been gone a while', () => {
    const smoother = new PoseSmoother();
    for (let i = 0; i < 10; i += 1) smoother.smooth(frame(i * FRAME_MS, 0.3), SMOOTHING_PRESETS.balanced);
    smoother.smooth(frame(600, 0, 0, 0, false), SMOOTHING_PRESETS.balanced);
    smoother.smooth(frame(1200, 0, 0, 0, false), SMOOTHING_PRESETS.balanced);
    expect(smoother.smooth(frame(1250, 0.7), SMOOTHING_PRESETS.balanced).landmarks[0].x).toBeCloseTo(0.7, 5);
  });

  it('passes points through untouched when smoothing is off', () => {
    const smoother = new PoseSmoother();
    const input = frame(0, 0.42);
    expect(smoother.smooth(input, null)).toBe(input);
  });

  it('smooths the 3D points too, without changing their visibility', () => {
    const smoother = new PoseSmoother();
    smoother.smooth(frame(0, 0.5), SMOOTHING_PRESETS.balanced);
    const next = smoother.smooth(frame(FRAME_MS, 0.52), SMOOTHING_PRESETS.balanced);
    expect(next.worldLandmarks[3].x).toBeLessThan(0.52);
    expect(next.landmarks[3].visibility).toBe(0.95);
  });

  it('rates tracking from how clearly the key joints are seen', () => {
    expect(trackingQuality(null)).toBeNull();
    expect(trackingQuality(frame(0, 0.5, 0.5, 0.95, false))).toBeNull();
    expect(trackingQuality(frame(0, 0.5, 0.5, 0.95))?.label).toBe('Excellent');
    expect(trackingQuality(frame(0, 0.5, 0.5, 0.75))?.label).toBe('Good');
    expect(trackingQuality(frame(0, 0.5, 0.5, 0.55))?.label).toBe('Fair');
    expect(trackingQuality(frame(0, 0.5, 0.5, 0.2))?.label).toBe('Weak');
    expect(trackingQuality(frame(0, 0.5, 0.5, 0.95), 0.02)?.score).toBeLessThan(trackingQuality(frame(0, 0.5, 0.5, 0.95), 0)!.score);
  });
});
