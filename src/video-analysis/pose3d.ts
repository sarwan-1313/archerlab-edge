import type { ArcherHandedness } from '../types/biomechanics';
import { SKELETON } from './drawing';
import { LANDMARK_COUNT, LM, visibilityAt } from './frameFeatures';
import { indexAtTime } from './signal';
import type { PoseSample, Vec3 } from './types';

/**
 * Pure helpers for the 3D pose viewer. They work in "scene space": MediaPipe
 * world landmarks (metres, hip-centred, y down, z away from the camera) turned
 * 180° about x, so y is up and the original camera sits on +z. A turn keeps the
 * space right-handed, so left and right stay where the model put them.
 */

export type CameraPreset = 'side' | 'behind' | 'top';
export type BoneSide = 'bow' | 'draw' | 'body';

/** Same cut-off the 2D overlay uses for drawing a landmark. */
export const MIN_VISIBILITY = 0.35;
/** A sample further than this from the replay time is treated as "nobody tracked here". */
export const MAX_SAMPLE_GAP_S = 0.25;
/** The landmarks drawn as joints: the nose, then the body from the shoulders down. */
export const JOINT_LANDMARKS: readonly number[] = [LM.nose, ...Array.from({ length: LANDMARK_COUNT - LM.leftShoulder }, (_, index) => LM.leftShoulder + index)];

const FOOT_LANDMARKS = [27, 28, 29, 30, 31, 32];
const DEFAULT_FLOOR_Y = -0.9;
const UP: Vec3 = { x: 0, y: 1, z: 0 };

export interface ScenePose {
  /** Scene-space position of each of the 33 landmarks, or null when it is not visible enough to draw. */
  points: Array<Vec3 | null>;
}

/** Where the archer stands and which way they shoot, for the floor and the preset cameras. */
export interface SceneFrame {
  floorY: number;
  /** Mid-body point the cameras orbit around. */
  center: Vec3;
  /** Floor-plane unit vector from the draw hand toward the target. */
  forward: Vec3;
  /** Floor-plane unit vector, square to `forward`, on the side the archer's chest faces. */
  front: Vec3;
  /** Floor to top of the head, metres. */
  height: number;
}

export interface CameraPose {
  position: Vec3;
  target: Vec3;
}

export function hasWorldLandmarks(samples: readonly PoseSample[]): boolean {
  return samples.some((sample) => sample.world !== null);
}

/** One landmark in scene space, or null if its numbers are missing. */
export function scenePoint(world: Float32Array, index: number): Vec3 | null {
  const x = world[index * 3];
  const y = world[index * 3 + 1];
  const z = world[index * 3 + 2];
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? { x, y: -y, z: -z } : null;
}

export function scenePose(sample: PoseSample): ScenePose | null {
  const { world, image } = sample;
  if (!world) return null;
  const points = Array.from({ length: LANDMARK_COUNT }, (_, index) => (image && visibilityAt(image, index) < MIN_VISIBILITY ? null : scenePoint(world, index)));
  return { points };
}

/** The sample to show at replay time `t`, or null when nobody was tracked near that moment. */
export function sampleAtTime(samples: readonly PoseSample[], times: readonly number[], t: number): PoseSample | null {
  const sample = samples[indexAtTime(times, t)];
  if (!sample?.world || Math.abs(sample.t - t) > MAX_SAMPLE_GAP_S) return null;
  return sample;
}

/** Landmarks on each side of the body, by handedness (the draw hand). */
export function armLandmarks(handedness: ArcherHandedness) {
  const left = { shoulder: LM.leftShoulder, elbow: LM.leftElbow, wrist: LM.leftWrist, hand: [17, 19, 21] };
  const right = { shoulder: LM.rightShoulder, elbow: LM.rightElbow, wrist: LM.rightWrist, hand: [18, 20, 22] };
  return handedness === 'left' ? { bow: right, draw: left } : { bow: left, draw: right };
}

/** Bow arm, draw arm or the rest of the body, for each entry of SKELETON. */
export function boneSides(handedness: ArcherHandedness): BoneSide[] {
  const { bow, draw } = armLandmarks(handedness);
  const bowSet = new Set([bow.shoulder, bow.elbow, bow.wrist, ...bow.hand]);
  const drawSet = new Set([draw.shoulder, draw.elbow, draw.wrist, ...draw.hand]);
  return SKELETON.map(([a, b]) => (bowSet.has(a) && bowSet.has(b) ? 'bow' : drawSet.has(a) && drawSet.has(b) ? 'draw' : 'body'));
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function flatUnit(x: number, z: number): Vec3 | null {
  const length = Math.hypot(x, z);
  return length > 1e-6 ? { x: x / length, y: 0, z: z / length } : null;
}

/**
 * Finds the floor, the shooting direction and the archer's front from the whole
 * clip, so the preset cameras stay put while the replay moves.
 */
export function sceneFrame(samples: readonly PoseSample[], handedness: ArcherHandedness): SceneFrame {
  const { bow, draw } = armLandmarks(handedness);
  const floors: number[] = [];
  const heads: number[] = [];
  let armX = 0, armZ = 0, shoulderX = 0, shoulderZ = 0, frontX = 0, frontZ = 0;
  for (const sample of samples) {
    const pose = scenePose(sample);
    if (!pose) continue;
    const { points } = pose;
    // Feet are estimated even when out of shot, so use them regardless of visibility.
    const feet = FOOT_LANDMARKS.map((index) => (sample.world ? scenePoint(sample.world, index) : null)).filter((point): point is Vec3 => point !== null);
    if (feet.length) floors.push(Math.min(...feet.map((point) => point.y)));
    const nose = points[LM.nose];
    if (nose) heads.push(nose.y);
    const bowShoulder = points[bow.shoulder];
    const drawShoulder = points[draw.shoulder];
    const bowWrist = points[bow.wrist];
    const drawWrist = points[draw.wrist];
    if (bowShoulder && drawShoulder) {
      const sw = Math.hypot(bowShoulder.x - drawShoulder.x, bowShoulder.z - drawShoulder.z);
      shoulderX += bowShoulder.x - drawShoulder.x;
      shoulderZ += bowShoulder.z - drawShoulder.z;
      // Only a drawn bow says much about where the arrow points.
      if (bowWrist && drawWrist && Math.hypot(bowWrist.x - drawWrist.x, bowWrist.z - drawWrist.z) > 1.5 * sw) {
        armX += bowWrist.x - drawWrist.x;
        armZ += bowWrist.z - drawWrist.z;
      }
    }
    const left = points[LM.leftShoulder];
    const right = points[LM.rightShoulder];
    if (left && right) {
      // (left − right) × up points out of the chest.
      frontX += -(left.z - right.z);
      frontZ += left.x - right.x;
    }
  }
  const forward = flatUnit(armX, armZ) ?? flatUnit(shoulderX, shoulderZ) ?? { x: 1, y: 0, z: 0 };
  let front: Vec3 = { x: -forward.z, y: 0, z: forward.x };
  // With no chest direction, face the side the camera filmed from.
  const facing = Math.abs(frontX) + Math.abs(frontZ) > 1e-6 ? front.x * frontX + front.z * frontZ : front.z;
  if (facing < 0) front = { x: -front.x, y: 0, z: -front.z };
  const floorY = median(floors) ?? DEFAULT_FLOOR_Y;
  const headTop = (median(heads) ?? floorY + 1.6) + 0.12;
  const height = Math.max(1, headTop - floorY);
  return { floorY, center: { x: 0, y: floorY + height / 2, z: 0 }, forward, front, height };
}

function along(origin: Vec3, direction: Vec3, distance: number): Vec3 {
  return { x: origin.x + direction.x * distance, y: origin.y + direction.y * distance, z: origin.z + direction.z * distance };
}

/** Camera position and look-at point for a preset, framing the archer with a vertical field of view `fovDeg`. */
export function cameraPose(frame: SceneFrame, preset: CameraPreset, fovDeg: number): CameraPose {
  const target = frame.center;
  // Fit the archer's height plus the span of a drawn bow, with some margin.
  const extent = Math.max(frame.height, 1.8) * 0.62;
  const distance = extent / Math.tan((fovDeg * Math.PI) / 360);
  switch (preset) {
    case 'side':
      return { position: along(along(target, frame.front, distance), UP, distance * 0.08), target };
    case 'behind':
      return { position: along(along(target, frame.forward, -distance), UP, distance * 0.12), target };
    case 'top':
      // A nudge back along the arrow keeps "toward the target" at the top of the screen.
      return { position: along(along(target, UP, distance), frame.forward, -distance * 0.01), target };
  }
}
