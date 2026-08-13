import { describe, expect, it } from 'vitest';
import type { DetectedHand, GestureClassification, HandLandmarkPoint } from '../types/gestureScore';
import { classifyScoreGesture } from './gestureClassifier';
import { GestureStabilityTracker } from './gestureStability';
import { countRaisedFingers } from './fingerCounting';

const FINGERS = [[4, 3], [8, 6], [12, 10], [16, 14], [20, 18]] as const;
function landmarks(openFingers: number, wristX = 0): HandLandmarkPoint[] {
  const points = Array.from({ length: 21 }, () => ({ x: wristX, y: 0.7, z: 0 }));
  points[0] = { x: wristX, y: 0.9, z: 0 };
  points[5] = { x: wristX - 0.1, y: 0.7, z: 0 }; points[17] = { x: wristX + 0.1, y: 0.7, z: 0 };
  FINGERS.forEach(([tip, joint], index) => {
    points[joint] = { x: wristX, y: 0.6, z: 0 };
    points[tip] = { x: wristX, y: index < openFingers ? 0.25 : 0.72, z: 0 };
  });
  return points;
}

function hand(fingerCount: number, handedness: DetectedHand['handedness'], wristX: number): DetectedHand {
  return { handedness, confidence: 0.9, landmarks: landmarks(fingerCount, wristX), fingerCount };
}

function candidate(score: number, isX = false): GestureClassification {
  return { gestureId: isX ? 'x-ring' : `fingers-${score}`, score, isX, confidence: 0.9, leftFingerCount: score, rightFingerCount: null, handsDetected: 1, wristsCrossed: isX };
}

describe('finger counting and gesture vocabulary', () => {
  it.each([0, 1, 2, 3, 4, 5])('classifies %i raised fingers', (count) => {
    expect(countRaisedFingers(landmarks(count))).toBe(count);
    expect(classifyScoreGesture([hand(count, 'Left', 0)])).toMatchObject({ score: count, isX: false });
  });

  it.each([[1, 6], [2, 7], [3, 8], [4, 9], [5, 10]])('maps 5 + %i fingers to score %i', (second, score) => {
    expect(classifyScoreGesture([hand(5, 'Left', 0), hand(second, 'Right', 1)])).toMatchObject({ score, isX: false });
  });

  it('distinguishes separated open hands as 10 and overlapping wrists as X', () => {
    expect(classifyScoreGesture([hand(5, 'Left', 0), hand(5, 'Right', 1)])).toMatchObject({ score: 10, isX: false, wristsCrossed: false });
    expect(classifyScoreGesture([hand(5, 'Left', 0), hand(5, 'Right', 0.1)])).toMatchObject({ score: 10, isX: true, wristsCrossed: true });
  });

  it('works with either hand and rejects unclear low-confidence hands', () => {
    expect(classifyScoreGesture([hand(3, 'Right', 0)])).toMatchObject({ score: 3 });
    expect(classifyScoreGesture([{ ...hand(5, 'Left', 0), confidence: 0.2 }])).toBeNull();
  });
});

describe('gesture timestamp stability', () => {
  it('confirms only after the same candidate is held for 800 ms', () => {
    const tracker = new GestureStabilityTracker();
    expect(tracker.update(candidate(8), 0).confirmed).toBe(false);
    expect(tracker.update(candidate(8), 400).confirmed).toBe(false);
    const result = tracker.update(candidate(8), 800);
    expect(result.confirmed).toBe(true); expect(result.stableDurationMs).toBe(800); expect(result.confidence).toBeCloseTo(0.9);
  });

  it('does not confirm below hold duration or while predictions fluctuate', () => {
    const tracker = new GestureStabilityTracker(); tracker.update(candidate(8), 0); tracker.update(candidate(7), 400);
    expect(tracker.update(candidate(8), 900).confirmed).toBe(false);
    expect(tracker.update(candidate(8), 1699).confirmed).toBe(false);
  });

  it('resets after temporary tracking loss', () => {
    const tracker = new GestureStabilityTracker(); tracker.update(candidate(10), 0); tracker.update(candidate(10), 500); tracker.update(null, 600);
    expect(tracker.update(candidate(10), 900)).toMatchObject({ confirmed: false, stableDurationMs: 0 });
  });
});
