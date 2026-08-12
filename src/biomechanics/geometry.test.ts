import { describe, expect, it } from 'vitest';
import { angleAtJoint, normalizeAngleDelta, signedAngleFromHorizontal, signedAngleFromVertical, unwrapAngles } from './geometry';

describe('biomechanics geometry', () => {
  it('computes straight, right, and acute joint angles', () => {
    expect(angleAtJoint({ x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBeCloseTo(180);
    expect(angleAtJoint({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toBeCloseTo(90);
    expect(angleAtJoint({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 })).toBeCloseTo(45);
  });

  it('rejects zero-length vectors and clamps stable angle math', () => {
    expect(angleAtJoint({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 })).toBeNull();
  });

  it('uses documented image-plane signs', () => {
    expect(signedAngleFromHorizontal({ x: 1, y: 0 })).toBeCloseTo(0);
    expect(signedAngleFromHorizontal({ x: 1, y: 1 })).toBeCloseTo(45);
    expect(signedAngleFromVertical({ x: 1, y: -1 })).toBeCloseTo(45);
    expect(signedAngleFromVertical({ x: -1, y: -1 })).toBeCloseTo(-45);
  });

  it('unwraps angles across the -180/180 boundary', () => {
    expect(normalizeAngleDelta(-358)).toBe(2);
    expect(unwrapAngles([179, -179, -178])).toEqual([179, 181, 182]);
  });
});
