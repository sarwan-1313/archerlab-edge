import { VIDEO_CONFIG } from './config';
import { speedSeries, smoothVec2, smoothVec3, zeroPhaseSmooth, type Series } from './signal';
import type { FrameFeatures, Vec2, Vec3 } from './types';
import { dist2, sub2 } from './vec';

/**
 * Time-aligned, smoothed versions of every per-frame measurement. Segmentation
 * and shot metrics read from here so they always agree on the same signals.
 */
export interface FeatureTrack {
  times: number[];
  frames: FrameFeatures[];
  quality: number[];
  tracked: boolean[];
  span: Series;
  faceProx: Series;
  elevation: Series;
  span2: Series;
  faceProx2: Series;
  bowElbowAngle: Series;
  drawForearmAlignment: Series;
  shoulderAlignment: Series;
  bowShoulderRise: Series;
  torsoLean: Series;
  torso2: Series;
  /** Draw wrist relative to head, SW units — lightly smoothed so release spikes survive. */
  anchorVector: Array<Vec3 | undefined>;
  /** Smoothed anchor vector for steady-state measurements. */
  anchorVectorSmooth: Array<Vec3 | undefined>;
  /** Speed of the draw hand relative to the head, SW per second. */
  drawSpeed: Series;
  bowWrist3: Array<Vec3 | undefined>;
  sw3: Series;
  /** 2D positions relative to the hip midpoint (cancels camera shake), image heights. */
  bowWristRel2: Array<Vec2 | undefined>;
  headRel2: Array<Vec2 | undefined>;
  /** Draw wrist relative to the head in 2D, image heights. */
  drawRelHead2: Array<Vec2 | undefined>;
}

const pick = (frames: readonly FrameFeatures[], read: (frame: FrameFeatures) => number | null | undefined): Series =>
  frames.map((frame) => {
    if (!frame.tracked) return null;
    const value = read(frame);
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  });

export function buildFeatureTrack(frames: readonly FrameFeatures[]): FeatureTrack {
  const times = frames.map((frame) => frame.t);
  const smooth = VIDEO_CONFIG.smoothing;
  const light = { ...smooth, meanHalfWindowS: 0 };
  const s = (series: Series) => zeroPhaseSmooth(times, series, smooth);

  const span2Raw = pick(frames, (frame) => frame.drawWrist2 && frame.bowWrist2 && frame.torso2 ? dist2(frame.drawWrist2, frame.bowWrist2) / frame.torso2 : null);
  const face2Raw = pick(frames, (frame) => frame.drawWrist2 && frame.head2 && frame.torso2 ? dist2(frame.drawWrist2, frame.head2) / frame.torso2 : null);
  const anchorRaw = frames.map((frame) => (frame.tracked ? frame.anchorVector : undefined));
  const anchorVector = smoothVec3(times, anchorRaw, light);
  const rel = (read: (frame: FrameFeatures) => Vec2 | undefined) => frames.map((frame) => {
    const point = frame.tracked ? read(frame) : undefined;
    return point && frame.hipMid2 ? sub2(point, frame.hipMid2) : undefined;
  });

  return {
    times,
    frames: [...frames],
    quality: frames.map((frame) => frame.quality),
    tracked: frames.map((frame) => frame.tracked),
    span: s(pick(frames, (frame) => frame.span)),
    faceProx: s(pick(frames, (frame) => frame.faceProx)),
    elevation: s(pick(frames, (frame) => frame.bowArmElevation)),
    span2: s(span2Raw),
    faceProx2: s(face2Raw),
    bowElbowAngle: s(pick(frames, (frame) => frame.bowElbowAngle)),
    drawForearmAlignment: s(pick(frames, (frame) => frame.drawForearmAlignment)),
    shoulderAlignment: s(pick(frames, (frame) => frame.shoulderAlignment)),
    bowShoulderRise: s(pick(frames, (frame) => frame.bowShoulderRise)),
    torsoLean: s(pick(frames, (frame) => frame.torsoLean)),
    torso2: s(pick(frames, (frame) => frame.torso2)),
    anchorVector,
    anchorVectorSmooth: smoothVec3(times, anchorRaw, smooth),
    drawSpeed: speedSeries(times, anchorVector),
    bowWrist3: smoothVec3(times, frames.map((frame) => (frame.tracked ? frame.bowWrist3 : undefined)), smooth),
    sw3: s(pick(frames, (frame) => frame.sw3)),
    bowWristRel2: smoothVec2(times, rel((frame) => frame.bowWrist2), smooth),
    headRel2: smoothVec2(times, rel((frame) => frame.head2), smooth),
    drawRelHead2: smoothVec2(times, frames.map((frame) => (frame.tracked && frame.drawWrist2 && frame.head2 ? sub2(frame.drawWrist2, frame.head2) : undefined)), smooth),
  };
}
