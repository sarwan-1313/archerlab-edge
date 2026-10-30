import { reportToJson } from '../storage';
import type { CategoryId, ReportLabels, ShotLabel, SkillLevel, VideoAnalysisReport } from '../types';

/** The release-time tolerance written into fixtures made from labels, seconds. */
export const LABEL_TOLERANCE_S = 0.1;

/** Labels to start from: every engine shot as a real shot at the engine's release time, nothing rated. */
export function initialLabels(report: VideoAnalysisReport, now = Date.now()): ReportLabels {
  return {
    shots: report.shots.map((shot) => ({ engineIndex: shot.index, release: shot.release, status: 'shot', ratings: {} })),
    level: null,
    labelledAt: now,
  };
}

/** Moves a label's release by whole frames of the clip. */
export function stepRelease(label: ShotLabel, frames: number, fps: number): ShotLabel {
  const frame = 1 / (fps > 0 ? fps : 30);
  return { ...label, release: Math.max(0, Number((label.release + frames * frame).toFixed(4))) };
}

/** The "expected" block of a fixture, built from a coach's labels. */
export interface FixtureExpectation {
  shots: number;
  releases: number[];
  toleranceS: number;
  /** Let-downs the coach marked, by time; they must not be counted as shots. */
  letDowns: number[];
  /** Per real shot (in release order), the coach's 1–5 rating for each area rated. */
  ratings: Array<Partial<Record<CategoryId, number>>>;
  level: SkillLevel | null;
  source: 'labels';
}

export function expectedFromLabels(labels: ReportLabels): FixtureExpectation {
  const real = labels.shots.filter((shot) => shot.status === 'shot').sort((a, b) => a.release - b.release);
  return {
    shots: real.length,
    releases: real.map((shot) => Number(shot.release.toFixed(3))),
    toleranceS: LABEL_TOLERANCE_S,
    letDowns: labels.shots.filter((shot) => shot.status === 'let-down').map((shot) => Number(shot.release.toFixed(3))).sort((a, b) => a - b),
    ratings: real.map((shot) => ({ ...shot.ratings })),
    level: labels.level,
    source: 'labels',
  };
}

/**
 * A fixture file (src/video-analysis/fixtures): the report as exported, which holds the body landmarks and the
 * audio onsets but never the video or any image, with the "expected" block from the labels in front.
 */
export function fixtureFromReport(report: VideoAnalysisReport, labels: ReportLabels): string {
  const exported = JSON.parse(reportToJson(report)) as Record<string, unknown>;
  delete exported.labels;
  return JSON.stringify({ expected: expectedFromLabels(labels), ...exported });
}
