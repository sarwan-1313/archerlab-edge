import { describe, expect, it } from 'vitest';
import { phaseAt, sceneFrame } from './scrollScene';

describe('landing scroll scene', () => {
  it('moves through the shot phases in order', () => {
    const phases = [0, 0.2, 0.4, 0.6, 0.9].map(phaseAt);
    expect(phases).toEqual(['ready', 'draw', 'hold', 'release', 'impact']);
  });

  it('never moves the arrow backwards after full draw', () => {
    let previous = -Infinity;
    for (let step = 340; step <= 1000; step += 1) {
      const { nockX } = sceneFrame(step / 1000);
      expect(nockX).toBeGreaterThanOrEqual(previous - 0.01);
      previous = nockX;
    }
  });

  it('lands the arrow in the centre of the target and shows the score', () => {
    const end = sceneFrame(1);
    expect(end.nockX + 236).toBeCloseTo(874, 0);
    expect(end.arrowY).toBeCloseTo(200, 5);
    expect(end.score).toBe(1);
    expect(sceneFrame(0.5).score).toBe(0);
  });
});
