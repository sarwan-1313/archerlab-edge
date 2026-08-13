import { describe, expect, it } from 'vitest';
import type { ShotFrame } from '../types/shotAnalysis';
import { relativeTimeMs, selectRelativeWindow, ShotRollingBuffer } from './shotBuffer';

function frame(timestampMs: number): ShotFrame {
  return { timestampMs, athleteDetected: true, poseConfidence: 0.9, shoulderLineAngleDeg: 1, bowArmElbowAngleDeg: 170, torsoLeanDeg: 0, headMotion: 0, bowHandMotion: 0, shoulderVariationDeg: 0, landmarkQuality: 0.9 };
}

describe('shot rolling buffer', () => {
  it('is bounded by timestamps and removes old frames', () => {
    const buffer = new ShotRollingBuffer(1200);
    buffer.push(frame(0)); buffer.push(frame(600)); buffer.push(frame(1300));
    expect(buffer.values().map((sample) => sample.timestampMs)).toEqual([600, 1300]);
    expect(buffer.durationMs).toBe(700);
  });

  it('ignores invalid and out-of-order samples', () => {
    const buffer = new ShotRollingBuffer(1200);
    buffer.push(frame(1000)); buffer.push(frame(900)); buffer.push(frame(Number.NaN));
    expect(buffer.values().map((sample) => sample.timestampMs)).toEqual([1000]);
  });

  it('selects pre/post windows and converts to release-relative time', () => {
    const frames = [800, 1200, 1800, 2000, 2100, 2600, 2900].map(frame);
    expect(selectRelativeWindow(frames, 2000, -1200, 0).map((sample) => sample.timestampMs)).toEqual([800, 1200, 1800, 2000]);
    expect(selectRelativeWindow(frames, 2000, 1, 800).map((sample) => sample.timestampMs)).toEqual([2100, 2600]);
    expect(relativeTimeMs(frame(1500), 2000)).toBe(-500);
    expect(relativeTimeMs(frame(2400), 2000)).toBe(400);
  });
});
