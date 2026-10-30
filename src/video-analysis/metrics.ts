import { VIDEO_CONFIG } from './config';
import { METRIC_RUBRIC } from './rubric';
import type { SegmentedShot } from './segmentation';
import { coefficientOfVariation, indicesBetween, linearSlope, mean, median, rmsSpread2, rmsSpread3, std, type Series } from './signal';
import type { FeatureTrack } from './track';
import type { CameraViewKind, MetricKey, MetricMap, MetricValue, Vec2, Vec3 } from './types';
import { dot3, finite, len3, norm3, sub3 } from './vec';

const W = VIDEO_CONFIG.windows;

function sufficiency(count: number, wanted: number): number {
  return Math.min(1, count / wanted);
}

function windowQuality(track: FeatureTrack, indices: readonly number[]): number {
  if (!indices.length) return 0;
  return mean(indices.map((index) => (track.tracked[index] ? track.quality[index] : 0)));
}

function confidenceFor(metric: MetricKey, view: CameraViewKind, quality: number, count: number, wanted: number): number {
  return Math.max(0, Math.min(1, quality * METRIC_RUBRIC[metric].view[view] * sufficiency(count, wanted)));
}

function medianOf(series: Series, indices: readonly number[]): { value: number | null; count: number } {
  const values = indices.map((index) => series[index]).filter(finite);
  return { value: values.length ? median(values) : null, count: values.length };
}

function medianPoint3(points: ReadonlyArray<Vec3 | undefined>, indices: readonly number[]): Vec3 | null {
  const usable = indices.map((index) => points[index]).filter((point): point is Vec3 => Boolean(point));
  if (!usable.length) return null;
  return { x: median(usable.map((p) => p.x)), y: median(usable.map((p) => p.y)), z: median(usable.map((p) => p.z)) };
}

function medianPoint2(points: ReadonlyArray<Vec2 | undefined>, indices: readonly number[]): Vec2 | null {
  const usable = indices.map((index) => points[index]).filter((point): point is Vec2 => Boolean(point));
  if (!usable.length) return null;
  return { x: median(usable.map((p) => p.x)), y: median(usable.map((p) => p.y)) };
}

export interface ShotMetricsResult {
  metrics: MetricMap;
  anchorVector?: Vec3;
  posture?: { bowShoulderHigher: boolean | null; leanTowardTarget: boolean | null };
  trackedRatio: number;
  meanVisibility: number;
}

/** Measures one shot. Every metric carries its own confidence so weak evidence counts for less. */
export function measureShot(track: FeatureTrack, shot: SegmentedShot, view: CameraViewKind): ShotMetricsResult {
  const metrics: MetricMap = {};
  const { times } = track;
  const set = (key: MetricKey, value: number | null, confidence: number) => {
    if (value !== null && Number.isFinite(value) && confidence > 0) metrics[key] = { value, confidence } satisfies MetricValue;
  };
  const release = shot.release;
  const cycleStart = shot.drawStart ?? shot.anchorStart ?? release - 1;
  const cycleIndices = indicesBetween(times, cycleStart, release + 0.8);
  const trackedRatio = cycleIndices.length ? cycleIndices.filter((index) => track.tracked[index]).length / cycleIndices.length : 0;
  const meanVisibility = windowQuality(track, cycleIndices);

  if (shot.source === 'audio-only' || shot.anchorStart === null) {
    return { metrics, trackedRatio, meanVisibility };
  }

  // --- Alignment & posture: the steady part of the hold, just before release.
  const anchorFrom = Math.max(shot.anchorStart, release - W.anchorBeforeReleaseS[0]);
  const anchorIdx = indicesBetween(times, anchorFrom, release - W.anchorBeforeReleaseS[1]);
  const anchorQuality = windowQuality(track, anchorIdx);
  for (const [key, series] of [
    ['bowElbowAngle', track.bowElbowAngle],
    ['drawForearmAlignment', track.drawForearmAlignment],
    ['shoulderAlignment', track.shoulderAlignment],
    ['torsoLean', track.torsoLean],
  ] as const) {
    const { value, count } = medianOf(series, anchorIdx);
    set(key, value, confidenceFor(key, view, anchorQuality, count, 4));
  }
  const rise = medianOf(track.bowShoulderRise, anchorIdx);
  set('bowShoulderRise', rise.value === null ? null : Math.abs(rise.value), confidenceFor('bowShoulderRise', view, anchorQuality, rise.count, 4));
  const anchorVector = medianPoint3(track.anchorVectorSmooth, anchorIdx) ?? undefined;
  const leanDirections = anchorIdx.map((index) => track.frames[index].torsoLeanDirection).filter((direction) => direction !== 0);
  const posture = {
    bowShoulderHigher: rise.value === null ? null : rise.value > 0,
    leanTowardTarget: leanDirections.length ? median(leanDirections) > 0 : null,
  };

  // --- Stability: up to the last 1.5 s of the hold.
  const stableFrom = Math.max(shot.anchorStart + W.stabilityTrimS, release - W.stabilityMaxS);
  const stableIdx = indicesBetween(times, stableFrom, release - W.stabilityTrimS);
  const stableDuration = stableIdx.length > 1 ? times[stableIdx.at(-1)!] - times[stableIdx[0]] : 0;
  if (stableDuration >= 0.35 && stableIdx.length >= 5) {
    const stableQuality = windowQuality(track, stableIdx);
    const torso = medianOf(track.torso2, stableIdx).value;
    if (torso && torso > 1e-3) {
      const sway = (points: ReadonlyArray<Vec2 | undefined>) => {
        const usable = stableIdx.map((index) => points[index]).filter((point): point is Vec2 => Boolean(point));
        return usable.length >= 5 ? { value: (rmsSpread2(usable) / torso) * 100, count: usable.length } : null;
      };
      const bow = sway(track.bowWristRel2);
      if (bow) set('bowHandSway', bow.value, confidenceFor('bowHandSway', view, stableQuality, bow.count, 10));
      const head = sway(track.headRel2);
      if (head) set('headSway', head.value, confidenceFor('headSway', view, stableQuality, head.count, 10));
      const anchor = sway(track.drawRelHead2);
      if (anchor) set('anchorSway', anchor.value, confidenceFor('anchorSway', view, stableQuality, anchor.count, 10));
    }
  }
  const creepIdx = indicesBetween(times, Math.max(shot.anchorStart + 0.2, release - W.stabilityMaxS), release - W.anchorBeforeReleaseS[1]);
  const creepPoints = creepIdx.filter((index) => finite(track.span[index]));
  if (creepPoints.length >= 5) {
    const slope = linearSlope(creepPoints.map((index) => times[index]), creepPoints.map((index) => track.span[index] as number));
    if (slope !== null) set('drawCreep', slope * 100, confidenceFor('drawCreep', view, windowQuality(track, creepIdx), creepPoints.length, 8));
  }

  // --- Release: compare just before and just after the release instant.
  const preIdx = indicesBetween(times, release - W.releasePreS[0], release - W.releasePreS[1]);
  const postIdx = indicesBetween(times, release + W.releasePostS[0], release + W.releasePostS[1]);
  const releaseQuality = Math.min(windowQuality(track, preIdx), windowQuality(track, postIdx));
  const pre = medianPoint3(track.anchorVector, preIdx);
  const travelIdx = indicesBetween(times, release + W.releaseTravelS - 0.04, release + W.releaseTravelS + 0.04);
  const after = medianPoint3(track.anchorVector, travelIdx);
  if (pre && after) {
    const travel = sub3(after, pre);
    const distance = len3(travel);
    set('releaseTravel', distance, confidenceFor('releaseTravel', view, releaseQuality, Math.min(preIdx.length, travelIdx.length), 2));
    const bowWristPre = medianPoint3(track.bowWrist3, preIdx);
    const preIdx3 = preIdx.filter((index) => track.frames[index].drawWrist3);
    const drawWristPre = medianPoint3(track.frames.map((frame) => frame.drawWrist3), preIdx3);
    if (distance >= 0.05 && bowWristPre && drawWristPre) {
      const back = norm3(sub3(drawWristPre, bowWristPre));
      if (back) set('releaseBackFraction', dot3(travel, back) / distance, confidenceFor('releaseBackFraction', view, releaseQuality, Math.min(preIdx.length, travelIdx.length), 2));
    }
  }
  const headPre = medianPoint2(track.headRel2, preIdx);
  const headPost = medianPoint2(track.headRel2, postIdx);
  const torsoAtRelease = medianOf(track.torso2, [...preIdx, ...postIdx]).value;
  if (headPre && headPost && torsoAtRelease && torsoAtRelease > 1e-3) {
    const moved = Math.hypot(headPost.x - headPre.x, headPost.y - headPre.y) / torsoAtRelease * 100;
    set('headMoveAtRelease', moved, confidenceFor('headMoveAtRelease', view, releaseQuality, Math.min(preIdx.length, postIdx.length), 2));
  }

  // --- Follow-through.
  const dropIdx = indicesBetween(times, release + W.bowArmDropS - 0.04, release + W.bowArmDropS + 0.04);
  const bowPre = medianPoint3(track.bowWrist3, preIdx);
  const bowAfter = medianPoint3(track.bowWrist3, dropIdx);
  const swAtRelease = medianOf(track.sw3, preIdx).value;
  if (bowPre && bowAfter && swAtRelease && swAtRelease > 0.05) {
    // World y points down, so a positive difference is a drop.
    set('bowArmDrop', Math.max(0, (bowAfter.y - bowPre.y) / swAtRelease), confidenceFor('bowArmDrop', view, Math.min(releaseQuality, windowQuality(track, dropIdx)), Math.min(preIdx.length, dropIdx.length), 2));
  }
  if (shot.followThroughEnd !== null) {
    const hold = shot.followThroughEnd - release;
    const censoredPenalty = shot.followThroughCensored ? (hold >= 0.8 ? 0.8 : 0.4) : 1;
    set('followThroughHold', hold, confidenceFor('followThroughHold', view, windowQuality(track, indicesBetween(times, release, shot.followThroughEnd)), 1, 1) * censoredPenalty);
  }

  // --- Timing.
  const runQuality = windowQuality(track, indicesBetween(times, shot.anchorStart, release));
  set('holdDuration', release - shot.anchorStart, confidenceFor('holdDuration', view, runQuality, 1, 1));
  if (shot.drawStart !== null) {
    set('drawDuration', shot.anchorStart - shot.drawStart, confidenceFor('drawDuration', view, windowQuality(track, indicesBetween(times, shot.drawStart, shot.anchorStart)), 1, 1));
  }
  if (shot.audio.clicker && shot.audio.release) {
    set('clickerReaction', shot.audio.release.t - shot.audio.clicker.t, 0.5 * METRIC_RUBRIC.clickerReaction.view[view]);
  }

  return { metrics, anchorVector, posture, trackedRatio, meanVisibility };
}

/** Cross-shot consistency: the same anchor, timing and bow arm every time is the hallmark of skill. */
export function measureSession(shots: ReadonlyArray<{ metrics: MetricMap; anchorVector?: Vec3; meanVisibility: number }>): MetricMap {
  const session: MetricMap = {};
  const measured = shots.filter((shot) => Object.keys(shot.metrics).length > 0);
  if (measured.length < 2) return session;
  const quality = mean(measured.map((shot) => shot.meanVisibility));
  const countFactor = (count: number) => Math.min(1, (count - 1) / 4);

  const anchors = measured.map((shot) => shot.anchorVector).filter((vector): vector is Vec3 => Boolean(vector));
  if (anchors.length >= 2) session.anchorSpread = { value: rmsSpread3(anchors), confidence: quality * countFactor(anchors.length) };
  const values = (key: MetricKey) => measured.map((shot) => shot.metrics[key]?.value).filter(finite);
  const holds = values('holdDuration');
  const holdCv = coefficientOfVariation(holds);
  if (holdCv !== null) session.holdTimeCv = { value: holdCv, confidence: quality * countFactor(holds.length) };
  const draws = values('drawDuration');
  const drawCv = coefficientOfVariation(draws);
  if (drawCv !== null) session.drawTimeCv = { value: drawCv, confidence: quality * countFactor(draws.length) * 0.9 };
  const elbows = values('bowElbowAngle');
  if (elbows.length >= 2) session.elbowAngleSd = { value: std(elbows), confidence: quality * countFactor(elbows.length) * 0.9 };
  return session;
}
