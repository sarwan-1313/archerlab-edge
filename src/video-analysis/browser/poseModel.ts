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

/** Whether the service worker already holds this file, which is the only way it can load offline. */
async function isCached(url: string): Promise<boolean> {
  try {
    return typeof caches !== 'undefined' && Boolean(await caches.match(url));
  } catch {
    return false;
  }
}

/**
 * Which pose models can be used. public/models/models.json lists the ones deployed (the lite model always
 * ships); `npm run models:pose` downloads the larger ones and updates the list. Reading a manifest avoids
 * probing for missing files.
 *
 * Offline, only models already on this device count: Lite is installed with the app, while Full and Heavy
 * are cached the first time they are used online. Without this, the preselected Full model would fail
 * to load on a device that has never used it.
 */
export async function availableModels(): Promise<PoseModelVariant[]> {
  let deployed: PoseModelVariant[] = ['lite'];
  try {
    const response = await fetch(`${appBase}/models/models.json`, { cache: 'no-cache' });
    if (response.ok) {
      const manifest = await response.json() as { available?: unknown };
      const listed = Array.isArray(manifest.available) ? manifest.available : [];
      deployed = (['lite', 'full', 'heavy'] as const).filter((variant) => variant === 'lite' || listed.includes(variant));
    }
  } catch { /* Only the Lite model is certain. */ }
  if (typeof navigator === 'undefined' || navigator.onLine !== false) return deployed;
  const usable = await Promise.all(deployed.map(async (variant) => variant === 'lite' || await isCached(MODEL_PATHS[variant])));
  return deployed.filter((_, index) => usable[index]);
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
