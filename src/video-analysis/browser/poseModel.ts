import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { POSE_CONFIG } from '../../config/pose';
import type { PoseModelVariant } from '../types';

/**
 * The video engine uses its own pose-model instances (separate from the live
 * camera engine), created per analysis pass so tracking state never leaks
 * between clips. It prefers the GPU and falls back to the CPU.
 */

const appBase = import.meta.env.BASE_URL.replace(/\/$/, '');

export const MODEL_PATHS: Record<PoseModelVariant, string> = {
  lite: POSE_CONFIG.modelAssetPath,
  full: `${appBase}/models/pose_landmarker_full.task`,
  heavy: `${appBase}/models/pose_landmarker_heavy.task`,
};

export const MODEL_LABELS: Record<PoseModelVariant, string> = {
  lite: 'Lite (fastest, built in)',
  full: 'Full (more accurate)',
  heavy: 'Heavy (most accurate, slowest)',
};

let visionPromise: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null;

function vision() {
  if (!visionPromise) {
    visionPromise = FilesetResolver.forVisionTasks(POSE_CONFIG.wasmRoot).catch((error: unknown) => {
      visionPromise = null;
      throw error;
    });
  }
  return visionPromise;
}

/**
 * Which pose models are deployed. public/models/models.json lists them (the lite
 * model always ships); `npm run models:pose` downloads the larger ones and
 * updates the list. Reading a manifest avoids probing for missing files.
 */
export async function availableModels(): Promise<PoseModelVariant[]> {
  try {
    const response = await fetch(`${appBase}/models/models.json`, { cache: 'no-cache' });
    if (!response.ok) return ['lite'];
    const manifest = await response.json() as { available?: unknown };
    const listed = Array.isArray(manifest.available) ? manifest.available : [];
    return (['lite', 'full', 'heavy'] as const).filter((variant) => variant === 'lite' || listed.includes(variant));
  } catch {
    return ['lite'];
  }
}

export interface VideoPoseModel {
  landmarker: PoseLandmarker;
  delegate: 'GPU' | 'CPU';
  variant: PoseModelVariant;
}

export async function createVideoPoseModel(variant: PoseModelVariant, preferGpu = true): Promise<VideoPoseModel> {
  if (typeof WebAssembly === 'undefined') throw new Error('This browser does not support WebAssembly, which the pose model needs.');
  const fileset = await vision();
  const create = (delegate: 'GPU' | 'CPU') => PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_PATHS[variant], delegate },
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputSegmentationMasks: false,
  });
  if (preferGpu) {
    try {
      return { landmarker: await create('GPU'), delegate: 'GPU', variant };
    } catch (error) {
      console.warn('GPU pose model unavailable, using CPU.', error);
    }
  }
  return { landmarker: await create('CPU'), delegate: 'CPU', variant };
}
