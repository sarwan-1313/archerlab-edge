import { describe, expect, it } from 'vitest';
import { CATEGORY_INFO, METRIC_RUBRIC, bandScore, rubricFor } from './rubric';
import type { MetricKey } from './types';

describe('bandScore', () => {
  it('hits the anchor points of a lower-is-better band', () => {
    const band = { kind: 'lower' as const, excellent: 1, good: 2, fair: 3, poor: 4 };
    expect(bandScore(0.5, band)).toBe(100);
    expect(bandScore(2, band)).toBeCloseTo(82, 6);
    expect(bandScore(3, band)).toBeCloseTo(58, 6);
    expect(bandScore(4, band)).toBeCloseTo(30, 6);
    expect(bandScore(100, band)).toBe(10);
  });

  it('mirrors for higher-is-better bands', () => {
    const band = METRIC_RUBRIC.bowElbowAngle.band;
    expect(bandScore(175, band)).toBe(100);
    expect(bandScore(165, band)).toBeCloseTo(82, 6);
    expect(bandScore(150, band)).toBeLessThan(58);
  });

  it('rewards staying inside a range', () => {
    const band = METRIC_RUBRIC.holdDuration.band;
    expect(bandScore(2.5, band)).toBe(100);
    expect(bandScore(0.5, band)).toBeLessThan(70);
    expect(bandScore(9, band)).toBeLessThan(40);
  });

  it('is monotonic for every metric', () => {
    for (const key of Object.keys(METRIC_RUBRIC) as MetricKey[]) {
      const band = METRIC_RUBRIC[key].band;
      if (band.kind === 'range') continue;
      const values = band.kind === 'lower' ? [band.excellent, band.good, band.fair, band.poor] : [band.poor, band.fair, band.good, band.excellent];
      const scores = values.map((value) => bandScore(value, band));
      for (let index = 1; index < scores.length; index += 1) {
        if (band.kind === 'lower') expect(scores[index]).toBeLessThan(scores[index - 1]);
        else expect(scores[index]).toBeGreaterThan(scores[index - 1]);
      }
    }
  });

  it('softens the bow-arm target for compound archers', () => {
    expect(bandScore(161, rubricFor('bowElbowAngle', 'compound').band)).toBeGreaterThan(bandScore(161, rubricFor('bowElbowAngle', 'recurve').band));
  });

  it('weights categories to a total of 1', () => {
    const total = Object.values(CATEGORY_INFO).reduce((sum, category) => sum + category.weight, 0);
    expect(total).toBeCloseTo(1, 6);
  });
});
