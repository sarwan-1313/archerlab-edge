import { describe, expect, it } from 'vitest';
import { alignedTime, bestShot, compareShotMetrics, fitOnto, mirrorPoints, pointsFromSample, poseDifference, sampleNear, type Point2 } from './ghost';
import { ghostFromShot, isGhostReference } from './ghostStore';
import { buildReport } from './buildReport';
import { makeScenario, scriptShots, syntheticSamples } from './testing/syntheticArcher';
import type { PoseSample, ShotReport } from './types';

function body(shoulderY: number, hipY: number, centreX: number, halfWidth: number): Point2[] {
  const points: Point2[] = Array.from({ length: 33 }, () => ({ x: centreX, y: (shoulderY + hipY) / 2, v: 1 }));
  points[11] = { x: centreX - halfWidth, y: shoulderY, v: 1 };
  points[12] = { x: centreX + halfWidth, y: shoulderY, v: 1 };
  points[23] = { x: centreX - halfWidth * 0.7, y: hipY, v: 1 };
  points[24] = { x: centreX + halfWidth * 0.7, y: hipY, v: 1 };
  points[15] = { x: centreX - halfWidth * 4, y: shoulderY, v: 1 };
  return points;
}

describe('fitting a ghost onto a body', () => {
  it('moves and scales the ghost so the torsos line up', () => {
    const ghost = body(0.3, 0.6, 0.5, 0.05);
    const target = body(0.2, 0.8, 0.4, 0.1);
    const fitted = fitOnto(ghost, 1, target, 1)!;
    expect(fitted[11].y).toBeCloseTo(0.2);
    expect(fitted[23].y).toBeCloseTo(0.8);
    // Twice the size: the bow hand is twice as far from the shoulders.
    expect((fitted[11].x + fitted[12].x) / 2).toBeCloseTo(0.4);
    expect(fitted[15].x).toBeCloseTo(0.4 - 0.05 * 4 * 2);
    expect(poseDifference(fitOnto(target, 1, target, 1)!, target)).toBeCloseTo(0);
  });

  it('needs both shoulders', () => {
    const hidden = body(0.3, 0.6, 0.5, 0.05).map((point, index) => (index === 12 ? { ...point, v: 0 } : point));
    expect(fitOnto(hidden, 1, body(0.3, 0.6, 0.5, 0.05), 1)).toBeNull();
  });

  it('mirrors left and right', () => {
    const mirrored = mirrorPoints(body(0.3, 0.6, 0.5, 0.05));
    expect(mirrored[15].x).toBeCloseTo(0.5); // the far-out hand moved to the other landmark slot
    expect(mirrored[16].x).toBeCloseTo(1 - 0.3);
    expect(mirrored[11].x).toBeCloseTo(1 - 0.55);
  });
});

describe('lining shots up', () => {
  it('finds the nearest tracked sample', () => {
    const image = new Float32Array(33 * 4);
    const samples: PoseSample[] = [{ t: 0, image, world: null }, { t: 0.1, image: null, world: null }, { t: 0.2, image, world: null }];
    expect(sampleNear(samples, 0.12)?.t).toBe(0.2);
    expect(sampleNear(samples, 2)).toBeNull();
    expect(pointsFromSample(samples[0])).toHaveLength(33);
  });

  it('aligns at the release', () => {
    expect(alignedTime({ release: 10 }, { release: 3 }, 9.5)).toBe(2.5);
  });

  it('picks the best tracked shot, compares measurements and builds a ghost', () => {
    const scenario = makeScenario({ shots: scriptShots(3) });
    const report = buildReport({
      id: 'r', createdAt: 1, samples: syntheticSamples(scenario, 24),
      source: { fileName: 'clip.mp4', fileSize: 1, mimeType: 'video/mp4', durationS: scenario.durationS, width: 1280, height: 720, nativeFps: 30, analysisFps: 24, hasAudio: false },
      settings: { quality: 'standard', requestedHandedness: 'auto', bowType: 'recurve', model: 'lite', delegate: 'CPU' },
      audio: { kind: 'unavailable', reason: 'none' },
    });
    const best = bestShot(report);
    expect(best).not.toBeNull();
    const others = report.shots.filter((shot) => shot.formScore !== null);
    expect(others.every((shot) => (shot.formScore ?? 0) <= (best!.formScore ?? 0))).toBe(true);
    const rows = compareShotMetrics(report.shots[0], report.shots[1]);
    expect(rows.length).toBeGreaterThan(0);
    const ghost = ghostFromShot(report);
    expect(ghost && isGhostReference(ghost)).toBe(true);
    expect(ghost!.aspect).toBeCloseTo(1280 / 720);
    expect(isGhostReference({ reportId: 'x' })).toBe(false);
  });

  it('skips audio-only and poorly tracked shots', () => {
    const shot = (index: number, formScore: number | null, extra: Partial<ShotReport> = {}) => ({ index, formScore, source: 'video', quality: { label: 'good' }, ...extra }) as unknown as ShotReport;
    expect(bestShot({ shots: [shot(0, 90, { source: 'audio-only' }), shot(1, 95, { quality: { trackedRatio: 0, meanVisibility: 0, label: 'poor' } }), shot(2, 70)] })?.index).toBe(2);
    expect(bestShot({ shots: [] })).toBeNull();
  });
});
