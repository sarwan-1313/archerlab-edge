import type { ShotDataQuality, ShotFrame } from '../types/shotAnalysis';
import { SHOT_CONFIG } from './config';

export function calculateShotDataQuality(frames: readonly ShotFrame[], releaseTimestampMs: number): ShotDataQuality {
  const isUsable = (frame: ShotFrame) => frame.athleteDetected && frame.landmarkQuality >= SHOT_CONFIG.minLandmarkQuality;
  const usable = frames.filter(isUsable);
  const usableFrameRatio = frames.length ? usable.length / frames.length : 0;
  const averagePoseConfidence = frames.length ? frames.reduce((sum, frame) => sum + frame.poseConfidence, 0) / frames.length : 0;
  let trackingLossMs = 0;
  const expectedStart = releaseTimestampMs - SHOT_CONFIG.preReleaseMs;
  const expectedEnd = releaseTimestampMs + SHOT_CONFIG.postReleaseMs;
  const firstTimestamp = frames[0]?.timestampMs;
  const lastTimestamp = frames.at(-1)?.timestampMs;
  if (firstTimestamp === undefined) trackingLossMs = SHOT_CONFIG.preReleaseMs + SHOT_CONFIG.postReleaseMs;
  else {
    trackingLossMs += Math.max(0, Math.min(SHOT_CONFIG.preReleaseMs, firstTimestamp - expectedStart));
    trackingLossMs += Math.max(0, Math.min(SHOT_CONFIG.postReleaseMs, expectedEnd - (lastTimestamp ?? firstTimestamp)));
  }
  for (let index = 1; index < frames.length; index += 1) {
    const gap = frames[index].timestampMs - frames[index - 1].timestampMs;
    if (!Number.isFinite(gap) || gap <= 0) continue;
    if (!isUsable(frames[index - 1]) || !isUsable(frames[index])) trackingLossMs += gap;
    else if (gap > SHOT_CONFIG.maxSampleGapMs) trackingLossMs += gap - SHOT_CONFIG.maxSampleGapMs;
  }
  const first = firstTimestamp ?? Infinity;
  const last = lastTimestamp ?? -Infinity;
  const releaseWindowComplete = first <= expectedStart + SHOT_CONFIG.releaseWindowToleranceMs
    && last >= expectedEnd - SHOT_CONFIG.releaseWindowToleranceMs;
  const label = releaseWindowComplete && usableFrameRatio >= SHOT_CONFIG.dataQualityGoodRatio && averagePoseConfidence >= SHOT_CONFIG.dataQualityGoodConfidence
    ? 'Good'
    : usableFrameRatio >= SHOT_CONFIG.dataQualityLimitedRatio ? 'Limited' : 'Poor';
  return { usableFrameRatio, averagePoseConfidence, trackingLossMs, releaseWindowComplete, label };
}
