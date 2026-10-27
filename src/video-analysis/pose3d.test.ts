import { describe, expect, it } from 'vitest';
import { SKELETON } from './drawing';
import { boneSides, cameraPose, hasWorldLandmarks, sampleAtTime, sceneFrame, scenePoint, scenePose } from './pose3d';
import { makeScenario, scriptShots, syntheticSamples } from './testing/syntheticArcher';

const dot = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => a.x * b.x + a.y * b.y + a.z * b.z;

describe('pose3d', () => {
  it('turns MediaPipe world space into a y-up scene', () => {
    const world = new Float32Array(33 * 3);
    world.set([0.2, -0.5, 0.3], 0);
    expect(scenePoint(world, 0)).toEqual({ x: expect.closeTo(0.2), y: expect.closeTo(0.5), z: expect.closeTo(-0.3) });
    world[3] = Number.NaN;
    expect(scenePoint(world, 1)).toBeNull();
  });

  it('hides landmarks the model could not see', () => {
    const [sample] = syntheticSamples(makeScenario({ shots: scriptShots(1) }), 10);
    const image = new Float32Array(sample.image as Float32Array);
    image[16 * 4 + 3] = 0.1;
    const pose = scenePose({ ...sample, image });
    expect(pose?.points[16]).toBeNull();
    expect(pose?.points[15]).not.toBeNull();
    expect(scenePose({ t: 0, image: null, world: null })).toBeNull();
  });

  it('colours the bow arm and draw arm by handedness', () => {
    const right = boneSides('right');
    const left = boneSides('left');
    const bone = (a: number, b: number) => SKELETON.findIndex(([p, q]) => p === a && q === b);
    expect(right[bone(11, 13)]).toBe('bow');
    expect(right[bone(14, 16)]).toBe('draw');
    expect(left[bone(11, 13)]).toBe('draw');
    expect(left[bone(14, 16)]).toBe('bow');
    expect(right[bone(11, 12)]).toBe('body');
  });

  it('finds the floor and the shooting direction for either hand', () => {
    for (const drawSide of ['right', 'left'] as const) {
      const samples = syntheticSamples(makeScenario({ shots: scriptShots(2), drawSide, yawDeg: 0 }), 15);
      const frame = sceneFrame(samples, drawSide);
      expect(frame.floorY).toBeCloseTo(-0.93, 1);
      // The synthetic archer shoots toward +x when filmed side-on.
      expect(frame.forward.x).toBeGreaterThan(0.95);
      expect(Math.abs(dot(frame.forward, frame.front))).toBeLessThan(1e-6);
      expect(frame.height).toBeGreaterThan(1.4);
    }
  });

  it('follows the archer when filmed down the line', () => {
    const samples = syntheticSamples(makeScenario({ shots: scriptShots(2), yawDeg: 90 }), 15);
    expect(Math.abs(sceneFrame(samples, 'right').forward.z)).toBeGreaterThan(0.95);
  });

  it('places preset cameras beside, behind and above the archer', () => {
    const frame = sceneFrame(syntheticSamples(makeScenario({ shots: scriptShots(1) }), 15), 'right');
    const offset = (preset: 'side' | 'behind' | 'top') => {
      const { position, target } = cameraPose(frame, preset, 40);
      return { x: position.x - target.x, y: position.y - target.y, z: position.z - target.z };
    };
    const side = offset('side');
    const behind = offset('behind');
    const top = offset('top');
    expect(dot(side, frame.front)).toBeGreaterThan(2);
    expect(Math.abs(dot(side, frame.forward))).toBeLessThan(1e-6);
    expect(dot(behind, frame.forward)).toBeLessThan(-2);
    expect(top.y).toBeGreaterThan(2);
    expect(Math.hypot(top.x, top.z)).toBeLessThan(0.1);
  });

  it('falls back sensibly with no landmarks', () => {
    expect(hasWorldLandmarks([])).toBe(false);
    const frame = sceneFrame([], 'right');
    expect(frame.forward).toEqual({ x: 1, y: 0, z: 0 });
    expect(frame.front.z).toBeGreaterThan(0);
  });

  it('shows nobody between tracked samples that are far apart', () => {
    const samples = syntheticSamples(makeScenario({ shots: scriptShots(1), dropouts: [[1, 2]] }), 10);
    const times = samples.map((sample) => sample.t);
    expect(sampleAtTime(samples, times, 0.52)?.t).toBe(0.5);
    expect(sampleAtTime(samples, times, 1.5)).toBeNull();
    expect(sampleAtTime(samples, times, 99)).toBeNull();
    expect(hasWorldLandmarks(samples)).toBe(true);
  });
});
