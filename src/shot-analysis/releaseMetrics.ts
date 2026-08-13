import { distance2D } from '../biomechanics/geometry';
import { availableMetric, unavailableMetric } from '../biomechanics/metrics';
import type { BiomechanicsMetric, Point2D } from '../types/biomechanics';
import type { BeforeAfterMetric, ReleaseMetrics, ShotFrame } from '../types/shotAnalysis';
import { SHOT_CONFIG } from './config';
import { selectRelativeWindow } from './shotBuffer';

type NumericField = 'shoulderLineAngleDeg' | 'bowArmElbowAngleDeg' | 'torsoLeanDeg';
type PointField = 'headPosition' | 'bowWristPosition';

function fieldQuality(frame: ShotFrame, field: NumericField | PointField): number {
  if (field === 'shoulderLineAngleDeg') return frame.shoulderLineQuality ?? frame.landmarkQuality;
  if (field === 'bowArmElbowAngleDeg') return frame.bowArmQuality ?? frame.landmarkQuality;
  if (field === 'torsoLeanDeg') return frame.torsoQuality ?? frame.landmarkQuality;
  if (field === 'headPosition') return frame.headQuality ?? frame.landmarkQuality;
  return frame.bowHandQuality ?? frame.landmarkQuality;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function metric(value: number, unit: string, confidence: number): BiomechanicsMetric {
  return availableMetric(value, unit, { confidence, coordinateSpace: 'temporal-normalized' });
}

function quality(frames: readonly ShotFrame[]): number {
  return frames.length ? Math.min(...frames.map((frame) => frame.landmarkQuality)) : 0;
}

function numericValues(frames: readonly ShotFrame[], field: NumericField): { values: number[]; frames: ShotFrame[] } {
  const usable = frames.filter((frame) => fieldQuality(frame, field) >= SHOT_CONFIG.minLandmarkQuality && frame[field] !== null && Number.isFinite(frame[field]));
  return { values: usable.map((frame) => frame[field]!), frames: usable };
}

function windowMedian(frames: readonly ShotFrame[], field: NumericField, label: string): BiomechanicsMetric {
  const usable = numericValues(frames, field);
  if (usable.values.length < SHOT_CONFIG.minimumMetricSamples) return unavailableMetric(`Insufficient ${label} samples`, '°', quality(usable.frames));
  return metric(median(usable.values), '°', quality(usable.frames));
}

function beforeAfter(frames: readonly ShotFrame[], releaseTimestampMs: number, field: NumericField, label: string): BeforeAfterMetric {
  const before = windowMedian(selectRelativeWindow(frames, releaseTimestampMs, SHOT_CONFIG.comparisonPreStartMs, SHOT_CONFIG.comparisonPreEndMs), field, label);
  const after = windowMedian(selectRelativeWindow(frames, releaseTimestampMs, SHOT_CONFIG.comparisonPostStartMs, SHOT_CONFIG.comparisonPostEndMs), field, label);
  const confidence = Math.min(before.confidence, after.confidence);
  const delta = before.available && after.available
    ? metric(after.value! - before.value!, '°', confidence)
    : unavailableMetric(before.reason ?? after.reason ?? `Insufficient ${label} data`, '°', confidence);
  return { before, after, delta };
}

function centroid(points: Point2D[]): Point2D {
  return { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length };
}

function pointWindow(frames: readonly ShotFrame[], field: PointField): Array<ShotFrame & Record<PointField, Point2D> & { shoulderWidth: number }> {
  return frames.filter((frame) => {
    const point = frame[field];
    return fieldQuality(frame, field) >= SHOT_CONFIG.minLandmarkQuality && point && Number.isFinite(point.x) && Number.isFinite(point.y) && frame.shoulderWidth !== undefined && Number.isFinite(frame.shoulderWidth) && frame.shoulderWidth > 0;
  }) as Array<ShotFrame & Record<PointField, Point2D> & { shoulderWidth: number }>;
}

function displacement(frames: readonly ShotFrame[], releaseTimestampMs: number, field: PointField, label: string): BiomechanicsMetric {
  const before = pointWindow(selectRelativeWindow(frames, releaseTimestampMs, SHOT_CONFIG.comparisonPreStartMs, SHOT_CONFIG.comparisonPreEndMs), field);
  const after = pointWindow(selectRelativeWindow(frames, releaseTimestampMs, SHOT_CONFIG.comparisonPostStartMs, SHOT_CONFIG.comparisonPostEndMs), field);
  if (before.length < SHOT_CONFIG.minimumMetricSamples || after.length < SHOT_CONFIG.minimumMetricSamples) {
    return unavailableMetric(`Insufficient ${label} samples`, '% SW', Math.min(quality(before), quality(after)));
  }
  const beforePoint = centroid(before.map((frame) => frame[field]));
  const afterPoint = centroid(after.map((frame) => frame[field]));
  const shoulderWidth = median([...before, ...after].map((frame) => frame.shoulderWidth));
  return metric((distance2D(beforePoint, afterPoint) / shoulderWidth) * 100, '% SW', Math.min(quality(before), quality(after)));
}

export function variationMetric(frames: readonly ShotFrame[], field: NumericField, label: string): BiomechanicsMetric {
  const usable = numericValues(frames, field);
  if (usable.values.length < SHOT_CONFIG.minimumMetricSamples) return unavailableMetric(`Insufficient ${label} samples`, '°', quality(usable.frames));
  const mean = usable.values.reduce((sum, value) => sum + value, 0) / usable.values.length;
  return metric(Math.sqrt(usable.values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / usable.values.length), '°', quality(usable.frames));
}

export function motionMetric(frames: readonly ShotFrame[], field: PointField, label: string): BiomechanicsMetric {
  const usable = pointWindow(frames, field);
  if (usable.length < SHOT_CONFIG.minimumMetricSamples) return unavailableMetric(`Insufficient ${label} samples`, '% SW', quality(usable));
  const center = centroid(usable.map((frame) => frame[field]));
  const meanSquare = usable.reduce((sum, frame) => sum + (distance2D(frame[field], center) / frame.shoulderWidth) ** 2, 0) / usable.length;
  return metric(Math.sqrt(meanSquare) * 100, '% SW', quality(usable));
}

export function calculateReleaseMetrics(frames: readonly ShotFrame[], releaseTimestampMs: number): ReleaseMetrics {
  const followThrough = selectRelativeWindow(frames, releaseTimestampMs, SHOT_CONFIG.followThroughStartMs, SHOT_CONFIG.followThroughEndMs);
  return {
    shoulder: beforeAfter(frames, releaseTimestampMs, 'shoulderLineAngleDeg', 'shoulder'),
    bowArm: beforeAfter(frames, releaseTimestampMs, 'bowArmElbowAngleDeg', 'bow-arm'),
    torso: beforeAfter(frames, releaseTimestampMs, 'torsoLeanDeg', 'torso'),
    headDisplacement: displacement(frames, releaseTimestampMs, 'headPosition', 'head'),
    bowHandDisplacement: displacement(frames, releaseTimestampMs, 'bowWristPosition', 'bow wrist'),
    followThroughShoulderVariation: variationMetric(followThrough, 'shoulderLineAngleDeg', 'follow-through shoulder'),
    followThroughTorsoVariation: variationMetric(followThrough, 'torsoLeanDeg', 'follow-through torso'),
    followThroughHeadMotion: motionMetric(followThrough, 'headPosition', 'follow-through head'),
    followThroughBowHandMotion: motionMetric(followThrough, 'bowWristPosition', 'follow-through bow wrist'),
  };
}
