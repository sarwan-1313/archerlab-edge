import { describe, expect, it } from 'vitest';
import type { ReportedShotResult } from '../types/gestureScore';
import type { ShotAnalysis } from '../types/shotAnalysis';
import { attachReportedResult, clearReportedResult } from './shotAssociation';

function shot(id: string): ShotAnalysis {
  return { id, frames: [{ timestampMs: 1 }], actualResult: undefined } as unknown as ShotAnalysis;
}

function result(score: number): ReportedShotResult {
  return { score, isX: false, source: 'gesture', capturedAt: 1000, gestureConfidence: 0.9, gestureId: `fingers-${score}` };
}

describe('reported result shot association', () => {
  it('attaches each gesture result only to its authoritative shot id', () => {
    let shots = [shot('shot_1'), shot('shot_2')];
    shots = attachReportedResult(shots, 'shot_1', result(8));
    expect(shots[0].actualResult?.score).toBe(8); expect(shots[1].actualResult).toBeUndefined();
    shots = attachReportedResult(shots, 'shot_2', result(10));
    expect(shots[0].actualResult?.score).toBe(8); expect(shots[1].actualResult?.score).toBe(10);
  });

  it('undoes only the score and preserves captured biomechanics', () => {
    const captured = shot('shot_1'); const withResult = attachReportedResult([captured], captured.id, result(9));
    const cleared = clearReportedResult(withResult, captured.id);
    expect(cleared[0].actualResult).toBeUndefined(); expect(cleared[0].frames).toEqual([{ timestampMs: 1 }]); expect(cleared[0].id).toBe(captured.id);
  });

  it('leaves a shot unchanged when an entry window times out without a result', () => {
    const captured = shot('shot_timeout');
    expect(captured.actualResult).toBeUndefined(); expect(captured.frames).toHaveLength(1);
  });
});
