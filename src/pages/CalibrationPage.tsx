import { useMemo, useRef } from 'react';
import { AppIcon } from '../components/AppIcon';
import { CalibrationStep } from '../components/CalibrationStep';
import { CameraPreview } from '../components/CameraPreview';
import { PageHeader } from '../components/PageHeader';
import { PoseDebugPanel } from '../components/pose/PoseDebugPanel';
import { PoseOverlay } from '../components/pose/PoseOverlay';
import { PoseStatus } from '../components/pose/PoseStatus';
import { useLocalCamera } from '../hooks/useLocalCamera';
import { useBiomechanics } from '../hooks/useBiomechanics';
import { usePoseLandmarker } from '../hooks/usePoseLandmarker';
import type { ArcherHandedness, BiomechanicsReference } from '../types/biomechanics';
import { getCalibrationReadiness, getPoseDetectionState } from '../utils/poseAnalysis';

const CAMERA_OPTIONS = { autoStart: true } as const;

type CalibrationPageProps = {
  onComplete?: () => void;
  handedness: ArcherHandedness;
  reference?: BiomechanicsReference;
  onReferenceChange?: (reference: BiomechanicsReference | undefined) => void;
};

export function CalibrationPage({ onComplete, handedness, reference, onReferenceChange }: CalibrationPageProps) {
  const { devices, selectedDeviceId, setSelectedDeviceId, stream, error, isLoading, startCamera } = useLocalCamera(CAMERA_OPTIONS);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pose = usePoseLandmarker({ videoRef, active: Boolean(stream) });
  const biomechanics = useBiomechanics({ poseResult: pose.result, handedness, active: Boolean(stream), resetKey: selectedDeviceId ?? 'default-camera', reference, onReferenceChange });

  const deviceLabel = useMemo(
    () => devices.find((device) => device.deviceId === selectedDeviceId)?.label ?? 'Local Camera',
    [devices, selectedDeviceId],
  );
  const readiness = useMemo(
    () => getCalibrationReadiness(pose.result?.landmarks ?? [], Boolean(stream)),
    [pose.result, stream],
  );
  const detectionState = getPoseDetectionState(pose.result);
  const checks = [
    { title: 'Camera', detail: 'Live camera feed is available', complete: readiness.camera },
    { title: 'Athlete', detail: 'One person is detected in frame', complete: readiness.athlete },
    { title: 'Shoulders', detail: 'Both shoulders are clearly visible', complete: readiness.shoulders },
    { title: 'Arms', detail: 'Shoulders, elbows, and wrists are visible', complete: readiness.arms },
    { title: 'Lower body', detail: 'Hips, knees, and ankles are visible', complete: readiness.lowerBody },
  ];
  const completedChecks = checks.filter((check) => check.complete).length;
  const currentCheck = checks.findIndex((check) => !check.complete);

  const selectDevice = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    void startCamera(deviceId);
  };

  return (
    <div className="calibration-page">
      <PageHeader
        title="Calibration"
        subtitle="On-device visibility checks prepare a consistent analysis frame."
        actions={<span className="calibration-progress-badge">{completedChecks} / {checks.length} checks</span>}
      />

      <div className="calibration-layout">
        <section className="calibration-camera" aria-label="Calibration camera">
          <div className="calibration-camera__bar">
            <div>
              <span className={`status-dot ${stream ? 'status-dot--active' : ''}`} />
              <strong>{stream ? 'Camera active' : 'Camera unavailable'}</strong>
            </div>
            <label>
              <span className="sr-label">Camera device</span>
              <select value={selectedDeviceId ?? ''} onChange={(event) => selectDevice(event.target.value)} disabled={devices.length === 0}>
                {devices.length === 0 ? <option value="">{deviceLabel}</option> : devices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
              </select>
            </label>
          </div>

          <CameraPreview
            stream={stream}
            isLoading={isLoading}
            error={error}
            videoRef={videoRef}
            className="calibration-camera__preview"
          >
            <div className="calibration-grid" aria-hidden="true" />
            <PoseOverlay videoRef={videoRef} resultRef={pose.latestResultRef} active={Boolean(stream)} />
            {!pose.result?.athleteDetected ? (
              <div className="body-guide" aria-hidden="true">
                <span className="body-guide__head" />
                <span className="body-guide__torso" />
                <span className="body-guide__baseline" />
                <span className="body-guide__label">Position athlete here</span>
              </div>
            ) : null}
            <div className="calibration-pose-status">
              <PoseStatus engineStatus={pose.status} detectionState={detectionState} />
            </div>
            <div className="calibration-camera__privacy"><AppIcon name="shield" size={15} />Local processing</div>
          </CameraPreview>

          {pose.error ? <div className="pose-error"><AppIcon name="sensors" size={18} /><span>{pose.error}</span></div> : null}

          <div className="calibration-camera__tip">
            <AppIcon name={readiness.fullBody ? 'check' : 'scan'} size={20} />
            <div>
              <strong>{readiness.fullBody ? 'Full body visible' : 'Framing tip'}</strong>
              <span>{readiness.fullBody ? 'The main full-body landmarks meet the visibility threshold.' : 'Place the camera 3–4 metres away with the full shooting stance visible.'}</span>
            </div>
          </div>
        </section>

        <aside className="calibration-workflow" aria-label="Calibration readiness">
          <div className="calibration-workflow__header">
            <span className="eyebrow">Visibility readiness</span>
            <h2>{readiness.ready ? 'Calibration ready' : checks[currentCheck]?.title ?? 'Checking pose'}</h2>
            <p>{readiness.ready ? 'Camera, athlete, upper body, arms, and lower body are visible.' : checks[currentCheck]?.detail ?? 'Waiting for pose intelligence.'}</p>
          </div>

          <div className="calibration-workflow__meter" aria-hidden="true">
            <span style={{ width: `${(completedChecks / checks.length) * 100}%` }} />
          </div>

          <ol className="calibration-steps">
            {checks.map((check, index) => (
              <CalibrationStep
                key={check.title}
                index={index + 1}
                title={check.title}
                detail={check.detail}
                state={check.complete ? 'complete' : index === currentCheck ? 'active' : 'pending'}
              />
            ))}
          </ol>

          <div className="calibration-visibility" aria-label="Pose visibility summary">
            <span className={readiness.upperBody ? 'is-ready' : ''}><AppIcon name={readiness.upperBody ? 'check' : 'scan'} size={14} />Upper body</span>
            <span className={readiness.arms ? 'is-ready' : ''}><AppIcon name={readiness.arms ? 'check' : 'scan'} size={14} />Arms</span>
            <span className={readiness.fullBody ? 'is-ready' : ''}><AppIcon name={readiness.fullBody ? 'check' : 'scan'} size={14} />Full body</span>
          </div>

          <PoseDebugPanel status={pose.status} stats={pose.debugStats} />

          <div className="reference-capture">
            <div>
              <strong>{reference ? 'Reference captured' : 'Reference pose'}</strong>
              <span>{reference ? `Median of ${reference.sampleCount} valid frames` : 'Hold your anchor posture while ArcherLab samples it.'}</span>
            </div>
            <button type="button" onClick={biomechanics.captureReference} disabled={!readiness.ready || biomechanics.isCapturingReference}>
              {biomechanics.isCapturingReference ? 'Capturing…' : reference ? 'Recapture' : 'Capture reference'}
            </button>
            {reference ? <button type="button" className="reference-capture__reset" onClick={biomechanics.resetReference}>Clear</button> : null}
            {biomechanics.captureError ? <p>{biomechanics.captureError}</p> : null}
          </div>

          <div className="calibration-workflow__actions">
            {error || pose.status === 'error' ? <button type="button" className="button button--secondary" disabled={isLoading} onClick={() => void startCamera(selectedDeviceId ?? undefined)}>Retry camera and analysis</button> : null}
            <button type="button" className="calibration-primary" onClick={onComplete} disabled={!readiness.ready}>
              {readiness.ready ? 'Confirm calibration' : 'Complete visibility checks'}
              <AppIcon name={readiness.ready ? 'check' : 'arrow-right'} size={18} />
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
