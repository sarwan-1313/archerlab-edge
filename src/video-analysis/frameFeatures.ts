import { VIDEO_CONFIG } from './config';
import type { BodySideName, FrameFeatures, PoseSample, Vec2, Vec3 } from './types';
import { angle3, dist2, dist3, jointAngle3, mid2, mid3, norm3, scale3, sub3 } from './vec';

/** MediaPipe Pose landmark indices used by the video engine. */
export const LM = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
} as const;

export const LANDMARK_COUNT = 33;
const QUALITY_LANDMARKS: number[] = [LM.nose, LM.leftShoulder, LM.rightShoulder, LM.leftElbow, LM.rightElbow, LM.leftWrist, LM.rightWrist, LM.leftHip, LM.rightHip];

export function visibilityAt(image: Float32Array, index: number): number {
  const value = image[index * 4 + 3];
  return Number.isFinite(value) ? value : 0;
}

/** Aspect-corrected 2D point (x scaled by width/height so both axes share units), or undefined if not visible. */
export function imagePoint(image: Float32Array, index: number, aspect: number, minVisibility: number = VIDEO_CONFIG.minLandmarkVisibility): Vec2 | undefined {
  if (visibilityAt(image, index) < minVisibility) return undefined;
  const x = image[index * 4];
  const y = image[index * 4 + 1];
  return Number.isFinite(x) && Number.isFinite(y) ? { x: x * aspect, y } : undefined;
}

export function worldPoint(world: Float32Array, image: Float32Array, index: number, minVisibility: number = VIDEO_CONFIG.minLandmarkVisibility): Vec3 | undefined {
  if (visibilityAt(image, index) < minVisibility) return undefined;
  const x = world[index * 3];
  const y = world[index * 3 + 1];
  const z = world[index * 3 + 2];
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? { x, y, z } : undefined;
}

export function sampleQuality(image: Float32Array | null): number {
  if (!image) return 0;
  return QUALITY_LANDMARKS.reduce((sum, index) => sum + visibilityAt(image, index), 0) / QUALITY_LANDMARKS.length;
}

function sideIndices(side: BodySideName) {
  return side === 'left'
    ? { shoulder: LM.leftShoulder, elbow: LM.leftElbow, wrist: LM.leftWrist, ear: LM.leftEar }
    : { shoulder: LM.rightShoulder, elbow: LM.rightElbow, wrist: LM.rightWrist, ear: LM.rightEar };
}

const UP: Vec3 = { x: 0, y: -1, z: 0 };

function emptyFeatures(t: number, quality: number): FrameFeatures {
  return {
    t, tracked: false, quality, has3d: false,
    torso2: null, viewRatio: null, sw3: null,
    span: null, faceProx: null, bowArmElevation: null,
    bowElbowAngle: null, drawForearmAlignment: null, shoulderAlignment: null,
    bowShoulderRise: null, torsoLean: null, torsoLeanDirection: 0,
  };
}

/**
 * Turns one pose sample into archery measurements. 3D quantities use MediaPipe's
 * world landmarks, which are roughly independent of where the camera stands; that
 * is what lets one engine read clips filmed from the side, the front or an angle.
 */
export function computeFrameFeatures(sample: PoseSample, aspect: number, drawSide: BodySideName): FrameFeatures {
  const quality = sampleQuality(sample.image);
  const features = emptyFeatures(sample.t, quality);
  const image = sample.image;
  if (!image || quality < VIDEO_CONFIG.minTrackedQuality) return features;
  features.tracked = true;

  const bow = sideIndices(drawSide === 'right' ? 'left' : 'right');
  const draw = sideIndices(drawSide);

  // ---- 2D (aspect-corrected image space) ----
  const leftShoulder2 = imagePoint(image, LM.leftShoulder, aspect);
  const rightShoulder2 = imagePoint(image, LM.rightShoulder, aspect);
  const leftHip2 = imagePoint(image, LM.leftHip, aspect);
  const rightHip2 = imagePoint(image, LM.rightHip, aspect);
  const nose2 = imagePoint(image, LM.nose, aspect);
  const leftEar2 = imagePoint(image, LM.leftEar, aspect);
  const rightEar2 = imagePoint(image, LM.rightEar, aspect);
  features.head2 = nose2 ?? (leftEar2 && rightEar2 ? mid2(leftEar2, rightEar2) : leftEar2 ?? rightEar2);
  features.bowWrist2 = imagePoint(image, bow.wrist, aspect);
  features.drawWrist2 = imagePoint(image, draw.wrist, aspect);
  if (leftShoulder2 && rightShoulder2) features.shoulderMid2 = mid2(leftShoulder2, rightShoulder2);
  if (leftHip2 && rightHip2) features.hipMid2 = mid2(leftHip2, rightHip2);
  if (features.shoulderMid2 && features.hipMid2) {
    const torso = dist2(features.shoulderMid2, features.hipMid2);
    if (torso > 1e-4) {
      features.torso2 = torso;
      if (leftShoulder2 && rightShoulder2) features.viewRatio = dist2(leftShoulder2, rightShoulder2) / torso;
    }
  }

  // ---- 3D (world landmarks, metres) ----
  const world = sample.world;
  if (!world) return features;
  const bowShoulder = worldPoint(world, image, bow.shoulder);
  const drawShoulder = worldPoint(world, image, draw.shoulder);
  const bowElbow = worldPoint(world, image, bow.elbow);
  const drawElbow = worldPoint(world, image, draw.elbow);
  const bowWrist = worldPoint(world, image, bow.wrist);
  const drawWrist = worldPoint(world, image, draw.wrist);
  const nose = worldPoint(world, image, LM.nose);
  const leftEar = worldPoint(world, image, LM.leftEar);
  const rightEar = worldPoint(world, image, LM.rightEar);
  const leftHip = worldPoint(world, image, LM.leftHip, 0.2);
  const rightHip = worldPoint(world, image, LM.rightHip, 0.2);
  const head = nose ?? (leftEar && rightEar ? mid3(leftEar, rightEar) : undefined);
  if (!bowShoulder || !drawShoulder) return features;
  const sw = dist3(bowShoulder, drawShoulder);
  if (!(sw > 0.05)) return features;
  features.has3d = true;
  features.sw3 = sw;
  features.head3 = head;
  features.bowWrist3 = bowWrist;
  features.drawWrist3 = drawWrist;
  features.bowShoulder3 = bowShoulder;

  features.bowShoulderRise = (drawShoulder.y - bowShoulder.y) / sw;
  if (bowElbow && bowWrist) features.bowElbowAngle = jointAngle3(bowShoulder, bowElbow, bowWrist);
  if (bowWrist) features.bowArmElevation = (bowShoulder.y - bowWrist.y) / sw;
  if (bowWrist && drawWrist) {
    features.span = dist3(bowWrist, drawWrist) / sw;
    const arrow = sub3(bowWrist, drawWrist);
    if (drawElbow) features.drawForearmAlignment = angle3(sub3(drawWrist, drawElbow), arrow);
    features.shoulderAlignment = angle3(sub3(bowShoulder, drawShoulder), arrow);
  }
  if (drawWrist && head) {
    features.faceProx = dist3(drawWrist, head) / sw;
    features.anchorVector = scale3(sub3(drawWrist, head), 1 / sw);
  }

  const hipMid = leftHip && rightHip ? mid3(leftHip, rightHip) : { x: 0, y: 0, z: 0 };
  const torso = sub3(mid3(bowShoulder, drawShoulder), hipMid);
  features.torsoLean = angle3(torso, UP);
  const targetward = bowWrist && drawWrist ? norm3({ x: bowWrist.x - drawWrist.x, y: 0, z: bowWrist.z - drawWrist.z }) : null;
  const horizontal = { x: torso.x, y: 0, z: torso.z };
  if (targetward && Math.hypot(horizontal.x, horizontal.z) > 0.01) {
    features.torsoLeanDirection = Math.sign(horizontal.x * targetward.x + horizontal.z * targetward.z);
  }
  return features;
}
