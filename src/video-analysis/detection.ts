import { VIDEO_CONFIG } from './config';
import { LM, imagePoint, sampleQuality, worldPoint } from './frameFeatures';
import { median, percentile } from './signal';
import type { FrameFeatures, HandednessDetection, PoseSample, ViewDetection } from './types';
import { dist2, dist3, mid2 } from './vec';

/**
 * Works out which hand draws the string: at full draw the drawing hand sits at
 * the face while the bow hand is an arm's length away. This also copes with
 * mirrored selfie footage, because it only cares which landmark set behaves
 * like a drawing arm.
 */
export function detectDrawSide(samples: readonly PoseSample[], aspect: number): HandednessDetection {
  let left = 0;
  let right = 0;
  for (const sample of samples) {
    const image = sample.image;
    if (!image || sampleQuality(image) < VIDEO_CONFIG.minTrackedQuality) continue;
    let leftNear: number | null = null;
    let rightNear: number | null = null;
    let shoulderWidth: number | null = null;
    if (sample.world) {
      const ls = worldPoint(sample.world, image, LM.leftShoulder);
      const rs = worldPoint(sample.world, image, LM.rightShoulder);
      const nose = worldPoint(sample.world, image, LM.nose);
      const lw = worldPoint(sample.world, image, LM.leftWrist);
      const rw = worldPoint(sample.world, image, LM.rightWrist);
      if (ls && rs && nose && lw && rw) {
        shoulderWidth = dist3(ls, rs);
        leftNear = dist3(lw, nose);
        rightNear = dist3(rw, nose);
      }
    }
    if (leftNear === null || rightNear === null || !shoulderWidth) {
      const ls = imagePoint(image, LM.leftShoulder, aspect);
      const rs = imagePoint(image, LM.rightShoulder, aspect);
      const lh = imagePoint(image, LM.leftHip, aspect);
      const rh = imagePoint(image, LM.rightHip, aspect);
      const nose = imagePoint(image, LM.nose, aspect);
      const lw = imagePoint(image, LM.leftWrist, aspect);
      const rw = imagePoint(image, LM.rightWrist, aspect);
      if (!ls || !rs || !lh || !rh || !nose || !lw || !rw) continue;
      // In 2D, normalise by torso length, which does not collapse when the camera looks down the line.
      shoulderWidth = dist2(mid2(ls, rs), mid2(lh, rh)) * 0.75;
      leftNear = dist2(lw, nose);
      rightNear = dist2(rw, nose);
    }
    const near = Math.min(leftNear, rightNear) / shoulderWidth;
    const far = Math.max(leftNear, rightNear) / shoulderWidth;
    if (near < 0.8 && far > 1.4) {
      if (leftNear < rightNear) left += 1;
      else right += 1;
    }
  }
  const votes = left + right;
  if (votes < 6) return { drawSide: null, confidence: 0, votes };
  const majority = Math.max(left, right) / votes;
  if (majority < 0.7) return { drawSide: null, confidence: majority, votes };
  return { drawSide: right >= left ? 'right' : 'left', confidence: majority, votes };
}

const VIEW_NOTES = {
  broadside: 'Filmed side-on to the shooting line: alignment, release and posture are all well measured.',
  oblique: 'Filmed at an angle: 3D measurements carry most of the analysis; side-on footage is still the most precise.',
  'down-the-line': 'Filmed along the shooting line (from behind or in front): elbow line and bow-arm checks are strong; draw-length and release travel are less certain.',
  unknown: 'Not enough clear frames to tell where the camera was.',
} as const;

/**
 * Classifies the camera angle from how wide the shoulders appear relative to the
 * torso. Side-on footage shows the full shoulder width; footage along the
 * shooting line shows the shoulders overlapping.
 */
export function detectCameraView(features: readonly FrameFeatures[], fullDrawMask?: readonly boolean[]): ViewDetection {
  const pick = (useMask: boolean) => features
    .filter((frame, index) => frame.tracked && frame.viewRatio !== null && (!useMask || fullDrawMask?.[index]))
    .map((frame) => frame.viewRatio as number);
  let ratios = fullDrawMask ? pick(true) : [];
  if (ratios.length < 5) ratios = pick(false);
  if (ratios.length < 5) return { kind: 'unknown', confidence: 0, ratio: null, note: VIEW_NOTES.unknown };
  const ratio = median(ratios);
  const spread = percentile(ratios, 0.75) - percentile(ratios, 0.25);
  const kind = ratio >= 0.5 ? 'broadside' : ratio >= 0.25 ? 'oblique' : 'down-the-line';
  const edge = kind === 'broadside' ? ratio - 0.5 : kind === 'oblique' ? Math.min(ratio - 0.25, 0.5 - ratio) : 0.25 - ratio;
  const confidence = Math.max(0.3, Math.min(1, 0.55 + edge * 2.5 - spread));
  return { kind, confidence, ratio, note: VIEW_NOTES[kind] };
}
