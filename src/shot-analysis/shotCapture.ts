import type { ArcherHandedness } from '../types/biomechanics';
import type { ReleaseSource, ShotAnalysis, ShotCaptureState, ShotFrame } from '../types/shotAnalysis';
import { SHOT_CONFIG } from './config';
import { calculateReleaseMetrics } from './releaseMetrics';
import { ShotRollingBuffer } from './shotBuffer';
import { createShotId } from './shotId';
import { createShotPhases } from './shotPhases';
import { calculateShotDataQuality } from './shotQuality';
import { createShotSummary } from './shotSummary';
import { cloneShotFrame } from './shotFrame';

export type MarkReleaseResult = { ok: true } | { ok: false; reason: string };

export class ShotCaptureEngine {
  private readonly buffer = new ShotRollingBuffer();
  private stateValue: ShotCaptureState = 'idle';
  private releaseTimestamp: number | null = null;
  private releaseSource: ReleaseSource = 'manual';
  private preFrames: ShotFrame[] = [];
  private postFrames: ShotFrame[] = [];
  private lastTimestamp = -Infinity;
  private cooldownUntil = -Infinity;
  private handedness: ArcherHandedness;

  constructor(handedness: ArcherHandedness) { this.handedness = handedness; }

  arm(): void { if (this.stateValue === 'idle' || this.stateValue === 'complete' || this.stateValue === 'error') this.stateValue = 'armed'; }

  setHandedness(handedness: ArcherHandedness): void {
    if (handedness !== this.handedness) { this.abort(); this.handedness = handedness; this.arm(); }
  }

  ingest(frame: ShotFrame): ShotAnalysis | null {
    if (!Number.isFinite(frame.timestampMs) || frame.timestampMs <= this.lastTimestamp) return null;
    this.lastTimestamp = frame.timestampMs;
    if (frame.athleteDetected) this.buffer.push(cloneShotFrame(frame));
    if (this.stateValue !== 'capturing-post-release' || this.releaseTimestamp === null) {
      if (this.stateValue === 'complete' && frame.timestampMs >= this.cooldownUntil) this.stateValue = 'armed';
      return null;
    }
    if (frame.timestampMs > this.releaseTimestamp && frame.timestampMs <= this.releaseTimestamp + SHOT_CONFIG.postReleaseMs) {
      this.postFrames.push(cloneShotFrame(frame));
    }
    return this.advance(frame.timestampMs);
  }

  /** Completes a capture on elapsed time even if tracking is lost after release. */
  advance(timestampMs: number): ShotAnalysis | null {
    if (this.stateValue !== 'capturing-post-release' || this.releaseTimestamp === null || !Number.isFinite(timestampMs)) return null;
    if (timestampMs < this.releaseTimestamp + SHOT_CONFIG.postReleaseMs) return null;
    this.stateValue = 'finalizing';
    const shot = this.finalize();
    this.stateValue = 'complete';
    this.cooldownUntil = timestampMs + SHOT_CONFIG.releaseCooldownMs;
    return shot;
  }

  markRelease(timestampMs: number, source: ReleaseSource = 'manual'): MarkReleaseResult {
    if (this.stateValue !== 'armed') return { ok: false, reason: this.stateValue === 'capturing-post-release' ? 'Follow-through capture is already in progress' : 'Shot analyzer is not ready' };
    if (!Number.isFinite(timestampMs) || timestampMs <= 0) return { ok: false, reason: 'Release timestamp is invalid' };
    if (timestampMs < this.cooldownUntil) return { ok: false, reason: 'Release cooldown is active' };
    if (timestampMs > this.lastTimestamp) return { ok: false, reason: 'Release timestamp is newer than the biomechanics stream' };
    const preFrames = this.buffer.selectWindow(timestampMs - SHOT_CONFIG.preReleaseMs, timestampMs);
    const usable = preFrames.filter((frame) => frame.athleteDetected && frame.landmarkQuality >= SHOT_CONFIG.minLandmarkQuality);
    const duration = usable.length > 1 ? usable.at(-1)!.timestampMs - usable[0].timestampMs : 0;
    if (usable.length < SHOT_CONFIG.minimumPreReleaseSamples || duration < SHOT_CONFIG.minimumPreReleaseMs) {
      return { ok: false, reason: 'Hold full draw while movement history is collected' };
    }
    this.releaseTimestamp = timestampMs;
    this.releaseSource = source;
    this.preFrames = preFrames.map(cloneShotFrame);
    this.postFrames = this.buffer.values()
      .filter((frame) => frame.timestampMs > timestampMs && frame.timestampMs <= timestampMs + SHOT_CONFIG.postReleaseMs)
      .map(cloneShotFrame);
    this.stateValue = 'capturing-post-release';
    return { ok: true };
  }

  abort(): void {
    this.buffer.clear();
    this.releaseTimestamp = null;
    this.preFrames = [];
    this.postFrames = [];
    this.lastTimestamp = -Infinity;
    this.cooldownUntil = -Infinity;
    this.releaseSource = 'manual';
    this.stateValue = 'idle';
  }

  resetAfterUndo(): void {
    this.releaseTimestamp = null;
    this.preFrames = [];
    this.postFrames = [];
    this.cooldownUntil = -Infinity;
    this.releaseSource = 'manual';
    this.stateValue = 'armed';
  }

  private finalize(): ShotAnalysis {
    const releaseTimestampMs = this.releaseTimestamp!;
    const frames = [...this.preFrames, ...this.postFrames].map(cloneShotFrame).sort((a, b) => a.timestampMs - b.timestampMs);
    const releaseMetrics = calculateReleaseMetrics(frames, releaseTimestampMs);
    return {
      id: createShotId(),
      capturedAt: Date.now(),
      releaseTimestampMs,
      releaseSource: this.releaseSource,
      handedness: this.handedness,
      frames,
      preReleaseFrames: this.preFrames.map(cloneShotFrame),
      postReleaseFrames: this.postFrames.map(cloneShotFrame),
      phases: createShotPhases(),
      releaseMetrics,
      summary: createShotSummary(frames, releaseTimestampMs, releaseMetrics),
      dataQuality: calculateShotDataQuality(frames, releaseTimestampMs),
    };
  }

  get state(): ShotCaptureState { return this.stateValue; }
  get bufferDurationMs(): number { return this.buffer.durationMs; }
  get bufferFrames(): number { return this.buffer.length; }
  get latestTimestampMs(): number { return Number.isFinite(this.lastTimestamp) ? this.lastTimestamp : 0; }
  get releaseTimestampMs(): number | null { return this.releaseTimestamp; }
  get preReleaseUsableSamples(): number { return this.preFrames.filter((frame) => frame.landmarkQuality >= SHOT_CONFIG.minLandmarkQuality).length; }
  get postReleaseUsableSamples(): number { return this.postFrames.filter((frame) => frame.landmarkQuality >= SHOT_CONFIG.minLandmarkQuality).length; }
}
