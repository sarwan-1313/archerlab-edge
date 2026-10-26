import { describe, expect, it } from 'vitest';
import { detectOnsets } from './audio';
import { buildReport, type BuildReportInput } from './buildReport';
import { ReportFileError, inputFromReport, parseReportFile, restoreReportInput } from './reportFile';
import { reportToJson } from './storage';
import { makeScenario, scriptShots, syntheticSamples } from './testing/syntheticArcher';
import { synthesizeRangeAudio } from './testing/syntheticAudio';

const scenario = makeScenario({ shots: scriptShots(3) });

function analysed(options: { audio?: boolean; requestedHandedness?: 'auto' | 'left' | 'right' } = {}) {
  let audio: BuildReportInput['audio'] = { kind: 'unavailable', reason: 'No audio track.' };
  if (options.audio) {
    const events = scenario.shots.flatMap((shot) => [{ t: shot.release, kind: 'release' as const }, { t: shot.release + 0.45, kind: 'impact' as const }]);
    const analysis = detectOnsets(synthesizeRangeAudio(scenario.durationS, events), 16000);
    audio = { kind: 'analysed', onsets: analysis.onsets, noiseFloorDb: analysis.noiseFloorDb, sampleRate: 16000, durationS: scenario.durationS };
  }
  return buildReport({
    id: 'video_1_abc',
    createdAt: 1_800_000_000_000,
    samples: syntheticSamples(scenario, 24),
    source: { fileName: 'clip.mp4', fileSize: 1000, mimeType: 'video/mp4', durationS: scenario.durationS, width: 1280, height: 720, nativeFps: 30, analysisFps: 24, hasAudio: Boolean(options.audio) },
    settings: { quality: 'standard', requestedHandedness: options.requestedHandedness ?? 'auto', bowType: 'recurve', model: 'lite', delegate: 'CPU' },
    audio,
    processingMs: 4200,
    refinedFrames: 12,
  });
}

const exported = (mutate: (value: Record<string, unknown>) => void = () => undefined) => {
  const value = JSON.parse(reportToJson(analysed())) as Record<string, unknown>;
  mutate(value);
  return JSON.stringify(value);
};

function expectFileError(text: string, message: RegExp) {
  expect(() => parseReportFile(text)).toThrow(ReportFileError);
  expect(() => parseReportFile(text)).toThrow(message);
}

describe('report files', () => {
  it('restores an exported report and scores it the same way again', () => {
    const original = analysed({ audio: true });
    const input = parseReportFile(reportToJson(original));
    expect(input.samples[10].image).toBeInstanceOf(Float32Array);
    expect(input.samples[10].world).toBeInstanceOf(Float32Array);
    expect(input.samples[10].image).toHaveLength(33 * 4);
    expect(input.audio).toEqual(expect.objectContaining({ kind: 'analysed', onsets: original.audio?.onsets }));
    const rebuilt = buildReport(input);
    expect(rebuilt.id).toBe(original.id);
    expect(rebuilt.createdAt).toBe(original.createdAt);
    expect(rebuilt.tracking.processingMs).toBe(4200);
    expect(rebuilt.tracking.refinedFrames).toBe(12);
    expect(rebuilt.shots).toHaveLength(original.shots.length);
    rebuilt.shots.forEach((shot, index) => {
      expect(shot.release).toBeCloseTo(original.shots[index].release, 2);
      expect(shot.releaseSource).toBe(original.shots[index].releaseSource);
    });
    expect(rebuilt.scores.overall).toBeCloseTo(original.scores.overall as number, 0);
  });

  it('keeps unavailable audio as unavailable', () => {
    expect(parseReportFile(exported()).audio).toEqual({ kind: 'unavailable', reason: 'No audio track.' });
  });

  it('sorts frames that are out of order', () => {
    const input = parseReportFile(exported((value) => { (value.samples as unknown[]).reverse(); }));
    expect(input.samples.map((sample) => sample.t)).toEqual([...input.samples.map((sample) => sample.t)].sort((a, b) => a - b));
  });

  it('rejects files that are not reports', () => {
    expectFileError('not json', /not valid JSON/);
    expectFileError('[]', /not an ArcherLab video report/);
    expectFileError('{"hello": "world"}', /not an ArcherLab video report/);
    expectFileError(exported((value) => { delete value.id; }), /missing its id/);
  });

  it('explains when a report has no landmarks', () => {
    expectFileError(exported((value) => { value.samples = []; }), /no pose landmarks/);
    expectFileError(exported((value) => { value.samples = (value.samples as Array<Record<string, unknown>>).map((sample) => ({ ...sample, image: null, world: null })); }), /Nobody was tracked/);
  });

  it('rejects malformed landmarks, settings, video details and audio', () => {
    expectFileError(exported((value) => { (value.samples as Array<Record<string, unknown>>)[5].image = [1, 2, 3]; }), /Frame 6 has malformed landmarks/);
    expectFileError(exported((value) => { ((value.samples as Array<Record<string, unknown>>)[5].world as unknown[])[0] = 'x'; }), /Frame 6 has malformed landmarks/);
    expectFileError(exported((value) => { (value.samples as Array<Record<string, unknown>>)[2].t = -1; }), /Frame 3 is missing its time/);
    expectFileError(exported((value) => { (value.settings as Record<string, unknown>).bowType = 'crossbow'; }), /analysis settings/);
    expectFileError(exported((value) => { (value.source as Record<string, unknown>).analysisFps = 0; }), /video details/);
    expectFileError(exported((value) => { value.audio = { available: true, onsets: [{ t: 1 }] }; }), /audio data/);
  });

  it('accepts an already-parsed value', () => {
    expect(restoreReportInput(JSON.parse(exported())).samples.length).toBeGreaterThan(0);
  });

  it('re-scores a stored report with new settings without re-tracking', () => {
    const original = analysed();
    expect(original.settings.handednessSource).toBe('auto');
    const input = inputFromReport(original, { bowType: 'compound', requestedHandedness: 'left' });
    expect(input.samples).toBe(original.samples);
    expect(input.settings).toEqual({ quality: 'standard', model: 'lite', delegate: 'CPU', requestedHandedness: 'left', bowType: 'compound' });
    const rescored = buildReport(input);
    expect(rescored.id).toBe(original.id);
    expect(rescored.settings.bowType).toBe('compound');
    expect(rescored.settings.handedness).toBe('left');
    expect(rescored.settings.handednessSource).toBe('manual');
    // Back to auto-detection finds the right-handed archer again.
    const back = buildReport(inputFromReport(rescored, { requestedHandedness: 'auto' }));
    expect(back.settings.handedness).toBe('right');
    expect(back.shots).toHaveLength(original.shots.length);
  });
});
