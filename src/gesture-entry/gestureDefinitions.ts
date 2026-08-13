import type { ScoreGestureDefinition } from '../types/gestureScore';
export const SCORE_GESTURES: ScoreGestureDefinition[] = Array.from({ length: 11 }, (_, score) => ({
  id: score === 0 ? 'fist-0' : `fingers-${score}`, label: score === 0 ? 'MISS / 0' : String(score), score,
  requiredHands: score <= 5 ? 1 : 2,
  description: score === 0 ? 'One closed fist' : score <= 5 ? `${score} raised finger${score === 1 ? '' : 's'}` : score === 10 ? 'Both hands fully open' : `Five fingers plus ${score - 5}`,
  accessibilityDescription: `Athlete-reported score ${score} using ${score === 0 ? 'a closed fist' : `${score} total raised fingers`}`,
}));
SCORE_GESTURES.push({ id: 'x-ring', label: 'X', score: 10, isX: true, requiredHands: 2, description: 'Both hands open with wrists crossed', accessibilityDescription: 'X ring using two open hands with overlapping wrists' });
