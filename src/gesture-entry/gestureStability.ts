import type { GestureClassification } from '../types/gestureScore';
import { GESTURE_CONFIG } from './config';
export class GestureStabilityTracker {
  private key: string | null = null; private startedAt: number | null = null; private samples = 0;
  update(candidate: GestureClassification | null, timestampMs: number): { confirmed: boolean; stableDurationMs: number; confidence: number } {
    if (!candidate || !Number.isFinite(timestampMs)) { this.reset(); return { confirmed: false, stableDurationMs: 0, confidence: 0 }; }
    const nextKey = `${candidate.score}:${candidate.isX}`;
    if (nextKey !== this.key || this.startedAt === null || timestampMs < this.startedAt) { this.key = nextKey; this.startedAt = timestampMs; this.samples = 1; return { confirmed: false, stableDurationMs: 0, confidence: candidate.confidence }; }
    this.samples += 1; const stableDurationMs = timestampMs - this.startedAt;
    return { confirmed: stableDurationMs >= GESTURE_CONFIG.holdMs && this.samples >= 3, stableDurationMs, confidence: candidate.confidence * Math.min(1, stableDurationMs / GESTURE_CONFIG.holdMs) };
  }
  reset(): void { this.key = null; this.startedAt = null; this.samples = 0; }
}
