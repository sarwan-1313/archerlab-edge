import type { MetricKey, PoseSample, ShotReport, VideoAnalysisReport } from './types';

/**
 * Comparing two shots: picking the athlete's best shot, lining shots up at
 * the release, and fitting one skeleton onto another body so it can be drawn
 * as a "ghost" over a live camera or another clip.
 */

export interface Point2 { x: number; y: number; v: number }

/** Upper-body and leg connections of the 33-point MediaPipe pose. */
export const SKELETON: ReadonlyArray<readonly [number, number]> = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [15, 17], [16, 18], [15, 19], [16, 20],
  [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28], [0, 7], [0, 8],
];

const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;

/** The 33 image landmarks of a sample as points (x, y normalised to the frame; v visibility). */
export function pointsFromSample(sample: PoseSample | null | undefined): Point2[] | null {
  if (!sample?.image) return null;
  const points: Point2[] = [];
  for (let index = 0; index < 33; index += 1) points.push({ x: sample.image[index * 4], y: sample.image[index * 4 + 1], v: sample.image[index * 4 + 3] });
  return points;
}

/** The tracked sample nearest to time t (samples are sorted by time). */
export function sampleNear(samples: readonly PoseSample[], t: number, maxGapS = 0.25): PoseSample | null {
  if (!samples.length) return null;
  let low = 0;
  let high = samples.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (samples[mid].t < t) low = mid + 1; else high = mid;
  }
  let best: PoseSample | null = null;
  for (let index = Math.max(0, low - 3); index <= Math.min(samples.length - 1, low + 3); index += 1) {
    const sample = samples[index];
    if (!sample.image) continue;
    if (!best || Math.abs(sample.t - t) < Math.abs(best.t - t)) best = sample;
  }
  return best && Math.abs(best.t - t) <= maxGapS ? best : null;
}

/** The shot with the highest form score that was tracked well enough to trust. */
export function bestShot(report: Pick<VideoAnalysisReport, 'shots'>): ShotReport | null {
  let best: ShotReport | null = null;
  for (const shot of report.shots) {
    if (shot.source === 'audio-only' || shot.formScore === null || shot.quality.label === 'poor') continue;
    if (!best || (shot.formScore ?? 0) > (best.formScore ?? 0)) best = shot;
  }
  return best;
}

/** The moment in shot B that matches time t in shot A, lining both up at the release. */
export function alignedTime(a: Pick<ShotReport, 'release'>, b: Pick<ShotReport, 'release'>, t: number): number {
  return b.release + (t - a.release);
}

/** How far before and after the release a comparison runs, seconds. */
export function comparisonWindow(a: ShotReport, b: ShotReport): { before: number; after: number } {
  const lead = (shot: ShotReport) => shot.release - (shot.drawStart ?? shot.anchorStart ?? shot.release - 3);
  const tail = (shot: ShotReport) => (shot.followThroughEnd ?? shot.release + 1.5) - shot.release;
  return { before: Math.min(6, Math.max(lead(a), lead(b), 1)), after: Math.min(3, Math.max(tail(a), tail(b), 0.8)) };
}

interface BodyFrame { x: number; y: number; scale: number }

/** A reference point and size for a body: the middle of the hips (or shoulders) and the torso length, in height units. */
function bodyFrame(points: readonly Point2[], aspect: number, minVisibility: number): BodyFrame | null {
  const seen = (index: number) => (points[index] && points[index].v >= minVisibility ? points[index] : null);
  const ls = seen(LEFT_SHOULDER); const rs = seen(RIGHT_SHOULDER); const lh = seen(LEFT_HIP); const rh = seen(RIGHT_HIP);
  if (!ls || !rs) return null;
  const shoulders = { x: ((ls.x + rs.x) / 2) * aspect, y: (ls.y + rs.y) / 2 };
  if (lh && rh) {
    const hips = { x: ((lh.x + rh.x) / 2) * aspect, y: (lh.y + rh.y) / 2 };
    const torso = Math.hypot(shoulders.x - hips.x, shoulders.y - hips.y);
    if (torso > 1e-3) return { x: shoulders.x, y: shoulders.y, scale: torso };
  }
  const width = Math.hypot((ls.x - rs.x) * aspect, ls.y - rs.y);
  // Shoulder width is about 0.8 of torso length; use it when the hips are out of frame.
  return width > 1e-3 ? { x: shoulders.x, y: shoulders.y, scale: width / 0.8 } : null;
}

/**
 * Moves and scales the ghost skeleton so its shoulders and torso sit on the
 * target body. Aspect ratios (width / height) let clips of different shapes be
 * compared. Returns points in the target's normalised coordinates, or null when
 * either body is not visible enough.
 */
export function fitOnto(ghost: readonly Point2[], ghostAspect: number, target: readonly Point2[], targetAspect: number, minVisibility = 0.4): Point2[] | null {
  const from = bodyFrame(ghost, ghostAspect, minVisibility);
  const to = bodyFrame(target, targetAspect, minVisibility);
  if (!from || !to) return null;
  const ratio = to.scale / from.scale;
  return ghost.map((point) => ({
    x: (to.x + (point.x * ghostAspect - from.x) * ratio) / targetAspect,
    y: to.y + (point.y - from.y) * ratio,
    v: point.v,
  }));
}

/**
 * Mirrors a skeleton left-to-right, so a right-handed reference can sit over
 * a left-handed archer (or a clip filmed from the other side). Left and right
 * landmarks swap so arms stay arms.
 */
export function mirrorPoints(points: readonly Point2[]): Point2[] {
  const swapped = points.map((point) => ({ ...point, x: 1 - point.x }));
  const pairs: Array<[number, number]> = [[1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32]];
  for (const [left, right] of pairs) [swapped[left], swapped[right]] = [swapped[right], swapped[left]];
  return swapped;
}

/** Average distance between matching upper-body joints, in torso lengths (0 = identical). */
export function poseDifference(a: readonly Point2[], b: readonly Point2[], aspect = 1): number | null {
  const frame = bodyFrame(a, aspect, 0.4);
  if (!frame) return null;
  const joints = [11, 12, 13, 14, 15, 16, 0];
  let sum = 0; let count = 0;
  for (const index of joints) {
    if ((a[index]?.v ?? 0) < 0.4 || (b[index]?.v ?? 0) < 0.4) continue;
    sum += Math.hypot((a[index].x - b[index].x) * aspect, a[index].y - b[index].y);
    count += 1;
  }
  return count ? sum / count / frame.scale : null;
}

export interface MetricDifference { key: MetricKey; a: number; b: number; scoreA: number | null; scoreB: number | null }

/** The measurements both shots have, the biggest gaps in score first. */
export function compareShotMetrics(a: ShotReport, b: ShotReport): MetricDifference[] {
  const keys = (Object.keys(a.metrics) as MetricKey[]).filter((key) => b.metrics[key]);
  return keys
    .map((key) => ({ key, a: a.metrics[key]!.value, b: b.metrics[key]!.value, scoreA: a.scores[key] ?? null, scoreB: b.scores[key] ?? null }))
    .sort((x, y) => Math.abs((y.scoreA ?? 0) - (y.scoreB ?? 0)) - Math.abs((x.scoreA ?? 0) - (x.scoreB ?? 0)));
}
