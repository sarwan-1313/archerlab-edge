import type { Vec2, Vec3 } from './types';

const DEG = 180 / Math.PI;

export const sub3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const add3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const scale3 = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const dot3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const len3 = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const dist3 = (a: Vec3, b: Vec3): number => len3(sub3(a, b));
export const mid3 = (a: Vec3, b: Vec3): Vec3 => scale3(add3(a, b), 0.5);

export function norm3(a: Vec3): Vec3 | null {
  const length = len3(a);
  return length > 1e-9 ? scale3(a, 1 / length) : null;
}

/** Angle between two vectors in degrees, or null when either is degenerate. */
export function angle3(a: Vec3, b: Vec3): number | null {
  const denominator = len3(a) * len3(b);
  if (!(denominator > 1e-12)) return null;
  const cosine = Math.min(1, Math.max(-1, dot3(a, b) / denominator));
  return Math.acos(cosine) * DEG;
}

/** Interior angle at `vertex` formed by `a` and `c`, degrees. */
export function jointAngle3(a: Vec3, vertex: Vec3, c: Vec3): number | null {
  return angle3(sub3(a, vertex), sub3(c, vertex));
}

export const sub2 = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const len2 = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist2 = (a: Vec2, b: Vec2): number => len2(sub2(a, b));
export const mid2 = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
