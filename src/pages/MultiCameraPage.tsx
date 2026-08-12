import { ActionButton } from '../components/ActionButton';
import { AppIcon } from '../components/AppIcon';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';

export function MultiCameraPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-gutter pb-24 pt-20 md:px-section-gap">
      <PageHeader
        title="Multi-Camera Array"
        subtitle="Each device processes video locally; only metadata is synchronized."
        actions={<StatusBadge label="Experimental" tone="warning" compact />}
      />

      <div className="grid grid-cols-1 gap-stack-md xl:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-white/10 bg-surface-container">
          <div className="flex items-center justify-between border-b border-white/5 bg-surface-container-high p-4">
            <span className="font-label-caps text-label-caps text-secondary-fixed">Primary Device</span>
            <AppIcon name="smartphone" size={18} className="text-primary" />
          </div>
          <div className="relative h-64 w-full bg-surface-lowest">
            <img
              className="h-full w-full object-cover opacity-60"
              alt="Primary camera feed"
              src="https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=1200&q=80"
            />
            <div className="absolute left-2 top-2 rounded border border-white/10 bg-surface-dim/80 px-2 py-1 font-label-caps text-label-caps text-primary-fixed">Side View</div>
            <div className="absolute bottom-2 right-2 rounded border border-white/10 bg-surface-dim/80 px-2 py-1 font-data-mono text-data-mono text-secondary-fixed">120 FPS • 4K HDR</div>
          </div>
          <div className="grid grid-cols-2 gap-4 bg-surface-container-low p-4">
            <div>
              <p className="font-label-caps text-label-caps text-on-surface-variant">Local latency</p>
              <p className="mt-1 font-data-mono text-data-mono text-primary">2ms</p>
            </div>
            <div>
              <p className="font-label-caps text-label-caps text-on-surface-variant">Frame sync</p>
              <p className="mt-1 font-data-mono text-data-mono text-primary">Master</p>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-white/10 bg-surface-container">
          <div className="flex items-center justify-between border-b border-white/5 bg-surface-container-high p-4">
            <span className="font-label-caps text-label-caps text-secondary-fixed">Secondary Device</span>
            <AppIcon name="tablet" size={18} className="text-primary" />
          </div>
          <div className="relative h-64 w-full bg-surface-lowest">
            <img
              className="h-full w-full object-cover opacity-60"
              alt="Secondary camera feed"
              src="https://images.unsplash.com/photo-1521119989659-a83eee488004?auto=format&fit=crop&w=1200&q=80"
            />
            <div className="absolute left-2 top-2 rounded border border-white/10 bg-surface-dim/80 px-2 py-1 font-label-caps text-label-caps text-primary-fixed">Front View</div>
            <div className="absolute bottom-2 right-2 rounded border border-white/10 bg-surface-dim/80 px-2 py-1 font-data-mono text-data-mono text-secondary-fixed">12ms delay</div>
          </div>
          <div className="grid grid-cols-2 gap-4 bg-surface-container-low p-4">
            <div>
              <p className="font-label-caps text-label-caps text-on-surface-variant">Metadata link</p>
              <p className="mt-1 font-data-mono text-data-mono text-primary">Active</p>
            </div>
            <div>
              <p className="font-label-caps text-label-caps text-on-surface-variant">Offset</p>
              <p className="mt-1 font-data-mono text-data-mono text-primary">-1 frame</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col items-center justify-between gap-6 rounded-xl border border-dashed border-outline-variant bg-surface-container-low p-6 md:flex-row">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-bright">
            <AppIcon name="scan" size={22} className="text-on-surface" />
          </div>
          <div>
            <h4 className="font-headline-sm text-headline-sm-mobile md:text-headline-sm text-inverse-surface">Add Camera Node</h4>
            <p className="font-body-md text-body-md text-on-surface-variant">Pair another device for additional angles</p>
          </div>
        </div>
        <ActionButton variant="secondary">PAIR DEVICE</ActionButton>
      </div>
    </div>
  );
}
