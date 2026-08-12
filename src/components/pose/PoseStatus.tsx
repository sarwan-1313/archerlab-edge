import type { PoseDetectionState, PoseEngineStatus } from '../../types/pose';

type PoseStatusProps = {
  engineStatus: PoseEngineStatus;
  detectionState: PoseDetectionState;
};

const engineLabels: Record<PoseEngineStatus, string> = {
  idle: 'Pose AI idle',
  loading: 'Loading pose engine…',
  ready: 'AI ready',
  running: 'On-device pose AI',
  error: 'Pose model unavailable',
};

const detectionLabels: Record<PoseDetectionState, string> = {
  'no-athlete': 'No athlete',
  'athlete-detected': 'Athlete detected',
  'low-visibility': 'Low visibility',
};

export function PoseStatus({ engineStatus, detectionState }: PoseStatusProps) {
  return (
    <div className="pose-status" aria-live="polite">
      <span className={`pose-status__badge pose-status__badge--${engineStatus}`}>
        <span />{engineLabels[engineStatus]}
      </span>
      {engineStatus === 'running' ? (
        <span className={`pose-status__badge pose-status__badge--${detectionState}`}>
          <span />{detectionLabels[detectionState]}
        </span>
      ) : null}
    </div>
  );
}

