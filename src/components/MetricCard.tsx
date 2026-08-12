import type { ReactNode } from 'react';

type MetricCardProps = {
  title: string;
  value: string | number;
  unit?: string;
  status?: string;
  progress?: number;
  tone?: 'primary' | 'secondary' | 'warning' | 'neutral';
  icon?: ReactNode;
};

const toneMap: Record<NonNullable<MetricCardProps['tone']>, string> = {
  primary: 'border-primary/20 text-primary',
  secondary: 'border-secondary/20 text-secondary-fixed-dim',
  warning: 'border-error/20 text-error',
  neutral: 'border-white/10 text-on-surface',
};

export function MetricCard({ title, value, unit, status, progress, tone = 'neutral', icon }: MetricCardProps) {
  const safeProgress = progress === undefined ? undefined : Math.min(100, Math.max(0, progress));

  return (
    <article className={`metric-card metric-card--${tone}`}>
      <div className="metric-card__header">
        <span className="metric-card__title">{title}</span>
        {icon ? <span className={`metric-card__icon ${toneMap[tone]}`}>{icon}</span> : null}
      </div>
      <div className="metric-card__reading">
        <span className="metric-card__value">{value}</span>
        {unit ? <span className="metric-card__unit">{unit}</span> : null}
      </div>
      {safeProgress !== undefined ? (
        <div
          className="metric-card__track"
          role="progressbar"
          aria-label={`${title} progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={safeProgress}
        >
          <span className="metric-card__fill" style={{ width: `${safeProgress}%` }} />
        </div>
      ) : null}
      {status ? <div className="metric-card__status"><span />{status}</div> : null}
    </article>
  );
}
