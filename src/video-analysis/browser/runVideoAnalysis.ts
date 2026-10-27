import type { ArcherHandedness } from '../../types/biomechanics';
import { detectOnsets } from '../audio';
import { buildReport, type AudioInput } from '../buildReport';
import { QUALITY_FPS, VIDEO_CONFIG } from '../config';
import { formatClock } from '../format';
import { audioSkipReason, onsetsInRange, rangeLength, rangeProblem } from '../range';
import type { AnalysisQuality, AnchorObservation, BowType, PoseModelVariant, PoseSample, TimeRange, VideoAnalysisReport } from '../types';
import { measureAnchorDetail } from './anchorDetail';
import { decodeAudioTrack } from './audioDecode';
import { AnalysisCancelledError, captureRanges, resolveDuration } from './frameCapture';
import { createVideoPoseModel } from './poseModel';

export type AnalysisStage = 'loading' | 'audio' | 'model' | 'tracking' | 'refining' | 'anchor' | 'scoring';

export interface AnalysisProgress {
  stage: AnalysisStage;
  /** Overall progress 0–1. */
  fraction: number;
  message: string;
  currentTime?: number;
  sample?: PoseSample;
  framesProcessed?: number;
  playbackRate?: number;
}

export interface RunVideoAnalysisOptions {
  file: File;
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  quality: AnalysisQuality;
  requestedHandedness: 'auto' | ArcherHandedness;
  profileHandedness?: ArcherHandedness;
  bowType: BowType;
  model: PoseModelVariant;
  analyzeAudio: boolean;
  /** Part of the video to analyse, in seconds; the whole clip when omitted. */
  range?: TimeRange;
  signal: AbortSignal;
  onProgress: (progress: AnalysisProgress) => void;
}

const STAGE_SPAN: Record<AnalysisStage, [number, number]> = {
  loading: [0, 0.02],
  audio: [0.02, 0.08],
  model: [0.08, 0.12],
  tracking: [0.12, 0.85],
  refining: [0.85, 0.94],
  anchor: [0.94, 0.98],
  scoring: [0.98, 1],
};

function overall(stage: AnalysisStage, fraction: number): number {
  const [from, to] = STAGE_SPAN[stage];
  return from + (to - from) * Math.min(1, Math.max(0, fraction));
}

export class VideoUnsupportedError extends Error {}

export const UNPLAYABLE_VIDEO_MESSAGE = 'This browser cannot play this video file. iPhone .mov files recorded in HEVC often fail outside Safari: try Safari, or export the clip as an H.264 MP4.';

/** Loads a file into the given video element and resolves once metadata is known. */
export function loadVideo(video: HTMLVideoElement, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('error', onError);
    };
    const onLoaded = () => { cleanup(); resolve(); };
    const onError = () => {
      cleanup();
      reject(new VideoUnsupportedError(UNPLAYABLE_VIDEO_MESSAGE));
    };
    video.addEventListener('loadedmetadata', onLoaded);
    video.addEventListener('error', onError);
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    if (video.src !== url) video.src = url;
    else if (video.readyState >= 1) { cleanup(); resolve(); }
  });
}

function mergeWindows(times: number[], half: number, range: TimeRange): Array<[number, number]> {
  const windows = [...times].sort((a, b) => a - b).map((t) => [Math.max(range.start, t - half), Math.min(range.end, t + half)] as [number, number]);
  const merged: Array<[number, number]> = [];
  for (const window of windows) {
    const last = merged.at(-1);
    if (last && window[0] <= last[1]) last[1] = Math.max(last[1], window[1]);
    else merged.push([...window]);
  }
  return merged;
}

function mergeSamples(base: PoseSample[], refined: PoseSample[]): PoseSample[] {
  const all = [...refined, ...base].sort((a, b) => a.t - b.t);
  const out: PoseSample[] = [];
  for (const sample of all) {
    const last = out.at(-1);
    if (last && Math.abs(sample.t - last.t) < 0.002) continue;
    out.push(sample);
  }
  return out;
}

/**
 * Full browser pipeline: audio → pose tracking pass → precision pass around
 * each release → report. Everything runs locally in the browser.
 */
export async function runVideoAnalysis(options: RunVideoAnalysisOptions): Promise<VideoAnalysisReport> {
  const started = performance.now();
  const { video, signal } = options;
  const progress = (stage: AnalysisStage, fraction: number, message: string, extra: Partial<AnalysisProgress> = {}) =>
    options.onProgress({ stage, fraction: overall(stage, fraction), message, ...extra });
  const checkAbort = () => { if (signal.aborted) throw new AnalysisCancelledError(); };

  progress('loading', 0, 'Reading the video…');
  const duration = await resolveDuration(video);
  if (!Number.isFinite(duration) || duration <= 0) throw new VideoUnsupportedError('The video length could not be read. Try exporting the clip again as an MP4.');
  const range = options.range ?? { start: 0, end: duration };
  const problem = rangeProblem(range, duration);
  if (problem) throw new VideoUnsupportedError(problem);
  const span = rangeLength(range);

  // 1. Audio (fast, and it sharpens release timing).
  let audio: AudioInput | null = null;
  const skipAudio = audioSkipReason(duration);
  if (options.analyzeAudio && skipAudio) {
    audio = { kind: 'unavailable', reason: skipAudio };
  } else if (options.analyzeAudio) {
    progress('audio', 0, 'Listening for releases, clicker and impacts…');
    const decoded = await decodeAudioTrack(options.file);
    checkAbort();
    if (decoded.status === 'decoded') {
      const analysis = detectOnsets(decoded.samples, decoded.sampleRate);
      audio = { kind: 'analysed', onsets: onsetsInRange(analysis.onsets, range), noiseFloorDb: analysis.noiseFloorDb, sampleRate: decoded.sampleRate, durationS: decoded.durationS };
    } else {
      audio = { kind: 'unavailable', reason: decoded.reason };
    }
    progress('audio', 1, 'Audio analysed.');
  }

  // 2. First tracking pass over the selected range.
  progress('model', 0, 'Loading the pose model…');
  const fps = QUALITY_FPS[options.quality];
  const first = await createVideoPoseModel(options.model);
  let pass1;
  try {
    checkAbort();
    progress('tracking', 0, 'Tracking the archer frame by frame…');
    pass1 = await captureRanges({
      video, canvas: options.canvas, landmarker: first.landmarker, ranges: [[range.start, range.end]], fps, signal,
      onProgress: (info) => progress('tracking', info.fraction, `Tracking frame by frame — ${(info.t - range.start).toFixed(1)} s of ${span.toFixed(1)} s`, {
        currentTime: info.t, sample: info.sample, framesProcessed: info.processed, playbackRate: info.playbackRate,
      }),
    });
  } finally {
    first.landmarker.close();
  }
  checkAbort();
  // A file that stopped playing partway is analysed up to that point (captureRanges fails when too little was tracked).
  const analysed = pass1.stalledAt === null ? range : { start: range.start, end: pass1.stalledAt };

  const source = {
    fileName: options.file.name,
    fileSize: options.file.size,
    mimeType: options.file.type || 'video/*',
    durationS: duration,
    range: analysed,
    width: video.videoWidth,
    height: video.videoHeight,
    nativeFps: pass1.nativeFps,
    analysisFps: fps,
    hasAudio: audio?.kind === 'analysed',
  };
  const settings = {
    quality: options.quality,
    requestedHandedness: options.requestedHandedness,
    bowType: options.bowType,
    model: first.variant,
    delegate: first.delegate,
  };

  // 3. Precision pass: re-track each release at the native frame rate.
  let samples = pass1.samples;
  let refinedFrames = 0;
  const nativeFps = pass1.nativeFps ?? 30;
  if (nativeFps > fps * 1.15) {
    const preliminary = buildReport({ samples, source, settings, profileHandedness: options.profileHandedness, audio });
    const releases = preliminary.shots.filter((shot) => shot.source !== 'audio-only').map((shot) => shot.release);
    if (releases.length) {
      progress('refining', 0, `Precision pass around ${releases.length} release${releases.length === 1 ? '' : 's'}…`);
      const second = await createVideoPoseModel(options.model);
      try {
        checkAbort();
        const refined = await captureRanges({
          video, canvas: options.canvas, landmarker: second.landmarker,
          ranges: mergeWindows(releases, VIDEO_CONFIG.refineWindowS, analysed), fps: Math.min(nativeFps, 60), signal, allowPartial: true,
          onProgress: (info) => progress('refining', info.fraction, `Precision pass — ${info.t.toFixed(1)} s`, { currentTime: info.t, sample: info.sample, framesProcessed: info.processed, playbackRate: info.playbackRate }),
        });
        refinedFrames = refined.samples.length;
        samples = mergeSamples(samples, refined.samples);
      } finally {
        second.landmarker.close();
      }
      checkAbort();
    }
  }

  // 4. Anchor on the face (experimental): face and hand models on a few frames of each anchor window only.
  const tracked = buildReport({ samples, source, settings, profileHandedness: options.profileHandedness, audio })
    .shots.filter((shot) => shot.source !== 'audio-only');
  let anchorFrames: AnchorObservation[] | undefined;
  if (tracked.length) {
    progress('anchor', 0, 'Measuring the anchor on the face…');
    anchorFrames = await measureAnchorDetail({
      video, samples, shots: tracked, signal,
      onProgress: (fraction) => progress('anchor', fraction, 'Measuring the anchor on the face…'),
    });
    checkAbort();
  }

  // 5. Report.
  progress('scoring', 0.5, 'Scoring form and building your coaching report…');
  const report = buildReport({
    samples, source, settings, profileHandedness: options.profileHandedness, audio,
    processingMs: performance.now() - started, refinedFrames, anchorFrames,
  });
  if (pass1.stalledAt !== null) {
    report.limitations.unshift(`The video stopped playing at ${formatClock(pass1.stalledAt, 1)}, before the end of the selected part, so only what came before was analysed. The file may be damaged; exporting it again as MP4 may help.`);
  }
  progress('scoring', 1, 'Done.');
  return report;
}
