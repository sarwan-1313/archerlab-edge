import { VIDEO_CONFIG } from './config';
import type { AudioOnset, TimeRange, VideoSourceInfo } from './types';

/**
 * The part of a video that is analysed. Times stay in seconds of the original
 * file (media time), so shots, sounds and the kept video always line up.
 */

/** The analysed range of a report; reports from before trimming cover the whole clip. */
export function sourceRange(source: Pick<VideoSourceInfo, 'durationS' | 'range'>): TimeRange {
  return source.range ?? { start: 0, end: source.durationS };
}

export function rangeLength(range: TimeRange): number {
  return range.end - range.start;
}

/** The range preselected for a new clip: all of it when short enough, otherwise its first part. */
export function defaultRange(durationS: number): TimeRange {
  return { start: 0, end: Math.min(durationS, VIDEO_CONFIG.maxDurationS) };
}

/** Why a range cannot be analysed, or null when it can. */
export function rangeProblem(range: TimeRange, durationS: number): string | null {
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end) || range.start < 0 || range.end > durationS + 0.01) return 'The selected range is outside the video.';
  if (rangeLength(range) < VIDEO_CONFIG.minRangeS) return `Select at least ${VIDEO_CONFIG.minRangeS} seconds.`;
  if (rangeLength(range) > VIDEO_CONFIG.maxDurationS + 0.01) return `Select up to ${Math.round(VIDEO_CONFIG.maxDurationS / 60)} minutes. Move the start or end so the range covers the shots you want reviewed.`;
  return null;
}

/**
 * Why the audio of a file is not decoded, or null when it can be. Decoding
 * reads the whole track into memory, however short the selected range.
 */
export function audioSkipReason(fileDurationS: number): string | null {
  if (fileDurationS <= VIDEO_CONFIG.maxAudioDecodeDurationS) return null;
  return `The video is longer than ${Math.round(VIDEO_CONFIG.maxAudioDecodeDurationS / 60)} minutes, so its audio was not decoded and release timing comes from video only. Trim the file before uploading to use the sound.`;
}

/** Keeps only the sounds inside the analysed range. */
export function onsetsInRange(onsets: readonly AudioOnset[], range: TimeRange): AudioOnset[] {
  return onsets.filter((onset) => onset.t >= range.start && onset.t <= range.end);
}
