import { matchShotAudio, type ShotAudioMatch } from './audio';
import { VIDEO_CONFIG } from './config';
import { indicesBetween, median } from './signal';
import type { FeatureTrack } from './track';
import type { AudioOnset, FramePhase, LetDown, ShotSource, ShotTiming, TimeRange } from './types';
import { finite } from './vec';

const SEG = VIDEO_CONFIG.segmentation;

export interface SegmentedShot extends ShotTiming {
  source: ShotSource;
  peakSpeed: number | null;
  followThroughCensored: boolean;
  audio: ShotAudioMatch;
  /** Visual release estimate before any audio correction. */
  visualRelease: number | null;
}

export interface SegmentationResult {
  shots: SegmentedShot[];
  letDowns: LetDown[];
  fullDrawMask: boolean[];
  syncOffsetS: number | null;
  matchedReleases: number;
  unmatchedStrong: number;
}

/** Drawn: drawing hand near the face, hands far apart, bow arm up. True at anchor and during the follow-through hold. */
export function isFullDraw(track: FeatureTrack, index: number): boolean {
  if (!track.tracked[index]) return false;
  const span = track.span[index];
  const face = track.faceProx[index];
  if (finite(span) && finite(face)) {
    const elevation = track.elevation[index];
    return face <= SEG.anchorFaceProxMax && span >= SEG.fullDrawSpanMin && (!finite(elevation) || elevation >= SEG.bowArmElevationMin);
  }
  const span2 = track.span2[index];
  const face2 = track.faceProx2[index];
  return finite(span2) && finite(face2) && face2 <= SEG.anchorFaceProx2dMax && span2 >= SEG.fullDrawSpan2dMin;
}

/** Tracked and clearly not drawn — the archer has come down between shots. */
function isReset(track: FeatureTrack, mask: readonly boolean[], index: number): boolean {
  return track.tracked[index] && !mask[index];
}

interface Run { start: number; end: number }

/** Contiguous drawn periods, bridging short tracking gaps. */
function findRuns(track: FeatureTrack, mask: readonly boolean[]): Run[] {
  const { times } = track;
  const runs: Run[] = [];
  let index = 0;
  while (index < mask.length) {
    if (!mask[index]) { index += 1; continue; }
    const start = index;
    let end = index;
    index += 1;
    while (index < mask.length) {
      if (mask[index]) { end = index; index += 1; continue; }
      if (!track.tracked[index] && times[index] - times[end] <= SEG.mergeGapS) { index += 1; continue; }
      if (times[index] - times[end] <= SEG.mergeGapS) {
        let next = index;
        while (next < mask.length && !mask[next] && times[next] - times[end] <= SEG.mergeGapS) next += 1;
        if (next < mask.length && mask[next]) { index = next; continue; }
      }
      break;
    }
    runs.push({ start, end });
  }
  return runs;
}

interface ReleaseCandidate { index: number; peak: number; release: number }

/**
 * Release candidates: a burst of drawing-hand motion (relative to the head)
 * straight out of a still, drawn position.
 */
function findReleaseCandidates(track: FeatureTrack, mask: readonly boolean[]): ReleaseCandidate[] {
  const { times, drawSpeed } = track;
  const out: ReleaseCandidate[] = [];
  for (let index = 0; index < times.length; index += 1) {
    const speed = drawSpeed[index];
    if (!finite(speed) || speed < SEG.releaseMinSpeed) continue;
    const neighbours = indicesBetween(times, times[index] - 0.15, times[index] + 0.15);
    if (neighbours.some((other) => {
      const value = drawSpeed[other];
      return finite(value) && (value > speed || (value === speed && other < index));
    })) continue;
    const before = indicesBetween(times, times[index] - 0.5, times[index] - 0.02);
    const drawnBefore = before.filter((other) => mask[other]).length;
    const trackedBefore = before.filter((other) => track.tracked[other]).length;
    if (drawnBefore < 2 || drawnBefore < trackedBefore * 0.5) continue;
    const settle = indicesBetween(times, times[index] - 0.6, times[index] - 0.12).map((other) => drawSpeed[other]).filter(finite);
    if (settle.length && median(settle) > 0.9) continue;
    // A let-down carries the hand forward toward the bow; a release does not.
    const use3d = finite(track.span[index]);
    const spanSeries = use3d ? track.span : track.span2;
    const spanBefore = indicesBetween(times, times[index] - 0.2, times[index] - 0.06).map((other) => spanSeries[other]).filter(finite);
    const spanAfter = indicesBetween(times, times[index] + 0.2, times[index] + 0.3).map((other) => spanSeries[other]).filter(finite);
    if (spanBefore.length && spanAfter.length && median(spanAfter) - median(spanBefore) < (use3d ? -SEG.letDownSpanDrop : -SEG.letDownSpanDrop2d)) continue;
    // Release onset: walk back to where the burst began.
    let k = index;
    const floor = before.length ? before[0] : index;
    while (k - 1 >= floor) {
      const previous = drawSpeed[k - 1];
      if (!finite(previous) || previous < speed * SEG.releaseOnsetFraction) break;
      k -= 1;
    }
    out.push({ index, peak: speed, release: times[k] });
  }
  return out;
}

/**
 * Anchor start: walk back from release through the still, fully drawn stretch.
 * The draw length must stay at its anchored value and the hand must be still;
 * brief noisy frames are tolerated so jitter does not cut the hold short.
 */
function findAnchorStart(track: FeatureTrack, mask: readonly boolean[], release: number): number | null {
  const { times } = track;
  const reference = indicesBetween(times, release - 0.3, release - 0.04);
  if (!reference.length) return null;
  const use3d = reference.some((index) => finite(track.span[index]));
  const series = use3d ? track.span : track.span2;
  const values = reference.map((index) => series[index]).filter(finite);
  if (!values.length) return null;
  const anchored = median(values);
  const tolerance = Math.max(anchored * SEG.anchorSpanTolerance, use3d ? 0.04 : 0.02);
  let start: number | null = null;
  let lastGood = release;
  for (let index = reference.at(-1) as number; index >= 0; index -= 1) {
    const t = times[index];
    if (release - t > SEG.maxHoldS) break;
    const value = series[index];
    const speed = track.drawSpeed[index];
    const good = track.tracked[index] && finite(value) && mask[index]
      && Math.abs(value - anchored) <= tolerance && (!finite(speed) || speed <= SEG.anchorStillSpeed);
    if (good) {
      start = t;
      lastGood = t;
    } else if (lastGood - t > SEG.anchorPatienceS) {
      break;
    }
  }
  return start;
}

function findDrawStart(track: FeatureTrack, anchorStart: number, floorTime: number): number | null {
  const { times } = track;
  const indices = indicesBetween(times, Math.max(floorTime, anchorStart - SEG.drawLookbackS), anchorStart);
  if (indices.length < 3) return null;
  const has3d = indices.filter((index) => finite(track.span[index])).length >= indices.length * 0.5;
  const series = has3d ? track.span : track.span2;
  const anchorValues = indicesBetween(times, anchorStart, anchorStart + 0.3).map((index) => series[index]).filter(finite);
  const values = indices.map((index) => series[index]);
  if (!anchorValues.length || values.filter(finite).length < 3) return null;
  const anchorValue = median(anchorValues);
  let minIndex = -1;
  let minValue = Infinity;
  values.forEach((value, position) => {
    if (finite(value) && value <= minValue) { minValue = value; minIndex = position; }
  });
  if (minIndex < 0 || anchorValue - minValue < (has3d ? 0.2 : 0.15)) return null;
  const threshold = minValue + SEG.drawStartFraction * (anchorValue - minValue);
  for (let position = minIndex; position < values.length; position += 1) {
    const value = values[position];
    if (finite(value) && value >= threshold) return times[indices[position]];
  }
  return null;
}

function findFollowThroughEnd(track: FeatureTrack, release: number, ceiling: number): { end: number | null; censored: boolean } {
  const { times } = track;
  const pre = indicesBetween(times, release - 0.18, release - 0.02);
  const elevation0 = pre.map((index) => track.elevation[index]).filter(finite);
  const y0 = pre.map((index) => track.bowWristRel2[index]?.y).filter(finite);
  const torso = pre.map((index) => track.torso2[index]).filter(finite);
  const use3d = elevation0.length > 0;
  if (!use3d && (!y0.length || !torso.length)) return { end: null, censored: true };
  const e0 = use3d ? median(elevation0) : 0;
  const baseY = y0.length ? median(y0) : 0;
  const torsoLength = torso.length ? median(torso) : 1;
  let lastTracked = release;
  for (const index of indicesBetween(times, release, ceiling)) {
    const t = times[index];
    if (!track.tracked[index]) {
      if (t - lastTracked > 0.4) return { end: lastTracked, censored: true };
      continue;
    }
    lastTracked = t;
    if (use3d) {
      const elevation = track.elevation[index];
      if (finite(elevation) && elevation < e0 - VIDEO_CONFIG.windows.followThroughDropSW) return { end: t, censored: false };
    } else {
      const y = track.bowWristRel2[index]?.y;
      if (finite(y) && (y - baseY) / torsoLength > 0.35) return { end: t, censored: false };
    }
  }
  return { end: Math.min(ceiling, lastTracked), censored: true };
}

function trackedRatioAround(track: FeatureTrack, t: number, halfWindow: number): number {
  const indices = indicesBetween(track.times, t - halfWindow, t + halfWindow);
  if (!indices.length) return 0;
  return indices.filter((index) => track.tracked[index]).length / indices.length;
}

/**
 * How a drawn period ended. A let-down brings the drawing hand forward while
 * the bow arm stays up; after a real shot both arms come down together.
 */
function runEnding(track: FeatureTrack, runEnd: number): 'let-down' | 'lowered' | 'unknown' {
  const { times } = track;
  const values = (series: FeatureTrack['span'], from: number, to: number) => indicesBetween(times, from, to).map((index) => series[index]).filter(finite);
  const spanBefore = values(track.span, runEnd - 0.4, runEnd - 0.1);
  const spanAfter = values(track.span, runEnd + 0.1, runEnd + 0.6);
  const elevationBefore = values(track.elevation, runEnd - 0.4, runEnd - 0.1);
  const elevationAfter = values(track.elevation, runEnd + 0.1, runEnd + 0.6);
  if (!spanBefore.length || !spanAfter.length || !elevationBefore.length || !elevationAfter.length) return 'unknown';
  const spanChange = median(spanAfter) - median(spanBefore);
  const elevationChange = median(elevationAfter) - median(elevationBefore);
  if (spanChange < -0.25 && elevationChange > -0.25) return 'let-down';
  return elevationChange <= -0.25 ? 'lowered' : 'unknown';
}

/** The clearest small burst of drawing-hand motion inside a drawn period (a "dead" release). */
function findWeakRelease(track: FeatureTrack, run: Run, minSpeed: number): ReleaseCandidate | null {
  const { times, drawSpeed } = track;
  const inner = indicesBetween(times, times[run.start] + 0.3, times[run.end] - 0.2);
  let best: ReleaseCandidate | null = null;
  for (const index of inner) {
    const speed = drawSpeed[index];
    if (!finite(speed) || speed < minSpeed || (best && speed <= best.peak)) continue;
    const settle = indicesBetween(times, times[index] - 0.6, times[index] - 0.12).map((other) => drawSpeed[other]).filter(finite);
    if (!settle.length || median(settle) > 0.5) continue;
    let k = index;
    while (k - 1 >= inner[0] && finite(drawSpeed[k - 1]) && (drawSpeed[k - 1] as number) >= speed * SEG.releaseOnsetFraction) k -= 1;
    best = { index, peak: speed, release: times[k] };
  }
  return best;
}

/**
 * Splits a clip into shots, release first. A release is a burst of draw-hand
 * motion out of a still, drawn position; the anchor is the steady stretch
 * before it. When the audio has a clear transient nearby, the release time is
 * snapped to the sound, which is far more precise than a video frame. A new
 * shot is only accepted after the archer has come down from the previous one,
 * so follow-through movements are never mistaken for releases.
 */
export function segmentShots(track: FeatureTrack, onsets: readonly AudioOnset[] | null, range: TimeRange): SegmentationResult {
  const { times } = track;
  const mask = times.map((_, index) => isFullDraw(track, index));
  const candidates = findReleaseCandidates(track, mask);
  const usedOnsets = new Set<number>();
  const shots: SegmentedShot[] = [];

  const resetBetween = (from: number, to: number) => {
    const indices = indicesBetween(times, from, to);
    let run = 0;
    let runStart = -Infinity;
    for (const index of indices) {
      if (isReset(track, mask, index)) {
        if (run === 0) runStart = times[index];
        run += 1;
        if (times[index] - runStart >= 0.25 || run >= 4) return true;
      } else if (track.tracked[index]) run = 0;
    }
    return false;
  };

  /** Adds a shot in time order if it is clearly separate from its neighbours. */
  const accept = (release: number, peak: number | null, visual: number | null, weak = false) => {
    const previous = [...shots].reverse().find((shot) => shot.release < release);
    const next = shots.find((shot) => shot.release >= release);
    if (previous && (release - previous.release < SEG.minShotSpacingS || !resetBetween(previous.release, release))) return false;
    if (next && (next.release - release < SEG.minShotSpacingS || !resetBetween(release, next.release))) return false;
    const audio = onsets?.length ? matchShotAudio(visual ?? release, onsets, usedOnsets) : {};
    const shot: SegmentedShot = {
      drawStart: null,
      anchorStart: null,
      release: audio.release?.t ?? release,
      followThroughEnd: null,
      releaseSource: audio.release ? 'audio' : 'visual',
      source: audio.release ? 'video+audio' : 'video',
      peakSpeed: peak,
      followThroughCensored: true,
      audio,
      visualRelease: weak ? null : visual,
    };
    const insertAt = shots.findIndex((existing) => existing.release > shot.release);
    if (insertAt < 0) shots.push(shot);
    else shots.splice(insertAt, 0, shot);
    return true;
  };

  for (const candidate of candidates) accept(candidate.release, candidate.peak, candidate.release);

  // Drawn periods with no clear release burst: a let-down, a release the audio
  // caught, or a "dead" release with very little hand movement.
  const letDowns: LetDown[] = [];
  for (const run of findRuns(track, mask)) {
    const runStart = times[run.start];
    const runEnd = times[run.end];
    if (shots.some((shot) => shot.release >= runStart - 0.1 && shot.release <= runEnd + SEG.releaseSearchAfterS)) continue;
    if (runEnd - runStart < 0.5) continue;
    const heard = onsets?.map((onset, index) => ({ onset, index }))
      .filter(({ onset, index }) => !usedOnsets.has(index) && onset.strength >= 0.25 && onset.t >= runStart + 0.2 && onset.t <= runEnd + SEG.releaseSearchAfterS)
      .sort((a, b) => b.onset.strength - a.onset.strength)[0];
    if (heard && accept(heard.onset.t, null, null)) continue;
    const ending = runEnding(track, runEnd);
    if (ending !== 'let-down') {
      const weak = findWeakRelease(track, run, ending === 'lowered' ? SEG.weakReleaseMinSpeed : SEG.weakReleaseMinSpeed * 1.5);
      if (weak && accept(weak.release, weak.peak, weak.release, true)) continue;
    }
    letDowns.push({ start: runStart, end: runEnd });
  }

  // Estimate the audio/video offset from matched shots and apply it to unmatched ones.
  const offsets = shots
    .filter((shot) => shot.audio.release && shot.visualRelease !== null)
    .map((shot) => (shot.audio.release as AudioOnset).t - (shot.visualRelease as number));
  const syncOffsetS = offsets.length ? median(offsets) : null;
  if (syncOffsetS !== null && offsets.length >= 2 && Math.abs(syncOffsetS) < 0.15) {
    for (const shot of shots) if (!shot.audio.release && shot.visualRelease !== null) shot.release = shot.visualRelease + syncOffsetS;
  }

  // Strong transients with no visible shot: audio-only shots when the archer was not tracked.
  let unmatchedStrong = 0;
  if (onsets) {
    onsets.forEach((onset, index) => {
      if (usedOnsets.has(index) || onset.strength < VIDEO_CONFIG.audio.audioOnlyMinStrength) return;
      if (shots.some((shot) => Math.abs(shot.release - onset.t) < SEG.minShotSpacingS)) return;
      if (shots.some((shot) => onset.t > shot.release && onset.t - shot.release <= VIDEO_CONFIG.audio.impactWindowS[1])) return;
      if (trackedRatioAround(track, onset.t, 1) < 0.5) {
        usedOnsets.add(index);
        shots.push({
          drawStart: null, anchorStart: null, release: onset.t, followThroughEnd: null,
          releaseSource: 'audio', source: 'audio-only', peakSpeed: null,
          followThroughCensored: true, audio: { release: onset }, visualRelease: null,
        });
      } else {
        unmatchedStrong += 1;
      }
    });
    shots.sort((a, b) => a.release - b.release);
  }

  // Phase boundaries.
  shots.forEach((shot, index) => {
    const previous = shots[index - 1];
    const next = shots[index + 1];
    if (shot.source !== 'audio-only') {
      shot.anchorStart = findAnchorStart(track, mask, shot.release);
      if (shot.anchorStart !== null) {
        const floor = previous ? (previous.followThroughEnd ?? previous.release + 0.5) : range.start;
        shot.drawStart = findDrawStart(track, shot.anchorStart, floor);
      }
      const ceiling = Math.min(shot.release + SEG.maxFollowThroughS, next ? (next.drawStart ?? next.release - 1) : range.end, range.end);
      const follow = findFollowThroughEnd(track, shot.release, Math.max(shot.release, ceiling));
      shot.followThroughEnd = follow.end;
      shot.followThroughCensored = follow.censored;
    }
  });

  return {
    shots,
    letDowns,
    fullDrawMask: mask,
    syncOffsetS,
    matchedReleases: offsets.length,
    unmatchedStrong,
  };
}

/** Phase label for a moment in the clip, given the segmented shots. */
export function phaseAt(t: number, shots: readonly ShotTiming[]): { phase: FramePhase; shotIndex: number | null } {
  for (let index = 0; index < shots.length; index += 1) {
    const shot = shots[index];
    if (shot.drawStart !== null && shot.anchorStart !== null && t >= shot.drawStart && t < shot.anchorStart) return { phase: 'draw', shotIndex: index + 1 };
    if (shot.anchorStart !== null && t >= shot.anchorStart && t < shot.release - 0.05) return { phase: 'anchor', shotIndex: index + 1 };
    if (t >= shot.release - 0.05 && t < shot.release + 0.1) return { phase: 'release', shotIndex: index + 1 };
    const end = shot.followThroughEnd ?? shot.release + 0.6;
    if (t >= shot.release + 0.1 && t < end) return { phase: 'follow-through', shotIndex: index + 1 };
  }
  return { phase: 'idle', shotIndex: null };
}
