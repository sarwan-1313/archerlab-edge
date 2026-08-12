import { MetricCard } from '../components/MetricCard';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { sessionDetails, shotHistory, topMetrics } from '../data/mockData';

export function SessionDashboardPage() {
  return (
    <div className="page-container page-container--wide mx-auto w-full max-w-7xl px-gutter pb-24 pt-20 md:px-section-gap">
      <PageHeader
        title="Training Block Alpha"
        subtitle="Session Summary • 14:30 - 16:15"
        actions={<StatusBadge label="Live Telemetry Sync" tone="primary" compact />}
      />

      <div className="overview-grid grid grid-cols-1 gap-stack-md md:grid-cols-12">
        <div className="overview-grid__metrics metric-grid col-span-1 grid grid-cols-2 gap-stack-md md:col-span-8 md:grid-cols-4">
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

        <div className="overview-grid__secondary panel-card col-span-1 rounded-xl border border-white/5 bg-surface-container p-container-padding md:col-span-4">
          <div className="section-heading mb-4 flex items-center justify-between">
            <span className="font-label-caps text-label-caps text-on-surface-variant">Session Detail</span>
            <StatusBadge label="Calibrated" tone="success" compact />
          </div>
          <div className="space-y-3">
            {sessionDetails.map((item) => (
              <div key={item.label} className="metric-status-row flex items-center justify-between border-b border-white/5 pb-2 last:border-b-0 last:pb-0">
                <span className="font-body-md text-body-md text-on-surface-variant">{item.label}</span>
                <span className="font-data-mono text-data-mono text-primary">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="session-secondary-grid mt-section-gap grid grid-cols-1 gap-stack-md xl:grid-cols-[1.5fr_1fr]">
        <div className="rounded-xl border border-white/5 bg-surface-container p-container-padding">
          <div className="section-heading mb-4 flex items-center justify-between">
            <span className="font-label-caps text-label-caps text-on-surface-variant">Shot Tracker</span>
            <StatusBadge label="Last 5 shots" tone="info" compact />
          </div>
          <div className="space-y-3">
            {shotHistory.map((shot) => (
              <div key={shot.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-surface-container-low px-3 py-3">
                <div>
                  <div className="font-data-mono text-data-mono text-primary">{shot.id}</div>
                  <div className="font-body-md text-body-md text-on-surface-variant">{shot.outcome}</div>
                </div>
                <div className="text-right">
                  <div className="font-data-mono text-data-mono text-on-surface">{shot.score}</div>
                  <div className="font-body-md text-body-md text-on-surface-variant">{shot.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-white/5 bg-surface-container p-container-padding">
          <div className="section-heading mb-4 flex items-center justify-between">
            <span className="font-label-caps text-label-caps text-on-surface-variant">Coach Notes</span>
            <StatusBadge label="Review" tone="warning" compact />
          </div>
          <div className="space-y-3">
            {[
              'Shoulder alignment improved by 4% after the last drill.',
              'Release timing is consistent at 11.3ms.',
              'Next focus: reduce draw variance on long shots.',
            ].map((note) => (
              <div key={note} className="rounded-lg border border-white/10 bg-surface-container-low p-3">
                <p className="font-body-md text-body-md text-on-surface">{note}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
