import type { GestureClassification, GestureEntryState } from '../../types/gestureScore';
import { GESTURE_CONFIG } from '../../gesture-entry/config';

export function GestureScoreOverlay({ state, candidate, stableDurationMs, shotNumber, onSkip, onManual, onGuide, onUndo }: { state: GestureEntryState; candidate: GestureClassification | null; stableDurationMs: number; shotNumber: number; onSkip: () => void; onManual: () => void; onGuide: () => void; onUndo: () => void }) {
  const progress = Math.min(100, (stableDurationMs / GESTURE_CONFIG.holdMs) * 100);
  return <div className="gesture-overlay"><span className="eyebrow">Shot #{shotNumber} captured</span>
    <h3>{state === 'recorded' ? 'Score recorded' : state === 'timeout' ? 'Score skipped' : 'Show score to camera'}</h3>
    {state === 'recorded' ? <strong className="gesture-overlay__score">{candidate?.isX ? 'X' : candidate?.score ?? '--'}</strong> : <><p>Face the camera and hold your score gesture clearly.</p><strong className="gesture-overlay__score">{candidate ? candidate.isX ? 'X' : candidate.score : '--'}</strong><div className="gesture-overlay__progress"><span style={{ width: `${progress}%` }} /></div><small>{candidate ? 'Hold steadily…' : 'Waiting for gesture…'}</small></>}
    <div className="gesture-overlay__actions">{state === 'recorded' ? <button type="button" onClick={onUndo}>Undo score</button> : <><button type="button" onClick={onGuide}>Gesture Guide</button><button type="button" onClick={onManual}>Enter Manually</button><button type="button" onClick={onSkip}>Skip</button></>}</div>
  </div>;
}
