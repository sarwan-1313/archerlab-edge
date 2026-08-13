import { RollingTimeBuffer } from '../biomechanics/rollingBuffer';
import type { ShotFrame } from '../types/shotAnalysis';
import { SHOT_CONFIG } from './config';

export class ShotRollingBuffer {
  private readonly buffer: RollingTimeBuffer<ShotFrame>;

  constructor(durationMs: number = SHOT_CONFIG.bufferDurationMs) {
    this.buffer = new RollingTimeBuffer<ShotFrame>(durationMs);
  }

  push(frame: ShotFrame): void { this.buffer.push(frame); }
  clear(): void { this.buffer.clear(); }
  values(): readonly ShotFrame[] { return this.buffer.values(); }
  get length(): number { return this.buffer.length; }
  get durationMs(): number { return this.buffer.durationMs; }

  selectWindow(startMs: number, endMs: number): ShotFrame[] {
    return this.buffer.values().filter((frame) => frame.timestampMs >= startMs && frame.timestampMs <= endMs);
  }
}

export function selectRelativeWindow(frames: readonly ShotFrame[], releaseTimestampMs: number, startRelativeMs: number, endRelativeMs: number): ShotFrame[] {
  return frames.filter((frame) => {
    const relative = frame.timestampMs - releaseTimestampMs;
    return relative >= startRelativeMs && relative <= endRelativeMs;
  });
}

export function relativeTimeMs(frame: ShotFrame, releaseTimestampMs: number): number {
  return frame.timestampMs - releaseTimestampMs;
}
