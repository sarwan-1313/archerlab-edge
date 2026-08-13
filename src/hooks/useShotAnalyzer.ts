import { useCallback, useEffect, useRef, useState } from 'react';
import { SHOT_CONFIG } from '../shot-analysis/config';
import { evaluateReleaseCandidate, type CandidateDetectorState } from '../shot-analysis/releaseCandidate';
import { ShotCaptureEngine } from '../shot-analysis/shotCapture';
import { createShotFrame } from '../shot-analysis/shotFrame';
import { phaseAt } from '../shot-analysis/shotPhases';
import type { ArcherHandedness, BiomechanicsSnapshot } from '../types/biomechanics';
import type { ReleaseCandidate, ShotAnalysis, ShotCaptureDebug, ShotCaptureState, ShotFrame } from '../types/shotAnalysis';

type Options = {
  snapshot: BiomechanicsSnapshot;
  active: boolean;
  handedness: ArcherHandedness;
  onShotCaptured: (shot: ShotAnalysis) => void;
};

export function useShotAnalyzer({ snapshot, active, handedness, onShotCaptured }: Options) {
  const engineRef = useRef(new ShotCaptureEngine(handedness));
  const previousFrameRef = useRef<ShotFrame | undefined>(undefined);
  const candidateStateRef = useRef<CandidateDetectorState>({ lastCandidateMs: -Infinity });
  const activeStartedRef = useRef<number | null>(null);
  const [captureState, setCaptureState] = useState<ShotCaptureState>('idle');
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [autoReleaseEnabled, setAutoReleaseEnabled] = useState(false);
  const [pendingCandidate, setPendingCandidate] = useState<ReleaseCandidate | null>(null);
  const [latestShot, setLatestShot] = useState<ShotAnalysis | undefined>(undefined);
  const captureTimerRef = useRef<number | null>(null);
  const candidateExpiryRef = useRef<number | null>(null);
  const [debug, setDebug] = useState<ShotCaptureDebug>({
    captureState: 'idle', bufferDurationMs: 0, bufferFrames: 0, latestTimestampMs: 0,
    releaseTimestampMs: null, relativeTimestampMs: null, candidateEnabled: false,
    candidateStrength: 0, candidateThreshold: SHOT_CONFIG.candidateThreshold,
    drawWristVelocity: 0, drawElbowVelocity: 0, bowWristVelocity: 0,
    currentPhase: null, preReleaseUsableSamples: 0, postReleaseUsableSamples: 0,
  });

  const syncDebug = useCallback((candidate?: ReleaseCandidate | null) => {
    const engine = engineRef.current;
    const releaseTimestamp = engine.releaseTimestampMs;
    const relative = releaseTimestamp === null ? null : engine.latestTimestampMs - releaseTimestamp;
    setDebug({
      captureState: engine.state,
      bufferDurationMs: engine.bufferDurationMs,
      bufferFrames: engine.bufferFrames,
      latestTimestampMs: engine.latestTimestampMs,
      releaseTimestampMs: releaseTimestamp,
      relativeTimestampMs: relative,
      candidateEnabled: autoReleaseEnabled,
      candidateStrength: candidate?.releaseCandidateStrength ?? pendingCandidate?.releaseCandidateStrength ?? 0,
      candidateThreshold: SHOT_CONFIG.candidateThreshold,
      drawWristVelocity: candidate?.drawWristVelocity ?? pendingCandidate?.drawWristVelocity ?? 0,
      drawElbowVelocity: candidate?.drawElbowVelocity ?? pendingCandidate?.drawElbowVelocity ?? 0,
      bowWristVelocity: candidate?.bowWristVelocity ?? pendingCandidate?.bowWristVelocity ?? 0,
      currentPhase: relative === null ? null : phaseAt(relative),
      preReleaseUsableSamples: engine.preReleaseUsableSamples,
      postReleaseUsableSamples: engine.postReleaseUsableSamples,
    });
  }, [autoReleaseEnabled, pendingCandidate]);

  useEffect(() => {
    const engine = engineRef.current;
    engine.setHandedness(handedness);
    setPendingCandidate(null);
    setCaptureState(engine.state);
  }, [handedness]);

  const publishShot = useCallback((shot: ShotAnalysis) => {
    setLatestShot(shot);
    onShotCaptured(shot);
    setCaptureError(null);
    setCaptureState(engineRef.current.state);
  }, [onShotCaptured]);

  useEffect(() => {
    const engine = engineRef.current;
    if (active) {
      if (activeStartedRef.current === null) activeStartedRef.current = performance.now();
      engine.arm();
    } else {
      engine.abort();
      previousFrameRef.current = undefined;
      candidateStateRef.current = { lastCandidateMs: -Infinity };
      activeStartedRef.current = null;
      setPendingCandidate(null);
      setCaptureError(null);
      if (captureTimerRef.current !== null) window.clearTimeout(captureTimerRef.current);
      if (candidateExpiryRef.current !== null) window.clearTimeout(candidateExpiryRef.current);
      captureTimerRef.current = null;
      candidateExpiryRef.current = null;
    }
    setCaptureState(engine.state);
    syncDebug();
  }, [active, syncDebug]);

  useEffect(() => () => {
    if (captureTimerRef.current !== null) window.clearTimeout(captureTimerRef.current);
    if (candidateExpiryRef.current !== null) window.clearTimeout(candidateExpiryRef.current);
    engineRef.current.abort();
  }, []);

  useEffect(() => {
    if (!active) return;
    const frame = createShotFrame(snapshot);
    if (!frame) return;
    const engine = engineRef.current;
    const shot = engine.ingest(frame);
    if (shot) {
      if (captureTimerRef.current !== null) window.clearTimeout(captureTimerRef.current);
      captureTimerRef.current = null;
      publishShot(shot);
    }
    let candidate: ReleaseCandidate | null = null;
    const startupComplete = activeStartedRef.current !== null && performance.now() - activeStartedRef.current >= SHOT_CONFIG.candidateStartupMs;
    if (autoReleaseEnabled && !pendingCandidate && engine.state === 'armed' && startupComplete) {
      candidate = evaluateReleaseCandidate(previousFrameRef.current, frame, candidateStateRef.current);
      if (candidate) {
        setPendingCandidate(candidate);
        if (candidateExpiryRef.current !== null) window.clearTimeout(candidateExpiryRef.current);
        candidateExpiryRef.current = window.setTimeout(() => {
          setPendingCandidate(null);
          candidateExpiryRef.current = null;
        }, SHOT_CONFIG.candidateConfirmWindowMs);
      }
    }
    previousFrameRef.current = frame;
    setCaptureState(engine.state);
    syncDebug(candidate ?? candidateStateRef.current.lastEvaluation);
  }, [active, autoReleaseEnabled, pendingCandidate, publishShot, snapshot, syncDebug]);

  const markRelease = useCallback((source: 'manual' | 'automatic-candidate-confirmed' = 'manual', timestampMs?: number) => {
    if (!active) { setCaptureError('Start the camera before marking release'); return false; }
    if (!snapshot.athleteDetected) { setCaptureError('Athlete must be visible before marking release'); return false; }
    const result = engineRef.current.markRelease(timestampMs ?? snapshot.timestampMs, source);
    if (!result.ok) { setCaptureError(result.reason); return false; }
    setCaptureError(null);
    setCaptureState(engineRef.current.state);
    setPendingCandidate(null);
    if (candidateExpiryRef.current !== null) window.clearTimeout(candidateExpiryRef.current);
    candidateExpiryRef.current = null;
    if (captureTimerRef.current !== null) window.clearTimeout(captureTimerRef.current);
    const releaseTimestamp = engineRef.current.releaseTimestampMs!;
    const delay = Math.max(0, releaseTimestamp + SHOT_CONFIG.postReleaseMs - snapshot.timestampMs);
    captureTimerRef.current = window.setTimeout(() => {
      const shot = engineRef.current.advance(releaseTimestamp + SHOT_CONFIG.postReleaseMs);
      captureTimerRef.current = null;
      if (shot) publishShot(shot);
      syncDebug();
    }, delay);
    syncDebug();
    return true;
  }, [active, publishShot, snapshot.athleteDetected, snapshot.timestampMs, syncDebug]);

  const confirmCandidate = useCallback(() => {
    if (!pendingCandidate) return;
    markRelease('automatic-candidate-confirmed', pendingCandidate.timestampMs);
  }, [markRelease, pendingCandidate]);
  const ignoreCandidate = useCallback(() => {
    if (candidateExpiryRef.current !== null) window.clearTimeout(candidateExpiryRef.current);
    candidateExpiryRef.current = null;
    setPendingCandidate(null);
    syncDebug(null);
  }, [syncDebug]);
  const clearLatestShot = useCallback(() => {
    setLatestShot(undefined);
    engineRef.current.resetAfterUndo();
    setCaptureState(engineRef.current.state);
    setCaptureError(null);
    syncDebug();
  }, [syncDebug]);

  return {
    captureState, captureError, markRelease, latestShot, clearLatestShot,
    autoReleaseEnabled, setAutoReleaseEnabled, pendingCandidate, confirmCandidate, ignoreCandidate, debug,
  };
}
