import { ActionButton } from '../components/ActionButton';
import { AppIcon } from '../components/AppIcon';
import { MetricCard } from '../components/MetricCard';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { topMetrics } from '../data/mockData';

export function HomePage() {
  return (
    <div className="w-full max-w-7xl mx-auto px-gutter pb-24 pt-20 md:px-section-gap md:pt-container-padding">
      <PageHeader
        title="Training Block Alpha"
        subtitle="Session Summary • 14:30 - 16:15"
        actions={<StatusBadge label="Live Telemetry Sync" tone="primary" compact />}
      />

      <div className="grid grid-cols-1 gap-stack-md md:grid-cols-12">
        <div className="col-span-1 md:col-span-8 grid grid-cols-2 gap-stack-md md:grid-cols-4">
          {topMetrics.map((metric) => (
            <MetricCard
              key={metric.label}
              title={metric.label}
              value={metric.value}
              status={metric.detail}
              tone={metric.tone as 'primary' | 'secondary' | 'warning' | 'neutral'}
            />
          ))}
        </div>

        <div className="card-bg border border-white/5 rounded-xl p-container-padding col-span-1 md:col-span-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="font-label-caps text-label-caps text-on-surface-variant">Session Health</span>
            <StatusBadge label="Optimal" tone="success" compact />
          </div>
          <div className="space-y-4">
            {[
              { label: 'Form consistency', value: '94%' },
              { label: 'Release confidence', value: '88%' },
              { label: 'Focus rhythm', value: '91%' },
            ].map((item) => (
              <div key={item.label} className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-on-surface-variant">
                  <span className="font-body-md text-body-md">{item.label}</span>
                  <span className="font-data-mono text-data-mono text-primary">{item.value}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-variant">
                  <div className="h-full rounded-full bg-primary-container" style={{ width: item.value }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-section-gap grid grid-cols-1 gap-stack-md lg:grid-cols-3">
        <div className="card-bg rounded-xl border border-white/5 p-container-padding lg:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="font-label-caps text-label-caps text-on-surface-variant">Recommended Next Steps</span>
            <StatusBadge label="Planned" tone="info" compact />
          </div>
          <div className="space-y-3">
            {[
              'Run athlete calibration before next block.',
              'Review shoulder alignment in the live analysis view.',
              'Log one manual shot to compare predicted vs actual impact.',
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-lg border border-white/10 bg-surface-container/40 p-3">
                <AppIcon name="arrow-right" size={18} className="text-primary" />
                <p className="font-body-md text-body-md text-on-surface">{item}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="card-bg rounded-xl border border-white/5 p-container-padding">
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="font-label-caps text-label-caps text-on-surface-variant">Quick Actions</span>
          </div>
          <div className="quick-actions">
            <ActionButton variant="primary" className="w-full justify-center">Start Session</ActionButton>
            <ActionButton variant="secondary" className="w-full justify-center">Open Calibration</ActionButton>
            <ActionButton variant="ghost" className="w-full justify-center">View Replay</ActionButton>
          </div>
        </div>
      </div>
    </div>
  );
}
