import { describe, expect, it } from 'vitest';
import { detectOnsets, fft, matchShotAudio } from './audio';
import { synthesizeRangeAudio } from './testing/syntheticAudio';

describe('fft', () => {
  it('puts a pure tone in the right bin', () => {
    const n = 256;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i += 1) re[i] = Math.cos((2 * Math.PI * 16 * i) / n);
    fft(re, im);
    const magnitudes = Array.from({ length: n / 2 }, (_, k) => Math.hypot(re[k], im[k]));
    expect(magnitudes.indexOf(Math.max(...magnitudes))).toBe(16);
  });
});

describe('detectOnsets', () => {
  const events = [
    { t: 1.79, kind: 'clicker' as const },
    { t: 2.0, kind: 'release' as const },
    { t: 2.42, kind: 'impact' as const },
    { t: 6.0, kind: 'release' as const },
  ];
  const signal = synthesizeRangeAudio(8, events);
  const analysis = detectOnsets(signal, 16000);

  it('finds every transient with millisecond timing', () => {
    for (const event of events) {
      const nearest = analysis.onsets.reduce((best, onset) => (Math.abs(onset.t - event.t) < Math.abs(best.t - event.t) ? onset : best));
      expect(Math.abs(nearest.t - event.t)).toBeLessThan(0.005);
    }
  });

  it('ranks releases as the strongest sounds and estimates the noise floor', () => {
    const strongest = [...analysis.onsets].sort((a, b) => b.strength - a.strength).slice(0, 2).map((onset) => Math.round(onset.t));
    expect(strongest.sort()).toEqual([2, 6]);
    expect(analysis.noiseFloorDb).toBeLessThan(-40);
  });

  it('attributes clicker, release and impact around a visual release', () => {
    const match = matchShotAudio(1.98, analysis.onsets, new Set());
    expect(match.release?.t).toBeCloseTo(2.0, 2);
    expect(match.clicker?.t).toBeCloseTo(1.79, 2);
    expect(match.impact?.t).toBeCloseTo(2.42, 2);
  });

  it('returns nothing for silence', () => {
    expect(detectOnsets(new Float32Array(16000 * 2), 16000).onsets).toHaveLength(0);
  });
});
