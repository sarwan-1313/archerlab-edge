import { describe, expect, it } from 'vitest';
import { carryOverAnnotations } from './annotations';
import type { VideoAnalysisReport } from './types';

const report = (shots: Array<{ release: number; notes?: string }>, extra: Partial<VideoAnalysisReport> = {}) =>
  ({ shots: shots.map((shot, index) => ({ index: index + 1, ...shot })), ...extra }) as unknown as VideoAnalysisReport;

describe('carryOverAnnotations', () => {
  it('moves each note to the re-scored shot released at the same moment', () => {
    const before = report([{ release: 5, notes: 'nine, low' }, { release: 12 }, { release: 20, notes: 'good one' }]);
    const after = carryOverAnnotations(before, report([{ release: 5.04 }, { release: 12 }, { release: 19.9 }]));
    expect(after.shots.map((shot) => shot.notes)).toEqual(['nine, low', undefined, 'good one']);
  });

  it('drops a note whose shot is no longer found, rather than giving it to another shot', () => {
    const after = carryOverAnnotations(report([{ release: 5, notes: 'nine' }]), report([{ release: 9 }]));
    expect(after.shots[0].notes).toBeUndefined();
  });

  it('keeps the coach\'s labels', () => {
    const labels = { shots: [], level: 'advanced' as const, labelledAt: 1 };
    expect(carryOverAnnotations(report([], { labels }), report([])).labels).toBe(labels);
  });
});
