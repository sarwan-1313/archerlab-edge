export type ScoreEntryMethod = 'gesture-manual' | 'manual-only' | 'none';
export type GestureEntryState = 'idle' | 'waiting-for-score' | 'detecting' | 'confirming' | 'recorded' | 'skipped' | 'timeout' | 'error';

export interface ScoringScheme { minScore: number; maxScore: number; supportsX: boolean; missScore: number; }
export interface ScoreGestureDefinition { id: string; label: string; score: number; isX?: boolean; requiredHands: 1 | 2; description: string; accessibilityDescription: string; }
export interface HandLandmarkPoint { x: number; y: number; z: number; }
export interface DetectedHand { handedness: 'Left' | 'Right' | 'Unknown'; confidence: number; landmarks: HandLandmarkPoint[]; fingerCount: number; }
export interface GestureClassification { gestureId: string; score: number; isX: boolean; confidence: number; leftFingerCount: number | null; rightFingerCount: number | null; handsDetected: number; wristsCrossed: boolean; }
export interface ReportedShotResult {
  score: number;
  isX: boolean;
  source: 'gesture' | 'manual';
  capturedAt: number;
  gestureConfidence?: number;
  gestureId?: string;
  targetX?: number;
  targetY?: number;
  notes?: string;
}
export interface GestureDebugData {
  state: GestureEntryState; handsDetected: number; leftHandConfidence: number; rightHandConfidence: number;
  leftFingerCount: number | null; rightFingerCount: number | null; wristsCrossed: boolean; candidateScore: string;
  stableDurationMs: number; requiredHoldMs: number; candidateConfidence: number; awaitingShotId?: string;
}
