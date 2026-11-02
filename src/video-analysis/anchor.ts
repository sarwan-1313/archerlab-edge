/**
 * Anchor detail from MediaPipe Face Landmarker + Hand Landmarker, run only on the frames of each shot's
 * anchor window (see browser/anchorDetail.ts). Pure geometry, so it is unit-tested with synthetic landmarks.
 *
 * Everything is measured in a face-aligned frame, in face heights (forehead to chin), so it does not depend on
 * how far the archer stands from the camera or how the head is tilted:
 *  - origin: the chin;
 *  - y: up the face, toward the forehead;
 *  - x: across the face, positive toward the side the draw hand is on.
 */
import type { AnchorFaceSummary, AnchorObservation } from './types';

export interface Point2 { x: number; y: number }

/** Face Landmarker (478-point face mesh) indices used here. */
export const FACE_POINTS = { forehead: 10, chin: 152, noseTip: 1, mouthCornerA: 61, mouthCornerB: 291, cheekA: 234, cheekB: 454 } as const;
/** Hand Landmarker (21-point hand) index of the index fingertip. */
export const INDEX_TIP = 8;

export const ANCHOR_CONFIG = {
  /** A fingertip further than this from the chin is not at the face (face heights). */
  maxReachFh: 1.4,
  /** Frames a shot needs before its anchor point is reported. */
  minFrames: 2,
  /** Frames per second sampled in each anchor window. */
  sampleFps: 8,
  /** Longest stretch of each anchor window that is sampled, ending just before release (seconds). */
  maxWindowS: 1.5,
} as const;

const sub = (a: Point2, b: Point2): Point2 => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Point2, b: Point2) => a.x * b.x + a.y * b.y;
const length = (a: Point2) => Math.hypot(a.x, a.y);
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export interface AnchorFrameInput {
  t: number;
  /** Face landmarks, normalised image coordinates (0–1); null when no face was found. */
  face: Point2[] | null;
  /** Each detected hand's landmarks, normalised image coordinates. */
  hands: Point2[][];
  /** Frame width ÷ height, so x and y distances compare in the same units. */
  aspect: number;
}

/**
 * Where the draw hand's index fingertip sits on the face in one frame, or null when there is no face, no hand
 * near it, or the face is too small to measure.
 */
export function anchorObservation({ t, face, hands, aspect }: AnchorFrameInput): AnchorObservation | null {
  if (!face || face.length <= FACE_POINTS.cheekB || !hands.length) return null;
  const at = (index: number): Point2 => ({ x: face[index].x * aspect, y: face[index].y });
  const chin = at(FACE_POINTS.chin);
  const forehead = at(FACE_POINTS.forehead);
  const faceHeight = length(sub(forehead, chin));
  if (faceHeight < 1e-3) return null;

  // The draw hand is the one whose index fingertip is closest to the chin.
  const tips = hands.filter((hand) => hand.length > INDEX_TIP).map((hand) => ({ x: hand[INDEX_TIP].x * aspect, y: hand[INDEX_TIP].y }));
  if (!tips.length) return null;
  const tip = tips.reduce((best, candidate) => (length(sub(candidate, chin)) < length(sub(best, chin)) ? candidate : best));
  if (length(sub(tip, chin)) / faceHeight > ANCHOR_CONFIG.maxReachFh) return null;

  const up = { x: (forehead.x - chin.x) / faceHeight, y: (forehead.y - chin.y) / faceHeight };
  let across = { x: -up.y, y: up.x };
  const cornerA = at(FACE_POINTS.mouthCornerA);
  const cornerB = at(FACE_POINTS.mouthCornerB);
  const nearCorner = length(sub(tip, cornerA)) <= length(sub(tip, cornerB)) ? cornerA : cornerB;
  // x is positive toward the draw-hand side: the mouth corner nearest the fingertip.
  if (dot(sub(nearCorner, chin), across) < 0) across = { x: -across.x, y: -across.y };

  const relative = sub(tip, chin);
  const nose = at(FACE_POINTS.noseTip);
  const cheekA = at(FACE_POINTS.cheekA);
  const cheekB = at(FACE_POINTS.cheekB);
  const nearCheek = nearCorner === cornerA ? cheekA : cheekB;
  const farCheek = nearCorner === cornerA ? cheekB : cheekA;
  // When the head turns away, the draw-side cheek comes closer to the nose in the image; that side of the
  // face is then hidden and its landmarks are guesses. Frontal or draw side toward the camera → 1.
  const near = length(sub(nearCheek, nose));
  const far = length(sub(farCheek, nose));
  const visibility = near + far > 0 ? clamp01((2 * near) / (near + far)) : 0;

  return {
    t,
    x: dot(relative, across) / faceHeight,
    y: dot(relative, up) / faceHeight,
    toChin: length(relative) / faceHeight,
    toMouthCorner: length(sub(tip, nearCorner)) / faceHeight,
    toNose: length(sub(tip, nose)) / faceHeight,
    visibility,
  };
}

/** One shot's anchor point: the median over the frames sampled in its anchor window. */
export function summarizeShotAnchor(observations: readonly AnchorObservation[]): AnchorFaceSummary | null {
  if (observations.length < ANCHOR_CONFIG.minFrames) return null;
  const meanVisibility = observations.reduce((sum, item) => sum + item.visibility, 0) / observations.length;
  const pick = (key: 'x' | 'y' | 'toChin' | 'toMouthCorner' | 'toNose') => median(observations.map((item) => item[key]));
  const x = pick('x');
  const y = pick('y');
  return {
    x,
    y,
    toChin: pick('toChin'),
    toMouthCorner: pick('toMouthCorner'),
    toNose: pick('toNose'),
    // How far the fingertip wanders within this one anchor.
    wobble: median(observations.map((item) => Math.hypot(item.x - x, item.y - y))),
    frames: observations.length,
    confidence: clamp01(meanVisibility * Math.min(1, observations.length / 6)),
  };
}

/** The reference the fingertip rests against: the nearer of the chin and the mouth corner (face heights). */
export function contactDistance(summary: AnchorFaceSummary): number {
  return Math.min(summary.toChin, summary.toMouthCorner);
}

/** Spread of the anchor point across shots: mean distance from their centre (face heights), or null below 2 shots. */
export function anchorFaceSpread(points: ReadonlyArray<Pick<AnchorFaceSummary, 'x' | 'y'>>): number | null {
  if (points.length < 2) return null;
  const centre = { x: points.reduce((sum, p) => sum + p.x, 0) / points.length, y: points.reduce((sum, p) => sum + p.y, 0) / points.length };
  return points.reduce((sum, p) => sum + Math.hypot(p.x - centre.x, p.y - centre.y), 0) / points.length;
}

/** A shot's anchor window: from anchor (at most 1.5 s back) to just before release. */
export function anchorWindow(shot: { anchorStart: number | null; release: number }): { start: number; end: number } {
  const end = shot.release - 0.05;
  return { start: Math.max(shot.anchorStart ?? end - ANCHOR_CONFIG.maxWindowS, end - ANCHOR_CONFIG.maxWindowS), end };
}

/** The frames to sample in each shot's anchor window. */
export function anchorSampleTimes(shots: ReadonlyArray<{ anchorStart: number | null; release: number }>, fps: number = ANCHOR_CONFIG.sampleFps): number[][] {
  return shots.map((shot) => {
    const { start, end } = anchorWindow(shot);
    if (end <= start) return [];
    const times: number[] = [];
    for (let t = start; t <= end + 1e-9; t += 1 / fps) times.push(Number(t.toFixed(3)));
    return times;
  });
}
