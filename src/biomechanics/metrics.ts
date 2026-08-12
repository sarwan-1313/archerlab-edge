import type { ArcherHandedness, BiomechanicsMetric, InstantaneousBiomechanics, Point2D, Point3D } from '../types/biomechanics';
import type { PoseLandmark, PoseResult } from '../types/pose';
import { BIOMECHANICS_CONFIG } from './config';
import { angleAtJoint, distance2D, midpoint, signedAngleFromHorizontal, signedAngleFromVertical, vector2D } from './geometry';
import { getBowSide } from './handedness';
import { validateLandmarks } from './landmarkQuality';
import { LANDMARK } from './landmarks';

type MetricOptions = Pick<BiomechanicsMetric, 'coordinateSpace' | 'confidence'>;

export function unavailableMetric(reason: string, unit = 'deg', confidence = 0): BiomechanicsMetric {
  return { value: null, rawValue: null, smoothedValue: null, unit, confidence, available: false, reason };
}

export function availableMetric(value: number, unit: string, options: MetricOptions): BiomechanicsMetric {
  return { value, rawValue: value, smoothedValue: value, unit, available: true, ...options };
}

function point3D(landmark: PoseLandmark): Point3D {
  return { x: landmark.x, y: landmark.y, z: landmark.z };
}

export function calculateShoulderLineAngle(landmarks: PoseLandmark[]): BiomechanicsMetric {
  const quality = validateLandmarks(landmarks, [
    { index: LANDMARK.leftShoulder, label: 'Left shoulder' },
    { index: LANDMARK.rightShoulder, label: 'Right shoulder' },
  ]);
  if (!quality.usable) return unavailableMetric(quality.reason ?? 'Shoulders unavailable', '°', quality.confidence);
  const angle = signedAngleFromHorizontal(vector2D(landmarks[LANDMARK.leftShoulder], landmarks[LANDMARK.rightShoulder]));
  return angle === null
    ? unavailableMetric('Shoulder line is too short', '°', quality.confidence)
    : availableMetric(angle, '°', { confidence: quality.confidence, coordinateSpace: 'normalized-image' });
}

export function calculateBowArmElbowAngle(
  landmarks: PoseLandmark[],
  worldLandmarks: PoseLandmark[],
  handedness: ArcherHandedness,
): BiomechanicsMetric {
  const side = getBowSide(handedness);
  const indices = side === 'left'
    ? [LANDMARK.leftShoulder, LANDMARK.leftElbow, LANDMARK.leftWrist]
    : [LANDMARK.rightShoulder, LANDMARK.rightElbow, LANDMARK.rightWrist];
  const labels = ['Bow shoulder', 'Bow elbow', 'Bow wrist'];
  const requirements = indices.map((index, item) => ({ index, label: labels[item] }));
  const worldQuality = validateLandmarks(worldLandmarks, requirements);
  const imageQuality = validateLandmarks(landmarks, requirements);
  const source = worldQuality.usable ? worldLandmarks : landmarks;
  const quality = worldQuality.usable ? worldQuality : imageQuality;
  if (!quality.usable) return unavailableMetric(quality.reason ?? 'Bow arm unavailable', '°', quality.confidence);
  const angle = angleAtJoint(point3D(source[indices[0]]), point3D(source[indices[1]]), point3D(source[indices[2]]));
  return angle === null
    ? unavailableMetric('Bow arm segments are too short', '°', quality.confidence)
    : availableMetric(angle, '°', {
        confidence: quality.confidence,
        coordinateSpace: worldQuality.usable ? 'world' : 'normalized-image-fallback',
      });
}

export function calculateTorsoLean(landmarks: PoseLandmark[]): BiomechanicsMetric {
  const quality = validateLandmarks(landmarks, [
    { index: LANDMARK.leftShoulder, label: 'Left shoulder' },
    { index: LANDMARK.rightShoulder, label: 'Right shoulder' },
    { index: LANDMARK.leftHip, label: 'Left hip' },
    { index: LANDMARK.rightHip, label: 'Right hip' },
  ]);
  if (!quality.usable) return unavailableMetric(quality.reason ?? 'Torso unavailable', '°', quality.confidence);
  const shoulders = midpoint(landmarks[LANDMARK.leftShoulder], landmarks[LANDMARK.rightShoulder]);
  const hips = midpoint(landmarks[LANDMARK.leftHip], landmarks[LANDMARK.rightHip]);
  const angle = signedAngleFromVertical(vector2D(hips, shoulders));
  return angle === null
    ? unavailableMetric('Torso axis is too short', '°', quality.confidence)
    : availableMetric(angle, '°', { confidence: quality.confidence, coordinateSpace: 'normalized-image' });
}

export function getShoulderWidth(landmarks: PoseLandmark[]): { value: number | null; confidence: number } {
  const quality = validateLandmarks(landmarks, [
    { index: LANDMARK.leftShoulder, label: 'Left shoulder' },
    { index: LANDMARK.rightShoulder, label: 'Right shoulder' },
  ]);
  if (!quality.usable) return { value: null, confidence: quality.confidence };
  const width = distance2D(landmarks[LANDMARK.leftShoulder], landmarks[LANDMARK.rightShoulder]);
  return { value: width >= BIOMECHANICS_CONFIG.minShoulderWidth ? width : null, confidence: quality.confidence };
}

export function getHeadReference(landmarks: PoseLandmark[]): { position?: Point2D; source?: 'ears' | 'nose'; confidence: number } {
  const ears = validateLandmarks(landmarks, [
    { index: LANDMARK.leftEar, label: 'Left ear' },
    { index: LANDMARK.rightEar, label: 'Right ear' },
  ]);
  if (ears.usable) return { position: midpoint(landmarks[LANDMARK.leftEar], landmarks[LANDMARK.rightEar]), source: 'ears', confidence: ears.confidence };
  const nose = validateLandmarks(landmarks, [{ index: LANDMARK.nose, label: 'Nose' }]);
  if (nose.usable) return { position: landmarks[LANDMARK.nose], source: 'nose', confidence: nose.confidence };
  return { confidence: Math.max(ears.confidence, nose.confidence) };
}

export function getBowHandPosition(landmarks: PoseLandmark[], handedness: ArcherHandedness): { position?: Point2D; confidence: number } {
  const bowSide = getBowSide(handedness);
  const index = bowSide === 'left' ? LANDMARK.leftWrist : LANDMARK.rightWrist;
  const quality = validateLandmarks(landmarks, [{ index, label: 'Bow wrist' }]);
  return quality.usable ? { position: landmarks[index], confidence: quality.confidence } : { confidence: quality.confidence };
}

export function createInstantaneousBiomechanics(pose: PoseResult, handedness: ArcherHandedness): InstantaneousBiomechanics {
  const shoulderLine = calculateShoulderLineAngle(pose.landmarks);
  const bowArmElbow = calculateBowArmElbowAngle(pose.landmarks, pose.worldLandmarks, handedness);
  const torsoLean = calculateTorsoLean(pose.landmarks);
  const shoulderWidth = getShoulderWidth(pose.landmarks);
  const head = getHeadReference(pose.landmarks);
  const bowHand = getBowHandPosition(pose.landmarks, handedness);
  return {
    shoulderLine,
    bowArmElbow,
    torsoLean,
    normalizedLandmarks: pose.landmarks,
    frame: {
      timestampMs: pose.timestamp,
      shoulderLineAngleDeg: shoulderLine.rawValue,
      bowArmElbowAngleDeg: bowArmElbow.rawValue,
      torsoLeanDeg: torsoLean.rawValue,
      headPosition: head.position,
      headReference: head.source,
      bowHandPosition: bowHand.position,
      shoulderWidth: shoulderWidth.value ?? undefined,
      confidence: Math.min(shoulderLine.confidence, bowArmElbow.confidence, torsoLean.confidence, head.confidence, bowHand.confidence, shoulderWidth.confidence),
      shoulderLineConfidence: shoulderLine.confidence,
      headConfidence: Math.min(head.confidence, shoulderWidth.confidence),
      bowHandConfidence: Math.min(bowHand.confidence, shoulderWidth.confidence),
      shoulderWidthConfidence: shoulderWidth.confidence,
    },
  };
}
