import type { Vec2, Vec3 } from './types';
import { finite } from './vec';

/**
 * Offline time-series helpers. Because the whole clip is available, smoothing is
 * centred (zero-phase): it removes landmark jitter without the lag a live
 * filter adds, so release timing is not pushed late.
 */

export type Series = Array<number | null>;

export function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function std(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
}

export function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return Number.NaN;
  const index = Math.min(sorted.length - 1, Math.max(0, (sorted.length - 1) * p));
  const low = Math.floor(index);
  const high = Math.ceil(index);
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

/** Median absolute deviation. */
export function mad(values: readonly number[]): number {
  if (!values.length) return 0;
  const center = median(values);
  return median(values.map((value) => Math.abs(value - center)));
}

/** Coefficient of variation, or null when the mean is not positive. */
export function coefficientOfVariation(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const average = mean(values);
  return average > 1e-9 ? std(values) / average : null;
}

export function compact(values: Series): number[] {
  return values.filter(finite);
}

/** Linearly bridges null runs that are shorter than `maxGapS`. Longer gaps stay null. */
export function fillShortGaps(times: readonly number[], values: Series, maxGapS: number): Series {
  const out = [...values];
  let index = 0;
  while (index < out.length) {
    if (out[index] !== null) { index += 1; continue; }
    const start = index;
    while (index < out.length && out[index] === null) index += 1;
    const before = start - 1;
    const after = index;
    if (before < 0 || after >= out.length) continue;
    if (times[after] - times[before] > maxGapS) continue;
    const a = out[before] as number;
    const b = out[after] as number;
    for (let k = start; k < after; k += 1) {
      const fraction = (times[k] - times[before]) / (times[after] - times[before]);
      out[k] = a + (b - a) * fraction;
    }
  }
  return out;
}

function windowed(times: readonly number[], values: Series, halfWindowS: number, reducer: (window: number[]) => number): Series {
  const out: Series = new Array(values.length).fill(null);
  let low = 0;
  let high = 0;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === null) continue;
    const t = times[index];
    while (times[low] < t - halfWindowS) low += 1;
    if (high < index) high = index;
    while (high + 1 < values.length && times[high + 1] <= t + halfWindowS) high += 1;
    const window: number[] = [];
    for (let k = low; k <= high; k += 1) {
      const value = values[k];
      if (value !== null) window.push(value);
    }
    out[index] = reducer(window);
  }
  return out;
}

export function medianSmooth(times: readonly number[], values: Series, halfWindowS: number): Series {
  return windowed(times, values, halfWindowS, median);
}

export function meanSmooth(times: readonly number[], values: Series, halfWindowS: number): Series {
  return windowed(times, values, halfWindowS, mean);
}

export interface SmoothingOptions {
  medianHalfWindowS: number;
  meanHalfWindowS: number;
  maxInterpolationGapS: number;
}

/** Gap fill → centred median (spike removal) → centred mean (jitter removal). */
export function zeroPhaseSmooth(times: readonly number[], values: Series, options: SmoothingOptions): Series {
  const filled = fillShortGaps(times, values, options.maxInterpolationGapS);
  const despiked = medianSmooth(times, filled, options.medianHalfWindowS);
  return options.meanHalfWindowS > 0 ? meanSmooth(times, despiked, options.meanHalfWindowS) : despiked;
}

export function smoothVec2(times: readonly number[], points: ReadonlyArray<Vec2 | undefined>, options: SmoothingOptions): Array<Vec2 | undefined> {
  const xs = zeroPhaseSmooth(times, points.map((point) => point?.x ?? null), options);
  const ys = zeroPhaseSmooth(times, points.map((point) => point?.y ?? null), options);
  return xs.map((x, index) => (x !== null && ys[index] !== null ? { x, y: ys[index] as number } : undefined));
}

export function smoothVec3(times: readonly number[], points: ReadonlyArray<Vec3 | undefined>, options: SmoothingOptions): Array<Vec3 | undefined> {
  const xs = zeroPhaseSmooth(times, points.map((point) => point?.x ?? null), options);
  const ys = zeroPhaseSmooth(times, points.map((point) => point?.y ?? null), options);
  const zs = zeroPhaseSmooth(times, points.map((point) => point?.z ?? null), options);
  return xs.map((x, index) => (x !== null && ys[index] !== null && zs[index] !== null
    ? { x, y: ys[index] as number, z: zs[index] as number }
    : undefined));
}

/** Central-difference speed of a 3D point series, in units per second. */
export function speedSeries(times: readonly number[], points: ReadonlyArray<Vec3 | undefined>, maxGapS = 0.3): Series {
  return points.map((_, index) => {
    const before = index > 0 ? index - 1 : index;
    const after = index < points.length - 1 ? index + 1 : index;
    const a = points[before];
    const b = points[after];
    const dt = times[after] - times[before];
    if (!a || !b || !(dt > 0) || dt > maxGapS) return null;
    return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / dt;
  });
}

/** Index of the sample nearest to `t` (times must be sorted). */
export function indexAtTime(times: readonly number[], t: number): number {
  if (!times.length) return -1;
  let low = 0;
  let high = times.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (times[middle] < t) low = middle + 1;
    else high = middle;
  }
  if (low > 0 && Math.abs(times[low - 1] - t) <= Math.abs(times[low] - t)) return low - 1;
  return low;
}

/** Indices whose time lies within [start, end]. */
export function indicesBetween(times: readonly number[], start: number, end: number): number[] {
  const out: number[] = [];
  for (let index = 0; index < times.length; index += 1) {
    if (times[index] >= start && times[index] <= end) out.push(index);
    else if (times[index] > end) break;
  }
  return out;
}

/** Least-squares slope (units per second), or null with fewer than 3 points. */
export function linearSlope(times: readonly number[], values: readonly number[]): number | null {
  if (times.length < 3 || times.length !== values.length) return null;
  const tMean = mean(times);
  const vMean = mean(values);
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < times.length; index += 1) {
    numerator += (times[index] - tMean) * (values[index] - vMean);
    denominator += (times[index] - tMean) ** 2;
  }
  return denominator > 1e-12 ? numerator / denominator : null;
}

/** RMS distance of 2D points from their centroid. */
export function rmsSpread2(points: readonly Vec2[]): number {
  const cx = mean(points.map((point) => point.x));
  const cy = mean(points.map((point) => point.y));
  return Math.sqrt(mean(points.map((point) => (point.x - cx) ** 2 + (point.y - cy) ** 2)));
}

/** RMS distance of 3D points from their centroid. */
export function rmsSpread3(points: readonly Vec3[]): number {
  const cx = mean(points.map((point) => point.x));
  const cy = mean(points.map((point) => point.y));
  const cz = mean(points.map((point) => point.z));
  return Math.sqrt(mean(points.map((point) => (point.x - cx) ** 2 + (point.y - cy) ** 2 + (point.z - cz) ** 2)));
}

/** Median spacing between consecutive timestamps. */
export function medianInterval(times: readonly number[]): number | null {
  const gaps: number[] = [];
  for (let index = 1; index < times.length; index += 1) {
    const gap = times[index] - times[index - 1];
    if (gap > 0) gaps.push(gap);
  }
  return gaps.length ? median(gaps) : null;
}
