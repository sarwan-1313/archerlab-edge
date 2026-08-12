import type { Point2D, Point3D } from '../types/biomechanics';

const RADIANS_TO_DEGREES = 180 / Math.PI;

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function distance2D(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function distance3D(a: Point3D, b: Point3D): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

export function midpoint(a: Point2D, b: Point2D): Point2D {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function vector2D(from: Point2D, to: Point2D): Point2D {
  return { x: to.x - from.x, y: to.y - from.y };
}

export function vector3D(from: Point3D, to: Point3D): Point3D {
  return { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
}

export function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) return Number.NaN;
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

export function magnitude(vector: number[]): number {
  return Math.hypot(...vector);
}

export function angleBetweenVectors(a: number[], b: number[]): number | null {
  const denominator = magnitude(a) * magnitude(b);
  if (!Number.isFinite(denominator) || denominator <= Number.EPSILON) return null;
  const cosine = dotProduct(a, b) / denominator;
  if (!Number.isFinite(cosine)) return null;
  return Math.acos(clamp(cosine, -1, 1)) * RADIANS_TO_DEGREES;
}

export function angleAtJoint(a: Point3D, vertex: Point3D, c: Point3D): number | null {
  const first = vector3D(vertex, a);
  const second = vector3D(vertex, c);
  return angleBetweenVectors([first.x, first.y, first.z], [second.x, second.y, second.z]);
}

export function signedAngleFromHorizontal(vector: Point2D): number | null {
  if (!Number.isFinite(vector.x) || !Number.isFinite(vector.y) || Math.hypot(vector.x, vector.y) <= Number.EPSILON) return null;
  let angle = Math.atan2(vector.y, vector.x) * RADIANS_TO_DEGREES;
  if (angle > 90) angle -= 180;
  if (angle <= -90) angle += 180;
  return angle;
}

/** Positive means the upper point leans toward screen-right; image y increases downward. */
export function signedAngleFromVertical(vector: Point2D): number | null {
  if (!Number.isFinite(vector.x) || !Number.isFinite(vector.y) || Math.hypot(vector.x, vector.y) <= Number.EPSILON) return null;
  return Math.atan2(vector.x, -vector.y) * RADIANS_TO_DEGREES;
}

export function normalizeAngleDelta(angle: number): number {
  let normalized = ((angle + 180) % 360 + 360) % 360 - 180;
  if (normalized === -180) normalized = 180;
  return normalized;
}

export function unwrapAngles(angles: number[]): number[] {
  if (angles.length === 0) return [];
  const result = [angles[0]];
  for (let index = 1; index < angles.length; index += 1) {
    result.push(result[index - 1] + normalizeAngleDelta(angles[index] - angles[index - 1]));
  }
  return result;
}

