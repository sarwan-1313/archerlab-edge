import { FaceLandmarker, HandLandmarker } from '@mediapipe/tasks-vision';
import { anchorObservation, anchorSampleTimes, type Point2 } from '../anchor';
import type { AnchorObservation, PoseSample } from '../types';
import { seekTo } from './frameCapture';
import { vision } from './poseModel';

const appBase = import.meta.env.BASE_URL.replace(/\/$/, '');
const FACE_MODEL = `${appBase}/models/face_landmarker.task`;
const HAND_MODEL = `${appBase}/models/hand_landmarker.task`;

/** Side of the square head crop the face and hand models see, in pixels. */
const CROP_PX = 384;
/** Crop side in shoulder widths: the whole head with the draw hand at the face. */
const CROP_SHOULDER_WIDTHS = 2.2;

const NOSE = 0;
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;

export interface AnchorDetailOptions {
  video: HTMLVideoElement;
  samples: readonly PoseSample[];
  shots: ReadonlyArray<{ anchorStart: number | null; release: number }>;
  signal: AbortSignal;
  onProgress?: (fraction: number) => void;
}

function nearestSample(samples: readonly PoseSample[], t: number): PoseSample | null {
  let best: PoseSample | null = null;
  for (const sample of samples) {
    if (!sample.image) continue;
    if (!best || Math.abs(sample.t - t) < Math.abs(best.t - t)) best = sample;
  }
  return best && Math.abs(best.t - t) < 0.5 ? best : null;
}

/** A square around the head in video pixels, from the pose: centred on the nose, sized by the shoulders. */
function headCrop(sample: PoseSample, width: number, height: number): { x: number; y: number; side: number } | null {
  const image = sample.image;
  if (!image) return null;
  const point = (index: number) => ({ x: image[index * 4] * width, y: image[index * 4 + 1] * height, visibility: image[index * 4 + 3] });
  const nose = point(NOSE);
  const left = point(LEFT_SHOULDER);
  const right = point(RIGHT_SHOULDER);
  if (nose.visibility < 0.3) return null;
  const shoulderWidth = Math.hypot(left.x - right.x, left.y - right.y);
  // Side-on, the shoulders overlap in the image; the nose-to-shoulder distance still gives the scale.
  const scale = Math.max(shoulderWidth, Math.hypot(nose.x - (left.x + right.x) / 2, nose.y - (left.y + right.y) / 2) * 1.6);
  if (scale < 4) return null;
  const side = scale * CROP_SHOULDER_WIDTHS;
  return { x: nose.x - side / 2, y: nose.y - side / 2.4, side };
}

/**
 * Runs Face Landmarker and Hand Landmarker only on frames inside each shot's anchor window (a few per shot),
 * on a square crop around the head, and returns where the draw hand's index fingertip sits on the face.
 * Optional: any failure (model missing, browser without the task) returns no observations, and the report
 * simply has no face-based anchor metrics.
 */
export async function measureAnchorDetail({ video, samples, shots, signal, onProgress }: AnchorDetailOptions): Promise<AnchorObservation[]> {
  const times = anchorSampleTimes(shots).flat();
  if (!times.length) return [];
  let face: FaceLandmarker | null = null;
  let hands: HandLandmarker | null = null;
  try {
    const fileset = await vision();
    face = await FaceLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: FACE_MODEL, delegate: 'CPU' }, runningMode: 'IMAGE', numFaces: 1 });
    hands = await HandLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: HAND_MODEL, delegate: 'CPU' }, runningMode: 'IMAGE', numHands: 2 });
  } catch (error) {
    console.warn('Anchor detail skipped: the face or hand model could not be loaded.', error);
    face?.close();
    return [];
  }
  const canvas = document.createElement('canvas');
  canvas.width = CROP_PX;
  canvas.height = CROP_PX;
  const context = canvas.getContext('2d');
  const observations: AnchorObservation[] = [];
  try {
    if (!context) return [];
    for (let i = 0; i < times.length; i += 1) {
      if (signal.aborted) break;
      const t = times[i];
      onProgress?.(i / times.length);
      const sample = nearestSample(samples, t);
      const crop = sample ? headCrop(sample, video.videoWidth, video.videoHeight) : null;
      if (!crop) continue;
      await seekTo(video, t);
      context.fillStyle = '#000';
      context.fillRect(0, 0, CROP_PX, CROP_PX);
      context.drawImage(video, crop.x, crop.y, crop.side, crop.side, 0, 0, CROP_PX, CROP_PX);
      const faceResult = face.detect(canvas);
      const handResult = hands.detect(canvas);
      const facePoints: Point2[] | null = faceResult.faceLandmarks[0]?.map(({ x, y }) => ({ x, y })) ?? null;
      const handPoints: Point2[][] = handResult.landmarks.map((hand) => hand.map(({ x, y }) => ({ x, y })));
      // The crop is square, so x and y are already in the same units.
      const observation = anchorObservation({ t, face: facePoints, hands: handPoints, aspect: 1 });
      if (observation) observations.push(observation);
    }
    onProgress?.(1);
    return observations;
  } catch (error) {
    console.warn('Anchor detail stopped early.', error);
    return observations;
  } finally {
    face.close();
    hands.close();
  }
}
