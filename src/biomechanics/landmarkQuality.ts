import type { PoseLandmark } from '../types/pose';
import { BIOMECHANICS_CONFIG } from './config';

export type LandmarkRequirement = {
  index: number;
  label: string;
};

export type LandmarkQuality = {
  usable: boolean;
  confidence: number;
  reason?: string;
};

function hasFiniteCoordinates(landmark: PoseLandmark): boolean {
  return Number.isFinite(landmark.x) && Number.isFinite(landmark.y) && Number.isFinite(landmark.z);
}

export function isLandmarkUsable(
  landmark: PoseLandmark | undefined,
  threshold = BIOMECHANICS_CONFIG.minLandmarkVisibility,
): boolean {
  if (!landmark || !hasFiniteCoordinates(landmark)) return false;
  if (!Number.isFinite(landmark.visibility) || (landmark.visibility ?? 0) < threshold) return false;
  if (landmark.presence !== undefined && (!Number.isFinite(landmark.presence) || landmark.presence < threshold)) return false;
  return true;
}

export function getLandmarkConfidence(landmarks: PoseLandmark[]): number {
  if (landmarks.length === 0) return 0;
  return Math.min(...landmarks.map((landmark) => Math.min(landmark.visibility ?? 0, landmark.presence ?? 1)));
}

export function validateLandmarks(
  landmarks: PoseLandmark[],
  requirements: LandmarkRequirement[],
  threshold = BIOMECHANICS_CONFIG.minLandmarkVisibility,
): LandmarkQuality {
  const required: PoseLandmark[] = [];
  for (const requirement of requirements) {
    const landmark = landmarks[requirement.index];
    if (!landmark) return { usable: false, confidence: 0, reason: `${requirement.label} unavailable` };
    if (!hasFiniteCoordinates(landmark)) return { usable: false, confidence: 0, reason: `${requirement.label} coordinates invalid` };
    const confidence = Math.min(landmark.visibility ?? 0, landmark.presence ?? 1);
    if (!Number.isFinite(confidence) || confidence < threshold) {
      return { usable: false, confidence: Math.max(0, Number.isFinite(confidence) ? confidence : 0), reason: `${requirement.label} visibility too low` };
    }
    required.push(landmark);
  }
  return { usable: true, confidence: getLandmarkConfidence(required) };
}

