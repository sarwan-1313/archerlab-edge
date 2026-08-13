import type { ShotPhase, ShotPhaseInterval } from '../types/shotAnalysis';
import { SHOT_CONFIG } from './config';

export function createShotPhases(): ShotPhaseInterval[] {
  return [
    { phase: 'setup', startRelativeMs: -SHOT_CONFIG.preReleaseMs, endRelativeMs: -900, estimated: true },
    { phase: 'draw', startRelativeMs: -900, endRelativeMs: SHOT_CONFIG.anchorStartMs, estimated: true },
    { phase: 'anchor', startRelativeMs: SHOT_CONFIG.anchorStartMs, endRelativeMs: SHOT_CONFIG.anchorEndMs, estimated: true },
    { phase: 'release', startRelativeMs: SHOT_CONFIG.releaseStartMs, endRelativeMs: SHOT_CONFIG.releaseEndMs, estimated: true },
    { phase: 'follow-through', startRelativeMs: SHOT_CONFIG.followThroughStartMs, endRelativeMs: SHOT_CONFIG.followThroughEndMs, estimated: true },
  ];
}

export function phaseAt(relativeMs: number): ShotPhase | null {
  return createShotPhases().find((phase) => relativeMs >= phase.startRelativeMs && relativeMs <= phase.endRelativeMs)?.phase ?? null;
}
