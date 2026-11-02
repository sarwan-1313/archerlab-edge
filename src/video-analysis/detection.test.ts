import { describe, expect, it } from 'vitest';
import { detectCameraView, detectDrawSide } from './detection';
import { computeFrameFeatures } from './frameFeatures';
import { makeScenario, scriptShots, syntheticSamples } from './testing/syntheticArcher';

const aspect = 16 / 9;

function viewFor(yawDeg: number) {
  const samples = syntheticSamples(makeScenario({ shots: scriptShots(2), yawDeg }), 12);
  return detectCameraView(samples.map((sample) => computeFrameFeatures(sample, aspect, 'right')));
}

describe('detectDrawSide', () => {
  it('finds a right-handed archer', () => {
    const result = detectDrawSide(syntheticSamples(makeScenario({ shots: scriptShots(2) }), 12), aspect);
    expect(result.drawSide).toBe('right');
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it('finds a left-handed archer from another angle', () => {
    const result = detectDrawSide(syntheticSamples(makeScenario({ shots: scriptShots(2), drawSide: 'left', yawDeg: 55 }), 12), aspect);
    expect(result.drawSide).toBe('left');
  });

  it('declines to guess without any full draw', () => {
    const result = detectDrawSide(syntheticSamples(makeScenario({ shots: [], durationS: 5 }), 12), aspect);
    expect(result.drawSide).toBeNull();
  });
});

describe('detectCameraView', () => {
  it('classifies side-on, angled and down-the-line footage', () => {
    expect(viewFor(0).kind).toBe('broadside');
    expect(viewFor(58).kind).toBe('oblique');
    expect(viewFor(88).kind).toBe('down-the-line');
  });

  it('reports unknown with no tracked frames', () => {
    expect(detectCameraView([]).kind).toBe('unknown');
  });
});
