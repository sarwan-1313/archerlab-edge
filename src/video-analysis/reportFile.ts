import type { ArcherHandedness } from '../types/biomechanics';
import type { AudioInput, BuildReportInput } from './buildReport';
import type { AnalysisSettings, AnchorObservation, AudioOnset, AudioSummary, BowType, PoseSample, VideoAnalysisReport, VideoSourceInfo } from './types';

/**
 * Turns a stored or exported report back into engine input, so it can be
 * scored again (with new settings or a newer engine) without re-tracking the
 * video. Exported files are untrusted, so their shape is checked first.
 */

const LANDMARKS = 33;
const BOW_TYPES: readonly BowType[] = ['recurve', 'compound', 'barebow', 'traditional', 'unknown'];

/** A file that cannot be opened as a report; the message is shown to the athlete. */
export class ReportFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportFileError';
  }
}

/** Settings that can change without re-tracking. */
export interface RescoreSettings {
  bowType: BowType;
  requestedHandedness: 'auto' | ArcherHandedness;
}

type ReportParts = Pick<VideoAnalysisReport, 'id' | 'createdAt' | 'samples' | 'source' | 'settings' | 'audio' | 'anchorFrames'> & {
  tracking?: Partial<VideoAnalysisReport['tracking']>;
};

function audioInput(audio: AudioSummary | null): AudioInput | null {
  if (!audio) return null;
  if (!audio.available) return { kind: 'unavailable', reason: audio.reason ?? 'Audio was not analysed.' };
  return { kind: 'analysed', onsets: audio.onsets, noiseFloorDb: audio.noiseFloorDb, sampleRate: audio.sampleRate, durationS: audio.durationS };
}

function toInput(report: ReportParts, changes?: Partial<RescoreSettings>): BuildReportInput {
  const { quality, requestedHandedness, bowType, model, delegate } = report.settings;
  return {
    id: report.id,
    createdAt: report.createdAt,
    samples: report.samples,
    source: report.source,
    settings: { quality, model, delegate, requestedHandedness: changes?.requestedHandedness ?? requestedHandedness, bowType: changes?.bowType ?? bowType },
    // Keeps a profile-supplied hand when the clip itself does not show one.
    profileHandedness: report.settings.handednessSource === 'profile' ? report.settings.handedness : undefined,
    audio: audioInput(report.audio),
    processingMs: report.tracking?.processingMs,
    refinedFrames: report.tracking?.refinedFrames,
    anchorFrames: report.anchorFrames,
  };
}

/** Engine input for scoring a report again from its stored samples and audio onsets. */
export function inputFromReport(report: VideoAnalysisReport, changes?: Partial<RescoreSettings>): BuildReportInput {
  return toInput(report, changes);
}

// ---------- validation ----------

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isOneOf = <T extends string>(value: unknown, options: readonly T[]): value is T => typeof value === 'string' && (options as readonly string[]).includes(value);

function landmarks(value: unknown, stride: number, frame: number): Float32Array | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value) || value.length !== LANDMARKS * stride || !value.every(isNumber)) {
    throw new ReportFileError(`Frame ${frame} has malformed landmarks, so the file cannot be re-analysed.`);
  }
  return Float32Array.from(value);
}

function restoreSamples(value: unknown): PoseSample[] {
  if (!Array.isArray(value)) throw new ReportFileError('This file has no pose landmarks, so it cannot be re-analysed.');
  if (!value.length) throw new ReportFileError('This report has no pose landmarks (copies kept in an account leave them out), so it cannot be re-analysed. Export it from the device that analysed the clip.');
  const samples = value.map((sample, index): PoseSample => {
    if (!isRecord(sample) || !isNumber(sample.t) || sample.t < 0) throw new ReportFileError(`Frame ${index + 1} is missing its time, so the file cannot be re-analysed.`);
    return { t: sample.t, image: landmarks(sample.image, 4, index + 1), world: landmarks(sample.world, 3, index + 1) };
  });
  if (!samples.some((sample) => sample.image)) throw new ReportFileError('Nobody was tracked in any frame of this report, so there is nothing to re-analyse.');
  return samples.sort((a, b) => a.t - b.t);
}

function restoreSource(value: unknown): VideoSourceInfo {
  if (!isRecord(value)
    || typeof value.fileName !== 'string' || typeof value.mimeType !== 'string'
    || !isNumber(value.fileSize) || !isNumber(value.durationS) || !isNumber(value.width) || !isNumber(value.height)
    || !(value.nativeFps === null || isNumber(value.nativeFps)) || !isNumber(value.analysisFps) || value.analysisFps <= 0
    || typeof value.hasAudio !== 'boolean') {
    throw new ReportFileError('The video details in this report are missing or malformed.');
  }
  const { fileName, fileSize, mimeType, durationS, width, height, nativeFps, analysisFps, hasAudio } = value;
  const source: VideoSourceInfo = { fileName, fileSize, mimeType, durationS, width, height, nativeFps, analysisFps, hasAudio };
  if (value.range !== undefined) {
    const range = value.range;
    if (!isRecord(range) || !isNumber(range.start) || !isNumber(range.end) || range.start < 0 || range.end <= range.start || range.end > durationS + 0.01) {
      throw new ReportFileError('The analysed range in this report is malformed.');
    }
    source.range = { start: range.start, end: range.end };
  }
  return source;
}

function restoreSettings(value: unknown): AnalysisSettings {
  if (!isRecord(value)
    || !isOneOf(value.quality, ['fast', 'standard', 'max'] as const)
    || !isOneOf(value.requestedHandedness, ['auto', 'left', 'right'] as const)
    || !isOneOf(value.bowType, BOW_TYPES)
    || !isOneOf(value.model, ['lite', 'full', 'heavy'] as const)
    || !isOneOf(value.delegate, ['GPU', 'CPU', 'unknown'] as const)) {
    throw new ReportFileError('The analysis settings in this report are missing or malformed.');
  }
  return {
    quality: value.quality, requestedHandedness: value.requestedHandedness, bowType: value.bowType, model: value.model, delegate: value.delegate,
    handedness: isOneOf(value.handedness, ['left', 'right'] as const) ? value.handedness : 'right',
    handednessSource: isOneOf(value.handednessSource, ['auto', 'profile', 'manual', 'default'] as const) ? value.handednessSource : 'default',
  };
}

function isOnset(value: unknown): value is AudioOnset {
  return isRecord(value) && isNumber(value.t) && isNumber(value.strength) && isNumber(value.peakDb) && isNumber(value.centroidHz) && isNumber(value.decayS);
}

/** Anchor measurements are optional; malformed entries are dropped rather than failing the whole file. */
function restoreAnchorFrames(value: unknown): AnchorObservation[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const keys = ['t', 'x', 'y', 'toChin', 'toMouthCorner', 'toNose', 'visibility'] as const;
  return value.filter((item): item is AnchorObservation => isRecord(item) && keys.every((key) => isNumber(item[key])))
    .map((item) => Object.fromEntries(keys.map((key) => [key, item[key]])) as unknown as AnchorObservation);
}

function restoreAudio(value: unknown): AudioSummary | null {
  if (value === null || value === undefined) return null;
  const malformed = new ReportFileError('The audio data in this report is malformed.');
  if (!isRecord(value) || typeof value.available !== 'boolean') throw malformed;
  const empty = { durationS: 0, sampleRate: 0, noiseFloorDb: -120, onsets: [], syncOffsetS: null, matchedReleases: 0, unmatchedStrong: 0 };
  if (!value.available) return { ...empty, available: false, reason: typeof value.reason === 'string' ? value.reason : undefined };
  if (!Array.isArray(value.onsets) || !value.onsets.every(isOnset) || !isNumber(value.noiseFloorDb) || !isNumber(value.sampleRate) || !isNumber(value.durationS)) throw malformed;
  const onsets = value.onsets.map(({ t, strength, peakDb, centroidHz, decayS }) => ({ t, strength, peakDb, centroidHz, decayS }));
  return { ...empty, available: true, onsets, noiseFloorDb: value.noiseFloorDb, sampleRate: value.sampleRate, durationS: value.durationS };
}

/** Validates a parsed report (e.g. from an exported file) and returns engine input for it. Throws ReportFileError. */
export function restoreReportInput(value: unknown): BuildReportInput {
  if (!isRecord(value) || !('samples' in value) || !('settings' in value)) throw new ReportFileError('This file is not an ArcherLab video report.');
  if (typeof value.id !== 'string' || !value.id || !isNumber(value.createdAt)) throw new ReportFileError('This report is missing its id or date.');
  const tracking = isRecord(value.tracking) ? value.tracking : {};
  return toInput({
    id: value.id,
    createdAt: value.createdAt,
    samples: restoreSamples(value.samples),
    source: restoreSource(value.source),
    settings: restoreSettings(value.settings),
    audio: restoreAudio(value.audio),
    anchorFrames: restoreAnchorFrames(value.anchorFrames),
    tracking: {
      processingMs: isNumber(tracking.processingMs) ? tracking.processingMs : undefined,
      refinedFrames: isNumber(tracking.refinedFrames) ? tracking.refinedFrames : undefined,
    },
  });
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new ReportFileError('This file is not valid JSON. Choose a report exported with “Export report (JSON)”.');
  }
}

/** Parses the text of an exported report file. Throws ReportFileError with a message for the athlete. */
export function parseReportFile(text: string): BuildReportInput {
  return restoreReportInput(parseJson(text));
}

/** The reports in a full export (Privacy → "Export all video reports"), with how many could not be restored. */
export interface ReportBundle { inputs: BuildReportInput[]; skipped: number }

/**
 * Reads either one exported report or a full export of every report. Throws
 * ReportFileError for anything else, or for a full export with nothing usable in it.
 */
export function readReportFile(text: string): { report: BuildReportInput } | { bundle: ReportBundle } {
  const value = parseJson(text);
  if (!isRecord(value) || !Array.isArray(value.reports)) return { report: restoreReportInput(value) };
  const inputs: BuildReportInput[] = [];
  let skipped = 0;
  for (const item of value.reports) {
    try {
      inputs.push(restoreReportInput(item));
    } catch (error) {
      if (!(error instanceof ReportFileError)) throw error;
      skipped += 1;
    }
  }
  if (!inputs.length) {
    throw new ReportFileError(value.reports.length ? 'None of the reports in this export could be re-analysed: they have no pose landmarks or are malformed.' : 'This export has no reports in it.');
  }
  return { bundle: { inputs, skipped } };
}
