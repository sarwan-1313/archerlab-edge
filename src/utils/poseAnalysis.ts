import { POSE_CONFIG } from '../config/pose';
import type { CalibrationReadiness, PoseDetectionState, PoseLandmark, PoseResult } from '../types/pose';

export const POSE_LANDMARK_INDEX = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

const shoulders = [POSE_LANDMARK_INDEX.leftShoulder, POSE_LANDMARK_INDEX.rightShoulder];
const arms = [
  ...shoulders,
  POSE_LANDMARK_INDEX.leftElbow,
  POSE_LANDMARK_INDEX.rightElbow,
  POSE_LANDMARK_INDEX.leftWrist,
  POSE_LANDMARK_INDEX.rightWrist,
];
const hips = [POSE_LANDMARK_INDEX.leftHip, POSE_LANDMARK_INDEX.rightHip];
const lowerBody = [
  ...hips,
  POSE_LANDMARK_INDEX.leftKnee,
  POSE_LANDMARK_INDEX.rightKnee,
  POSE_LANDMARK_INDEX.leftAnkle,
  POSE_LANDMARK_INDEX.rightAnkle,
];
const fullBody = [...shoulders, ...lowerBody];

export function aggregatePoseVisibility(landmarks: PoseLandmark[]): number {
  const visibilityValues = landmarks
    .map((landmark) => landmark.visibility)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  if (visibilityValues.length === 0) return 0;
  return visibilityValues.reduce((sum, value) => sum + value, 0) / visibilityValues.length;
}

function landmarksVisible(landmarks: PoseLandmark[], indices: number[], threshold: number): boolean {
  return indices.every((index) => (landmarks[index]?.visibility ?? 0) >= threshold);
}

export function getCalibrationReadiness(
  landmarks: PoseLandmark[],
  cameraActive: boolean,
  visibilityThreshold = POSE_CONFIG.landmarkVisibilityThreshold,
): CalibrationReadiness {
  const athlete = landmarks.length >= 33;
  const shouldersVisible = athlete && landmarksVisible(landmarks, shoulders, visibilityThreshold);
  const armsVisible = athlete && landmarksVisible(landmarks, arms, visibilityThreshold);
  const lowerBodyVisible = athlete && landmarksVisible(landmarks, lowerBody, visibilityThreshold);
  const upperBodyVisible = athlete && landmarksVisible(landmarks, [...shoulders, ...hips], visibilityThreshold);
  const fullBodyVisible = athlete && landmarksVisible(landmarks, fullBody, visibilityThreshold);

  return {
    camera: cameraActive,
    athlete,
    shoulders: shouldersVisible,
    arms: armsVisible,
    lowerBody: lowerBodyVisible,
    upperBody: upperBodyVisible,
    fullBody: fullBodyVisible,
    ready: cameraActive && athlete && shouldersVisible && armsVisible && lowerBodyVisible,
  };
}

export function getPoseDetectionState(
  result: PoseResult | null,
  lowVisibilityThreshold = POSE_CONFIG.lowVisibilityThreshold,
): PoseDetectionState {
  if (!result?.athleteDetected) return 'no-athlete';
  return result.averageVisibility < lowVisibilityThreshold ? 'low-visibility' : 'athlete-detected';
}

