import { describe, expect, it } from 'vitest';
import type { PoseLandmark } from '../types/pose';
import { calculateBowArmElbowAngle, calculateShoulderLineAngle, calculateTorsoLean } from './metrics';

function landmarks(): PoseLandmark[] {
  return Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0.95, presence: 0.95 }));
}

describe('instantaneous archery metrics', () => {
  it('computes shoulder line and signed torso lean in normalized image space', () => {
    const pose = landmarks();
    pose[11] = { ...pose[11], x: 0.3, y: 0.4 };
    pose[12] = { ...pose[12], x: 0.7, y: 0.4 };
    pose[23] = { ...pose[23], x: 0.4, y: 0.8 };
    pose[24] = { ...pose[24], x: 0.6, y: 0.8 };
    expect(calculateShoulderLineAngle(pose).value).toBeCloseTo(0);
    expect(calculateTorsoLean(pose).value).toBeCloseTo(0);
    pose[11].x += 0.1;
    pose[12].x += 0.1;
    expect(calculateTorsoLean(pose).value).toBeGreaterThan(0);
  });

  it('uses the expected shoulder-line sign for image y offsets', () => {
    const pose = landmarks();
    pose[11] = { ...pose[11], x: 0.3, y: 0.4 };
    pose[12] = { ...pose[12], x: 0.7, y: 0.5 };
    expect(calculateShoulderLineAngle(pose).value).toBeCloseTo(14.036, 2);
  });

  it('uses opposite signs for screen-left and screen-right torso lean', () => {
    const pose = landmarks();
    pose[11] = { ...pose[11], x: 0.3, y: 0.4 };
    pose[12] = { ...pose[12], x: 0.5, y: 0.4 };
    pose[23] = { ...pose[23], x: 0.4, y: 0.8 };
    pose[24] = { ...pose[24], x: 0.6, y: 0.8 };
    expect(calculateTorsoLean(pose).value).toBeLessThan(0);
    pose[11].x += 0.2;
    pose[12].x += 0.2;
    expect(calculateTorsoLean(pose).value).toBeGreaterThan(0);
  });

  it('maps a right-handed archer to the left bow arm and prefers world landmarks', () => {
    const image = landmarks();
    const world = landmarks();
    world[11] = { ...world[11], x: -1, y: 0 };
    world[13] = { ...world[13], x: 0, y: 0 };
    world[15] = { ...world[15], x: 1, y: 0 };
    const metric = calculateBowArmElbowAngle(image, world, 'right');
    expect(metric.value).toBeCloseTo(180);
    expect(metric.coordinateSpace).toBe('world');
  });

  it('returns unavailable instead of a misleading number on occlusion', () => {
    const pose = landmarks();
    pose[11].visibility = 0.1;
    expect(calculateShoulderLineAngle(pose)).toMatchObject({ available: false, value: null });
  });
});
