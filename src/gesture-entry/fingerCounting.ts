import { distance2D } from '../biomechanics/geometry';
import type { HandLandmarkPoint } from '../types/gestureScore';
import { GESTURE_CONFIG } from './config';

const FINGERS = [[4, 3], [8, 6], [12, 10], [16, 14], [20, 18]] as const;
export function countRaisedFingers(landmarks: readonly HandLandmarkPoint[]): number | null {
  if (landmarks.length < 21 || landmarks.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null;
  const wrist = landmarks[0];
  return FINGERS.reduce((count, [tip, joint]) => count + (distance2D(wrist, landmarks[tip]) > distance2D(wrist, landmarks[joint]) * GESTURE_CONFIG.fingerExtensionRatio ? 1 : 0), 0);
}
export function palmWidth(landmarks: readonly HandLandmarkPoint[]): number { return landmarks.length >= 18 ? distance2D(landmarks[5], landmarks[17]) : 0; }
