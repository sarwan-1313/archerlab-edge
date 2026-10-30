import { describe, expect, it } from 'vitest';
import { LM } from '../video-analysis/frameFeatures';
import { clampBox, nearestSample, suggestBowBox } from './bowBox';

function pose(points: Record<number, [number, number]>): Float32Array {
  const image = new Float32Array(33 * 4);
  for (const [index, [x, y]] of Object.entries(points)) image.set([x, y, 0, 1], Number(index) * 4);
  return image;
}

describe('suggestBowBox', () => {
  const body = { [LM.leftShoulder]: [0.45, 0.3], [LM.rightShoulder]: [0.55, 0.3], [LM.leftHip]: [0.45, 0.6], [LM.rightHip]: [0.55, 0.6] } as Record<number, [number, number]>;

  it('centres a tall box on the bow hand (left hand for a right-handed archer)', () => {
    const box = suggestBowBox(pose({ ...body, [LM.leftWrist]: [0.2, 0.3], [LM.rightWrist]: [0.8, 0.3] }), 'right', 1000, 1000);
    expect(box).not.toBeNull();
    expect(box!.x + box!.width / 2).toBeCloseTo(200);
    expect(box!.height).toBeGreaterThan(box!.width);
  });

  it('uses the right hand for a left-handed archer and clips to the image', () => {
    const box = suggestBowBox(pose({ ...body, [LM.leftWrist]: [0.2, 0.3], [LM.rightWrist]: [0.99, 0.3] }), 'left', 1000, 1000)!;
    expect(box.x + box.width).toBeLessThanOrEqual(1000);
    expect(box.y).toBe(0);
  });

  it('returns null without a visible bow hand', () => {
    expect(suggestBowBox(pose(body), 'right', 1000, 1000)).toBeNull();
  });
});

describe('clampBox and nearestSample', () => {
  it('normalises negative sizes', () => {
    expect(clampBox({ x: 50, y: 50, width: -20, height: -10 }, 100, 100)).toEqual({ x: 30, y: 40, width: 20, height: 10 });
  });

  it('finds the closest tracked sample within the gap', () => {
    const image = new Float32Array(132);
    const samples = [{ t: 0, image, world: null }, { t: 0.5, image, world: null }, { t: 1, image: null, world: null }];
    expect(nearestSample(samples, 0.45)?.t).toBe(0.5);
    expect(nearestSample(samples, 1)).toBeNull();
  });
});
