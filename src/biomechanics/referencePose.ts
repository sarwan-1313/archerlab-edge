import type { BiomechanicsReference, BiomechanicsReferenceDeltas, BiomechanicsSnapshot } from '../types/biomechanics';
import { BIOMECHANICS_CONFIG } from './config';

export type ReferenceSample = {
  timestampMs: number;
  shoulderLineAngleDeg: number;
  bowArmElbowAngleDeg: number;
  torsoLeanDeg: number;
  confidence: number;
};

export function median(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function createBiomechanicsReference(samples: ReferenceSample[]): BiomechanicsReference | null {
  const valid = samples.filter((sample) => Number.isFinite(sample.timestampMs) && Number.isFinite(sample.shoulderLineAngleDeg) && Number.isFinite(sample.bowArmElbowAngleDeg) && Number.isFinite(sample.torsoLeanDeg) && Number.isFinite(sample.confidence) && sample.confidence >= BIOMECHANICS_CONFIG.minLandmarkVisibility);
  if (valid.length < BIOMECHANICS_CONFIG.referenceMinSamples) return null;
  if (valid.at(-1)!.timestampMs - valid[0].timestampMs < BIOMECHANICS_CONFIG.referenceMinHistoryMs) return null;
  return {
    capturedAt: valid.at(-1)!.timestampMs,
    shoulderLineAngleDeg: median(valid.map((sample) => sample.shoulderLineAngleDeg)),
    bowArmElbowAngleDeg: median(valid.map((sample) => sample.bowArmElbowAngleDeg)),
    torsoLeanDeg: median(valid.map((sample) => sample.torsoLeanDeg)),
    sampleCount: valid.length,
  };
}

export function calculateReferenceDeltas(
  snapshot: Pick<BiomechanicsSnapshot, 'shoulderLineAngle' | 'bowArmElbowAngle' | 'torsoLean'>,
  reference?: BiomechanicsReference,
): BiomechanicsReferenceDeltas | undefined {
  if (!reference) return undefined;
  return {
    shoulderDeltaDeg: snapshot.shoulderLineAngle.value === null ? undefined : snapshot.shoulderLineAngle.value - reference.shoulderLineAngleDeg,
    bowArmDeltaDeg: snapshot.bowArmElbowAngle.value === null ? undefined : snapshot.bowArmElbowAngle.value - reference.bowArmElbowAngleDeg,
    torsoDeltaDeg: snapshot.torsoLean.value === null ? undefined : snapshot.torsoLean.value - reference.torsoLeanDeg,
  };
}
