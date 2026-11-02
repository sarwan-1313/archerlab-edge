import { describe, expect, it } from 'vitest';
import { FACE_POINTS, INDEX_TIP, anchorFaceSpread, anchorObservation, anchorSampleTimes, anchorWindow, contactDistance, summarizeShotAnchor, type Point2 } from './anchor';
import { buildReport } from './buildReport';
import { inputFromReport } from './reportFile';
import { makeScenario, scriptShots, syntheticSamples } from './testing/syntheticArcher';
import type { AnchorObservation } from './types';

interface FaceOptions {
  chin?: Point2;
  /** Face height in normalised image units. */
  height?: number;
  /** Head tilt in the image plane, degrees. */
  tiltDeg?: number;
  /** 0 frontal; toward 1 the A side (mouth corner 61, cheek 234) turns away from the camera. */
  turnA?: number;
}

/**
 * A synthetic 478-point face mesh. Only the points anchor.ts reads are placed; the rest sit on the chin. Face
 * coordinates are (across toward the A side, up), in face heights from the chin.
 */
function syntheticFace({ chin = { x: 0.5, y: 0.5 }, height = 0.2, tiltDeg = 0, turnA = 0 }: FaceOptions = {}): Point2[] {
  const angle = (tiltDeg * Math.PI) / 180;
  // Image axes for "up the face" and "toward the A side", tilted; image y grows downwards.
  const up = { x: Math.sin(angle), y: -Math.cos(angle) };
  const towardA = { x: -Math.cos(angle), y: -Math.sin(angle) };
  const at = (across: number, upward: number): Point2 => ({
    x: chin.x + (towardA.x * across + up.x * upward) * height,
    y: chin.y + (towardA.y * across + up.y * upward) * height,
  });
  const squeeze = 1 - turnA;
  const points: Point2[] = Array.from({ length: 478 }, () => ({ ...chin }));
  points[FACE_POINTS.forehead] = at(0, 1);
  points[FACE_POINTS.noseTip] = at(0, 0.45);
  points[FACE_POINTS.mouthCornerA] = at(0.2 * squeeze, 0.3);
  points[FACE_POINTS.mouthCornerB] = at(-0.2, 0.3);
  points[FACE_POINTS.cheekA] = at(0.45 * squeeze, 0.5);
  points[FACE_POINTS.cheekB] = at(-0.45, 0.5);
  return points;
}

/** The image point at (across toward A, up) face heights from the chin of a face built with the same options. */
function faceSpot(options: FaceOptions, across: number, upward: number): Point2 {
  const face = syntheticFace(options);
  const chin = face[FACE_POINTS.chin];
  const height = options.height ?? 0.2;
  const angle = ((options.tiltDeg ?? 0) * Math.PI) / 180;
  return {
    x: chin.x + (-Math.cos(angle) * across + Math.sin(angle) * upward) * height,
    y: chin.y + (-Math.sin(angle) * across - Math.cos(angle) * upward) * height,
  };
}

function hand(tip: Point2): Point2[] {
  const points: Point2[] = Array.from({ length: 21 }, () => ({ x: tip.x + 0.05, y: tip.y + 0.05 }));
  points[INDEX_TIP] = tip;
  return points;
}

describe('anchorObservation', () => {
  it('measures the fingertip in face heights from the chin, with x toward the draw side', () => {
    const options = { chin: { x: 0.5, y: 0.6 }, height: 0.2 };
    const observation = anchorObservation({ t: 1, face: syntheticFace(options), hands: [hand(faceSpot(options, 0.25, 0.05))], aspect: 1 });
    expect(observation).not.toBeNull();
    expect(observation!.x).toBeCloseTo(0.25, 5);
    expect(observation!.y).toBeCloseTo(0.05, 5);
    expect(observation!.toChin).toBeCloseTo(Math.hypot(0.25, 0.05), 5);
    expect(observation!.toMouthCorner).toBeCloseTo(Math.hypot(0.05, 0.25), 5);
    expect(observation!.visibility).toBeCloseTo(1, 5);
  });

  it('gives the same answer whatever the face size and tilt, and on either side of the face', () => {
    const base = anchorObservation({ t: 0, face: syntheticFace(), hands: [hand(faceSpot({}, 0.2, 0.1))], aspect: 1 })!;
    const options = { chin: { x: 0.3, y: 0.4 }, height: 0.08, tiltDeg: 25 };
    const moved = anchorObservation({ t: 0, face: syntheticFace(options), hands: [hand(faceSpot(options, 0.2, 0.1))], aspect: 1 })!;
    expect(moved.x).toBeCloseTo(base.x, 5);
    expect(moved.y).toBeCloseTo(base.y, 5);
    // A hand on the other side of the face is measured the same way: x is always toward the draw side.
    const mirrored = anchorObservation({ t: 0, face: syntheticFace(), hands: [hand(faceSpot({}, -0.2, 0.1))], aspect: 1 })!;
    expect(mirrored.x).toBeCloseTo(0.2, 5);
    expect(mirrored.y).toBeCloseTo(0.1, 5);
  });

  it('corrects for a frame that is wider than it is tall', () => {
    const aspect = 16 / 9;
    const squash = (point: Point2) => ({ x: 0.5 + (point.x - 0.5) / aspect, y: point.y });
    const face = syntheticFace().map(squash);
    const observation = anchorObservation({ t: 0, face, hands: [hand(squash(faceSpot({}, 0.2, 0.1)))], aspect })!;
    expect(observation.x).toBeCloseTo(0.2, 5);
    expect(observation.y).toBeCloseTo(0.1, 5);
  });

  it('uses the hand nearest the face as the draw hand', () => {
    const bowHand = hand({ x: 0.95, y: 0.5 });
    const observation = anchorObservation({ t: 0, face: syntheticFace(), hands: [bowHand, hand(faceSpot({}, 0.15, 0))], aspect: 1 })!;
    expect(observation.x).toBeCloseTo(0.15, 5);
  });

  it('marks the draw side as poorly seen when the head turns it away from the camera', () => {
    const frontal = anchorObservation({ t: 0, face: syntheticFace(), hands: [hand(faceSpot({}, 0.2, 0.1))], aspect: 1 })!;
    const turned = anchorObservation({ t: 0, face: syntheticFace({ turnA: 0.8 }), hands: [hand(faceSpot({ turnA: 0.8 }, 0.08, 0.1))], aspect: 1 })!;
    expect(frontal.visibility).toBeCloseTo(1, 5);
    expect(turned.visibility).toBeLessThan(0.4);
  });

  it('returns null without a face, without a hand, or with the hand away from the face', () => {
    const face = syntheticFace();
    expect(anchorObservation({ t: 0, face: null, hands: [hand({ x: 0.5, y: 0.5 })], aspect: 1 })).toBeNull();
    expect(anchorObservation({ t: 0, face, hands: [], aspect: 1 })).toBeNull();
    expect(anchorObservation({ t: 0, face, hands: [hand({ x: 0.95, y: 0.95 })], aspect: 1 })).toBeNull();
  });
});

const observation = (t: number, x: number, y: number, visibility = 1): AnchorObservation => ({
  t, x, y, toChin: Math.hypot(x, y), toMouthCorner: Math.hypot(x - 0.2, y - 0.3), toNose: Math.hypot(x, y - 0.45), visibility,
});

describe('shot and session summaries', () => {
  it('takes the median point of a shot and how much it wobbles', () => {
    const summary = summarizeShotAnchor([observation(0, 0.2, 0.05), observation(0.1, 0.22, 0.05), observation(0.2, 0.2, 0.07), observation(0.3, 0.9, 0.9)])!;
    expect(summary.x).toBeCloseTo(0.21, 5);
    expect(summary.y).toBeCloseTo(0.06, 5);
    expect(summary.frames).toBe(4);
    expect(summary.wobble).toBeLessThan(0.05);
    expect(contactDistance(summary)).toBeCloseTo(Math.min(summary.toChin, summary.toMouthCorner), 9);
  });

  it('scales confidence with how well the face was seen and how many frames there were', () => {
    const seen = summarizeShotAnchor(Array.from({ length: 6 }, (_, i) => observation(i, 0.2, 0.05, 1)))!;
    const hidden = summarizeShotAnchor(Array.from({ length: 6 }, (_, i) => observation(i, 0.2, 0.05, 0.3)))!;
    const few = summarizeShotAnchor([observation(0, 0.2, 0.05), observation(1, 0.2, 0.05)])!;
    expect(seen.confidence).toBeCloseTo(1, 5);
    expect(hidden.confidence).toBeCloseTo(0.3, 5);
    expect(few.confidence).toBeLessThan(seen.confidence);
    expect(summarizeShotAnchor([observation(0, 0.2, 0.05)])).toBeNull();
  });

  it('measures the spread of anchor points across shots', () => {
    expect(anchorFaceSpread([{ x: 0.2, y: 0.05 }])).toBeNull();
    expect(anchorFaceSpread([{ x: 0.2, y: 0.05 }, { x: 0.2, y: 0.05 }])).toBe(0);
    expect(anchorFaceSpread([{ x: 0.1, y: 0 }, { x: 0.3, y: 0 }])).toBeCloseTo(0.1, 9);
  });

  it('samples only each shot\'s anchor window, at most 1.5 s, ending just before release', () => {
    const [short, long] = anchorSampleTimes([{ anchorStart: 9, release: 10 }, { anchorStart: 1, release: 20 }], 4);
    expect(short[0]).toBe(9);
    expect(short.at(-1)!).toBeLessThanOrEqual(9.95);
    expect(long[0]).toBeCloseTo(18.45, 5);
    expect(long.length).toBeLessThanOrEqual(7);
    expect(anchorWindow({ anchorStart: null, release: 5 })).toEqual({ start: 3.45, end: 4.95 });
  });
});

describe('anchor metrics in the report', () => {
  const scenario = makeScenario({ shots: scriptShots(3) });
  const input = {
    id: 'anchor', createdAt: 1,
    samples: syntheticSamples(scenario, 24),
    source: { fileName: 'clip.mp4', fileSize: 1000, mimeType: 'video/mp4', durationS: scenario.durationS, width: 1280, height: 720, nativeFps: 30, analysisFps: 24, hasAudio: false },
    settings: { quality: 'standard' as const, requestedHandedness: 'auto' as const, bowType: 'recurve' as const, model: 'lite' as const, delegate: 'CPU' as const },
    audio: null,
  };
  const plain = buildReport(input);
  // Fingertip under the chin, a little to the draw side, in the same spot on every shot but the last.
  const frames = plain.shots.flatMap((shot, index) => anchorSampleTimes([shot])[0].map((t) => observation(t, index === 2 ? 0.3 : 0.12, index === 2 ? 0.2 : 0.02)));

  it('adds a contact point per shot, a consistency across shots, and keeps the measurements', () => {
    expect(plain.shots.length).toBe(3);
    expect(plain.shots.every((shot) => !shot.anchorFace && !shot.metrics.anchorContactPoint)).toBe(true);

    const report = buildReport({ ...input, anchorFrames: frames });
    for (const shot of report.shots) {
      expect(shot.anchorFace).toBeTruthy();
      expect(shot.metrics.anchorContactPoint?.value).toBeCloseTo(contactDistance(shot.anchorFace!), 9);
    }
    expect(report.session.anchorFaceSpread?.value).toBeGreaterThan(0.05);
    expect(report.anchorFrames).toHaveLength(frames.length);
  });

  it('marks its findings as experimental and leaves the level caps alone', () => {
    const report = buildReport({ ...input, anchorFrames: frames });
    const finding = report.findings.find((item) => item.metric === 'anchorFaceSpread' || item.metric === 'anchorContactPoint');
    // The last shot anchors in a clearly different place, so the spread needs work.
    expect(finding?.metric).toBe('anchorFaceSpread');
    expect(finding?.experimental).toBe(true);
    expect(finding?.drill).toMatch(/Eyes-closed anchors/);
    expect(report.scores.level).toBe(plain.scores.level);
  });

  it('keeps the anchor metrics when the report is scored again', () => {
    const report = buildReport({ ...input, anchorFrames: frames });
    const again = buildReport(inputFromReport(report, { bowType: 'barebow' }));
    expect(again.shots.map((shot) => shot.anchorFace?.x)).toEqual(report.shots.map((shot) => shot.anchorFace?.x));
    expect(again.session.anchorFaceSpread?.value).toBeCloseTo(report.session.anchorFaceSpread!.value, 9);
  });
});
