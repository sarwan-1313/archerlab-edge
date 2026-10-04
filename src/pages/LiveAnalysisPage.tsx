import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AppIcon } from '../components/AppIcon';
import { BiomechanicsDebugPanel } from '../components/biomechanics/BiomechanicsDebugPanel';
import { BiomechanicsMetricCard } from '../components/biomechanics/BiomechanicsMetricCard';
import { CameraPreview } from '../components/CameraPreview';
import { GestureDebugPanel } from '../components/gestures/GestureDebugPanel';
import { GestureScoreOverlay } from '../components/gestures/GestureScoreOverlay';
import { PageHeader } from '../components/PageHeader';
import { PoseDebugPanel } from '../components/pose/PoseDebugPanel';
import { PoseOverlay } from '../components/pose/PoseOverlay';
import { PoseStatus } from '../components/pose/PoseStatus';
import { RecordingControls } from '../components/recording/RecordingControls';
import { ShotCaptureDebugPanel } from '../components/shot/ShotCaptureDebugPanel';
import { StatusBadge } from '../components/StatusBadge';
import { EndSessionDialog } from '../components/training/EndSessionDialog';
import { ReadinessCheck, type ReadinessCheckItem } from '../components/training/ReadinessCheck';
import { SessionSummary } from '../components/training/SessionSummary';
import { ShotReviewPanel } from '../components/training/ShotReviewPanel';
import { TrainingProgress } from '../components/training/TrainingProgress';
import { useBiomechanics } from '../hooks/useBiomechanics';
import { useGestureScoreEntry } from '../hooks/useGestureScoreEntry';
import { useLocalCamera } from '../hooks/useLocalCamera';
import { usePoseLandmarker } from '../hooks/usePoseLandmarker';
import { useSessionRecorder } from '../hooks/useSessionRecorder';
import { useShotAnalyzer } from '../hooks/useShotAnalyzer';
import { runPresentationTransition } from '../motion/runPresentationTransition';
import { isActiveTrainingState, isSetupTrainingState, transitionTrainingWorkflow, type TrainingWorkflowEvent, type TrainingWorkflowState } from '../training/trainingWorkflow';
import type { ArcherHandedness, BiomechanicsReference, CameraView } from '../types/biomechanics';
import type { ReportedShotResult, ScoreEntryMethod } from '../types/gestureScore';
import type { ShotAnalysis } from '../types/shotAnalysis';
import { getCalibrationReadiness, getPoseDetectionState } from '../utils/poseAnalysis';

const CAMERA_OPTIONS = { autoStart: true } as const;
const TRAINING_STAGE_KEY = 'archerlab-edge:training-stage';
const ACTIVE_SESSION_KEY = 'archerlab-edge:live-session-active';

const SHOT_PHASES = [
  { id: 'setup', label: 'Set up', shortLabel: 'Set' },
  { id: 'draw', label: 'Draw', shortLabel: 'Draw' },
  { id: 'anchor', label: 'Anchor', shortLabel: 'Hold' },
  { id: 'release', label: 'Release', shortLabel: 'Release' },
  { id: 'follow-through', label: 'Follow-through', shortLabel: 'Follow' },
] as const;

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  return `${Math.floor(totalSeconds / 60).toString().padStart(2, '0')}:${(totalSeconds % 60).toString().padStart(2, '0')}`;
}

function readInitialWorkflow(): { state: TrainingWorkflowState; interrupted: boolean } {
  try {
    const stored = sessionStorage.getItem(TRAINING_STAGE_KEY) as TrainingWorkflowState | null;
    const interrupted = sessionStorage.getItem(ACTIVE_SESSION_KEY) === 'true' || stored === 'SESSION_ACTIVE' || stored === 'SHOT_REVIEW' || stored === 'SESSION_ENDING';
    if (stored === 'CAMERA_SETUP' || stored === 'READY_CHECK' || stored === 'SESSION_READY') return { state: stored, interrupted: false };
    return { state: 'CAMERA_SETUP', interrupted };
  } catch {
    return { state: 'CAMERA_SETUP', interrupted: false };
  }
}

type LiveAnalysisPageProps = {
  handedness: ArcherHandedness;
  cameraView: CameraView;
  onCameraViewChange?: (view: CameraView) => void;
  reference?: BiomechanicsReference;
  scoreEntryMethod: ScoreEntryMethod;
  autoReleaseDefault: boolean;
  shots: ShotAnalysis[];
  onShotCaptured: (shot: ShotAnalysis) => void;
  onAttachResult: (shotId: string, result: ReportedShotResult) => void;
  onUndoLastShot: () => void;
  onGestureGuide: () => void;
  onSessionActiveChange?: (active: boolean) => void;
  navigationEndRequest?: number;
  onNavigationEndComplete?: () => void;
  onViewSessions: () => void;
  onViewAnalytics: () => void;
  onStartNewSession: () => void;
  onHome: () => void;
};

export function LiveAnalysisPage({ handedness, cameraView, onCameraViewChange, reference, scoreEntryMethod, autoReleaseDefault, shots, onShotCaptured, onAttachResult, onUndoLastShot, onGestureGuide, onSessionActiveChange, navigationEndRequest, onNavigationEndComplete, onViewSessions, onViewAnalytics, onStartNewSession, onHome }: LiveAnalysisPageProps) {
  const [initialWorkflow] = useState(readInitialWorkflow);
  const [workflowState, dispatch] = useReducer(
    (state: TrainingWorkflowState, event: TrainingWorkflowEvent) => transitionTrainingWorkflow(state, event),
    initialWorkflow.state,
  );
  const [interruptedSession] = useState(initialWorkflow.interrupted);
  const [awaitingScoreShotId, setAwaitingScoreShotId] = useState<string>();
  const [manualEntryRequested, setManualEntryRequested] = useState(false);
  const [shotRecordedId, setShotRecordedId] = useState<string>();
  const [showEndConfirmation, setShowEndConfirmation] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const startingSessionRef = useRef(false);
  const [sessionStartError, setSessionStartError] = useState<string>();
  const [sessionSaveError, setSessionSaveError] = useState<string>();
  const [finalDurationMs, setFinalDurationMs] = useState(0);

  const { devices, selectedDeviceId, setSelectedDeviceId, stream, error, isLoading, startCamera, stopCamera } = useLocalCamera(CAMERA_OPTIONS);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pose = usePoseLandmarker({ videoRef, active: Boolean(stream) });
  const biomechanics = useBiomechanics({ poseResult: pose.result, handedness, active: Boolean(stream), resetKey: `${selectedDeviceId ?? 'default-camera'}:${cameraView}`, reference });
  const sessionRecorder = useSessionRecorder(stream, { sessionId: undefined, athleteId: undefined });
  const sessionRecorderRef = useRef(sessionRecorder);
  const snapshotRef = useRef(biomechanics.snapshot);
  const handledNavigationRequestRef = useRef<number | undefined>(undefined);
  const workflowHasMountedRef = useRef(false);
  sessionRecorderRef.current = sessionRecorder;
  snapshotRef.current = biomechanics.snapshot;

  useEffect(() => {
    workflowHasMountedRef.current = true;
  }, []);

  const detectionState = getPoseDetectionState(pose.result);
  const calibrationReadiness = useMemo(
    () => getCalibrationReadiness(pose.result?.landmarks ?? [], Boolean(stream)),
    [pose.result, stream],
  );
  const cameraReady = Boolean(stream) && !error && !isLoading;
  const poseReady = detectionState === 'athlete-detected' && calibrationReadiness.ready;
  const engineReady = pose.status === 'ready' || pose.status === 'running';
  const readinessComplete = cameraReady && poseReady && engineReady;
  const sessionActive = isActiveTrainingState(workflowState);
  const scoreEntryBusy = Boolean(awaitingScoreShotId);

  const recordSessionEvent = useCallback((event: { type: string; tMs?: number; [key: string]: unknown }) => {
    void sessionRecorderRef.current.recordEvent(event);
  }, []);

  const handleShotCaptured = useCallback((shot: ShotAnalysis) => {
    onShotCaptured(shot);
    setManualEntryRequested(false);
    if (scoreEntryMethod !== 'none') setAwaitingScoreShotId(shot.id);
    setShotRecordedId(shot.id);
    dispatch('SHOT_COMPLETED');
  }, [onShotCaptured, scoreEntryMethod]);

  const shotAnalyzer = useShotAnalyzer({
    snapshot: biomechanics.snapshot,
    active: workflowState === 'SESSION_ACTIVE' && Boolean(stream) && !scoreEntryBusy,
    handedness,
    onShotCaptured: handleShotCaptured,
    onRecordEvent: recordSessionEvent,
  });
  const setAutoReleaseEnabled = shotAnalyzer.setAutoReleaseEnabled;

  const handleScoreResult = useCallback((shotId: string, result: ReportedShotResult) => {
    recordSessionEvent({ type: 'score', shotId, source: result.source, score: result.score, isX: result.isX, tMs: sessionRecorderRef.current.durationMs });
    onAttachResult(shotId, result);
    setAwaitingScoreShotId(undefined);
    setManualEntryRequested(false);
  }, [onAttachResult, recordSessionEvent]);

  const finishScoreWindow = useCallback(() => setAwaitingScoreShotId(undefined), []);
  const gesture = useGestureScoreEntry({
    videoRef,
    active: workflowState === 'SHOT_REVIEW' && Boolean(stream) && scoreEntryMethod === 'gesture-manual' && Boolean(awaitingScoreShotId) && !manualEntryRequested,
    shotId: awaitingScoreShotId,
    onResult: handleScoreResult,
    onTimeout: finishScoreWindow,
  });

  useEffect(() => {
    setAutoReleaseEnabled(autoReleaseDefault);
  }, [autoReleaseDefault, setAutoReleaseEnabled]);

  useEffect(() => {
    if (!shotRecordedId) return;
    const timeout = window.setTimeout(() => setShotRecordedId(undefined), 1800);
    return () => window.clearTimeout(timeout);
  }, [shotRecordedId]);

  useEffect(() => {
    if (sessionRecorder.state !== 'recording') return;
    const telemetryInterval = window.setInterval(() => {
      const snap = snapshotRef.current;
      if (!snap) return;
      void sessionRecorderRef.current.recordTelemetryFrame({
        tMs: Math.round(sessionRecorderRef.current.durationMs),
        athleteDetected: Boolean(snap.athleteDetected),
        shoulderLineAngleDeg: snap.shoulderLineAngle.smoothedValue ?? snap.shoulderLineAngle.rawValue ?? null,
        bowArmAngleDeg: snap.bowArmElbowAngle.smoothedValue ?? snap.bowArmElbowAngle.rawValue ?? null,
        torsoLeanDeg: snap.torsoLean.smoothedValue ?? snap.torsoLean.rawValue ?? null,
        headMotion: snap.headMotion.smoothedValue ?? snap.headMotion.rawValue ?? null,
        bowHandMotion: snap.bowHandMotion.smoothedValue ?? snap.bowHandMotion.rawValue ?? null,
        poseConfidence: snap.poseConfidence ?? snap.debug.metricConfidence ?? null,
      });
    }, 100);
    return () => window.clearInterval(telemetryInterval);
  }, [sessionRecorder.state]);

  useEffect(() => {
    onSessionActiveChange?.(sessionActive);
    try {
      if (isSetupTrainingState(workflowState) || sessionActive) sessionStorage.setItem(TRAINING_STAGE_KEY, workflowState);
      else sessionStorage.removeItem(TRAINING_STAGE_KEY);
      if (sessionActive) sessionStorage.setItem(ACTIVE_SESSION_KEY, 'true');
      else sessionStorage.removeItem(ACTIVE_SESSION_KEY);
    } catch { /* Session storage can be unavailable in private contexts. */ }
  }, [onSessionActiveChange, sessionActive, workflowState]);

  useEffect(() => {
    if (!sessionActive) return;
    const protectRefresh = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', protectRefresh);
    return () => window.removeEventListener('beforeunload', protectRefresh);
  }, [sessionActive]);

  useEffect(() => {
    if (workflowState === 'SESSION_READY' && !readinessComplete) dispatch('READINESS_LOST');
  }, [readinessComplete, workflowState]);

  useEffect(() => {
    if (workflowState !== 'SESSION_ENDING') return;
    if (sessionRecorder.state === 'idle') {
      setFinalDurationMs(sessionRecorder.durationMs);
      stopCamera();
      if (navigationEndRequest) onNavigationEndComplete?.();
      else dispatch('SESSION_FINALIZED');
      return;
    }
    if (sessionRecorder.state === 'error') {

        setFinalDurationMs(sessionRecorder.durationMs);
        setSessionSaveError('The browser could not finalize the local recording.');
        stopCamera();
        if (navigationEndRequest) onNavigationEndComplete?.();
        else dispatch('SESSION_FINALIZED');

    }
  }, [navigationEndRequest, onNavigationEndComplete, sessionRecorder.durationMs, sessionRecorder.state, stopCamera, workflowState]);

  useEffect(() => {
    if (!navigationEndRequest || handledNavigationRequestRef.current === navigationEndRequest || !sessionActive) return;
    handledNavigationRequestRef.current = navigationEndRequest;
    setFinalDurationMs(sessionRecorder.durationMs);
    dispatch('END_SESSION_CONFIRMED');
    sessionRecorder.stop();
  }, [navigationEndRequest, sessionActive, sessionRecorder]);

  const deviceLabel = useMemo(
    () => devices.find((device) => device.deviceId === selectedDeviceId)?.label ?? 'Local Camera',
    [devices, selectedDeviceId],
  );
  const activeCameraView = cameraView === 'side' ? 'Side view' : cameraView === 'front' ? 'Front view' : 'Rear view';
  const lastScoredShot = [...shots].reverse().find((shot) => shot.actualResult);
  const reviewShotId = shotAnalyzer.latestShot?.id ?? shots.at(-1)?.id;
  const reviewShot = shots.find((shot) => shot.id === reviewShotId) ?? shotAnalyzer.latestShot;
  const activePhaseIndex = SHOT_PHASES.findIndex((phase) => phase.id === shotAnalyzer.debug.currentPhase);
  const isShotComplete = shotAnalyzer.captureState === 'complete';

  const readinessChecks: ReadinessCheckItem[] = [
    {
      name: 'Camera',
      state: isLoading ? 'checking' : cameraReady ? 'ready' : 'attention',
      label: isLoading ? 'Checking' : cameraReady ? 'Ready' : 'Needs Attention',
      guidance: cameraReady ? `${deviceLabel} is providing a local video feed.` : error ?? 'Allow camera access and make sure the device is available.',
    },
    {
      name: 'Pose Detection',
      state: pose.status === 'loading' ? 'checking' : pose.status === 'error' ? 'unavailable' : poseReady ? 'ready' : 'attention',
      label: pose.status === 'loading' ? 'Searching' : pose.status === 'error' ? 'Unavailable' : poseReady ? 'Detected' : 'Needs Attention',
      guidance: poseReady ? 'The athlete and required landmarks are visible.' : pose.status === 'error' ? pose.error ?? 'The analysis model could not be loaded.' : 'Move farther back and keep the full shooting stance visible.',
    },
    {
      name: 'Analysis Engine',
      state: pose.status === 'error' ? 'unavailable' : engineReady ? 'ready' : pose.status === 'loading' ? 'checking' : 'attention',
      label: pose.status === 'error' ? 'Unavailable' : engineReady ? 'Ready' : pose.status === 'loading' ? 'Loading' : 'Waiting for camera',
      guidance: pose.status === 'error' ? pose.error ?? 'The pose model could not be loaded.' : engineReady ? 'On-device pose analysis is available.' : pose.status === 'loading' ? 'Loading the local analysis model.' : 'Connect the camera to start analysis.',
    },
  ];

  const selectDevice = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    void startCamera(deviceId);
  };

  const retryRuntime = () => { void startCamera(selectedDeviceId ?? undefined); };

  const switchCamera = () => {
    if (devices.length < 2) { retryRuntime(); return; }
    const currentIndex = devices.findIndex((device) => device.deviceId === selectedDeviceId);
    const nextDevice = devices[(currentIndex + 1) % devices.length];
    selectDevice(nextDevice.deviceId);
  };

  const startSession = async () => {
    if (startingSessionRef.current || !readinessComplete) return;
    startingSessionRef.current = true;
    setIsStartingSession(true);
    setSessionStartError(undefined);
    const result = await sessionRecorder.start().catch(() => ({ ok: false, error: 'The local recording could not start. Check camera and browser storage, then try again.' }));
    startingSessionRef.current = false;
    setIsStartingSession(false);
    if (!result.ok) {
      setSessionStartError(result.error || 'The local session could not be started.');
      return;
    }
    dispatch('SESSION_STARTED');
  };

  const continueSession = () => {
    setAwaitingScoreShotId(undefined);
    setManualEntryRequested(false);
    dispatch('CONTINUE_SESSION');
  };

  const confirmEndSession = () => {
    setShowEndConfirmation(false);
    setFinalDurationMs(sessionRecorder.durationMs);
    dispatch('END_SESSION_CONFIRMED');
    sessionRecorder.stop();
  };

  const openEndConfirmation = () => runPresentationTransition(
    () => setShowEndConfirmation(true),
    { cameraSafe: true, kind: 'modal' },
  );

  if (workflowState === 'SESSION_SUMMARY') {
    return <SessionSummary shots={shots} durationMs={finalDurationMs || sessionRecorder.durationMs} saveError={sessionSaveError} onViewSession={onViewSessions} onViewAnalytics={onViewAnalytics} onStartNew={onStartNewSession} onHome={onHome} />;
  }

  if (isSetupTrainingState(workflowState)) {
    const setupStep = workflowState === 'CAMERA_SETUP' ? 1 : workflowState === 'READY_CHECK' ? 2 : 3;
    const title = workflowState === 'CAMERA_SETUP' ? 'Camera Setup' : workflowState === 'READY_CHECK' ? 'Readiness Check' : 'Ready to Begin';
    const subtitle = workflowState === 'CAMERA_SETUP'
      ? 'Position your camera so your shooting form can be analyzed clearly.'
      : workflowState === 'READY_CHECK'
        ? 'Confirm the camera, athlete visibility, and on-device analysis engine.'
        : readinessComplete ? 'Your camera and analysis system are ready.' : 'Readiness changed. Rechecking the analysis system.';

    return (
      <div className="training-setup-page">
        <PageHeader title={title} subtitle={subtitle} actions={<StatusBadge label={`Step ${setupStep} of 3`} tone={readinessComplete ? 'success' : 'primary'} compact />} />
        <TrainingProgress current={setupStep} />
        {interruptedSession ? <div className="training-recovery-notice"><AppIcon name="history" size={18} /><div><strong>The previous live session ended after the page refreshed.</strong><span>Camera analysis cannot be restored after a refresh. Already saved sessions remain available on this device.</span></div></div> : null}

        <div className="training-setup-layout">
          <section className="training-setup-camera" aria-label="Camera setup preview">
            <div className="training-setup-camera__bar">
              <div><span className={`status-dot ${cameraReady ? 'status-dot--active' : ''}`} /><strong>{isLoading ? 'Requesting camera' : cameraReady ? 'Camera active' : 'Camera needs attention'}</strong></div>
              <label><span className="sr-label">Camera device</span><select value={selectedDeviceId ?? ''} onChange={(event) => selectDevice(event.target.value)} disabled={isLoading || devices.length === 0}>{devices.length === 0 ? <option value="">{deviceLabel}</option> : devices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}</select></label>
            </div>
            <CameraPreview stream={stream} isLoading={isLoading} error={error} videoRef={videoRef} className="training-setup-camera__preview">
              <div className="calibration-grid" aria-hidden="true" />
              <PoseOverlay videoRef={videoRef} resultRef={pose.latestResultRef} active={Boolean(stream)} />
              {!pose.result?.athleteDetected && stream && !error ? <div className="body-guide" aria-hidden="true"><span className="body-guide__head" /><span className="body-guide__torso" /><span className="body-guide__baseline" /><span className="body-guide__label">Position athlete here</span></div> : null}
              <div className="calibration-pose-status"><PoseStatus engineStatus={pose.status} detectionState={detectionState} /></div>
              <div className="calibration-camera__privacy"><AppIcon name="shield" size={15} />Local processing</div>
            </CameraPreview>
            <div className="training-camera-help"><AppIcon name="scan" size={18} /><div><strong>Your upper body and shooting arm should remain visible.</strong><span>If detection is unstable, increase lighting and move farther from the camera.</span></div></div>
          </section>

          <aside className="training-setup-panel">
            <div key={workflowState} className={`training-setup-panel__step ${workflowHasMountedRef.current ? 'motion-section-enter' : ''}`}>
            {workflowState === 'CAMERA_SETUP' ? <>
              <div className="training-setup-panel__header"><span className="eyebrow">Prepare the frame</span><h2>{readinessComplete ? 'Setup looks good' : 'Position the athlete'}</h2><p>These checks use the live camera and existing pose visibility output.</p></div>
              <label className="training-view-select"><span>Camera angle</span><select value={cameraView} onChange={(event) => onCameraViewChange?.(event.target.value as CameraView)}><option value="side">Side View</option><option value="front">Front View</option><option value="rear">Rear View</option></select></label>
              <ul className="training-setup-instructions">
                <li className={calibrationReadiness.athlete ? 'is-complete' : ''}><AppIcon name={calibrationReadiness.athlete ? 'check' : 'accessibility'} size={16} /><span><strong>Keep the archer visible</strong><small>Head, torso, arms, and stance should remain in frame.</small></span></li>
                <li className={calibrationReadiness.arms ? 'is-complete' : ''}><AppIcon name={calibrationReadiness.arms ? 'check' : 'scan'} size={16} /><span><strong>Show the shooting side</strong><small>Both shoulders, elbows, and wrists need clear visibility.</small></span></li>
                <li><AppIcon name="camera" size={16} /><span><strong>Stabilize the camera</strong><small>Use a fixed surface or mount and avoid strong backlighting.</small></span></li>
              </ul>
              {!readinessComplete ? <div className="training-inline-feedback"><AppIcon name={error || pose.status === 'error' ? 'sensors' : 'scan'} size={17} /><span>{error ?? (pose.status === 'error' ? pose.error ?? 'Analysis model unavailable.' : pose.status === 'loading' ? 'Searching for the athlete in the camera frame.' : 'Keep the complete shooting stance visible to continue.')}</span></div> : null}
              <div className="training-setup-actions"><button type="button" className="button button--secondary" onClick={onGestureGuide}>Open User Guide</button>{!cameraReady || pose.status === 'error' ? <button type="button" className="button button--secondary" onClick={retryRuntime} disabled={isLoading}><AppIcon name="refresh" size={16} />Try Camera Again</button> : null}<button type="button" className="button button--primary" disabled={!readinessComplete} onClick={() => dispatch('CAMERA_CONFIRMED')}>Continue to Readiness<AppIcon name="arrow-right" size={16} /></button></div>
            </> : null}

            {workflowState === 'READY_CHECK' ? <>
              <ReadinessCheck checks={readinessChecks} retrying={isLoading} onTryAgain={retryRuntime} />
              <div className="training-setup-actions"><button type="button" className="button button--secondary" onClick={() => dispatch('BACK_TO_CAMERA_SETUP')}><AppIcon name="arrow-left" size={16} />Back to Camera Setup</button><button type="button" className="button button--primary" disabled={!readinessComplete} onClick={() => dispatch('READINESS_PASSED')}>Continue<AppIcon name="arrow-right" size={16} /></button></div>
            </> : null}

            {workflowState === 'SESSION_READY' ? <div className="session-ready-card">
              <span className="session-ready-card__icon"><AppIcon name="check" size={26} /></span>
              <span className="eyebrow">All checks passed</span>
              <h2>Ready to Begin</h2>
              <p>Your camera and analysis system are ready. Starting the session begins local recording and shot capture.</p>
              <div className="session-ready-card__facts"><span><AppIcon name="camera" size={15} />{deviceLabel}</span><span><AppIcon name="accessibility" size={15} />{handedness}-handed</span><span><AppIcon name="scan" size={15} />{activeCameraView}</span><span><AppIcon name="shield" size={15} />On-device</span></div>
              {sessionStartError ? <div className="training-inline-feedback training-inline-feedback--error"><AppIcon name="sensors" size={17} /><span>{sessionStartError}</span></div> : null}
              <div className="training-setup-actions"><button type="button" className="button button--secondary" disabled={isStartingSession} onClick={() => dispatch('BACK_TO_CAMERA_SETUP')}>Back to Camera Setup</button><button type="button" className="button button--primary session-ready-start" disabled={isStartingSession || !readinessComplete} onClick={() => void startSession()}>{isStartingSession ? 'Starting Session…' : 'Start Session'}<AppIcon name="play" size={17} /></button></div>
            </div> : null}
            </div>
          </aside>
        </div>
      </div>
    );
  }

  const captureStatus = workflowState === 'SHOT_REVIEW'
    ? { label: 'Shot recorded', detail: 'Review the capture or continue when ready.', tone: 'success' as const }
    : shotAnalyzer.captureState === 'capturing-post-release'
      ? { label: 'Capturing follow-through', detail: 'Keep your form steady while the post-release window completes.', tone: 'info' as const }
      : shotAnalyzer.captureState === 'armed'
        ? { label: 'Ready for release', detail: 'Shoot naturally, then mark release at the moment of execution.', tone: 'success' as const }
        : { label: 'Preparing analysis', detail: 'Hold a visible shooting stance while movement history is collected.', tone: 'primary' as const };

  return (
    <div className="analysis-page training-live-page">
      <PageHeader title="Live Analysis" subtitle="Stay focused on the camera feed while ArcherLab captures the active session." actions={<div className="analysis-header-actions"><span className="analysis-header-meta"><AppIcon name="shield" size={14} />On-device processing</span><span className="analysis-header-status is-live"><span />Session active</span><button type="button" className="session-end-header-button" onClick={openEndConfirmation}><AppIcon name="stop" size={14} />End Session</button></div>} />

      <section className="live-session-strip" aria-label="Active session status">
        <div><span className="status-dot status-dot--active" /><strong>Session Active</strong></div>
        <div><span>Elapsed</span><strong>{formatDuration(sessionRecorder.durationMs)}</strong></div>
        <div><span>Shots</span><strong>{shots.length}</strong></div>
        <div><span>Camera</span><strong>{cameraReady ? 'Active' : 'Needs attention'}</strong></div>
        <div><span>Pose</span><strong>{detectionState === 'athlete-detected' ? 'Detected' : 'Searching'}</strong></div>
        {lastScoredShot?.actualResult ? <div><span>Last score</span><strong>{lastScoredShot.actualResult.isX ? 'X' : lastScoredShot.actualResult.score}</strong></div> : null}
      </section>

      {!cameraReady || pose.status === 'error' || sessionRecorder.state === 'error' ? <div className="live-recovery-banner"><AppIcon name={error ? 'camera' : 'sensors'} size={19} /><div><strong>{!cameraReady ? 'Camera needs attention' : pose.status === 'error' ? 'Analysis model unavailable' : 'Session recording needs attention'}</strong><span>{error ?? pose.error ?? (!cameraReady ? 'Restart the camera to continue analysis.' : 'Completed shots are preserved. End the session when ready to keep the available summary.')}</span></div>{!cameraReady || pose.status === 'error' ? <button type="button" className="button button--secondary" onClick={retryRuntime}><AppIcon name="refresh" size={15} />Retry</button> : null}</div> : null}

      <div className="analysis-layout">
        <section className="camera-workspace" aria-label="Live camera workspace">
          <div className="camera-hero">
            <div className="camera-hero__header"><div><span className="eyebrow">Camera feed</span><strong>{deviceLabel}</strong></div><div className="camera-hero__header-meta"><span>{activeCameraView}</span><span>{pose.debugStats.videoHeight ? `${pose.debugStats.videoHeight}p` : 'Camera resolution'}</span></div></div>
            <CameraPreview stream={stream} isLoading={isLoading} error={error} videoRef={videoRef} className="camera-hero__preview">
              <PoseOverlay videoRef={videoRef} resultRef={pose.latestResultRef} active={Boolean(stream)} />
              <div className="camera-hero__topbar"><div className="camera-badges"><span className={`camera-badge ${cameraReady ? 'camera-badge--active' : ''}`}><span className="camera-badge__dot" />{cameraReady ? 'Camera active' : 'Camera paused'}</span><PoseStatus engineStatus={pose.status} detectionState={detectionState} /></div><div className="session-timer" aria-label={`Session time ${formatDuration(sessionRecorder.durationMs)}`}><span>TIME</span>{formatDuration(sessionRecorder.durationMs)}</div></div>
              {stream && !isLoading && !error && detectionState !== 'athlete-detected' ? <div className="pose-lost-overlay" role="status"><span className="pose-lost-overlay__icon"><AppIcon name="accessibility" size={23} /></span><strong>Pose Not Detected</strong><span>Move into the camera frame and keep your shooting form visible.</span></div> : null}
              <div className="camera-hero__footer"><span><AppIcon name="shield" size={15} />Frames stay on this device</span><span>{shots.length} shot{shots.length === 1 ? '' : 's'} captured</span></div>
            </CameraPreview>
          </div>

          {pose.error ? <div className="pose-error"><AppIcon name="sensors" size={18} /><span>{pose.error}</span></div> : null}

          {workflowState === 'SHOT_REVIEW' && reviewShot ? createPortal(<ShotReviewPanel shot={reviewShot} shotNumber={shots.findIndex((shot) => shot.id === reviewShot.id) + 1 || shots.length} scoreEntryMethod={scoreEntryMethod} gestureActive={Boolean(awaitingScoreShotId) && !manualEntryRequested} manualEntryRequested={manualEntryRequested} onScore={(result) => handleScoreResult(reviewShot.id, result)} onContinue={continueSession} />, document.body) : <section className="shot-phase-panel motion-section-enter" aria-label="Shot cycle status" aria-live="polite"><div className="shot-phase-panel__header"><div><span className="eyebrow">Shot cycle</span><h2>{captureStatus.label}</h2><p>{captureStatus.detail}</p></div><StatusBadge label={`Shot ${String(shots.length + 1).padStart(2, '0')}`} tone={captureStatus.tone} compact /></div><div className="shot-phase-track">{SHOT_PHASES.map((phase, index) => { const active = index === activePhaseIndex; const complete = isShotComplete || activePhaseIndex > index; return <div key={phase.id} className={`shot-phase-step ${active ? 'is-active' : ''} ${complete ? 'is-complete' : ''}`}><span className="shot-phase-step__marker">{complete ? <AppIcon name="check" size={13} /> : String(index + 1).padStart(2, '0')}</span><span className="shot-phase-step__label"><span>{phase.shortLabel}</span><strong>{phase.label}</strong></span></div>; })}</div><button type="button" className="context-help-link" title="This shows the current stage of your shooting cycle." onClick={onGestureGuide}>How shot phases work</button></section>}

          <section className="session-control-panel motion-section-enter" aria-label="Session controls">
            <div className="session-control-panel__header"><div><span className="eyebrow">Session controls</span><h2>Camera and capture</h2></div><RecordingControls state={sessionRecorder.state} durationMs={sessionRecorder.durationMs} onStart={() => void startSession()} onPause={() => sessionRecorder.pause()} onResume={() => sessionRecorder.resume()} onStop={openEndConfirmation} /></div>
            <div className="session-control-panel__body"><div className="camera-panel__settings"><label><span>Camera device</span><select value={selectedDeviceId ?? ''} onChange={(event) => selectDevice(event.target.value)} disabled={isLoading || devices.length === 0}>{devices.length === 0 ? <option value="">Local Camera</option> : devices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}</select></label><label><span>Camera angle</span><select value={cameraView} onChange={(event) => onCameraViewChange?.(event.target.value as CameraView)}><option value="side">Side View</option><option value="front">Front View</option><option value="rear">Rear View</option></select></label></div><div className="session-capture-control"><div className="session-capture-control__copy"><span className="eyebrow">Release capture</span><strong>{captureStatus.label}</strong></div><button type="button" className="mark-release-button" onClick={() => shotAnalyzer.markRelease()} disabled={!stream || workflowState !== 'SESSION_ACTIVE' || scoreEntryBusy || shotAnalyzer.captureState !== 'armed'}><AppIcon name="target" size={17} />Mark release</button></div></div>
            {shotAnalyzer.captureError ? <div className="session-feedback session-feedback--error"><AppIcon name="sensors" size={16} /><span>{shotAnalyzer.captureError}</span></div> : null}
            {shotAnalyzer.pendingCandidate ? <div className="release-candidate"><div><strong>Likely release detected</strong><span>Experimental candidate · strength {shotAnalyzer.pendingCandidate.releaseCandidateStrength.toFixed(2)}</span></div><button type="button" onClick={shotAnalyzer.confirmCandidate}>Confirm release</button><button type="button" onClick={shotAnalyzer.ignoreCandidate}>Ignore</button></div> : null}
            <div className="session-control-panel__footer"><label className="auto-release-toggle"><input type="checkbox" checked={shotAnalyzer.autoReleaseEnabled} onChange={(event) => shotAnalyzer.setAutoReleaseEnabled(event.target.checked)} /><span><strong>Experimental auto release</strong><small>Detected releases still require confirmation.</small></span></label><div className="session-secondary-actions"><button type="button" onClick={switchCamera} disabled={isLoading || devices.length < 2}><AppIcon name="refresh" size={16} />Switch</button><button type="button" onClick={onGestureGuide}>Gesture guide</button>{shots.length && workflowState === 'SESSION_ACTIVE' ? <button type="button" onClick={() => { setAwaitingScoreShotId(undefined); shotAnalyzer.clearLatestShot(); onUndoLastShot(); }}>Undo last</button> : null}<button type="button" className="session-secondary-actions__stop" onClick={stopCamera} disabled={!stream}><AppIcon name="stop" size={15} />Stop camera</button></div></div>
            <div className="session-end-zone"><div><strong>Finish training</strong><span>Finalize the local recording and open the session summary.</span></div><button type="button" className="button button--danger" onClick={openEndConfirmation}><AppIcon name="stop" size={15} />End Session</button></div>
            <PoseDebugPanel status={pose.status} stats={pose.debugStats} /><ShotCaptureDebugPanel debug={shotAnalyzer.debug} /><GestureDebugPanel debug={gesture.debug} />
          </section>
        </section>

        <aside className="analytics-panel motion-section-enter" aria-label="Real-time biomechanics metrics">
          <div className="analytics-panel__header"><div><span className="eyebrow">Live landmarks</span><h2>Biomechanics</h2></div><StatusBadge label={detectionState === 'athlete-detected' ? 'Tracking' : 'Searching'} tone={detectionState === 'athlete-detected' ? 'success' : 'warning'} compact /></div>
          <div className="analytics-panel__context"><span>{handedness}-handed</span><span>{biomechanics.snapshot.debug.bowSide} bow arm</span><span>{activeCameraView}</span></div>
          <div className="biomechanics-notice"><AppIcon name="sensors" size={17} /><span>Measured on this device from MediaPipe landmarks. Values pause when visibility is insufficient. {reference ? 'Personal reference deltas are active.' : 'No personal reference.'}</span></div>
          <div className="analytics-panel__grid"><BiomechanicsMetricCard title="Shoulder line" metric={biomechanics.snapshot.shoulderLineAngle} signed referenceDelta={biomechanics.snapshot.reference?.shoulderDeltaDeg} detail="Signed from image horizontal" /><BiomechanicsMetricCard title="Bow-arm elbow" metric={biomechanics.snapshot.bowArmElbowAngle} referenceDelta={biomechanics.snapshot.reference?.bowArmDeltaDeg} detail={`${biomechanics.snapshot.bowArmElbowAngle.coordinateSpace === 'world' ? '3D world-landmark angle' : '2D image fallback'} · Recommended view: Side`} /><BiomechanicsMetricCard title="Torso lean" metric={biomechanics.snapshot.torsoLean} signed referenceDelta={biomechanics.snapshot.reference?.torsoDeltaDeg} detail="Positive values lean screen-right" /><BiomechanicsMetricCard title="Head motion" metric={biomechanics.snapshot.headMotion} detail="RMS movement normalized by shoulder width" /><BiomechanicsMetricCard title="Bow-hand motion" metric={biomechanics.snapshot.bowHandMotion} detail="RMS movement over the rolling window" /><BiomechanicsMetricCard title="Shoulder variation" metric={biomechanics.snapshot.shoulderVariation} detail="Shoulder-line angular standard deviation" /></div>
          <BiomechanicsDebugPanel snapshot={biomechanics.snapshot} />
          <div className="privacy-note"><AppIcon name="shield" size={20} /><div><strong>Private by design</strong><span>Camera frames are processed locally and are never uploaded.</span></div></div>
        </aside>
      </div>

      {shotRecordedId ? createPortal(<div className="shot-recorded-toast" role="status"><AppIcon name="check" size={17} /><div><strong>Shot Recorded</strong><span>Shot #{shots.findIndex((shot) => shot.id === shotRecordedId) + 1 || shots.length} is ready to review.</span></div></div>, document.body) : null}
      {awaitingScoreShotId && scoreEntryMethod === 'gesture-manual' && !manualEntryRequested ? createPortal(<GestureScoreOverlay state={gesture.state} candidate={gesture.candidate} stableDurationMs={gesture.debug.stableDurationMs} shotNumber={shots.findIndex((shot) => shot.id === awaitingScoreShotId) + 1} onSkip={gesture.skip} onGuide={onGestureGuide} onManual={() => { setManualEntryRequested(true); setAwaitingScoreShotId(undefined); }} />, document.body) : null}
      {showEndConfirmation ? createPortal(<EndSessionDialog isEnding={workflowState === 'SESSION_ENDING'} onCancel={() => setShowEndConfirmation(false)} onConfirm={confirmEndSession} />, document.body) : null}
    </div>
  );
}
