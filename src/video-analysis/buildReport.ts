import type { ArcherHandedness } from '../types/biomechanics';
import { anchorFaceSpread, anchorWindow, contactDistance, summarizeShotAnchor } from './anchor';
import { buildCoaching, buildPlan } from './coaching';
import { VIDEO_ENGINE_VERSION } from './config';
import { detectCameraView, detectDrawSide } from './detection';
import { computeFrameFeatures } from './frameFeatures';
import { measureSession, measureShot } from './metrics';
import { recommendResources } from './resources';
import { METRIC_RUBRIC } from './rubric';
import { aggregateMetrics, scoreMetrics, scoreSession } from './scoring';
import { formatClock } from './format';
import { onsetsInRange, rangeLength, sourceRange } from './range';
import { phaseAt, segmentShots } from './segmentation';
import { buildFeatureTrack } from './track';
import type {
  AnalysisSettings, AnchorObservation, AudioOnset, AudioSummary, FrameReadout, PoseSample, ShotReport,
  VideoAnalysisReport, VideoReportSummary, VideoSourceInfo,
} from './types';

export type AudioInput =
  | { kind: 'analysed'; onsets: AudioOnset[]; noiseFloorDb: number; sampleRate: number; durationS: number }
  | { kind: 'unavailable'; reason: string };

export interface BuildReportInput {
  id?: string;
  createdAt?: number;
  samples: PoseSample[];
  source: VideoSourceInfo;
  settings: Omit<AnalysisSettings, 'handedness' | 'handednessSource'>;
  profileHandedness?: ArcherHandedness;
  audio: AudioInput | null;
  processingMs?: number;
  refinedFrames?: number;
  /** Face and hand measurements from the anchor windows (browser/anchorDetail.ts); absent when not measured. */
  anchorFrames?: AnchorObservation[];
}

export function createReportId(now = Date.now()): string {
  const random = globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10);
  return `video_${now}_${random}`;
}

const round = (value: number | null, digits: number): number | null => (value === null ? null : Number(value.toFixed(digits)));

/**
 * The pure core of the video engine: landmarks (+ optional audio onsets) in,
 * complete coaching report out. Nothing here touches the DOM, so it is fully
 * unit-tested with synthetic archers.
 */
export function buildReport(input: BuildReportInput): VideoAnalysisReport {
  const { samples, source } = input;
  const aspect = source.width > 0 && source.height > 0 ? source.width / source.height : 16 / 9;

  // Which hand draws the string.
  const detection = detectDrawSide(samples, aspect);
  let handedness: ArcherHandedness;
  let handednessSource: AnalysisSettings['handednessSource'];
  if (input.settings.requestedHandedness !== 'auto') {
    handedness = input.settings.requestedHandedness;
    handednessSource = 'manual';
  } else if (detection.drawSide) {
    handedness = detection.drawSide;
    handednessSource = 'auto';
  } else if (input.profileHandedness) {
    handedness = input.profileHandedness;
    handednessSource = 'profile';
  } else {
    handedness = 'right';
    handednessSource = 'default';
  }

  const features = samples.map((sample) => computeFrameFeatures(sample, aspect, handedness));
  const track = buildFeatureTrack(features);
  const range = sourceRange(source);
  // Sounds outside the analysed range belong to shots that were trimmed away.
  const onsets = input.audio?.kind === 'analysed' ? onsetsInRange(input.audio.onsets, range) : null;
  const segmentation = segmentShots(track, onsets, range);
  const view = detectCameraView(features, segmentation.fullDrawMask);
  const bowType = input.settings.bowType;

  const anchorFrames = input.anchorFrames ?? [];
  const measured = segmentation.shots.map((shot) => {
    const result = measureShot(track, shot, view.kind);
    const window = anchorWindow(shot);
    const anchorFace = shot.source === 'audio-only' ? null
      : summarizeShotAnchor(anchorFrames.filter((observation) => observation.t >= window.start - 1e-6 && observation.t <= window.end + 1e-6));
    if (anchorFace) {
      result.metrics = {
        ...result.metrics,
        anchorContactPoint: { value: contactDistance(anchorFace), confidence: anchorFace.confidence * METRIC_RUBRIC.anchorContactPoint.view[view.kind] },
      };
    }
    return { shot, result, anchorFace };
  });
  const shots: ShotReport[] = measured.map(({ shot, result, anchorFace }, index) => {
    const { scores, formScore } = scoreMetrics(result.metrics, bowType);
    const quality = result.trackedRatio >= 0.85 && result.meanVisibility >= 0.65 ? 'good' : result.trackedRatio >= 0.6 ? 'limited' : 'poor';
    const audio = shot.audio.release || shot.audio.clicker || shot.audio.impact
      ? {
        releaseOnset: shot.audio.release?.t,
        clickerOnset: shot.audio.clicker?.t,
        impactOnset: shot.audio.impact?.t,
        flightTime: shot.audio.impact ? shot.audio.impact.t - shot.release : undefined,
      }
      : undefined;
    return {
      index: index + 1,
      source: shot.source,
      drawStart: shot.drawStart,
      anchorStart: shot.anchorStart,
      release: shot.release,
      followThroughEnd: shot.followThroughEnd,
      releaseSource: shot.releaseSource,
      metrics: result.metrics,
      scores,
      formScore,
      quality: { trackedRatio: result.trackedRatio, meanVisibility: result.meanVisibility, label: quality },
      audio,
      anchorVector: result.anchorVector,
      ...(anchorFace ? { anchorFace } : {}),
      posture: result.posture,
    };
  });

  const session = measureSession(measured.map(({ result }) => result));
  // Anchor point on the face across shots (experimental), from shots whose face was seen well enough.
  const faced = measured.map(({ anchorFace }) => anchorFace).filter((face): face is NonNullable<typeof face> => Boolean(face && face.confidence >= 0.3));
  const faceSpread = anchorFaceSpread(faced);
  if (faceSpread !== null) {
    const confidence = (faced.reduce((sum, face) => sum + face.confidence, 0) / faced.length) * Math.min(1, (faced.length - 1) / 4) * METRIC_RUBRIC.anchorFaceSpread.view[view.kind];
    session.anchorFaceSpread = { value: faceSpread, confidence };
  }
  const aggregated = aggregateMetrics(shots.filter((shot) => shot.source !== 'audio-only').map((shot) => shot.metrics), session);
  const trackedFrames = features.filter((frame) => frame.tracked);
  const trackedRatio = features.length ? trackedFrames.length / features.length : 0;
  const scores = scoreSession(aggregated, {
    bowType,
    shotCount: shots.filter((shot) => shot.source !== 'audio-only').length,
    trackedRatio,
    viewConfidence: view.confidence,
    audioUsed: segmentation.matchedReleases > 0,
  });
  const coaching = buildCoaching({ aggregated, shots, scores, bowType });
  const plan = buildPlan(coaching.focusAreas, scores.level, scores.confidence, coaching.findings);
  const resources = recommendResources(coaching.focusAreas, scores.level, bowType);

  const frames: FrameReadout[] = features.map((frame, index) => {
    const { phase, shotIndex } = phaseAt(frame.t, shots);
    return {
      t: frame.t,
      phase,
      shotIndex,
      tracked: frame.tracked,
      quality: Number(frame.quality.toFixed(2)),
      bowElbowAngle: round(track.bowElbowAngle[index], 1),
      drawForearmAlignment: round(track.drawForearmAlignment[index], 1),
      shoulderAlignment: round(track.shoulderAlignment[index], 1),
      bowShoulderRise: round(track.bowShoulderRise[index], 3),
      torsoLean: round(track.torsoLean[index], 1),
      span: round(track.span[index], 3),
      faceProx: round(track.faceProx[index], 3),
    };
  });

  let audio: AudioSummary | null = null;
  if (input.audio?.kind === 'analysed') {
    audio = {
      available: true,
      durationS: input.audio.durationS,
      sampleRate: input.audio.sampleRate,
      noiseFloorDb: input.audio.noiseFloorDb,
      onsets: onsets ?? [],
      syncOffsetS: segmentation.syncOffsetS,
      matchedReleases: segmentation.matchedReleases,
      unmatchedStrong: segmentation.unmatchedStrong,
    };
  } else if (input.audio?.kind === 'unavailable') {
    audio = { available: false, reason: input.audio.reason, durationS: 0, sampleRate: 0, noiseFloorDb: -120, onsets: [], syncOffsetS: null, matchedReleases: 0, unmatchedStrong: 0 };
  }

  const limitations = [
    'The form score and level are estimates from movement only, not a validated rating. ArcherLab does not see the target or know your scores.',
    'Scoring thresholds are coaching heuristics in a prototype, not a validated standard. Treat the score and level as a guide, and a coach\'s eye as the final word.',
    'Depth is estimated from a single camera, so movement toward or away from the camera is measured less precisely than movement across the frame.',
  ];
  if (view.kind === 'down-the-line') limitations.push('From this camera angle, release travel and draw length are the least certain measurements.');
  const audioOnly = shots.filter((shot) => shot.source === 'audio-only').length;
  if (audioOnly) limitations.push(`${audioOnly} shot${audioOnly === 1 ? ' was' : 's were'} heard but the archer was not tracked, so only timing is available for ${audioOnly === 1 ? 'it' : 'them'}.`);
  if (audio?.available) limitations.push('Clicker and arrow-impact sounds are best-effort and can be confused by other archers or range noise.');
  if (audio && !audio.available && audio.reason) limitations.push(audio.reason);
  if (rangeLength(range) < source.durationS - 0.05) limitations.push(`Only ${formatClock(range.start, 1)}–${formatClock(range.end, 1)} of the ${formatClock(source.durationS, 0)} video was analysed.`);
  limitations.push('If several people are in the frame, the tool follows the most prominent person.');

  return {
    id: input.id ?? createReportId(),
    createdAt: input.createdAt ?? Date.now(),
    engineVersion: VIDEO_ENGINE_VERSION,
    source,
    settings: { ...input.settings, handedness, handednessSource },
    view,
    handednessDetection: detection,
    tracking: {
      framesAnalyzed: samples.length,
      trackedRatio,
      meanQuality: trackedFrames.length ? trackedFrames.reduce((sum, frame) => sum + frame.quality, 0) / trackedFrames.length : 0,
      refinedFrames: input.refinedFrames ?? 0,
      processingMs: input.processingMs ?? 0,
    },
    samples,
    frames,
    audio,
    shots,
    letDowns: segmentation.letDowns,
    session,
    scores,
    findings: coaching.findings,
    focusAreas: coaching.focusAreas,
    strengths: coaching.strengths,
    plan,
    resources,
    limitations,
    ...(input.anchorFrames ? { anchorFrames: input.anchorFrames } : {}),
  };
}

export function summarizeReport(report: VideoAnalysisReport, hasVideo: boolean): VideoReportSummary {
  return {
    id: report.id,
    createdAt: report.createdAt,
    fileName: report.source.fileName,
    durationS: report.source.durationS,
    shots: report.shots.length,
    overall: report.scores.overall,
    level: report.scores.level,
    confidence: report.scores.confidence,
    view: report.view.kind,
    focus: report.focusAreas.map((finding) => finding.title),
    hasVideo,
  };
}
