import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { GESTURE_CONFIG, DEFAULT_SCORING_SCHEME } from '../gesture-entry/config';
import { classifyScoreGesture } from '../gesture-entry/gestureClassifier';
import { GestureStabilityTracker } from '../gesture-entry/gestureStability';
import { getHandLandmarker, toDetectedHands } from '../services/handLandmarkerService';
import type { GestureClassification, GestureDebugData, GestureEntryState, ReportedShotResult, ScoringScheme } from '../types/gestureScore';

type Options = { videoRef: RefObject<HTMLVideoElement | null>; active: boolean; shotId?: string; practice?: boolean; scheme?: ScoringScheme; onResult?: (shotId: string, result: ReportedShotResult) => void; onTimeout?: () => void };
export function useGestureScoreEntry({ videoRef, active, shotId, practice = false, scheme = DEFAULT_SCORING_SCHEME, onResult, onTimeout }: Options) {
  const [state, setState] = useState<GestureEntryState>('idle'); const [candidate, setCandidate] = useState<GestureClassification | null>(null); const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<GestureDebugData>({ state: 'idle', handsDetected: 0, leftHandConfidence: 0, rightHandConfidence: 0, leftFingerCount: null, rightFingerCount: null, wristsCrossed: false, candidateScore: '--', stableDurationMs: 0, requiredHoldMs: GESTURE_CONFIG.holdMs, candidateConfidence: 0 });
  const trackerRef = useRef(new GestureStabilityTracker()); const startedRef = useRef(0); const savedRef = useRef(false); const stoppedRef = useRef(false);
  useEffect(() => {
    let cancelled = false; let animationFrame = 0; let lastInference = -Infinity; let lastVideoTime = -1;
    const tracker = trackerRef.current;
    tracker.reset(); savedRef.current = false; stoppedRef.current = false; setCandidate(null); setError(null);
    if (!active || (!practice && !shotId)) { setState('idle'); return; }
    setState('waiting-for-score'); startedRef.current = performance.now();
    const start = async () => { try { const landmarker = await getHandLandmarker(); if (cancelled) return; setState('detecting');
      const loop = (now: number) => { if (cancelled || stoppedRef.current) return; const video = videoRef.current;
        if (now - startedRef.current >= GESTURE_CONFIG.entryTimeoutMs && !practice && !savedRef.current) { stoppedRef.current = true; setState('timeout'); setDebug((current) => ({ ...current, state: 'timeout' })); onTimeout?.(); return; }
        if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime !== lastVideoTime && now - lastInference >= 1000 / GESTURE_CONFIG.targetInferenceFps) {
          lastInference = now; lastVideoTime = video.currentTime;
          try { const hands = toDetectedHands(landmarker.detectForVideo(video, now)); const next = classifyScoreGesture(hands, scheme); const stability = tracker.update(next, now); setCandidate(next);
            const left = hands.find((hand) => hand.handedness === 'Left'); const right = hands.find((hand) => hand.handedness === 'Right');
            setDebug({ state: stability.confirmed && !practice ? 'confirming' : 'detecting', handsDetected: hands.length, leftHandConfidence: left?.confidence ?? 0, rightHandConfidence: right?.confidence ?? 0, leftFingerCount: left?.fingerCount ?? null, rightFingerCount: right?.fingerCount ?? null, wristsCrossed: next?.wristsCrossed ?? false, candidateScore: next ? next.isX ? 'X' : String(next.score) : '--', stableDurationMs: stability.stableDurationMs, requiredHoldMs: GESTURE_CONFIG.holdMs, candidateConfidence: stability.confidence, awaitingShotId: shotId });
            if (stability.confirmed && next && !practice && shotId && !savedRef.current) { savedRef.current = true; stoppedRef.current = true; setState('recorded'); setDebug((current) => ({ ...current, state: 'recorded' })); onResult?.(shotId, { score: next.score, isX: next.isX, source: 'gesture', capturedAt: Date.now(), gestureConfidence: stability.confidence, gestureId: next.gestureId }); return; }
          } catch (runtimeError) { stoppedRef.current = true; setError(runtimeError instanceof Error ? runtimeError.message : 'Gesture recognition failed'); setState('error'); setDebug((current) => ({ ...current, state: 'error' })); return; }
        } animationFrame = requestAnimationFrame(loop); };
      animationFrame = requestAnimationFrame(loop);
    } catch (initializationError) { if (!cancelled) { setError(initializationError instanceof Error ? initializationError.message : 'Hand tracking could not start'); setState('error'); } } };
    void start(); return () => { cancelled = true; stoppedRef.current = true; cancelAnimationFrame(animationFrame); tracker.reset(); };
  }, [active, onResult, onTimeout, practice, scheme, shotId, videoRef]);
  const skip = useCallback(() => { stoppedRef.current = true; trackerRef.current.reset(); setState('skipped'); setDebug((current) => ({ ...current, state: 'skipped' })); onTimeout?.(); }, [onTimeout]);
  return { state, candidate, debug, error, skip };
}
