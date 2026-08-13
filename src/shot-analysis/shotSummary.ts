import type { ReleaseMetrics, ShotFrame, ShotSummary } from '../types/shotAnalysis';
import { SHOT_CONFIG } from './config';
import { motionMetric, variationMetric } from './releaseMetrics';
import { selectRelativeWindow } from './shotBuffer';

export function createShotSummary(frames: readonly ShotFrame[], releaseTimestampMs: number, releaseMetrics: ReleaseMetrics): ShotSummary {
  const hold = selectRelativeWindow(frames, releaseTimestampMs, SHOT_CONFIG.anchorStartMs, SHOT_CONFIG.anchorEndMs);
  return {
    holdShoulderVariationDeg: variationMetric(hold, 'shoulderLineAngleDeg', 'hold shoulder'),
    holdBowArmVariationDeg: variationMetric(hold, 'bowArmElbowAngleDeg', 'hold bow-arm'),
    holdTorsoVariationDeg: variationMetric(hold, 'torsoLeanDeg', 'hold torso'),
    headMotionBeforeRelease: motionMetric(hold, 'headPosition', 'hold head'),
    bowHandMotionBeforeRelease: motionMetric(hold, 'bowWristPosition', 'hold bow wrist'),
    releaseShoulderDeltaDeg: releaseMetrics.shoulder.delta,
    releaseBowArmDeltaDeg: releaseMetrics.bowArm.delta,
    releaseHeadDisplacement: releaseMetrics.headDisplacement,
    releaseBowHandDisplacement: releaseMetrics.bowHandDisplacement,
    followThroughShoulderVariationDeg: releaseMetrics.followThroughShoulderVariation,
  };
}
