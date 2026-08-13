import type { BiomechanicsSnapshot } from '../types/biomechanics';
import type { ShotFrame } from '../types/shotAnalysis';

function copyPoint(point: ShotFrame['headPosition']): ShotFrame['headPosition'] {
  return point ? { x: point.x, y: point.y } : undefined;
}

/** Detaches a stored numeric sample from MediaPipe/biomechanics object references. */
export function cloneShotFrame(frame: ShotFrame): ShotFrame {
  return {
    ...frame,
    headPosition: copyPoint(frame.headPosition),
    bowWristPosition: copyPoint(frame.bowWristPosition),
    drawWristPosition: copyPoint(frame.drawWristPosition),
    drawElbowPosition: copyPoint(frame.drawElbowPosition),
    shoulderMidpoint: copyPoint(frame.shoulderMidpoint),
  };
}

export function createShotFrame(snapshot: BiomechanicsSnapshot): ShotFrame | null {
  const frame = snapshot.currentFrame;
  if (!frame || !Number.isFinite(snapshot.timestampMs) || snapshot.timestampMs <= 0) return null;
  return {
    timestampMs: snapshot.timestampMs,
    athleteDetected: snapshot.athleteDetected,
    poseConfidence: snapshot.poseConfidence,
    shoulderLineAngleDeg: snapshot.shoulderLineAngle.rawValue,
    bowArmElbowAngleDeg: snapshot.bowArmElbowAngle.rawValue,
    torsoLeanDeg: snapshot.torsoLean.rawValue,
    headMotion: snapshot.headMotion.rawValue,
    bowHandMotion: snapshot.bowHandMotion.rawValue,
    shoulderVariationDeg: snapshot.shoulderVariation.rawValue,
    headPosition: frame.headPosition,
    bowWristPosition: frame.bowHandPosition,
    drawWristPosition: frame.drawHandPosition,
    drawElbowPosition: frame.drawElbowPosition,
    shoulderMidpoint: frame.shoulderMidpoint,
    shoulderWidth: frame.shoulderWidth,
    landmarkQuality: frame.confidence,
    shoulderLineQuality: snapshot.shoulderLineAngle.confidence,
    bowArmQuality: snapshot.bowArmElbowAngle.confidence,
    torsoQuality: snapshot.torsoLean.confidence,
    headQuality: frame.headConfidence,
    bowHandQuality: frame.bowHandConfidence,
  };
}
