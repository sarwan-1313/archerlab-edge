import { describe, expect, it } from 'vitest';
import { sampleTimes } from './sampling';

describe('sampleTimes', () => {
  it('samples once a second and every frame within 0.3 s of a release', () => {
    const times = sampleTimes(4, [2.0], { nativeFps: 10 });
    expect(times.filter((t) => t.reason === 'interval').map((t) => t.t)).toEqual([0, 1, 3]);
    expect(times.filter((t) => t.reason === 'release').map((t) => t.t)).toEqual([1.7, 1.8, 1.9, 2, 2.1, 2.2, 2.3]);
  });

  it('keeps release windows inside the clip and returns nothing for an empty clip', () => {
    expect(sampleTimes(1, [0.04], { nativeFps: 10 }).map((t) => t.t)).toEqual([0, 0.1, 0.2, 0.3]);
    expect(sampleTimes(0, [1])).toEqual([]);
  });
});
