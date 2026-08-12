import type { PoseDebugStats, PoseEngineStatus } from '../../types/pose';

type PoseDebugPanelProps = {
  status: PoseEngineStatus;
  stats: PoseDebugStats;
};

export function PoseDebugPanel({ status, stats }: PoseDebugPanelProps) {
  return (
    <details className="pose-debug">
      <summary>Advanced · Pose debug</summary>
      <dl>
        <div><dt>Engine</dt><dd>{status}</dd></div>
        <div><dt>Pose FPS</dt><dd>{stats.fps.toFixed(1)}</dd></div>
        <div><dt>Landmarks</dt><dd>{stats.landmarkCount}</dd></div>
        <div><dt>Avg. visibility</dt><dd>{Math.round(stats.averageVisibility * 100)}%</dd></div>
        <div><dt>Video</dt><dd>{stats.videoWidth} × {stats.videoHeight}</dd></div>
      </dl>
    </details>
  );
}

