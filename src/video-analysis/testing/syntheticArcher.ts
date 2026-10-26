import type { PoseSample } from '../types';

/**
 * A deterministic synthetic archer used to test the video engine (and the
 * browser pipeline, via a stubbed pose model). It produces MediaPipe-shaped
 * image and world landmarks for any moment in a scripted session, from any
 * camera angle, with optional form faults. It is test tooling only.
 */

type P = [number, number, number];

export interface SyntheticFaults {
  /** Degrees of bend in the bow arm at full draw (0 = straight). */
  bowElbowBend: number;
  /** Metres the bow shoulder is lifted. */
  bowShoulderRaise: number;
  /** Degrees of torso lean toward the target (negative = away). */
  torsoLeanDeg: number;
  /** Bow-hand sway amplitude while aiming, metres. */
  swayAmplitude: number;
  /** Head movement at release, metres. */
  headFlinch: number;
  /** 0–1 share of the release travel that goes outward instead of back along the arrow. */
  pluck: number;
  /** No draw-hand travel at release. */
  staticRelease: boolean;
  /** Forward creep of the draw hand while aiming, metres per second. */
  creep: number;
  /** Bow-wrist drop within 0.3 s of release, metres. */
  dropArm: number;
}

export interface SyntheticShot {
  raiseStart: number;
  drawStart: number;
  anchor: number;
  release: number;
  /** Seconds the finish is held after release before lowering. */
  followThrough: number;
  /** Instead of releasing at `release`, let down slowly. */
  letDown?: boolean;
  faults?: Partial<SyntheticFaults>;
}

export interface SyntheticScenario {
  durationS: number;
  shots: SyntheticShot[];
  drawSide: 'left' | 'right';
  /** 0 = side-on (broadside), 90 = down the shooting line. */
  yawDeg: number;
  aspect: number;
  /** Landmark noise in metres (world); image noise is scaled from it. */
  noise: number;
  seed: number;
  /** Time ranges where the pose model finds nobody. */
  dropouts?: Array<[number, number]>;
  baseFaults?: Partial<SyntheticFaults>;
}

const NO_FAULTS: SyntheticFaults = {
  bowElbowBend: 4, bowShoulderRaise: 0, torsoLeanDeg: 1.5, swayAmplitude: 0.004, headFlinch: 0,
  pluck: 0, staticRelease: false, creep: 0, dropArm: 0.01,
};

/** Evenly spaced shots with a realistic rhythm. */
export function scriptShots(count: number, options: { start?: number; spacing?: number; hold?: number; drawTime?: number; followThrough?: number; faults?: Partial<SyntheticFaults> } = {}): SyntheticShot[] {
  const start = options.start ?? 1.0;
  const spacing = options.spacing ?? 9;
  const hold = options.hold ?? 2.6;
  const drawTime = options.drawTime ?? 1.8;
  return Array.from({ length: count }, (_, index) => {
    const raiseStart = start + index * spacing;
    const drawStart = raiseStart + 1.2;
    const anchor = drawStart + drawTime;
    return { raiseStart, drawStart, anchor, release: anchor + hold, followThrough: options.followThrough ?? 1.3, faults: options.faults };
  });
}

export function makeScenario(overrides: Partial<SyntheticScenario> = {}): SyntheticScenario {
  const shots = overrides.shots ?? scriptShots(3);
  const last = shots.at(-1);
  return {
    durationS: overrides.durationS ?? (last ? last.release + last.followThrough + 2.5 : 10),
    shots,
    drawSide: 'right',
    yawDeg: 0,
    aspect: 16 / 9,
    noise: 0.004,
    seed: 7,
    ...overrides,
  };
}

// ---------- deterministic noise ----------
function hash(a: number, b: number, c: number, d: number): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647 + d * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}
function noise(seed: number, t: number, landmark: number, axis: number): number {
  const ms = Math.round(t * 1000);
  return (hash(seed, ms, landmark, axis) + hash(seed + 1, ms, landmark, axis + 7)) / 2;
}

// ---------- geometry helpers ----------
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k, a[2] * k];
const lerp = (a: P, b: P, f: number): P => add(a, mul(sub(b, a), f));
const length = (a: P) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: P): P => mul(a, 1 / (length(a) || 1));
const easeInOut = (f: number) => (f <= 0 ? 0 : f >= 1 ? 1 : f * f * (3 - 2 * f));
const easeOut = (f: number) => (f <= 0 ? 0 : f >= 1 ? 1 : 1 - (1 - f) ** 3);

interface Arms { bowElbow: P; bowWrist: P; drawElbow: P; drawWrist: P }

const BOW_SHOULDER: P = [0.18, -0.5, 0];
const DRAW_SHOULDER: P = [-0.18, -0.5, 0];

function bowArm(bend: number): { elbow: P; wrist: P } {
  const half = 0.29;
  const interior = ((180 - Math.max(0.5, bend)) * Math.PI) / 180;
  const reach = 2 * half * Math.sin(interior / 2);
  const direction = unit([1, -0.05, 0.01]);
  const wrist = add(BOW_SHOULDER, mul(direction, reach));
  const offset = half * Math.cos(interior / 2);
  const elbow = add(add(BOW_SHOULDER, mul(direction, reach / 2)), mul(unit([0, 0.5, 0.866]), offset));
  return { elbow, wrist };
}

function restArms(): Arms {
  return { bowElbow: [0.21, -0.24, 0.02], bowWrist: [0.22, 0.0, 0.05], drawElbow: [-0.21, -0.24, 0.02], drawWrist: [-0.22, 0.0, 0.05] };
}

function setupArms(faults: SyntheticFaults): Arms {
  const bow = bowArm(faults.bowElbowBend);
  return { bowElbow: bow.elbow, bowWrist: bow.wrist, drawElbow: [0.16, -0.52, 0.12], drawWrist: [0.42, -0.55, 0.05] };
}

const ANCHOR_WRIST: P = [0.0, -0.62, 0.05];

function drawElbowFor(wrist: P, bowWrist: P): P {
  const arrow = unit(sub(bowWrist, wrist));
  return add(sub(wrist, mul(arrow, 0.26)), [0, -0.03, 0]);
}

function anchorArms(faults: SyntheticFaults, extraBack = 0): Arms {
  const bow = bowArm(faults.bowElbowBend);
  const arrow = unit(sub(bow.wrist, ANCHOR_WRIST));
  const drawWrist = sub(ANCHOR_WRIST, mul(arrow, extraBack));
  return { bowElbow: bow.elbow, bowWrist: bow.wrist, drawElbow: drawElbowFor(drawWrist, bow.wrist), drawWrist };
}

function finishArms(faults: SyntheticFaults): Arms {
  const anchor = anchorArms(faults);
  const arrow = unit(sub(anchor.bowWrist, anchor.drawWrist));
  // Even a "dead" release twitches the hand a little.
  const travel = faults.staticRelease ? 0.025 : 0.12;
  const back = mul(arrow, -travel * (1 - faults.pluck));
  const out = mul([0, 0, 1], travel * faults.pluck * 1.4);
  const drawWrist = add(add(anchor.drawWrist, back), add(out, [0, 0.02, 0]));
  const bowWrist = add(anchor.bowWrist, [0.02, faults.dropArm, 0]);
  const bowElbow = add(anchor.bowElbow, [0.01, faults.dropArm / 2, 0]);
  return { bowElbow, bowWrist, drawElbow: drawElbowFor(drawWrist, bowWrist), drawWrist };
}

function mixArms(a: Arms, b: Arms, f: number): Arms {
  return { bowElbow: lerp(a.bowElbow, b.bowElbow, f), bowWrist: lerp(a.bowWrist, b.bowWrist, f), drawElbow: lerp(a.drawElbow, b.drawElbow, f), drawWrist: lerp(a.drawWrist, b.drawWrist, f) };
}

interface BodyState { arms: Arms; headOffset: P; sway: P; shoulderRaise: number; leanDeg: number }

function bodyStateAt(scenario: SyntheticScenario, t: number): BodyState {
  const rest = restArms();
  for (const shot of scenario.shots) {
    const faults: SyntheticFaults = { ...NO_FAULTS, ...scenario.baseFaults, ...shot.faults };
    const lowerStart = shot.letDown ? shot.release + 0.9 : shot.release + shot.followThrough;
    const end = lowerStart + 1.0;
    if (t < shot.raiseStart || t >= end) continue;
    const setup = setupArms(faults);
    const anchor = anchorArms(faults);
    const posture = (f: number) => ({ shoulderRaise: faults.bowShoulderRaise * f, leanDeg: faults.torsoLeanDeg * f });
    const none: P = [0, 0, 0];
    if (t < shot.drawStart) {
      const f = easeInOut((t - shot.raiseStart) / (shot.drawStart - shot.raiseStart));
      return { arms: mixArms(rest, setup, f), headOffset: none, sway: none, ...posture(f) };
    }
    if (t < shot.anchor) {
      const f = easeInOut((t - shot.drawStart) / (shot.anchor - shot.drawStart));
      return { arms: mixArms(setup, anchor, f), headOffset: none, sway: none, ...posture(1) };
    }
    const sway: P = [0, faults.swayAmplitude * Math.sin(2 * Math.PI * 0.8 * t), faults.swayAmplitude * Math.sin(2 * Math.PI * 0.6 * t + 1)];
    if (t < shot.release) {
      const crept = faults.creep * (t - shot.anchor);
      return { arms: anchorArms(faults, -crept), headOffset: none, sway, ...posture(1) };
    }
    if (shot.letDown) {
      if (t < shot.release + 0.9) return { arms: mixArms(anchorArms(faults), setup, easeInOut((t - shot.release) / 0.9)), headOffset: none, sway: none, ...posture(1) };
      return { arms: mixArms(setup, rest, easeInOut((t - lowerStart) / 1.0)), headOffset: none, sway: none, ...posture(1 - easeInOut((t - lowerStart) / 1.0)) };
    }
    const finish = finishArms(faults);
    const crept = faults.creep * (shot.release - shot.anchor);
    const atRelease = anchorArms(faults, -crept);
    const flinch = mul(unit([-0.5, -0.85, 0]), faults.headFlinch * easeOut((t - shot.release) / 0.15));
    if (t < lowerStart) {
      const travel = easeOut((t - shot.release) / 0.08);
      const drop = easeOut((t - shot.release) / 0.3);
      const arms: Arms = {
        drawWrist: lerp(atRelease.drawWrist, finish.drawWrist, travel),
        drawElbow: lerp(atRelease.drawElbow, finish.drawElbow, travel),
        bowWrist: lerp(atRelease.bowWrist, finish.bowWrist, drop),
        bowElbow: lerp(atRelease.bowElbow, finish.bowElbow, drop),
      };
      return { arms, headOffset: flinch, sway: none, ...posture(1) };
    }
    const f = easeInOut((t - lowerStart) / 1.0);
    return { arms: mixArms(finish, rest, f), headOffset: mul(flinch, 1 - f), sway: none, ...posture(1 - f) };
  }
  return { arms: rest, headOffset: [0, 0, 0], sway: [0, 0, 0], shoulderRaise: 0, leanDeg: 0 };
}

const IDX = {
  nose: 0, leftEyeInner: 1, leftEye: 2, leftEyeOuter: 3, rightEyeInner: 4, rightEye: 5, rightEyeOuter: 6,
  leftEar: 7, rightEar: 8, mouthLeft: 9, mouthRight: 10, leftShoulder: 11, rightShoulder: 12,
  leftElbow: 13, rightElbow: 14, leftWrist: 15, rightWrist: 16, leftPinky: 17, rightPinky: 18,
  leftIndex: 19, rightIndex: 20, leftThumb: 21, rightThumb: 22, leftHip: 23, rightHip: 24,
  leftKnee: 25, rightKnee: 26, leftAnkle: 27, rightAnkle: 28, leftHeel: 29, rightHeel: 30, leftFoot: 31, rightFoot: 32,
} as const;

/** Landmarks for one moment, or nulls inside a dropout. */
export function syntheticPoseAt(scenario: SyntheticScenario, t: number): { image: Float32Array | null; world: Float32Array | null } {
  if (scenario.dropouts?.some(([from, to]) => t >= from && t <= to)) return { image: null, world: null };
  const state = bodyStateAt(scenario, t);
  const { arms } = state;
  const bowSide = scenario.drawSide === 'right' ? 'left' : 'right';
  const drawSide = scenario.drawSide;
  const points = new Map<number, P>();
  const put = (side: 'left' | 'right', part: string, point: P) => {
    const key = `${side}${part}` as keyof typeof IDX;
    points.set(IDX[key], point);
  };
  const bowShoulder = add(BOW_SHOULDER, [0, -state.shoulderRaise, 0]);
  const raise: P = [0, -state.shoulderRaise, 0];
  put(bowSide, 'Shoulder', bowShoulder);
  put(drawSide, 'Shoulder', DRAW_SHOULDER);
  put(bowSide, 'Elbow', add(add(arms.bowElbow, raise), mul(state.sway, 0.6)));
  put(bowSide, 'Wrist', add(add(arms.bowWrist, raise), state.sway));
  put(drawSide, 'Elbow', add(arms.drawElbow, mul(state.sway, 0.2)));
  put(drawSide, 'Wrist', add(arms.drawWrist, mul(state.sway, 0.2)));
  for (const side of ['left', 'right'] as const) {
    const wrist = points.get(IDX[`${side}Wrist`]) as P;
    const elbow = points.get(IDX[`${side}Elbow`]) as P;
    const forward = unit(sub(wrist, elbow));
    put(side, 'Index', add(wrist, mul(forward, 0.08)));
    put(side, 'Pinky', add(wrist, add(mul(forward, 0.07), [0, 0.02, 0])));
    put(side, 'Thumb', add(wrist, add(mul(forward, 0.05), [0, -0.02, 0])));
  }
  const head: P = add([0.02, -0.72, 0.0], add(state.headOffset, mul(state.sway, 0.2)));
  points.set(IDX.nose, add(head, [0.08, -0.01, 0.05]));
  const eyes: Array<[keyof typeof IDX, P]> = [
    ['leftEyeInner', [0.07, -0.04, 0.03]], ['leftEye', [0.06, -0.045, 0.01]], ['leftEyeOuter', [0.05, -0.045, -0.01]],
    ['rightEyeInner', [0.07, -0.04, 0.07]], ['rightEye', [0.06, -0.045, 0.09]], ['rightEyeOuter', [0.05, -0.045, 0.11]],
  ];
  for (const [name, offset] of eyes) points.set(IDX[name], add(head, offset));
  put(bowSide, 'Ear', add(head, [0.0, -0.01, -0.07]));
  put(drawSide, 'Ear', add(head, [-0.03, -0.01, 0.07]));
  points.set(IDX.mouthLeft, add(head, [0.07, 0.03, 0.03]));
  points.set(IDX.mouthRight, add(head, [0.07, 0.03, 0.07]));
  put(bowSide, 'Hip', [0.1, 0, 0]);
  put(drawSide, 'Hip', [-0.1, 0, 0]);
  put(bowSide, 'Knee', [0.11, 0.45, 0.01]);
  put(drawSide, 'Knee', [-0.11, 0.45, 0.01]);
  put(bowSide, 'Ankle', [0.13, 0.88, 0]);
  put(drawSide, 'Ankle', [-0.13, 0.88, 0]);
  put(bowSide, 'Heel', [0.13, 0.92, -0.04]);
  put(drawSide, 'Heel', [-0.13, 0.92, -0.04]);
  put(bowSide, 'Foot', [0.13, 0.93, 0.1]);
  put(drawSide, 'Foot', [-0.13, 0.93, 0.1]);

  const lean = (state.leanDeg * Math.PI) / 180;
  const yaw = (scenario.yawDeg * Math.PI) / 180;
  const image = new Float32Array(33 * 4);
  const world = new Float32Array(33 * 3);
  const scale = 0.4;
  for (let index = 0; index < 33; index += 1) {
    let [x, y, z] = points.get(index) ?? [0, 0, 0];
    if (y < 0) {
      // Lean the upper body about the hips.
      const leanX = x * Math.cos(lean) - y * Math.sin(lean);
      const leanY = x * Math.sin(lean) + y * Math.cos(lean);
      x = leanX;
      y = leanY;
    }
    const n = scenario.noise;
    const wx = Math.cos(yaw) * x - Math.sin(yaw) * z + noise(scenario.seed, t, index, 0) * n;
    const wy = y + noise(scenario.seed, t, index, 1) * n;
    const wz = -(Math.sin(yaw) * x + Math.cos(yaw) * z) + noise(scenario.seed, t, index, 2) * n;
    world[index * 3] = wx;
    world[index * 3 + 1] = wy;
    world[index * 3 + 2] = wz;
    const imageNoise = n * scale * 0.35;
    image[index * 4] = 0.5 + (wx * scale) / scenario.aspect + noise(scenario.seed + 3, t, index, 0) * imageNoise / scenario.aspect;
    image[index * 4 + 1] = 0.55 + wy * scale + noise(scenario.seed + 3, t, index, 1) * imageNoise;
    image[index * 4 + 2] = wz * scale * 0.3;
    const farSide = scenario.yawDeg > 60 && (index % 2 === 0 ? index > 10 : false);
    image[index * 4 + 3] = index === IDX.leftEar || index === IDX.rightEar ? 0.82 : farSide ? 0.72 : 0.93;
  }
  return { image, world };
}

/** Samples a scenario at a fixed frame rate, like the first tracking pass would. */
export function syntheticSamples(scenario: SyntheticScenario, fps: number): PoseSample[] {
  const samples: PoseSample[] = [];
  const frames = Math.floor(scenario.durationS * fps);
  for (let frame = 0; frame <= frames; frame += 1) {
    const t = Number((frame / fps).toFixed(4));
    const { image, world } = syntheticPoseAt(scenario, t);
    samples.push({ t, image, world });
  }
  return samples;
}
