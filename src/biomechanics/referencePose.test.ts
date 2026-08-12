import { describe, expect, it } from 'vitest';
import { calculateReferenceDeltas, createBiomechanicsReference, median, type ReferenceSample } from './referencePose';
import { availableMetric } from './metrics';

function sample(index: number): ReferenceSample {
  return { timestampMs: index * 180, shoulderLineAngleDeg: index, bowArmElbowAngleDeg: 170 + index, torsoLeanDeg: -index, confidence: 0.9 };
}

describe('reference pose', () => {
  it('uses a median across several valid frames', () => {
    expect(median([9, 1, 4, 2])).toBe(3);
    const reference = createBiomechanicsReference([0, 1, 2, 3, 4, 100].map(sample));
    expect(reference).toMatchObject({ shoulderLineAngleDeg: 2.5, bowArmElbowAngleDeg: 172.5, torsoLeanDeg: -2.5, sampleCount: 6 });
  });

  it('rejects an undersampled capture', () => expect(createBiomechanicsReference([0, 1].map(sample))).toBeNull());

  it('rejects a short capture and poor-quality samples', () => {
    const short = [0, 1, 2, 3, 4, 5].map((index) => ({ ...sample(index), timestampMs: index * 100 }));
    const poor = [0, 1, 2, 3, 4, 5].map((index) => ({ ...sample(index), confidence: 0.2 }));
    expect(createBiomechanicsReference(short)).toBeNull();
    expect(createBiomechanicsReference(poor)).toBeNull();
  });

  it('reports live deltas against the captured baseline', () => {
    const metric = (value: number) => availableMetric(value, 'deg', { confidence: 1, coordinateSpace: 'normalized-image' });
    const deltas = calculateReferenceDeltas(
      { shoulderLineAngle: metric(5), bowArmElbowAngle: metric(175), torsoLean: metric(-1) },
      { capturedAt: 0, shoulderLineAngleDeg: 2, bowArmElbowAngleDeg: 170, torsoLeanDeg: -3, sampleCount: 8 },
    );
    expect(deltas).toEqual({ shoulderDeltaDeg: 3, bowArmDeltaDeg: 5, torsoDeltaDeg: 2 });
  });
});
