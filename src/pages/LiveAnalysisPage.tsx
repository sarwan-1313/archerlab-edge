import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from '../components/AppIcon';
import { BiomechanicsDebugPanel } from '../components/biomechanics/BiomechanicsDebugPanel';
import { BiomechanicsMetricCard } from '../components/biomechanics/BiomechanicsMetricCard';
import { GestureScoreOverlay } from '../components/gestures/GestureScoreOverlay';
import { GestureDebugPanel } from '../components/gestures/GestureDebugPanel';
import { ShotCaptureDebugPanel } from '../components/shot/ShotCaptureDebugPanel';
import { CameraPreview } from '../components/CameraPreview';
import { PageHeader } from '../components/PageHeader';
import { PoseDebugPanel } from '../components/pose/PoseDebugPanel';
import { PoseOverlay } from '../components/pose/PoseOverlay';
import { PoseStatus } from '../components/pose/PoseStatus';
import { useLocalCamera } from '../hooks/useLocalCamera';
import { useBiomechanics } from '../hooks/useBiomechanics';
import { useGestureScoreEntry } from '../hooks/useGestureScoreEntry';
import { usePoseLandmarker } from '../hooks/usePoseLandmarker';
import { useShotAnalyzer } from '../hooks/useShotAnalyzer';
import type { ArcherHandedness, BiomechanicsReference, CameraView } from '../types/biomechanics';
import type { ReportedShotResult, ScoreEntryMethod } from '../types/gestureScore';
import type { ShotAnalysis } from '../types/shotAnalysis';
import { getPoseDetectionState } from '../utils/poseAnalysis';

const CAMERA_OPTIONS = { autoStart: true } as const;

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

type LiveAnalysisPageProps = {
  onRecalibrate?: () => void;
  handedness: ArcherHandedness;
  cameraView: CameraView;
  onCameraViewChange?: (view: CameraView) => void;
  reference?: BiomechanicsReference;
  scoreEntryMethod: ScoreEntryMethod;
  autoReleaseDefault: boolean;
  shots: ShotAnalysis[];
  onShotCaptured: (shot: ShotAnalysis) => void;
  onAttachResult: (shotId: string, result: ReportedShotResult) => void;
  onClearResult: (shotId: string) => void;
  onUndoLastShot: () => void;
  onGestureGuide: () => void;
  onManualEntry: (shotId: string) => void;
  onReplay: (shotId: string) => void;
};

export function LiveAnalysisPage({ onRecalibrate, handedness, cameraView, onCameraViewChange, reference, scoreEntryMethod, autoReleaseDefault, shots, onShotCaptured, onAttachResult, onClearResult, onUndoLastShot, onGestureGuide, onManualEntry, onReplay }: LiveAnalysisPageProps) {
  const { devices, selectedDeviceId, setSelectedDeviceId, stream, error, isLoading, startCamera, stopCamera } = useLocalCamera(CAMERA_OPTIONS);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pose = usePoseLandmarker({ videoRef, active: Boolean(stream) });
  const biomechanics = useBiomechanics({ poseResult: pose.result, handedness, active: Boolean(stream), resetKey: `${selectedDeviceId ?? 'default-camera'}:${cameraView}`, reference });
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [quality, setQuality] = useState('720p');
  const [awaitingScoreShotId, setAwaitingScoreShotId] = useState<string>();
  const [recentScore, setRecentScore] = useState<{ shotId: string; result: ReportedShotResult }>();
  const scoreEntryBusy = Boolean(awaitingScoreShotId || recentScore);
  const detectionState = getPoseDetectionState(pose.result);
  const handleShotCaptured = useCallback((shot: ShotAnalysis) => { onShotCaptured(shot); if (scoreEntryMethod !== 'none') setAwaitingScoreShotId(shot.id); }, [onShotCaptured, scoreEntryMethod]);
  const shotAnalyzer = useShotAnalyzer({ snapshot: biomechanics.snapshot, active: Boolean(stream) && !scoreEntryBusy, handedness, onShotCaptured: handleShotCaptured });
  const setAutoReleaseEnabled = shotAnalyzer.setAutoReleaseEnabled;
  useEffect(() => { setAutoReleaseEnabled(autoReleaseDefault); }, [autoReleaseDefault, setAutoReleaseEnabled]);
  const handleGestureResult = useCallback((shotId: string, result: ReportedShotResult) => {
    onAttachResult(shotId, result); setAwaitingScoreShotId(undefined); setRecentScore({ shotId, result });
  }, [onAttachResult]);
  const finishScoreWindow = useCallback(() => setAwaitingScoreShotId(undefined), []);
  const gesture = useGestureScoreEntry({ videoRef, active: Boolean(stream) && scoreEntryMethod === 'gesture-manual' && Boolean(awaitingScoreShotId), shotId: awaitingScoreShotId, onResult: handleGestureResult, onTimeout: finishScoreWindow });
  useEffect(() => { if (!recentScore) return; const timeout = window.setTimeout(() => setRecentScore(undefined), 1500); return () => window.clearTimeout(timeout); }, [recentScore]);

  useEffect(() => {
    if (!stream) return;
    const interval = window.setInterval(() => setElapsedSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [stream]);

  const deviceLabel = useMemo(
    () => devices.find((device) => device.deviceId === selectedDeviceId)?.label ?? 'Local Camera',
    [devices, selectedDeviceId],
  );

  const selectDevice = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    void startCamera(deviceId);
  };

  const switchCamera = () => {
    if (devices.length < 2) {
      void startCamera(selectedDeviceId ?? undefined);
      return;
    }
    const currentIndex = devices.findIndex((device) => device.deviceId === selectedDeviceId);
    const nextDevice = devices[(currentIndex + 1) % devices.length];
    selectDevice(nextDevice.deviceId);
  };

  return (
    <div className="analysis-page">
      <PageHeader
        title="Live Analysis"
        subtitle="Real-time on-device pose tracking · video stays private"
        actions={<span className="analysis-header-status"><span />{stream ? 'Session live' : 'Session paused'}</span>}
      />

      <div className="analysis-layout">
        <section className="camera-workspace" aria-label="Live camera workspace">
          <div className="camera-hero">
            <CameraPreview stream={stream} isLoading={isLoading} error={error} videoRef={videoRef} className="camera-hero__preview">
              <PoseOverlay videoRef={videoRef} resultRef={pose.latestResultRef} active={Boolean(stream)} />
              <div className="camera-hero__topbar">
                <div className="camera-badges">
                  <span className={`camera-badge ${stream ? 'camera-badge--active' : ''}`}>
                    <span className="camera-badge__dot" />{stream ? 'Camera active' : 'Camera paused'}
                  </span>
                  <PoseStatus engineStatus={pose.status} detectionState={detectionState} />
                </div>
                <div className="session-timer" aria-label={`Session time ${formatDuration(elapsedSeconds)}`}>
                  <span>REC</span>{formatDuration(elapsedSeconds)}
                </div>
              </div>

              {detectionState !== 'athlete-detected' ? (
                <div className="camera-hero__reticle" aria-hidden="true">
                  <span className="camera-hero__reticle-label">{detectionState === 'low-visibility' ? 'Improve visibility' : 'Waiting for athlete'}</span>
                  <span className="camera-hero__reticle-subtitle">Frame the athlete from head to toe</span>
                </div>
              ) : null}

              <div className="camera-hero__footer">
                <span><AppIcon name="camera" size={16} />{deviceLabel}</span>
                <span>{quality} · {cameraView === 'side' ? 'Side view' : cameraView === 'front' ? 'Front view' : 'Rear view'}</span>
              </div>
            </CameraPreview>
          </div>

          {pose.error ? <div className="pose-error"><AppIcon name="sensors" size={18} /><span>{pose.error}</span></div> : null}

          <div className="camera-panel">
            <div className="camera-panel__heading">
              <div><span className="eyebrow">Camera</span><strong><span className={stream ? 'status-dot status-dot--active' : 'status-dot'} />{stream ? 'Active' : 'Paused'}</strong></div>
              <span>Session input</span>
            </div>
            <div className="camera-panel__settings">
              <label>
                <span>Device</span>
                <select value={selectedDeviceId ?? ''} onChange={(event) => selectDevice(event.target.value)} disabled={devices.length === 0}>
                  {devices.length === 0 ? <option value="">Local Camera</option> : devices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
                </select>
              </label>
              <label>
                <span>Angle</span>
                <select value={cameraView} onChange={(event) => onCameraViewChange?.(event.target.value as CameraView)}>
                  <option value="side">Side View</option>
                  <option value="front">Front View</option>
                  <option value="rear">Rear View</option>
                </select>
              </label>
              <label>
                <span>Quality</span>
                <select value={quality} onChange={(event) => setQuality(event.target.value)}>
                  <option value="720p">720p</option>
                  <option value="1080p">1080p</option>
                  <option value="480p">480p</option>
                </select>
              </label>
            </div>
            <div className="camera-panel__actions">
              <button type="button" onClick={switchCamera}><AppIcon name="refresh" size={17} />Switch camera</button>
              <button type="button" onClick={onRecalibrate}><AppIcon name="calibration" size={17} />Recalibrate</button>
              <button type="button" className="camera-panel__stop" onClick={stopCamera} disabled={!stream}><AppIcon name="stop" size={16} />Stop camera</button>
            </div>
            <div className="shot-capture-controls">
              <div><span className="eyebrow">Shot Capture</span><strong>{scoreEntryBusy ? 'Score entry active' : shotAnalyzer.captureState === 'capturing-post-release' ? 'Capturing follow-through' : shotAnalyzer.captureState === 'complete' ? 'Shot captured' : shotAnalyzer.captureState === 'armed' ? 'Ready' : 'Preparing'}</strong></div>
              <button type="button" className="mark-release-button" onClick={() => shotAnalyzer.markRelease()} disabled={!stream || scoreEntryBusy || shotAnalyzer.captureState !== 'armed'}>MARK RELEASE</button>
              <label className="auto-release-toggle"><input type="checkbox" checked={shotAnalyzer.autoReleaseEnabled} onChange={(event) => shotAnalyzer.setAutoReleaseEnabled(event.target.checked)} />Experimental Auto Release</label>
              {shotAnalyzer.captureError ? <p>{shotAnalyzer.captureError}</p> : null}
              {shotAnalyzer.pendingCandidate ? <div className="release-candidate"><strong>Likely release detected</strong><span>Experimental candidate · strength {shotAnalyzer.pendingCandidate.releaseCandidateStrength.toFixed(2)}</span><button type="button" onClick={shotAnalyzer.confirmCandidate}>Confirm</button><button type="button" onClick={shotAnalyzer.ignoreCandidate}>Ignore</button></div> : null}
              <small className="auto-release-note">Experimental — detected releases must be manually confirmed.</small>
              <button type="button" className="gesture-guide-link" onClick={onGestureGuide}>? Gesture Guide</button>
              {shots.length ? <div className="shot-history-actions"><button type="button" onClick={() => onReplay(shots.at(-1)!.id)}>Replay latest</button><button type="button" onClick={() => { setAwaitingScoreShotId(undefined); shotAnalyzer.clearLatestShot(); onUndoLastShot(); }}>Undo last release</button></div> : null}
            </div>
            <PoseDebugPanel status={pose.status} stats={pose.debugStats} />
            <ShotCaptureDebugPanel debug={shotAnalyzer.debug} />
            <GestureDebugPanel debug={gesture.debug} />
          </div>
        </section>

        <aside className="analytics-panel" aria-label="Real-time biomechanics metrics">
          <div className="analytics-panel__header">
            <div><span className="eyebrow">Live landmarks</span><h2>Biomechanics</h2></div>
            <span>{handedness}-handed · {biomechanics.snapshot.debug.bowSide} bow arm</span>
          </div>
          <div className="biomechanics-notice">
            <AppIcon name="sensors" size={17} />
            <span>Measured on this device from MediaPipe landmarks. Values pause when visibility is insufficient. {reference ? 'Personal reference deltas are active.' : 'No personal reference.'}</span>
          </div>
          <div className="analytics-panel__grid">
            <BiomechanicsMetricCard title="Shoulder line" metric={biomechanics.snapshot.shoulderLineAngle} signed referenceDelta={biomechanics.snapshot.reference?.shoulderDeltaDeg} detail="Signed from image horizontal" />
            <BiomechanicsMetricCard title="Bow-arm elbow" metric={biomechanics.snapshot.bowArmElbowAngle} referenceDelta={biomechanics.snapshot.reference?.bowArmDeltaDeg} detail={`${biomechanics.snapshot.bowArmElbowAngle.coordinateSpace === 'world' ? '3D world-landmark angle' : '2D image fallback'} · Recommended view: Side`} />
            <BiomechanicsMetricCard title="Torso lean" metric={biomechanics.snapshot.torsoLean} signed referenceDelta={biomechanics.snapshot.reference?.torsoDeltaDeg} detail="Positive values lean screen-right" />
            <BiomechanicsMetricCard title="Head motion" metric={biomechanics.snapshot.headMotion} detail="RMS movement normalized by shoulder width" />
            <BiomechanicsMetricCard title="Bow-hand motion" metric={biomechanics.snapshot.bowHandMotion} detail="RMS movement over the rolling window" />
            <BiomechanicsMetricCard title="Shoulder variation" metric={biomechanics.snapshot.shoulderVariation} detail="Shoulder-line angular standard deviation" />
          </div>
          <BiomechanicsDebugPanel snapshot={biomechanics.snapshot} />
          <div className="privacy-note">
            <AppIcon name="shield" size={20} />
            <div><strong>Private by design</strong><span>Camera frames are processed locally and are never uploaded.</span></div>
          </div>
        </aside>
      </div>
      {awaitingScoreShotId ? <GestureScoreOverlay state={scoreEntryMethod === 'gesture-manual' ? gesture.state : 'waiting-for-score'} candidate={gesture.candidate} stableDurationMs={gesture.debug.stableDurationMs} shotNumber={shots.findIndex((shot) => shot.id === awaitingScoreShotId) + 1} onSkip={gesture.skip} onGuide={onGestureGuide} onManual={() => onManualEntry(awaitingScoreShotId)} onUndo={() => undefined} /> : null}
      {recentScore ? <GestureScoreOverlay state="recorded" candidate={{ gestureId: recentScore.result.gestureId ?? 'manual', score: recentScore.result.score, isX: recentScore.result.isX, confidence: recentScore.result.gestureConfidence ?? 1, leftFingerCount: null, rightFingerCount: null, handsDetected: 0, wristsCrossed: recentScore.result.isX }} stableDurationMs={800} shotNumber={shots.findIndex((shot) => shot.id === recentScore.shotId) + 1} onSkip={() => undefined} onGuide={onGestureGuide} onManual={() => undefined} onUndo={() => { onClearResult(recentScore.shotId); setRecentScore(undefined); setAwaitingScoreShotId(recentScore.shotId); }} /> : null}
    </div>
  );
}
