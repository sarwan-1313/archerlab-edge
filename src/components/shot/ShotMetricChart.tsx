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
  const points = samples.map(({ frame, value }) => `${((frame.timestampMs - shot.releaseTimestampMs - start) / timeRange) * 100},${92 - ((value - min) / range) * 76}`).join(' ');
  const releaseX = ((0 - start) / timeRange) * 100;
  const latest = values.at(-1)!;
  return (
    <div className="shot-chart">
      <div><strong>{label}</strong><span>{latest.toFixed(1)} {unit}</span></div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`${label} over time relative to release`}>
        <line x1={releaseX} x2={releaseX} y1="5" y2="95" className="shot-chart__release" />
        <polyline points={points} className="shot-chart__line" />
      </svg>
    </div>
  );
}
