import { describe, expect, it } from 'vitest';
import { buildReport } from '../buildReport';
import { parseReportFile } from '../reportFile';
import { makeScenario, scriptShots, syntheticSamples } from '../testing/syntheticArcher';
import { expectedFromLabels, fixtureFromReport, initialLabels, stepRelease } from './labels';
import { matchShots } from './stats';

const scenario = makeScenario({ shots: scriptShots(3) });
const report = buildReport({
  id: 'labelled', createdAt: 1,
  samples: syntheticSamples(scenario, 24),
  source: { fileName: 'clip.mp4', fileSize: 1000, mimeType: 'video/mp4', durationS: scenario.durationS, width: 1280, height: 720, nativeFps: 30, analysisFps: 24, hasAudio: false },
  settings: { quality: 'standard', requestedHandedness: 'auto', bowType: 'recurve', model: 'lite', delegate: 'CPU' },
  audio: null,
});

describe('labels', () => {
  it('start from the engine\'s shots, all counted as real and unrated', () => {
    const labels = initialLabels(report, 5);
    expect(labels.shots.map((shot) => shot.release)).toEqual(report.shots.map((shot) => shot.release));
    expect(labels.shots.every((shot) => shot.status === 'shot' && Object.keys(shot.ratings).length === 0)).toBe(true);
    expect(labels).toMatchObject({ level: null, labelledAt: 5 });
  });

  it('step the release by whole frames of the clip, never below zero', () => {
    const label = { engineIndex: 1, release: 2, status: 'shot' as const, ratings: {} };
    expect(stepRelease(label, 3, 30).release).toBeCloseTo(2.1, 9);
    expect(stepRelease(label, -1, 25).release).toBeCloseTo(1.96, 9);
    expect(stepRelease({ ...label, release: 0.01 }, -1, 30).release).toBe(0);
  });

  it('become an expected block: real shots in release order, let-downs and false shots left out', () => {
    const labels = initialLabels(report);
    labels.shots[0] = { ...labels.shots[0], status: 'false' };
    labels.shots[1] = { ...labels.shots[1], status: 'let-down' };
    labels.shots.push({ engineIndex: null, release: 0.5, status: 'shot', ratings: { posture: 4 } });
    labels.level = 'intermediate';
    const expected = expectedFromLabels(labels);
    expect(expected.shots).toBe(2);
    expect(expected.releases[0]).toBe(0.5);
    expect(expected.ratings[0]).toEqual({ posture: 4 });
    expect(expected.letDowns).toEqual([Number(report.shots[1].release.toFixed(3))]);
    expect(expected.level).toBe('intermediate');
  });
});

describe('fixtureFromReport', () => {
  const labels = initialLabels(report);
  labels.shots = labels.shots.map((shot) => ({ ...shot, release: shot.release + 0.04, ratings: { posture: 4, release: 3 } }));
  labels.level = 'advanced';
  const text = fixtureFromReport({ ...report, labels }, labels);
  const json = JSON.parse(text) as Record<string, unknown>;

  it('puts the expected block first and carries the landmarks, never a video, an image or the labels themselves', () => {
    expect(Object.keys(json)[0]).toBe('expected');
    expect(Array.isArray(json.samples)).toBe(true);
    expect(Object.keys(json)).not.toEqual(expect.arrayContaining(['labels']));
    expect(Object.keys(json).filter((key) => /video|image/i.test(key))).toEqual([]);
    expect(text).not.toMatch(/data:(?:image|video)\//);
  });

  it('reads back like any fixture, and the engine\'s releases match the labelled ones', () => {
    const rebuilt = buildReport(parseReportFile(text));
    const expected = (json.expected as { releases: number[]; toleranceS: number });
    const match = matchShots(rebuilt.shots.map((shot) => shot.release), expected.releases, expected.toleranceS);
    expect(match.truePositives).toBe(3);
    expect(match.errorsMs.every((ms) => Math.abs(ms + 40) < 1)).toBe(true);
  });
});
