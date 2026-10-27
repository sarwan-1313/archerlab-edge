import { describe, expect, it } from 'vitest';
import { buildReport } from './buildReport';
import { makeScenario, scriptShots, syntheticSamples, type SyntheticScenario } from './testing/syntheticArcher';
import { isVideoShot, sampleToPoseResult, toShotAnalyses } from './toShotAnalyses';

function report(scenario: SyntheticScenario, fps = 24) {
  return buildReport({
    id: 'report-1',
    createdAt: 1_800_000_000_000,
    samples: syntheticSamples(scenario, fps),
    source: { fileName: 'range-day.mp4', fileSize: 1000, mimeType: 'video/mp4', durationS: scenario.durationS, width: 1280, height: 720, nativeFps: 30, analysisFps: fps, hasAudio: false },
    settings: { quality: 'standard', requestedHandedness: 'auto', bowType: 'recurve', model: 'lite', delegate: 'CPU' },
    audio: null,
  });
}

describe('toShotAnalyses', () => {
  const scenario = makeScenario({ shots: scriptShots(3) });
  const videoReport = report(scenario);

  it('captures one ShotAnalysis per detected shot through the live engine', () => {
    expect(videoReport.shots).toHaveLength(3);
    const shots = toShotAnalyses(videoReport);
    expect(shots).toHaveLength(3);
    shots.forEach((shot, index) => {
      expect(isVideoShot(shot)).toBe(true);
      expect(shot.id).toBe(`video-shot_report-1_${videoReport.shots[index].index}`);
      expect(shot.releaseSource).toBe('video-detected');
      expect(shot.handedness).toBe(videoReport.settings.handedness);
      expect(shot.videoSource).toEqual({ reportId: 'report-1', fileName: 'range-day.mp4' });
      expect(shot.preReleaseFrames.length).toBeGreaterThan(0);
      expect(shot.postReleaseFrames.length).toBeGreaterThan(0);
      expect(shot.summary.holdShoulderVariationDeg.available).toBe(true);
      expect(shot.releaseMetrics.bowArm.before.available).toBe(true);
    });
  });

  it('marks each release at the video-detected time', () => {
    const shots = toShotAnalyses(videoReport);
    shots.forEach((shot, index) => {
      expect(shot.releaseTimestampMs).toBe(videoReport.shots[index].release * 1000);
      // The detected release should land close to the scripted one.
      expect(Math.abs(shot.releaseTimestampMs - scenario.shots[index].release * 1000)).toBeLessThan(150);
    });
    // In order, and never later than the analysis itself (release times can be minutes into a video).
    expect(shots.map((shot) => shot.capturedAt)).toEqual([videoReport.createdAt, videoReport.createdAt + 1, videoReport.createdAt + 2]);
  });

  it('does not drop a release that comes soon after the previous one', () => {
    // The live engine refuses a new release for 1.8 s after a shot; the video engine allows 1.5 s spacing.
    const first = videoReport.shots[0];
    const close = { ...first, index: 99, release: first.release + 1.6 };
    const shots = toShotAnalyses({ ...videoReport, shots: [first, close, ...videoReport.shots.slice(1)] });
    expect(shots.map((shot) => shot.id)).toEqual([
      `video-shot_report-1_${first.index}`,
      'video-shot_report-1_99',
      `video-shot_report-1_${videoReport.shots[1].index}`,
      `video-shot_report-1_${videoReport.shots[2].index}`,
    ]);
    expect(shots[1].releaseTimestampMs).toBe(close.release * 1000);
  });

  it('skips audio-only shots', () => {
    const withAudioOnly = { ...videoReport, shots: videoReport.shots.map((shot, index) => (index === 1 ? { ...shot, source: 'audio-only' as const } : shot)) };
    const shots = toShotAnalyses(withAudioOnly);
    expect(shots.map((shot) => shot.id)).toEqual([
      `video-shot_report-1_${videoReport.shots[0].index}`,
      `video-shot_report-1_${videoReport.shots[2].index}`,
    ]);
  });

  it('finishes a shot when the clip ends during the follow-through', () => {
    const lastRelease = videoReport.shots[2].release;
    const truncated = { ...videoReport, samples: videoReport.samples.filter((sample) => sample.t <= lastRelease + 0.3) };
    const shots = toShotAnalyses(truncated);
    expect(shots).toHaveLength(3);
    expect(shots[2].postReleaseFrames.length).toBeGreaterThan(0);
  });

  it('returns no shots for a report without landmarks', () => {
    expect(toShotAnalyses({ ...videoReport, samples: [] })).toEqual([]);
  });

  it('unpacks compact landmarks into a PoseResult', () => {
    const sample = videoReport.samples.find((item) => item.image)!;
    const pose = sampleToPoseResult(sample);
    expect(pose.timestamp).toBe(sample.t * 1000);
    expect(pose.athleteDetected).toBe(true);
    expect(pose.landmarks).toHaveLength(33);
    expect(pose.worldLandmarks).toHaveLength(33);
    expect(pose.landmarks[11].x).toBeCloseTo(sample.image![44]);
    expect(pose.worldLandmarks[11].z).toBeCloseTo(sample.world![35]);
    expect(sampleToPoseResult({ t: 1, image: null, world: null }).athleteDetected).toBe(false);
  });
});
