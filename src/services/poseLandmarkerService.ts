import {
  FilesetResolver,
  PoseLandmarker,
  type Landmark,
  type NormalizedLandmark,
  type PoseLandmarkerResult,
} from '@mediapipe/tasks-vision';
import { POSE_CONFIG } from '../config/pose';
import type { PoseConnection, PoseLandmark, PoseResult } from '../types/pose';
import { aggregatePoseVisibility } from '../utils/poseAnalysis';

let poseLandmarkerPromise: Promise<PoseLandmarker> | null = null;
let poseLandmarkerReady = false;

export const POSE_CONNECTIONS: PoseConnection[] = PoseLandmarker.POSE_CONNECTIONS.map(({ start, end }) => ({ start, end }));

function copyLandmark(landmark: NormalizedLandmark | Landmark): PoseLandmark {
  const presence = (landmark as NormalizedLandmark & { presence?: number }).presence;
  return {
    x: landmark.x,
    y: landmark.y,
    z: landmark.z,
    visibility: landmark.visibility,
    ...(typeof presence === 'number' ? { presence } : {}),
  };
}

async function createPoseLandmarker(): Promise<PoseLandmarker> {
  if (typeof WebAssembly === 'undefined') {
    throw new Error('This browser does not support the WebAssembly runtime required for pose tracking.');
  }

  const vision = await FilesetResolver.forVisionTasks(POSE_CONFIG.wasmRoot);
  const landmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: POSE_CONFIG.modelAssetPath,
      delegate: 'CPU',
    },
    runningMode: 'VIDEO',
    numPoses: POSE_CONFIG.numPoses,
    minPoseDetectionConfidence: POSE_CONFIG.minPoseDetectionConfidence,
    minPosePresenceConfidence: POSE_CONFIG.minPosePresenceConfidence,
    minTrackingConfidence: POSE_CONFIG.minTrackingConfidence,
    outputSegmentationMasks: false,
  });

  poseLandmarkerReady = true;
  return landmarker;
}

export function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (!poseLandmarkerPromise) {
    poseLandmarkerPromise = createPoseLandmarker().catch((error: unknown) => {
      poseLandmarkerPromise = null;
      poseLandmarkerReady = false;
      throw error;
    });
  }
  return poseLandmarkerPromise;
}

export function isPoseLandmarkerReady(): boolean {
  return poseLandmarkerReady;
}

export function toPoseResult(result: PoseLandmarkerResult, timestamp: number): PoseResult {
  const landmarks = (result.landmarks[0] ?? []).map(copyLandmark);
  const worldLandmarks = (result.worldLandmarks[0] ?? []).map(copyLandmark);
  return {
    landmarks,
    worldLandmarks,
    timestamp,
    athleteDetected: landmarks.length >= 33,
    averageVisibility: aggregatePoseVisibility(landmarks),
  };
}

export function getPoseErrorMessage(error: unknown): string {
  if (error instanceof Error && /fetch|network|model/i.test(error.message)) {
    return 'The on-device pose model could not be loaded. Check the model assets and try again.';
  }
  if (error instanceof Error && /wasm|webassembly/i.test(error.message)) {
    return 'The on-device pose runtime is unavailable in this browser.';
  }
  return 'On-device pose tracking could not start. The camera remains available.';
}

