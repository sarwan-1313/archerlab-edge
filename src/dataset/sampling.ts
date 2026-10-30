import { DATASET_CONFIG } from './config';
import type { DatasetFrame } from './types';

/**
 * Times to sample: one every `intervalS`, plus every frame within ±`releaseWindowS`
 * of each release (at the native frame rate when known). Sorted, with times closer
 * than a third of a frame merged; a release frame wins over an interval frame.
 */
export function sampleTimes(
  durationS: number,
  releases: readonly number[],
  { nativeFps = null, intervalS = DATASET_CONFIG.intervalS, releaseWindowS = DATASET_CONFIG.releaseWindowS }: { nativeFps?: number | null; intervalS?: number; releaseWindowS?: number } = {},
): Array<Pick<DatasetFrame, 't' | 'reason'>> {
  if (!Number.isFinite(durationS) || durationS <= 0) return [];
  const fps = nativeFps && nativeFps > 0 ? nativeFps : DATASET_CONFIG.fallbackFps;
  const last = Math.max(0, durationS - 1 / fps);
  const round = (t: number) => Math.round(t * 1000) / 1000;
  const candidates: Array<Pick<DatasetFrame, 't' | 'reason'>> = [];
  for (const release of releases) {
    if (!Number.isFinite(release)) continue;
    // Snap to the frame grid so neighbours are real frames.
    const centre = Math.round(release * fps);
    const span = Math.round(releaseWindowS * fps);
    for (let frame = centre - span; frame <= centre + span; frame += 1) {
      const t = frame / fps;
      if (t >= 0 && t <= last) candidates.push({ t: round(t), reason: 'release' });
    }
  }
  for (let t = 0; t <= last + 1e-9; t += intervalS) candidates.push({ t: round(t), reason: 'interval' });
  candidates.sort((a, b) => a.t - b.t || (a.reason === 'release' ? -1 : 1));
  const merged: Array<Pick<DatasetFrame, 't' | 'reason'>> = [];
  const minGap = 1 / fps / 3;
  for (const candidate of candidates) {
    const previous = merged[merged.length - 1];
    if (previous && candidate.t - previous.t < minGap) {
      if (candidate.reason === 'release') previous.reason = 'release';
      continue;
    }
    merged.push({ ...candidate });
  }
  return merged;
}
