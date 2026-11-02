import type { PoseLandmark, PoseResult } from '../types/pose';

/**
 * Steadier live tracking. A pose model's points jitter a little from frame to frame, even when the
 * athlete holds still. A One Euro filter smooths that: heavily when a point barely moves (so the
 * skeleton stops shaking at full draw) and lightly when it moves fast (so the release is not pushed
 * late). Points the model is unsure about are held where they were for a moment instead of jumping.
 * Everything here runs on the device, on the pose points only.
 */

export type SmoothingMode = 'off' | 'balanced' | 'steady';

export interface SmoothingParams {
  /** Cut-off (Hz) when a point is still: lower is steadier. */
  minCutoff: number;
  /** How quickly the cut-off opens up with speed: higher follows fast movement more closely. */
  beta: number;
  /** Cut-off (Hz) for the speed estimate itself. */
  dCutoff: number;
}

/** Starting values for normalised (0 to 1) coordinates at about 20 frames a second. */
export const SMOOTHING_PRESETS: Record<Exclude<SmoothingMode, 'off'>, SmoothingParams> = {
  balanced: { minCutoff: 1.6, beta: 9, dCutoff: 1 },
  steady: { minCutoff: 0.8, beta: 6, dCutoff: 1 },
};

/** A point below this visibility is not trusted at all. */
export const HOLD_VISIBILITY = 0.35;
/** A mid-confidence point that jumps further than this in one frame (normalised units) is treated as a glitch. */
export const GLITCH_JUMP = 0.2;
/** A point is held at most this long (ms) before the raw value is shown again. */
export const HOLD_MS = 400;
/** After this long (ms) without an athlete, the filters start fresh. */
export const LOST_RESET_MS = 500;

const smoothingFactor = (cutoffHz: number, dtS: number) => 1 / (1 + 1 / (2 * Math.PI * cutoffHz) / dtS);

/** One Euro filter for one number. */
export class OneEuroFilter {
  private value: number | null = null;
  private slope = 0;
  private time = 0;

  filter(raw: number, timeMs: number, params: SmoothingParams): number {
    if (this.value === null) { this.value = raw; this.slope = 0; this.time = timeMs; return raw; }
    const dt = (timeMs - this.time) / 1000;
    if (dt <= 0) return this.value;
    this.time = timeMs;
    this.slope += smoothingFactor(params.dCutoff, dt) * ((raw - this.value) / dt - this.slope);
    this.value += smoothingFactor(params.minCutoff + params.beta * Math.abs(this.slope), dt) * (raw - this.value);
    return this.value;
  }

  get current(): number | null { return this.value; }
}

interface PointTrack { x: OneEuroFilter; y: OneEuroFilter; z: OneEuroFilter; lastGoodAt: number }

const newTrack = (): PointTrack => ({ x: new OneEuroFilter(), y: new OneEuroFilter(), z: new OneEuroFilter(), lastGoodAt: -Infinity });

export class PoseSmoother {
  private image: PointTrack[] = [];
  private world: PointTrack[] = [];
  private lastSeenAt = -Infinity;
  /** Running average of how far the raw points sit from the smoothed ones (normalised units): a measure of jitter. */
  jitter = 0;

  reset(): void {
    this.image = [];
    this.world = [];
    this.jitter = 0;
    this.lastSeenAt = -Infinity;
  }

  /** Smooths a result. With no params (smoothing off) the result passes through unchanged. */
  smooth(result: PoseResult, params: SmoothingParams | null): PoseResult {
    if (!params) { if (this.image.length) this.reset(); return result; }
    if (!result.athleteDetected || !result.landmarks.length) {
      if (result.timestamp - this.lastSeenAt > LOST_RESET_MS) this.reset();
      return result;
    }
    this.lastSeenAt = result.timestamp;
    const reliable = result.landmarks.map((_, index) => this.isReliable(index, result.landmarks[index], result.timestamp));
    const landmarks = this.apply(this.image, result.landmarks, reliable, result.timestamp, params, true);
    const worldLandmarks = result.worldLandmarks.length === result.landmarks.length
      ? this.apply(this.world, result.worldLandmarks, reliable, result.timestamp, params, false)
      : result.worldLandmarks;
    return { ...result, landmarks, worldLandmarks };
  }

  private isReliable(index: number, point: PoseLandmark, timeMs: number): boolean {
    const visibility = point.visibility ?? 1;
    if (visibility < HOLD_VISIBILITY) return false;
    const track = this.image[index];
    const previous = track?.x.current;
    const previousY = track?.y.current;
    if (visibility < 0.6 && previous != null && previousY != null && timeMs - track.lastGoodAt <= HOLD_MS) {
      if (Math.hypot(point.x - previous, point.y - previousY) > GLITCH_JUMP) return false;
    }
    return true;
  }

  private apply(tracks: PointTrack[], points: readonly PoseLandmark[], reliable: readonly boolean[], timeMs: number, params: SmoothingParams, measure: boolean): PoseLandmark[] {
    let spread = 0;
    let counted = 0;
    const out = points.map((point, index) => {
      const track = (tracks[index] ??= newTrack());
      const heldX = track.x.current;
      const heldY = track.y.current;
      const heldZ = track.z.current;
      if (!reliable[index]) {
        // Hold the last good position for a moment; after that show what the model says.
        if (heldX !== null && heldY !== null && heldZ !== null && timeMs - track.lastGoodAt <= HOLD_MS) return { ...point, x: heldX, y: heldY, z: heldZ };
        return point;
      }
      track.lastGoodAt = timeMs;
      const x = track.x.filter(point.x, timeMs, params);
      const y = track.y.filter(point.y, timeMs, params);
      const z = track.z.filter(point.z, timeMs, params);
      if (measure) { spread += Math.hypot(point.x - x, point.y - y); counted += 1; }
      return { ...point, x, y, z };
    });
    if (measure && counted) this.jitter += 0.1 * (spread / counted - this.jitter);
    return out;
  }
}

export type TrackingQualityLabel = 'Excellent' | 'Good' | 'Fair' | 'Weak';
export interface TrackingQuality { score: number; label: TrackingQualityLabel }

/** The joints that matter for a shot. */
const KEY_JOINTS = [11, 12, 13, 14, 15, 16, 23, 24];

/**
 * A rough 0 to 100 read on how well the body is being tracked right now: how clearly the shoulders,
 * arms and hips are seen, less a penalty for jitter. It is a guide to camera placement and light,
 * not a measure of accuracy.
 */
export function trackingQuality(result: PoseResult | null, jitter = 0): TrackingQuality | null {
  if (!result?.athleteDetected || result.landmarks.length < 33) return null;
  const seen = KEY_JOINTS.reduce((sum, index) => sum + Math.max(0, Math.min(1, result.landmarks[index]?.visibility ?? 0)), 0) / KEY_JOINTS.length;
  const score = Math.max(0, Math.min(100, Math.round(seen * 100 - Math.min(25, jitter * 2500))));
  const label: TrackingQualityLabel = score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Fair' : 'Weak';
  return { score, label };
}
