import { SHOT_CONFIG } from '../../shot-analysis/config';
import type { ShotAnalysis } from '../../types/shotAnalysis';

type NumericShotField = 'shoulderLineAngleDeg' | 'bowArmElbowAngleDeg' | 'torsoLeanDeg' | 'headMotion' | 'bowHandMotion';

export function ShotMetricChart({ shot, field, label, unit }: { shot: ShotAnalysis; field: NumericShotField; label: string; unit: string }) {
  const samples = shot.frames.flatMap((frame) => {
    const value = frame[field];
    return value === null || !Number.isFinite(value) ? [] : [{ frame, value }];
  });
  if (samples.length < 2) return <div className="shot-chart shot-chart--empty"><strong>{label}</strong><span>Insufficient samples</span></div>;
  const values = samples.map((sample) => sample.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 0.001);
  const start = shot.frames[0].timestampMs - shot.releaseTimestampMs;
  const end = shot.frames.at(-1)!.timestampMs - shot.releaseTimestampMs;
  const timeRange = Math.max(end - start, 1);
  const x = (relativeMs: number) => Math.min(100, Math.max(0, ((relativeMs - start) / timeRange) * 100));
  const y = (value: number) => 88 - ((value - min) / range) * 72;
  const coords = samples.map(({ frame, value }) => [x(frame.timestampMs - shot.releaseTimestampMs), y(value)] as const);
  const points = coords.map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`).join(' ');
  const area = `${coords[0][0].toFixed(2)},100 ${points} ${coords.at(-1)![0].toFixed(2)},100`;
  const releaseX = x(0);
  const atRelease = samples.reduce((best, sample) => (
    Math.abs(sample.frame.timestampMs - shot.releaseTimestampMs) < Math.abs(best.frame.timestampMs - shot.releaseTimestampMs) ? sample : best
  ));
  const latest = values.at(-1)!;
  const gradientId = `shot-chart-fill-${field}`;
  return (
    <div className="shot-chart">
      <div>
        <strong>{label}</strong>
        <span><em>{atRelease.value.toFixed(1)}</em> {unit} at release · {latest.toFixed(1)} end</span>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`${label} over time relative to release`}>
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.32" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x={x(SHOT_CONFIG.anchorStartMs)} width={Math.max(0, x(SHOT_CONFIG.anchorEndMs) - x(SHOT_CONFIG.anchorStartMs))} y="0" height="100" className="shot-chart__phase shot-chart__phase--anchor" />
        <rect x={x(SHOT_CONFIG.followThroughStartMs)} width={Math.max(0, x(SHOT_CONFIG.followThroughEndMs) - x(SHOT_CONFIG.followThroughStartMs))} y="0" height="100" className="shot-chart__phase shot-chart__phase--follow" />
        <polygon points={area} fill={`url(#${gradientId})`} className="shot-chart__area" />
        <line x1={releaseX} x2={releaseX} y1="0" y2="100" className="shot-chart__release" />
        <polyline points={points} className="shot-chart__line" />
      </svg>
      <div className="shot-chart__axis" aria-hidden="true"><span>Hold</span><span>Release</span><span>Follow-through</span></div>
    </div>
  );
}
