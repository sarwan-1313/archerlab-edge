import type { BiomechanicsMetric } from '../../types/biomechanics';

function format(metric: BiomechanicsMetric, signed = false): string {
  if (!metric.available || metric.value === null) return '--';
  return `${signed && metric.value > 0 ? '+' : ''}${metric.value.toFixed(1)} ${metric.unit}`;
}

export function ShotMetricCard({ title, metric, signed = false }: { title: string; metric: BiomechanicsMetric; signed?: boolean }) {
  return <article className="shot-metric-card"><span>{title}</span><strong>{format(metric, signed)}</strong><p>{metric.available ? `Landmark quality ${Math.round(metric.confidence * 100)}%` : metric.reason}</p></article>;
}
