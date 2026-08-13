import { distance2D } from '../biomechanics/geometry';
import type { DetectedHand, GestureClassification, ScoringScheme } from '../types/gestureScore';
import { DEFAULT_SCORING_SCHEME, GESTURE_CONFIG } from './config';
import { palmWidth } from './fingerCounting';

export function classifyScoreGesture(hands: readonly DetectedHand[], scheme: ScoringScheme = DEFAULT_SCORING_SCHEME): GestureClassification | null {
  const usable = hands.filter((hand) => hand.confidence >= GESTURE_CONFIG.minHandConfidence && hand.fingerCount >= 0 && hand.fingerCount <= 5).slice(0, 2);
  if (!usable.length) return null;
  const total = usable.reduce((sum, hand) => sum + hand.fingerCount, 0);
  if (total < scheme.minScore || total > scheme.maxScore || (total > 5 && usable.length < 2)) return null;
  const left = usable.find((hand) => hand.handedness === 'Left'); const right = usable.find((hand) => hand.handedness === 'Right');
  let wristsCrossed = false;
  if (usable.length === 2 && usable.every((hand) => hand.fingerCount === 5)) {
    const scale = (palmWidth(usable[0].landmarks) + palmWidth(usable[1].landmarks)) / 2;
    wristsCrossed = scale > 0 && distance2D(usable[0].landmarks[0], usable[1].landmarks[0]) / scale < GESTURE_CONFIG.crossedWristPalmRatio;
  }
  const isX = scheme.supportsX && total === 10 && wristsCrossed;
  return { gestureId: isX ? 'x-ring' : total === 0 ? 'fist-0' : `fingers-${total}`, score: total, isX, confidence: Math.min(...usable.map((hand) => hand.confidence)), leftFingerCount: left?.fingerCount ?? null, rightFingerCount: right?.fingerCount ?? null, handsDetected: usable.length, wristsCrossed };
}
