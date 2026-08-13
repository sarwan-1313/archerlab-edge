import { FilesetResolver, HandLandmarker, type HandLandmarkerResult, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import { GESTURE_CONFIG } from '../gesture-entry/config';
import { countRaisedFingers } from '../gesture-entry/fingerCounting';
import type { DetectedHand, HandLandmarkPoint } from '../types/gestureScore';

let promise: Promise<HandLandmarker> | null = null;
async function create(): Promise<HandLandmarker> {
  const vision = await FilesetResolver.forVisionTasks(GESTURE_CONFIG.wasmRoot);
  return HandLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: GESTURE_CONFIG.modelAssetPath, delegate: 'CPU' }, runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: GESTURE_CONFIG.minHandConfidence, minHandPresenceConfidence: GESTURE_CONFIG.minHandConfidence, minTrackingConfidence: GESTURE_CONFIG.minHandConfidence });
}
export function getHandLandmarker(): Promise<HandLandmarker> { if (!promise) promise = create().catch((error) => { promise = null; throw error; }); return promise; }
function copy(point: NormalizedLandmark): HandLandmarkPoint { return { x: point.x, y: point.y, z: point.z }; }
export function toDetectedHands(result: HandLandmarkerResult): DetectedHand[] {
  return result.landmarks.map((landmarks, index) => {
    const points = landmarks.map(copy); const category = result.handedness[index]?.[0];
    const handedness = category?.categoryName === 'Left' || category?.categoryName === 'Right' ? category.categoryName : 'Unknown';
    return { handedness, confidence: category?.score ?? 0, landmarks: points, fingerCount: countRaisedFingers(points) ?? -1 };
  });
}
