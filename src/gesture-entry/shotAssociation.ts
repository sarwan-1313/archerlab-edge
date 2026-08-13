import type { ReportedShotResult } from '../types/gestureScore';
import type { ShotAnalysis } from '../types/shotAnalysis';

/** The shot id is the sole relationship between athlete-reported results and captures. */
export function attachReportedResult(shots: readonly ShotAnalysis[], shotId: string, result: ReportedShotResult): ShotAnalysis[] {
  return shots.map((shot) => shot.id === shotId ? { ...shot, actualResult: result } : shot);
}

export function clearReportedResult(shots: readonly ShotAnalysis[], shotId: string): ShotAnalysis[] {
  return shots.map((shot) => shot.id === shotId ? { ...shot, actualResult: undefined } : shot);
}
