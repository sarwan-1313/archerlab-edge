import type { ScoringScheme } from '../types/gestureScore';
const appBase = import.meta.env.BASE_URL.replace(/\/$/, '');
export const DEFAULT_SCORING_SCHEME: ScoringScheme = { minScore: 0, maxScore: 10, supportsX: true, missScore: 0 };
export const GESTURE_CONFIG = {
  wasmRoot: `${appBase}/mediapipe/wasm`, modelAssetPath: `${appBase}/models/hand_landmarker.task`,
  targetInferenceFps: 12, entryTimeoutMs: 10_000, holdMs: 800, confirmationMs: 1500,
  minHandConfidence: 0.55, fingerExtensionRatio: 1.12, crossedWristPalmRatio: 0.75,
  minCorrelationShots: 5,
  modelSource: 'Google MediaPipe Hand Landmarker (float16)',
} as const;
