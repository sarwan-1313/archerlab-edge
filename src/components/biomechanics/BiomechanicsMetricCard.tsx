import type { BiomechanicsMetric } from '../../types/biomechanics';

type Props = { title: string; metric: BiomechanicsMetric; signed?: boolean; referenceDelta?: number; detail?: string };

function formatValue(value: number | null, signed: boolean): string {
  if (value === null || !Number.isFinite(value)) return '--';
  return `${signed && value > 0 ? '+' : ''}${value.toFixed(1)}`;
}

export function BiomechanicsMetricCard({ title, metric, signed = false, referenceDelta, detail }: Props) {
  const confidencePercent = Math.round(metric.confidence * 100);
  const qualityLabel = !metric.available ? 'Unavailable' : metric.confidence >= 0.7 ? 'Good signal' : 'Low signal';
  return (
    <article className={`biomechanics-card ${metric.available ? '' : 'biomechanics-card--unavailable'}`}>
      <div className="biomechanics-card__heading">
        <span>{title}</span>
        <span className={`biomechanics-card__quality ${metric.confidence >= 0.7 ? 'is-good' : ''}`}>{qualityLabel}</span>
      </div>
      <div className="biomechanics-card__reading"><strong>{formatValue(metric.value, signed)}</strong><span>{metric.available ? metric.unit : ''}</span></div>
      <p>{metric.available ? detail : metric.reason}</p>
      {referenceDelta !== undefined ? <span className="biomechanics-card__delta">Δ {referenceDelta >= 0 ? '+' : ''}{referenceDelta.toFixed(1)}° from reference</span> : null}
      {metric.windowDurationMs !== undefined ? <span className="biomechanics-card__window">{metric.sampleCount} samples · {(metric.windowDurationMs / 1000).toFixed(1)} s window</span> : null}
      <div className="biomechanics-card__confidence" aria-label={`Landmark quality ${confidencePercent}%`}>
        <span><i style={{ width: `${confidencePercent}%` }} /></span>
        <small>{confidencePercent}% quality</small>
      </div>
    </article>
  );
}
