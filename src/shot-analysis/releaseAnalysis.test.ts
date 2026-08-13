import { describe, expect, it } from 'vitest';
import type { ShotFrame } from '../types/shotAnalysis';
import { evaluateReleaseCandidate, type CandidateDetectorState } from './releaseCandidate';
import { calculateReleaseMetrics } from './releaseMetrics';
import { createShotPhases, phaseAt } from './shotPhases';
import { calculateShotDataQuality } from './shotQuality';
import { createShotSummary } from './shotSummary';

const RELEASE = 2000;
function frame(timestampMs: number, overrides: Partial<ShotFrame> = {}): ShotFrame {
  const relative = timestampMs - RELEASE;
  const after = relative > 0;
  const followOffset = relative > 180 ? (relative - 100) / 200 : 0;
  return {
    timestampMs, athleteDetected: true, poseConfidence: 0.9,
    shoulderLineAngleDeg: (after ? 12 : 10) + followOffset,
    bowArmElbowAngleDeg: after ? 168 : 170, torsoLeanDeg: after ? 2 : 1,
    headMotion: 0, bowHandMotion: 0, shoulderVariationDeg: 0,
    headPosition: { x: (after ? 0.52 : 0.5) + followOffset * 0.002, y: 0.2 },
    bowWristPosition: { x: (after ? 0.34 : 0.3) + followOffset * 0.004, y: 0.5 },
    drawWristPosition: { x: 0.7, y: 0.3 }, drawElbowPosition: { x: 0.6, y: 0.4 },
    shoulderMidpoint: { x: 0.5, y: 0.4 }, shoulderWidth: 0.2, landmarkQuality: 0.9,
    ...overrides,
  };
}

const metricFrames = [-180, -100, -40, 40, 100, 180, 300, 500, 700].map((offset) => frame(RELEASE + offset));

describe('release metrics and quality', () => {
  it('uses robust windows for shoulder, bow-arm, torso, head, and bow-hand deltas', () => {
    const metrics = calculateReleaseMetrics(metricFrames, RELEASE);
    expect(metrics.shoulder.before.value).toBeCloseTo(10); expect(metrics.shoulder.after.value).toBeCloseTo(12); expect(metrics.shoulder.delta.value).toBeCloseTo(2);
    expect(metrics.bowArm.delta.value).toBeCloseTo(-2); expect(metrics.torso.delta.value).toBeCloseTo(1);
    expect(metrics.headDisplacement.value).toBeCloseTo(10); expect(metrics.bowHandDisplacement.value).toBeCloseTo(20);
    expect(metrics.followThroughShoulderVariation.value).toBeGreaterThan(0);
    expect(metrics.followThroughTorsoVariation.available).toBe(true);
    expect(metrics.followThroughHeadMotion.available).toBe(true);
    expect(metrics.followThroughBowHandMotion.available).toBe(true);
  });

  it('makes metrics unavailable for insufficient, low-quality, or missing data', () => {
    expect(calculateReleaseMetrics([frame(RELEASE - 100), frame(RELEASE + 100)], RELEASE).shoulder.delta.available).toBe(false);
    const low = metricFrames.map((sample) => ({ ...sample, landmarkQuality: 0.2 }));
    expect(calculateReleaseMetrics(low, RELEASE).shoulder.delta.available).toBe(false);
    const missingBow = metricFrames.map((sample) => ({ ...sample, bowArmElbowAngleDeg: null }));
    expect(calculateReleaseMetrics(missingBow, RELEASE).bowArm.delta.available).toBe(false);
    const missingWrist = metricFrames.map((sample) => ({ ...sample, bowWristPosition: undefined }));
    expect(calculateReleaseMetrics(missingWrist, RELEASE).bowHandDisplacement.available).toBe(false);
  });

  it('uses metric-specific quality rather than hiding good shoulder data behind another landmark', () => {
    const samples = metricFrames.map((sample) => ({ ...sample, landmarkQuality: 0.2, shoulderLineQuality: 0.9 }));
    const metrics = calculateReleaseMetrics(samples, RELEASE);
    expect(metrics.shoulder.delta.available).toBe(true); expect(metrics.headDisplacement.available).toBe(false);
  });

  it('summarizes real hold-window variation and normalized motion', () => {
    const hold = [-600, -500, -400, -300, -200, -100].map((offset, index) => frame(RELEASE + offset, {
      shoulderLineAngleDeg: 10 + index * 0.2, bowArmElbowAngleDeg: 170 + index * 0.3, torsoLeanDeg: 1 + index * 0.1,
      headPosition: { x: 0.5 + index * 0.001, y: 0.2 }, bowWristPosition: { x: 0.3 + index * 0.002, y: 0.5 },
    }));
    const frames = [...hold, ...metricFrames]; const metrics = calculateReleaseMetrics(frames, RELEASE); const summary = createShotSummary(frames, RELEASE, metrics);
    expect(summary.holdShoulderVariationDeg.value).toBeGreaterThan(0);
    expect(summary.holdBowArmVariationDeg.value).toBeGreaterThan(0);
    expect(summary.holdTorsoVariationDeg.value).toBeGreaterThan(0);
    expect(summary.headMotionBeforeRelease.available).toBe(true); expect(summary.bowHandMotionBeforeRelease.available).toBe(true);
  });

  it('counts missing trailing capture time as tracking loss', () => {
    const frames = [-1200, -800, -400, 0, 200].map((offset) => frame(RELEASE + offset));
    const quality = calculateShotDataQuality(frames, RELEASE);
    expect(quality.releaseWindowComplete).toBe(false); expect(quality.trackingLossMs).toBeGreaterThanOrEqual(600);
  });
});

describe('estimated shot phases', () => {
  it('defines configured anchor, release, and follow-through windows', () => {
    const phases = createShotPhases();
    expect(phases.find((item) => item.phase === 'anchor')).toMatchObject({ startRelativeMs: -600, endRelativeMs: -100, estimated: true });
    expect(phases.find((item) => item.phase === 'release')).toMatchObject({ startRelativeMs: -100, endRelativeMs: 100 });
    expect(phases.find((item) => item.phase === 'follow-through')).toMatchObject({ startRelativeMs: 100, endRelativeMs: 700 });
    expect(phaseAt(-400)).toBe('anchor'); expect(phaseAt(0)).toBe('release'); expect(phaseAt(400)).toBe('follow-through');
  });
});

describe('experimental release candidate', () => {
  function candidateFrame(time: number, x = 0.5, quality = 0.9): ShotFrame {
    return frame(time, { poseConfidence: quality, landmarkQuality: quality, drawWristPosition: { x, y: 0.3 }, drawElbowPosition: { x: 0.6, y: 0.4 }, bowWristPosition: { x: 0.25, y: 0.5 }, headPosition: { x: 0.5, y: 0.2 }, shoulderMidpoint: { x: 0.5, y: 0.4 } });
  }
  const readyState = (): CandidateDetectorState => ({ lastCandidateMs: -Infinity, trackingReadySinceMs: 0 });

  it('does not flag a stable athlete but can flag sudden draw-wrist motion', () => {
    expect(evaluateReleaseCandidate(candidateFrame(1000), candidateFrame(1100), readyState())).toBeNull();
    const candidate = evaluateReleaseCandidate(candidateFrame(1000), candidateFrame(1100, 0.7), readyState());
    expect(candidate?.releaseCandidateStrength).toBeGreaterThanOrEqual(0.68);
  });

  it('rejects whole-body translation and low pose quality', () => {
    const previous = candidateFrame(1000);
    const moved = candidateFrame(1100, 0.7); moved.drawElbowPosition = { x: 0.8, y: 0.4 }; moved.bowWristPosition = { x: 0.45, y: 0.5 }; moved.headPosition = { x: 0.7, y: 0.2 }; moved.shoulderMidpoint = { x: 0.7, y: 0.4 };
    expect(evaluateReleaseCandidate(previous, moved, readyState())).toBeNull();
    expect(evaluateReleaseCandidate(candidateFrame(1000), candidateFrame(1100, 0.7, 0.2), readyState())).toBeNull();
  });

  it('suppresses candidates during recovery and candidate cooldown', () => {
    expect(evaluateReleaseCandidate(candidateFrame(1000), candidateFrame(1100, 0.7), { lastCandidateMs: -Infinity })).toBeNull();
    const state = readyState(); expect(evaluateReleaseCandidate(candidateFrame(1000), candidateFrame(1100, 0.7), state)).not.toBeNull();
    expect(evaluateReleaseCandidate(candidateFrame(1100, 0.7), candidateFrame(1200, 0.9), state)).toBeNull();
  });
});
