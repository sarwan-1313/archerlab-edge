import { useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from '../components/AppIcon';
import { CameraPreview } from '../components/CameraPreview';
import { MetricCard } from '../components/MetricCard';
import { PageHeader } from '../components/PageHeader';
import { PoseDebugPanel } from '../components/pose/PoseDebugPanel';
import { PoseOverlay } from '../components/pose/PoseOverlay';
import { PoseStatus } from '../components/pose/PoseStatus';
import { useLocalCamera } from '../hooks/useLocalCamera';
import { usePoseLandmarker } from '../hooks/usePoseLandmarker';
import { getPoseDetectionState } from '../utils/poseAnalysis';

const CAMERA_OPTIONS = { autoStart: true } as const;

const analysisMetrics = [
  { title: 'Shoulder Alignment', value: 91, unit: '%', progress: 91, status: 'Prototype metric', tone: 'primary' as const, icon: 'calibration' as const },
  { title: 'Bow Arm Stability', value: 87, unit: '%', progress: 87, status: 'Prototype metric', tone: 'secondary' as const, icon: 'accessibility' as const },
  { title: 'Release Consistency', value: 84, unit: '%', progress: 84, status: 'Prototype metric', tone: 'warning' as const, icon: 'target' as const },
  { title: 'Brace Height', value: 6.2, unit: 'cm', progress: 78, status: 'Prototype metric', tone: 'neutral' as const, icon: 'scan' as const },
];

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

type LiveAnalysisPageProps = {
  onRecalibrate?: () => void;
};

export function LiveAnalysisPage({ onRecalibrate }: LiveAnalysisPageProps) {
  const { devices, selectedDeviceId, setSelectedDeviceId, stream, error, isLoading, startCamera, stopCamera } = useLocalCamera(CAMERA_OPTIONS);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pose = usePoseLandmarker({ videoRef, active: Boolean(stream) });
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [angle, setAngle] = useState('side');
  const [quality, setQuality] = useState('720p');
  const detectionState = getPoseDetectionState(pose.result);

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
                <span>{quality} · {angle === 'side' ? 'Side view' : angle === 'front' ? 'Front view' : 'Rear view'}</span>
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
                <select value={angle} onChange={(event) => setAngle(event.target.value)}>
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
            <PoseDebugPanel status={pose.status} stats={pose.debugStats} />
          </div>
        </section>

        <aside className="analytics-panel" aria-label="Prototype performance metrics">
          <div className="analytics-panel__header">
            <div><span className="eyebrow">Prototype only</span><h2>Form metrics</h2></div>
            <span>Mock values</span>
          </div>
          <div className="prototype-notice">
            <AppIcon name="sensors" size={17} />
            <span>These values are interface prototypes and are not calculated from pose landmarks yet.</span>
          </div>
          <div className="analytics-panel__grid">
            {analysisMetrics.map((metric) => (
              <MetricCard
                key={metric.title}
                title={metric.title}
                value={metric.value}
                unit={metric.unit}
                progress={metric.progress}
                status={metric.status}
                tone={metric.tone}
                icon={<AppIcon name={metric.icon} size={18} />}
              />
            ))}
          </div>
          <div className="privacy-note">
            <AppIcon name="shield" size={20} />
            <div><strong>Private by design</strong><span>Camera frames are processed locally and are never uploaded.</span></div>
          </div>
        </aside>
      </div>
    </div>
  );
}

