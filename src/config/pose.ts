const appBase = import.meta.env.BASE_URL.replace(/\/$/, '');

export const POSE_CONFIG = {
  wasmRoot: `${appBase}/mediapipe/wasm`,
  modelAssetPath: `${appBase}/models/pose_landmarker_lite.task`,
  modelSource: 'Google MediaPipe Pose Landmarker Lite (float16)',
  numPoses: 1,
  minPoseDetectionConfidence: 0.5,
  minPosePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
  landmarkVisibilityThreshold: 0.55,
  lowVisibilityThreshold: 0.62,
  targetInferenceFps: 20,
  uiUpdateIntervalMs: 160,
} as const;

