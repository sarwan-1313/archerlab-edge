import type { BiomechanicsFrame, BiomechanicsMetric, Point2D } from '../types/biomechanics';
import { BIOMECHANICS_CONFIG } from './config';
import { distance2D, unwrapAngles } from './geometry';
import { availableMetric, unavailableMetric } from './metrics';

function duration(frames: readonly BiomechanicsFrame[]): number {
  return frames.length < 2 ? 0 : frames.at(-1)!.timestampMs - frames[0].timestampMs;
}

function hasEnoughHistory(frames: readonly BiomechanicsFrame[]): boolean {
  return frames.length >= BIOMECHANICS_CONFIG.minMotionSamples && duration(frames) >= BIOMECHANICS_CONFIG.minMotionHistoryMs;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function temporalMetric(value: number, unit: string, frames: readonly BiomechanicsFrame[], confidence: number): BiomechanicsMetric {
  return {
    ...availableMetric(value, unit, { confidence, coordinateSpace: 'temporal-normalized' }),
    sampleCount: frames.length,
    windowDurationMs: duration(frames),
  };
}

function temporalUnavailable(reason: string, frames: readonly BiomechanicsFrame[], unit: string): BiomechanicsMetric {
  return { ...unavailableMetric(reason, unit), sampleCount: frames.length, windowDurationMs: duration(frames) };
}

function finitePoint(point: Point2D | undefined): point is Point2D {
  return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y));
}

function finiteShoulderWidth(width: number | undefined): width is number {
  return width !== undefined && Number.isFinite(width) && width > 0;
}

function rmsDisplacement(points: Point2D[], shoulderWidths: number[]): number {
  const centroid = {
    x: average(points.map((point) => point.x)),
    y: average(points.map((point) => point.y)),
  };
  const normalizedSquared = points.map((point, index) => {
    const displacement = distance2D(point, centroid) / shoulderWidths[index];
    return displacement * displacement;
  });
  return Math.sqrt(average(normalizedSquared)) * 100;
}

export function calculateHeadMotion(frames: readonly BiomechanicsFrame[]): BiomechanicsMetric {
  const current = frames.at(-1);
  if (!current || !finitePoint(current.headPosition)) return temporalUnavailable('Head landmarks unavailable', frames, '% SW');
  if (!finiteShoulderWidth(current.shoulderWidth)) return temporalUnavailable('Shoulder width unavailable', frames, '% SW');
  const usable = frames.filter((frame) => finitePoint(frame.headPosition) && finiteShoulderWidth(frame.shoulderWidth)) as Array<BiomechanicsFrame & { headPosition: Point2D; shoulderWidth: number }>;
  if (!hasEnoughHistory(usable)) return temporalUnavailable('Collecting movement data...', usable, '% SW');
  const value = rmsDisplacement(usable.map((frame) => frame.headPosition), usable.map((frame) => frame.shoulderWidth));
  return temporalMetric(value, '% SW', usable, Math.min(...usable.map((frame) => frame.headConfidence)));
}

export function calculateBowHandMotion(frames: readonly BiomechanicsFrame[]): BiomechanicsMetric {
  const current = frames.at(-1);
  if (!current || !finitePoint(current.bowHandPosition)) return temporalUnavailable('Bow wrist landmark unavailable', frames, '% SW');
  if (!finiteShoulderWidth(current.shoulderWidth)) return temporalUnavailable('Shoulder width unavailable', frames, '% SW');
  const usable = frames.filter((frame) => finitePoint(frame.bowHandPosition) && finiteShoulderWidth(frame.shoulderWidth)) as Array<BiomechanicsFrame & { bowHandPosition: Point2D; shoulderWidth: number }>;
  if (!hasEnoughHistory(usable)) return temporalUnavailable('Collecting movement data...', usable, '% SW');
  const rms = rmsDisplacement(usable.map((frame) => frame.bowHandPosition), usable.map((frame) => frame.shoulderWidth));
  let pathLength = 0;
  let elapsedMs = 0;
  for (let index = 1; index < usable.length; index += 1) {
    const deltaMs = usable[index].timestampMs - usable[index - 1].timestampMs;
    if (deltaMs <= 0 || deltaMs > BIOMECHANICS_CONFIG.maxSampleGapMs) continue;
    const width = (usable[index].shoulderWidth + usable[index - 1].shoulderWidth) / 2;
    pathLength += distance2D(usable[index - 1].bowHandPosition, usable[index].bowHandPosition) / width;
    elapsedMs += deltaMs;
  }
  const result = temporalMetric(rms, '% SW', usable, Math.min(...usable.map((frame) => frame.bowHandConfidence)));
  result.pathLengthShoulderWidths = pathLength;
  if (elapsedMs > 0) result.velocityShoulderWidthsPerSecond = pathLength / (elapsedMs / 1000);
  return result;
}

export function calculateShoulderVariation(frames: readonly BiomechanicsFrame[]): BiomechanicsMetric {
  const current = frames.at(-1);
  if (!current || current.shoulderLineAngleDeg === null || !Number.isFinite(current.shoulderLineAngleDeg)) {
    return temporalUnavailable('Shoulder landmarks unavailable', frames, '°');
  }
  const usable = frames.filter((frame) => frame.shoulderLineAngleDeg !== null);
  if (!hasEnoughHistory(usable)) return temporalUnavailable('Collecting movement data...', usable, '°');
  const values = unwrapAngles(usable.map((frame) => frame.shoulderLineAngleDeg!));
  const mean = average(values);
  const standardDeviation = Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
  const result = temporalMetric(standardDeviation, '°', usable, Math.min(...usable.map((frame) => frame.shoulderLineConfidence)));
  result.mean = mean;
  result.range = Math.max(...values) - Math.min(...values);
  return result;
}
