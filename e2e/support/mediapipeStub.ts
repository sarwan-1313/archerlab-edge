import { E2E_SCENARIO } from './scenario';
import { syntheticPoseAt } from '../../src/video-analysis/testing/syntheticArcher';

/**
 * Stand-in for @mediapipe/tasks-vision in builds made with VITE_E2E=1 (see
 * vite.config.ts). It never looks at the image: it returns the landmarks of the
 * scripted synthetic archer for the timestamp it is given, which matches the
 * clip in e2e/fixtures. Test tooling only; normal builds use the real package.
 */

interface Point { x: number; y: number; z: number; visibility?: number }

const CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10], [11, 12], [11, 13], [13, 15], [15, 17], [15, 19],
  [15, 21], [17, 19], [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20], [11, 23], [12, 24], [23, 24], [23, 25],
  [24, 26], [25, 27], [26, 28], [27, 29], [28, 30], [29, 31], [30, 32], [27, 31], [28, 32],
];

function image(values: Float32Array): Point[] {
  return Array.from({ length: 33 }, (_, index) => ({ x: values[index * 4], y: values[index * 4 + 1], z: values[index * 4 + 2], visibility: values[index * 4 + 3] }));
}

function world(values: Float32Array): Point[] {
  return Array.from({ length: 33 }, (_, index) => ({ x: values[index * 3], y: values[index * 3 + 1], z: values[index * 3 + 2] }));
}

export class FilesetResolver {
  static async forVisionTasks(_wasmRoot?: string) {
    return {};
  }
}

export class PoseLandmarker {
  static POSE_CONNECTIONS = CONNECTIONS.map(([start, end]) => ({ start, end }));

  static async createFromOptions(_fileset?: unknown, _options?: unknown) {
    return new PoseLandmarker();
  }

  setOptions() {
    return Promise.resolve();
  }

  detectForVideo(_frame: unknown, timestampMs: number) {
    const pose = syntheticPoseAt(E2E_SCENARIO, timestampMs / 1000);
    if (!pose.image || !pose.world) return { landmarks: [], worldLandmarks: [], segmentationMasks: undefined, close() {} };
    return { landmarks: [image(pose.image)], worldLandmarks: [world(pose.world)], segmentationMasks: undefined, close() {} };
  }

  close() {}
}

export class HandLandmarker {
  static async createFromOptions(_fileset?: unknown, _options?: unknown) {
    return new HandLandmarker();
  }

  detectForVideo(_frame: unknown, _timestampMs: number) {
    return { landmarks: [], worldLandmarks: [], handedness: [], handednesses: [] };
  }

  detect(_image: unknown) {
    return { landmarks: [], worldLandmarks: [], handedness: [], handednesses: [] };
  }

  close() {}
}

/** The synthetic archer has no face, so anchor detail finds none and the report has no face-based metrics. */
export class FaceLandmarker {
  static async createFromOptions(_fileset?: unknown, _options?: unknown) {
    return new FaceLandmarker();
  }

  detect(_image: unknown) {
    return { faceLandmarks: [], faceBlendshapes: [], facialTransformationMatrixes: [] };
  }

  close() {}
}
