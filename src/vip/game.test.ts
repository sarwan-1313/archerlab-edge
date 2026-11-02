import { describe, expect, it } from 'vitest';
import { LEVELS, dailySeed, impact, rng, roundBonus, windFor, wobble } from './game';
import { predictNextRound } from './predict';
import type { PracticeEntry } from '../practice-log/types';

describe('Wind Challenge', () => {
  it('is repeatable with a seed', () => {
    const a = rng(42); const b = rng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(a()).toBeGreaterThanOrEqual(0);
  });

  it('has no wind indoors, and wind within the limit outdoors', () => {
    expect(windFor('indoor', rng(1)).push).toEqual({ x: 0, y: 0 });
    const random = rng(7);
    for (let i = 0; i < 50; i += 1) {
      const wind = windFor('olympic', random);
      expect(Math.hypot(wind.push.x, wind.push.y)).toBeLessThanOrEqual(LEVELS.olympic.maxWind + 1e-9);
    }
  });

  it('wobbles more the longer you hold', () => {
    const size = (s: number) => Math.max(...Array.from({ length: 40 }, (_, i) => Math.hypot(wobble(s + i * 0.01).x, wobble(s + i * 0.01).y)));
    expect(size(8)).toBeGreaterThan(size(2) * 3);
  });

  it('lands near the aim on a calm, steady shot, and is pushed by the wind', () => {
    const calm = impact({ x: 0, y: 0 }, 2, { x: 0, y: 0 }, 'indoor', rng(3));
    expect(Math.hypot(calm.x, calm.y)).toBeLessThan(0.08);
    const windy = impact({ x: 0, y: 0 }, 2, { x: 0.2, y: 0 }, 'indoor', rng(3));
    expect(windy.x - calm.x).toBeCloseTo(0.2);
  });

  it('gives everyone the same daily challenge, and a new one each day', () => {
    expect(dailySeed('2026-11-03')).toBe(dailySeed('2026-11-03'));
    expect(dailySeed('2026-11-03')).not.toBe(dailySeed('2026-11-04'));
    expect(windFor('outdoor', rng(dailySeed('2026-11-03')))).toEqual(windFor('outdoor', rng(dailySeed('2026-11-03'))));
  });

  it('gives a bonus for tight groups', () => {
    expect(roundBonus([{ x: 0, y: 0 }, { x: 0.01, y: 0 }, { x: 0, y: 0.01 }])).toBe(10);
    expect(roundBonus([{ x: -0.5, y: 0 }, { x: 0.5, y: 0 }, { x: 0, y: 0.5 }])).toBe(0);
    expect(roundBonus([{ x: 0, y: 0 }])).toBe(0);
  });
});

describe('score predictor', () => {
  const round = (date: number, total: number): PracticeEntry => ({ id: `r${date}`, source: 'round', date, arrows: 60, averageScore: total / 60, totalScore: total, scoredArrows: 60, formScore: null, focusAreas: [], round: { name: 'WA 18 m indoor', faceId: '40-spot', arrowsPerEnd: 3, ends: [] } });
  it('follows the trend of recent rounds', () => {
    const prediction = predictNextRound([round(1, 500), round(2, 510), round(3, 520)])!;
    expect(prediction.predicted).toBe(530);
    expect(prediction.trendPerRound).toBeCloseTo(10);
    expect(prediction.best).toBe(520);
    expect(prediction.max).toBe(600);
  });
  it('needs three rounds', () => {
    expect(predictNextRound([round(1, 500), round(2, 510)])).toBeNull();
  });
});

import { breathState } from './breathing';
describe('breathing coach', () => {
  it('goes in, hold, out, hold, and finishes after the cycles', () => {
    expect(breathState(0)).toEqual({ step: 'in', cycle: 1, secondsLeft: 4, done: false });
    expect(breathState(5).step).toBe('hold-full');
    expect(breathState(9).step).toBe('out');
    expect(breathState(13).step).toBe('hold-empty');
    expect(breathState(17)).toMatchObject({ step: 'in', cycle: 2 });
    expect(breathState(64).done).toBe(true);
  });
});
