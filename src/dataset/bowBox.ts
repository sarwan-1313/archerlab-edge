import type { ArcherHandedness } from '../types/biomechanics';
import { LM, visibilityAt } from '../video-analysis/frameFeatures';
import type { PoseSample } from '../video-analysis/types';
import { DATASET_CONFIG } from './config';
import type { PixelBox } from './types';

/** Bow-hand wrist, pinky, index and thumb landmarks; the bow hand is the one that does not draw. */
function bowHandIndices(handedness: ArcherHandedness): number[] {
  return handedness === 'left' ? [LM.rightWrist, 18, 20, 22] : [LM.leftWrist, 17, 19, 21];
}

/**
 * A rough bow box centred on the bow hand, sized from the torso so it scales
 * with distance to the camera: tall and narrow, like a bow held upright. It is
 * only a starting point for the labeller, not a detection.
 */
export function suggestBowBox(image: Float32Array, handedness: ArcherHandedness, width: number, height: number): PixelBox | null {
  const { minVisibility } = DATASET_CONFIG.bowBox;
  const point = (index: number) => visibilityAt(image, index) >= minVisibility ? { x: image[index * 4] * width, y: image[index * 4 + 1] * height } : null;
  const hand = bowHandIndices(handedness).map(point).filter((p): p is { x: number; y: number } => p !== null);
  const shoulders = [point(LM.leftShoulder), point(LM.rightShoulder)];
  const hips = [point(LM.leftHip), point(LM.rightHip)];
  if (hand.length === 0 || shoulders.some((p) => !p) || hips.some((p) => !p)) return null;
  const [ls, rs] = shoulders as Array<{ x: number; y: number }>;
  const [lh, rh] = hips as Array<{ x: number; y: number }>;
  const torso = Math.hypot((ls.x + rs.x - lh.x - rh.x) / 2, (ls.y + rs.y - lh.y - rh.y) / 2);
  if (!(torso > 1)) return null;
  const cx = hand.reduce((sum, p) => sum + p.x, 0) / hand.length;
  const cy = hand.reduce((sum, p) => sum + p.y, 0) / hand.length;
  const boxWidth = torso * DATASET_CONFIG.bowBox.width;
  const boxHeight = torso * DATASET_CONFIG.bowBox.height;
  return clampBox({ x: cx - boxWidth / 2, y: cy - boxHeight / 2, width: boxWidth, height: boxHeight }, width, height);
}

/** Clips a box to the image; null when nothing is left. */
export function clampBox(box: PixelBox, width: number, height: number): PixelBox | null {
  const x0 = Math.max(0, Math.min(box.x, box.x + box.width));
  const y0 = Math.max(0, Math.min(box.y, box.y + box.height));
  const x1 = Math.min(width, Math.max(box.x, box.x + box.width));
  const y1 = Math.min(height, Math.max(box.y, box.y + box.height));
  if (x1 - x0 < 1 || y1 - y0 < 1) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** The pose sample nearest to `t`, if one lies within `maxGapS`. Samples are sorted by time. */
export function nearestSample(samples: readonly PoseSample[], t: number, maxGapS: number = DATASET_CONFIG.maxPoseGapS): PoseSample | null {
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  let best: PoseSample | null = null;
  for (const index of [lo - 1, lo]) {
    const sample = samples[index];
    if (sample?.image && Math.abs(sample.t - t) <= maxGapS && (!best || Math.abs(sample.t - t) < Math.abs(best.t - t))) best = sample;
  }
  return best;
}
