/**
 * Turns a video report into ShotAnalysis records for the Analytics and Replay
 * pages. Like the sample session, the clip's pose samples are run through the
 * real live pipeline (biomechanics snapshot → ShotFrame → ShotCaptureEngine),
 * with releases marked at the times the video engine detected them.
 */
import { BIOMECHANICS_CONFIG } from '../biomechanics/config';
import { getBowSide } from '../biomechanics/handedness';
import { createInstantaneousBiomechanics } from '../biomechanics/metrics';
import { RollingTimeBuffer } from '../biomechanics/rollingBuffer';
import { TimeAwareEma } from '../biomechanics/smoothing';
import { calculateBowHandMotion, calculateHeadMotion, calculateShoulderVariation } from '../biomechanics/stability';
import { SHOT_CONFIG } from '../shot-analysis/config';
import { ShotCaptureEngine } from '../shot-analysis/shotCapture';
import { createShotFrame } from '../shot-analysis/shotFrame';
import type { ArcherHandedness, BiomechanicsFrame, BiomechanicsMetric, BiomechanicsSnapshot } from '../types/biomechanics';
import type { PoseLandmark, PoseResult } from '../types/pose';
import type { ShotAnalysis } from '../types/shotAnalysis';
import { aggregatePoseVisibility } from '../utils/poseAnalysis';
import type { PoseSample, VideoAnalysisReport } from './types';

export const VIDEO_SHOT_PREFIX = 'video-shot_';

export function isVideoShot(shot: Pick<ShotAnalysis, 'id'>): boolean {
  return shot.id.startsWith(VIDEO_SHOT_PREFIX);
}

const LANDMARK_COUNT = 33;

/** Unpacks a stored sample into the shape MediaPipe hands the live pipeline. */
export function sampleToPoseResult(sample: PoseSample): PoseResult {
  const timestamp = sample.t * 1000;
  const { image, world } = sample;
  if (!image) return { landmarks: [], worldLandmarks: [], timestamp, athleteDetected: false, averageVisibility: 0 };
  const landmarks: PoseLandmark[] = [];
  const worldLandmarks: PoseLandmark[] = [];
  for (let index = 0; index < LANDMARK_COUNT; index += 1) {
    const visibility = image[index * 4 + 3];
    landmarks.push({ x: image[index * 4], y: image[index * 4 + 1], z: image[index * 4 + 2], visibility });
    // World landmarks share the image visibility, as they do in MediaPipe results.
    if (world) worldLandmarks.push({ x: world[index * 3], y: world[index * 3 + 1], z: world[index * 3 + 2], visibility });
  }
  return { landmarks, worldLandmarks, timestamp, athleteDetected: true, averageVisibility: aggregatePoseVisibility(landmarks) };
}

const metricNames = ['shoulderLine', 'bowArm', 'torso', 'head', 'bowHand', 'shoulderVariation'] as const;
type MetricName = typeof metricNames[number];

/** The temporal part of useBiomechanics (rolling window, stability metrics, smoothing) without React or reference capture. */
class SnapshotStepper {
  private readonly history = new RollingTimeBuffer<BiomechanicsFrame>(BIOMECHANICS_CONFIG.windowDurationMs);
  private readonly smoothers = Object.fromEntries(metricNames.map((name) => [name, new TimeAwareEma(BIOMECHANICS_CONFIG.smoothingTimeConstantMs, BIOMECHANICS_CONFIG.smoothingResetGapMs)])) as Record<MetricName, TimeAwareEma>;
  private lastTracked: number | null = null;
  private lastHeadReference: 'ears' | 'nose' | undefined;
  private readonly handedness: ArcherHandedness;

  constructor(handedness: ArcherHandedness) { this.handedness = handedness; }

  private reset() {
    this.history.clear();
    metricNames.forEach((name) => this.smoothers[name].reset());
    this.lastTracked = null;
    this.lastHeadReference = undefined;
  }

  private smooth(metric: BiomechanicsMetric, name: MetricName, timestampMs: number): BiomechanicsMetric {
    if (!metric.available || metric.rawValue === null) return metric;
    const smoothedValue = this.smoothers[name].update(metric.rawValue, timestampMs);
    return { ...metric, value: smoothedValue, smoothedValue };
  }

  /** Returns a snapshot for a tracked frame, or null when nobody was found. */
  step(pose: PoseResult): BiomechanicsSnapshot | null {
    if (!pose.athleteDetected) {
      const lostFor = this.lastTracked === null ? Infinity : pose.timestamp - this.lastTracked;
      if (lostFor > BIOMECHANICS_CONFIG.trackingLossResetMs) this.reset();
      return null;
    }
    this.lastTracked = pose.timestamp;
    const instant = createInstantaneousBiomechanics(pose, this.handedness);
    if (this.lastHeadReference && instant.frame.headReference && this.lastHeadReference !== instant.frame.headReference) {
      this.history.clear(); this.smoothers.head.reset();
    }
    this.lastHeadReference = instant.frame.headReference;
    this.history.push(instant.frame);
    const frames = this.history.values();
    const t = pose.timestamp;
    const headMotion = this.smooth(calculateHeadMotion(frames), 'head', t);
    const bowHandMotion = this.smooth(calculateBowHandMotion(frames), 'bowHand', t);
    return {
      timestampMs: t, athleteDetected: true, poseConfidence: pose.averageVisibility,
      shoulderLineAngle: this.smooth(instant.shoulderLine, 'shoulderLine', t),
      bowArmElbowAngle: this.smooth(instant.bowArmElbow, 'bowArm', t),
      torsoLean: this.smooth(instant.torsoLean, 'torso', t),
      headMotion, bowHandMotion,
      shoulderVariation: this.smooth(calculateShoulderVariation(frames), 'shoulderVariation', t),
      currentFrame: instant.frame,
      debug: {
        handedness: this.handedness, bowSide: getBowSide(this.handedness), timestampMs: t,
        historySamples: frames.length, historyDurationMs: this.history.durationMs,
        shoulderWidth: instant.frame.shoulderWidth ?? null, metricConfidence: instant.frame.confidence,
        headRmsPercent: headMotion.rawValue, bowHandRmsPercent: bowHandMotion.rawValue,
      },
    };
  }
}

/** Index of the first entry at or after `t`. */
function firstAtOrAfter(entries: ReadonlyArray<{ t: number }>, t: number): number {
  let low = 0;
  let high = entries.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (entries[middle].t < t) low = middle + 1;
    else high = middle;
  }
  return low;
}

/**
 * Captures one ShotAnalysis per video-detected release. Audio-only shots (heard
 * but not tracked) are skipped, as are releases the engine cannot capture
 * (for example too little tracked movement before release).
 */
export function toShotAnalyses(report: VideoAnalysisReport): ShotAnalysis[] {
  const handedness = report.settings.handedness;
  const releases = report.shots
    .filter((shot) => shot.source !== 'audio-only')
    .map((shot) => ({ index: shot.index, releaseMs: shot.release * 1000 }))
    .sort((a, b) => a.releaseMs - b.releaseMs);

  // The biomechanics snapshot is computed once over the whole clip, as the live hook would see it.
  const stepper = new SnapshotStepper(handedness);
  const timeline = [...report.samples].sort((a, b) => a.t - b.t).map((sample) => {
    const pose = sampleToPoseResult(sample);
    const snapshot = stepper.step(pose);
    return { t: pose.timestamp, frame: snapshot ? createShotFrame(snapshot) : null };
  });

  // Each release gets its own capture engine, so a quick second shot never falls in the
  // previous one's cooldown; the engine only needs the frames around its release.
  const captured: ShotAnalysis[] = [];
  for (const release of releases) {
    const engine = new ShotCaptureEngine(handedness);
    engine.arm();
    let marked = false;
    let shot: ShotAnalysis | null = null;
    const latest = release.releaseMs + SHOT_CONFIG.bufferDurationMs;
    for (let index = firstAtOrAfter(timeline, release.releaseMs - SHOT_CONFIG.bufferDurationMs); index < timeline.length && !shot; index += 1) {
      const { t, frame } = timeline[index];
      if (t > latest && !marked) break;
      // Frames without the archer still advance time, so a capture can finish through a dropout.
      shot = frame ? engine.ingest(frame) : engine.advance(t);
      // Mark the release once the tracked stream has passed it.
      if (!marked && engine.latestTimestampMs >= release.releaseMs) {
        if (!engine.markRelease(release.releaseMs, 'video-detected').ok) break;
        marked = true;
      }
    }
    // A clip that ends during the follow-through finishes on elapsed time, like a lost track.
    if (marked && !shot) shot = engine.advance(release.releaseMs + SHOT_CONFIG.postReleaseMs);
    if (!shot) continue;
    captured.push({
      ...shot,
      id: `${VIDEO_SHOT_PREFIX}${report.id}_${release.index}`,
      // Shots keep their order without dates in the future (release times can be far into a long video).
      capturedAt: report.createdAt + captured.length,
      videoSource: { reportId: report.id, fileName: report.source.fileName },
      notes: report.shots.find((reportShot) => reportShot.index === release.index)?.notes,
    });
  }
  return captured;
}
