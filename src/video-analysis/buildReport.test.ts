import { describe, expect, it } from 'vitest';
import { detectOnsets } from './audio';
import { buildReport, summarizeReport, type BuildReportInput } from './buildReport';
import { makeScenario, scriptShots, syntheticSamples, type SyntheticScenario } from './testing/syntheticArcher';
import { synthesizeRangeAudio } from './testing/syntheticAudio';
import type { BowType } from './types';

function report(scenario: SyntheticScenario, options: { fps?: number; audio?: boolean; bowType?: BowType } = {}) {
  const fps = options.fps ?? 24;
  let audio: BuildReportInput['audio'] = null;
  if (options.audio) {
    const events = scenario.shots.flatMap((shot) => [
      { t: shot.release - 0.2, kind: 'clicker' as const },
      { t: shot.release, kind: 'release' as const },
      { t: shot.release + 0.45, kind: 'impact' as const },
    ]);
    const analysis = detectOnsets(synthesizeRangeAudio(scenario.durationS, events), 16000);
    audio = { kind: 'analysed', onsets: analysis.onsets, noiseFloorDb: analysis.noiseFloorDb, sampleRate: 16000, durationS: scenario.durationS };
  }
  return buildReport({
    id: 'test',
    createdAt: 1,
    samples: syntheticSamples(scenario, fps),
    source: { fileName: 'clip.mp4', fileSize: 1000, mimeType: 'video/mp4', durationS: scenario.durationS, width: 1280, height: 720, nativeFps: 30, analysisFps: fps, hasAudio: Boolean(options.audio) },
    settings: { quality: 'standard', requestedHandedness: 'auto', bowType: options.bowType ?? 'recurve', model: 'lite', delegate: 'CPU' },
    audio,
  });
}

describe('buildReport', () => {
  it('rates clean form highly with no focus areas', () => {
    const result = report(makeScenario({ shots: scriptShots(3) }), { audio: true });
    expect(result.shots).toHaveLength(3);
    expect(result.scores.overall as number).toBeGreaterThan(85);
    expect(result.scores.level).toBe('elite');
    expect(result.scores.confidence).toBe('high');
    expect(result.focusAreas).toHaveLength(0);
    expect(result.strengths.length).toBeGreaterThan(2);
    expect(result.settings.handednessSource).toBe('auto');
  });

  it('finds the faults in faulty form and ranks the worst first', () => {
    const faults = { bowElbowBend: 32, bowShoulderRaise: 0.05, swayAmplitude: 0.025, pluck: 0.8, headFlinch: 0.03, dropArm: 0.12 };
    const result = report(makeScenario({ shots: scriptShots(3, { faults }) }));
    const metrics = result.findings.map((finding) => finding.metric);
    expect(metrics).toContain('bowElbowAngle');
    expect(metrics).toContain('releaseBackFraction');
    expect(metrics).toContain('headMoveAtRelease');
    expect(metrics).toContain('bowShoulderRise');
    expect(result.focusAreas.length).toBeLessThanOrEqual(3);
    expect(new Set(result.focusAreas.map((finding) => finding.category)).size).toBe(result.focusAreas.length);
    expect(['beginner', 'intermediate']).toContain(result.scores.level);
    expect(result.scores.nextLevel).toBeDefined();
    const bentArm = result.findings.find((finding) => finding.metric === 'bowElbowAngle');
    expect(bentArm?.where.shotIndex).not.toBeNull();
    expect(bentArm?.where.joints).toContain('bowElbow');
    expect(result.plan.length).toBeGreaterThan(2);
  });

  it('caps the level when a fundamental fault remains', () => {
    const faults = { bowElbowBend: 24, pluck: 0.65, swayAmplitude: 0.012, headFlinch: 0.02 };
    const result = report(makeScenario({ shots: scriptShots(3, { faults }) }));
    expect(result.scores.overall as number).toBeGreaterThan(68);
    expect(result.scores.level).toBe('intermediate');
    expect(result.scores.levelCap?.level).toBe('intermediate');
    expect(result.scores.nextLevel?.focus[0]).toBe('release');
  });

  it('times clicker reaction and arrow flight from the audio', () => {
    const result = report(makeScenario({ shots: scriptShots(2) }), { audio: true });
    for (const shot of result.shots) {
      expect(shot.releaseSource).toBe('audio');
      expect(shot.metrics.clickerReaction?.value).toBeCloseTo(0.2, 2);
      expect(Math.abs((shot.audio?.flightTime ?? 0) - 0.45)).toBeLessThan(0.015);
    }
    expect(result.audio?.matchedReleases).toBe(2);
  });

  it('is cautious with a single shot', () => {
    const result = report(makeScenario({ shots: scriptShots(1) }));
    expect(result.shots).toHaveLength(1);
    expect(result.scores.confidence).not.toBe('high');
    expect(result.scores.confidenceReasons.join(' ')).toContain('Only 1 shot');
    expect(Object.keys(result.session)).toHaveLength(0);
  });

  it('gives no level when no shots are found', () => {
    const result = report(makeScenario({ shots: [], durationS: 6 }));
    expect(result.shots).toHaveLength(0);
    expect(result.scores.overall).toBeNull();
    expect(result.scores.level).toBeNull();
    expect(result.focusAreas).toHaveLength(0);
  });

  it('labels every frame with a phase and keeps the readout compact', () => {
    const result = report(makeScenario({ shots: scriptShots(1) }), { fps: 12 });
    const phases = new Set(result.frames.map((frame) => frame.phase));
    for (const phase of ['idle', 'draw', 'anchor', 'release', 'follow-through']) expect(phases.has(phase as never)).toBe(true);
    expect(result.frames).toHaveLength(result.samples.length);
  });

  it('catches a dead release without audio, and skips release travel for compound bows', () => {
    const recurve = report(makeScenario({ shots: scriptShots(2, { faults: { staticRelease: true } }) }), { bowType: 'recurve' });
    expect(recurve.shots).toHaveLength(2);
    expect(recurve.letDowns).toHaveLength(0);
    expect(recurve.findings.some((finding) => finding.metric === 'releaseTravel')).toBe(true);
    const compound = report(makeScenario({ shots: scriptShots(2, { faults: { staticRelease: true } }) }), { bowType: 'compound' });
    expect(compound.shots).toHaveLength(2);
    expect(compound.findings.some((finding) => finding.metric === 'releaseTravel')).toBe(false);
  });

  it('summarises for the history list', () => {
    const result = report(makeScenario({ shots: scriptShots(2) }));
    const summary = summarizeReport(result, true);
    expect(summary).toMatchObject({ id: 'test', fileName: 'clip.mp4', shots: 2, hasVideo: true, view: 'broadside' });
  });

  it('analyses only the selected range of a longer video', () => {
    const scenario = makeScenario({ shots: scriptShots(4) });
    const range = { start: 9.5, end: 28.5 };
    // The browser pipeline tracks only the range but decodes the whole audio track.
    const samples = syntheticSamples(scenario, 24).filter((sample) => sample.t >= range.start && sample.t <= range.end);
    const releases = scenario.shots.map((shot) => shot.release);
    const analysis = detectOnsets(synthesizeRangeAudio(scenario.durationS, releases.map((t) => ({ t, kind: 'release' as const }))), 16000);
    const result = buildReport({
      id: 'trimmed', createdAt: 1, samples,
      source: { fileName: 'long.mp4', fileSize: 1000, mimeType: 'video/mp4', durationS: scenario.durationS, range, width: 1280, height: 720, nativeFps: 30, analysisFps: 24, hasAudio: true },
      settings: { quality: 'standard', requestedHandedness: 'auto', bowType: 'recurve', model: 'lite', delegate: 'CPU' },
      audio: { kind: 'analysed', onsets: analysis.onsets, noiseFloorDb: analysis.noiseFloorDb, sampleRate: 16000, durationS: scenario.durationS },
    });
    expect(result.source.range).toEqual(range);
    // Shots 1 and 4 fall outside the range: their sounds must not turn into audio-only shots.
    expect(result.shots.map((shot) => shot.source)).toEqual(['video+audio', 'video+audio']);
    expect(result.shots[0].release).toBeCloseTo(releases[1], 1);
    expect(result.shots[1].release).toBeCloseTo(releases[2], 1);
    expect(result.audio?.onsets.length).toBeGreaterThan(0);
    expect(result.audio?.onsets.every((onset) => onset.t >= range.start && onset.t <= range.end)).toBe(true);
    expect(result.shots.every((shot) => (shot.drawStart ?? range.start) >= range.start && (shot.followThroughEnd ?? range.end) <= range.end)).toBe(true);
    expect(result.limitations.some((line) => line.startsWith('Only 0:09.5–0:28.5 of the'))).toBe(true);
  });

  it('says in the report when the audio could not be used', () => {
    const result = buildReport({
      id: 'quiet', createdAt: 1, samples: syntheticSamples(makeScenario(), 24),
      source: { fileName: 'clip.mp4', fileSize: 1000, mimeType: 'video/mp4', durationS: 40 * 60, width: 1280, height: 720, nativeFps: 30, analysisFps: 24, hasAudio: false },
      settings: { quality: 'standard', requestedHandedness: 'auto', bowType: 'recurve', model: 'lite', delegate: 'CPU' },
      audio: { kind: 'unavailable', reason: 'The video is longer than 30 minutes, so its audio was not decoded.' },
    });
    expect(result.audio).toMatchObject({ available: false, reason: 'The video is longer than 30 minutes, so its audio was not decoded.' });
    expect(result.limitations).toContain('The video is longer than 30 minutes, so its audio was not decoded.');
  });
});
