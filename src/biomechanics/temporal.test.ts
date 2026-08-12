import { describe, expect, it } from 'vitest';
import type { BiomechanicsFrame } from '../types/biomechanics';
import { RollingTimeBuffer } from './rollingBuffer';
import { calculateBowHandMotion, calculateHeadMotion, calculateShoulderVariation } from './stability';

function frame(timestampMs: number, x: number, shoulderAngle = 0): BiomechanicsFrame {
  return {
    timestampMs,
    shoulderLineAngleDeg: shoulderAngle,
    bowArmElbowAngleDeg: 170,
    torsoLeanDeg: 0,
    headPosition: { x, y: 0.2 },
    headReference: 'ears',
    bowHandPosition: { x, y: 0.5 },
    shoulderWidth: 0.2,
    confidence: 0.9,
    shoulderLineConfidence: 0.9,
    headConfidence: 0.9,
    bowHandConfidence: 0.9,
    shoulderWidthConfidence: 0.9,
  };
}

describe('rolling temporal biomechanics', () => {
  it('expires old frames and ignores duplicate timestamps', () => {
    const buffer = new RollingTimeBuffer<BiomechanicsFrame>(2000);
    buffer.push(frame(0, 0)); buffer.push(frame(0, 1)); buffer.push(frame(1000, 1)); buffer.push(frame(2501, 2));
    expect(buffer.values().map((sample) => sample.timestampMs)).toEqual([1000, 2501]);
  });

  it('remains bounded to its timestamp window as samples accumulate', () => {
    const buffer = new RollingTimeBuffer<BiomechanicsFrame>(2000);
    for (let timestampMs = 0; timestampMs <= 10_000; timestampMs += 100) buffer.push(frame(timestampMs, 0));
    expect(buffer.durationMs).toBe(2000);
    expect(buffer.length).toBe(21);
  });

  it('reports near-zero RMS for stationary points and movement for changing points', () => {
    const still = [0, 200, 400, 600].map((time) => frame(time, 0.5));
    const moving = [0, 200, 400, 600].map((time, index) => frame(time, 0.5 + index * 0.02));
    expect(calculateHeadMotion(still).value).toBeCloseTo(0);
    expect(calculateHeadMotion(moving).value).toBeGreaterThan(0);
    expect(calculateBowHandMotion(moving).velocityShoulderWidthsPerSecond).toBeGreaterThan(0);
  });

  it('calculates normalized path and velocity from real elapsed time', () => {
    const moving = [0, 200, 400, 600].map((time, index) => frame(time, 0.5 + index * 0.02));
    const metric = calculateBowHandMotion(moving);
    expect(metric.pathLengthShoulderWidths).toBeCloseTo(0.3);
    expect(metric.velocityShoulderWidthsPerSecond).toBeCloseTo(0.5);
  });

  it('requires sufficient duration and samples', () => {
    expect(calculateHeadMotion([frame(0, 0.5), frame(100, 0.5)])).toMatchObject({ available: false });
  });

  it('makes a temporal metric unavailable when its current landmark is occluded', () => {
    const frames = [0, 200, 400, 600].map((time) => frame(time, 0.5));
    frames.at(-1)!.headPosition = undefined;
    frames.at(-1)!.bowHandPosition = undefined;
    frames.at(-1)!.shoulderLineAngleDeg = null;
    expect(calculateHeadMotion(frames)).toMatchObject({ available: false, reason: 'Head landmarks unavailable' });
    expect(calculateBowHandMotion(frames)).toMatchObject({ available: false, reason: 'Bow wrist landmark unavailable' });
    expect(calculateShoulderVariation(frames)).toMatchObject({ available: false, reason: 'Shoulder landmarks unavailable' });
  });

  it('rejects non-finite timestamps from the rolling buffer', () => {
    const buffer = new RollingTimeBuffer<BiomechanicsFrame>(2000);
    buffer.push(frame(Number.NaN, 0));
    expect(buffer.length).toBe(0);
  });

  it('calculates shoulder angular standard deviation', () => {
    const frames = [0, 200, 400, 600].map((time, index) => frame(time, 0.5, index * 2));
    expect(calculateShoulderVariation(frames).value).toBeCloseTo(Math.sqrt(5));
  });
});
