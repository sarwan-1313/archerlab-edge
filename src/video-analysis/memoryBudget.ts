import { VIDEO_CONFIG } from './config';

/**
 * How much a video analysis may hold in memory. A 2 GB Android phone gives a browser tab only a few
 * hundred MB, so low-memory devices (and Lite mode) get a smaller inference frame, fewer pose frames and
 * a lower cap on decoding the audio track (decoding reads the whole file into memory first).
 */
export interface MemoryBudget {
  inferenceLongEdgePx: number;
  /** Most pose frames kept from the first tracking pass; long ranges are sampled more sparsely to fit. */
  maxFrames: number;
  /** Largest file whose audio is decoded. */
  maxAudioDecodeBytes: number;
}

export const LOW_MEMORY_BUDGET: MemoryBudget = {
  inferenceLongEdgePx: 480,
  // Two minutes at 24 fps; longer ranges fall back towards the Fast rate.
  maxFrames: 2880,
  maxAudioDecodeBytes: 64 * 1024 * 1024,
};

export const DEFAULT_BUDGET: MemoryBudget = {
  inferenceLongEdgePx: VIDEO_CONFIG.inferenceLongEdgePx,
  maxFrames: 30_000,
  maxAudioDecodeBytes: VIDEO_CONFIG.maxAudioDecodeBytes,
};

/** The budget for a device with this much RAM (GB, null when unknown) and Lite mode on or off. */
export function memoryBudget(deviceMemoryGb: number | null | undefined, lite: boolean): MemoryBudget {
  const lowMemory = typeof deviceMemoryGb === 'number' && deviceMemoryGb > 0 && deviceMemoryGb <= 2;
  return lite || lowMemory ? LOW_MEMORY_BUDGET : DEFAULT_BUDGET;
}

/** The sampling rate that keeps a range of `spanS` seconds within `maxFrames`, never above `fps`. */
export function cappedFps(fps: number, spanS: number, maxFrames: number): number {
  if (!(spanS > 0) || !(maxFrames > 0)) return fps;
  return Math.min(fps, maxFrames / spanS);
}
