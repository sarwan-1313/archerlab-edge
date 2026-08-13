import { clamp, distance2D } from '../biomechanics/geometry';
import type { Point2D } from '../types/biomechanics';
import type { ReleaseCandidate, ShotFrame } from '../types/shotAnalysis';
import { SHOT_CONFIG } from './config';

export interface CandidateDetectorState {
  lastCandidateMs: number;
  lastStrongSignalMs?: number;
  trackingReadySinceMs?: number;
  lastEvaluation?: ReleaseCandidate;
}

function velocity(previous: ShotFrame, current: ShotFrame, field: 'drawWristPosition' | 'drawElbowPosition' | 'bowWristPosition' | 'shoulderMidpoint' | 'headPosition'): number {
  const before = previous[field] as Point2D | undefined;
  const after = current[field] as Point2D | undefined;
  const dt = (current.timestampMs - previous.timestampMs) / 1000;
  const width = previous.shoulderWidth && current.shoulderWidth ? (previous.shoulderWidth + current.shoulderWidth) / 2 : null;
  if (!before || !after || !width || dt <= 0 || dt * 1000 > SHOT_CONFIG.maxSampleGapMs) return 0;
  return distance2D(before, after) / width / dt;
}

function contribution(value: number, threshold: number): number { return clamp(value / threshold, 0, 1); }

export function evaluateReleaseCandidate(
  previous: ShotFrame | undefined,
  current: ShotFrame,
  state: CandidateDetectorState,
): ReleaseCandidate | null {
  const currentUsable = current.athleteDetected && current.poseConfidence >= SHOT_CONFIG.minLandmarkQuality && current.landmarkQuality >= SHOT_CONFIG.minLandmarkQuality;
  const previousUsable = previous?.athleteDetected && previous.poseConfidence >= SHOT_CONFIG.minLandmarkQuality && previous.landmarkQuality >= SHOT_CONFIG.minLandmarkQuality;
  if (!previous || !currentUsable || !previousUsable) {
    state.trackingReadySinceMs = currentUsable ? current.timestampMs : undefined;
    state.lastEvaluation = undefined;
    return null;
  }
  if (state.trackingReadySinceMs === undefined) state.trackingReadySinceMs = previous.timestampMs;
  if (current.timestampMs - state.lastCandidateMs < SHOT_CONFIG.candidateCooldownMs) return null;
  const drawWristVelocity = velocity(previous, current, 'drawWristPosition');
  const drawElbowVelocity = velocity(previous, current, 'drawElbowPosition');
  const bowWristVelocity = velocity(previous, current, 'bowWristPosition');
  const shoulderVelocity = velocity(previous, current, 'shoulderMidpoint');
  const headVelocity = velocity(previous, current, 'headPosition');
  const torsoChange = previous.torsoLeanDeg === null || current.torsoLeanDeg === null ? 0 : Math.abs(current.torsoLeanDeg - previous.torsoLeanDeg);
  const globalMotion = Math.max(
    contribution(shoulderVelocity, SHOT_CONFIG.candidateGlobalMotionRejectVelocity),
    contribution(headVelocity, SHOT_CONFIG.candidateHeadMotionRejectVelocity),
    contribution(torsoChange, SHOT_CONFIG.candidateTorsoChangeRejectDeg),
  );
  const strength = clamp(
    contribution(drawWristVelocity, SHOT_CONFIG.candidateDrawWristVelocity) * 0.6
      + contribution(drawElbowVelocity, SHOT_CONFIG.candidateDrawElbowVelocity) * 0.2
      + contribution(bowWristVelocity, SHOT_CONFIG.candidateBowWristVelocity) * 0.1
      + 0.1
      - globalMotion * 0.7,
    0,
    1,
  );
  const evaluation = { timestampMs: current.timestampMs, releaseCandidateStrength: strength, drawWristVelocity, drawElbowVelocity, bowWristVelocity };
  state.lastEvaluation = evaluation;
  if (current.timestampMs - state.trackingReadySinceMs < SHOT_CONFIG.candidateRecoveryMs) return null;
  if (strength < SHOT_CONFIG.candidateThreshold) return null;
  if (current.timestampMs - (state.lastStrongSignalMs ?? -Infinity) < SHOT_CONFIG.candidateDebounceMs) return null;
  state.lastStrongSignalMs = current.timestampMs;
  state.lastCandidateMs = current.timestampMs;
  return evaluation;
}
