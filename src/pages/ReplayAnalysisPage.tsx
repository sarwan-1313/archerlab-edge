import { AppIcon } from '../components/AppIcon';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';

export function ReplayAnalysisPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-gutter pb-24 pt-20 md:px-section-gap">
      <PageHeader title="Biomechanics Replay" subtitle="Frame review • release and anchor timing" actions={<StatusBadge label="Sync Active" tone="primary" compact />} />

      <section className="relative overflow-hidden rounded-xl border border-white/10 bg-surface-container-low/80 p-0">
        <div className="relative h-[42vh] min-h-[280px] w-full overflow-hidden">
          <img
            className="h-full w-full object-cover opacity-80"
            alt="Replay footage"
            src="https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=1200&q=80"
          />
          <div className="absolute left-4 top-4 flex gap-2">
            <StatusBadge label="Frame: 0142" tone="primary" />
            <StatusBadge label="ANG: 42.8°" tone="info" />
          </div>
        </div>

        <div className="border-t border-white/10 p-container-padding">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button type="button" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-on-surface hover:text-primary" aria-label="Previous frame">
                <AppIcon name="skip-prev" size={18} />
              </button>
              <button type="button" className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-background" aria-label="Pause playback">
                <AppIcon name="pause" size={18} />
              </button>
              <button type="button" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-on-surface hover:text-primary" aria-label="Next frame">
                <AppIcon name="skip-next" size={18} />
              </button>
            </div>
            <div className="flex gap-2">
              {['0.25x', '0.5x', '1x'].map((speed, index) => (
                <button
                  key={speed}
                  type="button"
                  className={[
                    'rounded border px-3 py-1 font-data-mono text-data-mono',
                    index === 2 ? 'border-primary bg-primary/10 text-primary' : 'border-white/20 text-on-surface-variant',
                  ].join(' ')}
                >
                  {speed}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {[
              { label: 'Stability', value: '+/- 2.1mm', color: 'bg-primary' },
              { label: 'Shoulder alignment', value: '94.2%', color: 'bg-secondary-fixed-dim' },
            ].map((row) => (
              <div key={row.label} className="flex items-center gap-3">
                <div className="w-32 flex-shrink-0 font-label-caps text-label-caps text-on-surface-variant">{row.label}</div>
                <div className="relative h-16 flex-1 overflow-hidden rounded-md border border-white/5 bg-surface-container">
                  <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                  <div className={['absolute inset-y-0 left-0 w-1/2 rounded-r-md opacity-80', row.color].join(' ')} />
                  <div className="absolute left-[45%] top-0 bottom-0 w-[2px] bg-primary shadow-[0_0_8px_rgba(0,218,243,0.8)]" />
                </div>
                <div className="w-20 text-right font-data-mono text-data-mono text-primary">{row.value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
