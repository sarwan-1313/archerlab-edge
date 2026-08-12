import { ActionButton } from '../components/ActionButton';
import { AppIcon } from '../components/AppIcon';
import { PageHeader } from '../components/PageHeader';

export function ManualShotEntryPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-gutter pb-24 pt-20 md:px-container-padding">
      <PageHeader title="Manual Entry" compact />

      <section className="relative flex w-full flex-col items-center overflow-hidden rounded-xl border border-white/5 bg-surface-container-high p-container-padding">
        <div className="mb-stack-md flex w-full items-center justify-between z-10">
          <h2 className="font-label-caps text-label-caps text-on-surface-variant">Tap target to place arrow</h2>
          <div className="flex gap-2">
            <button type="button" className="p-1 text-on-surface-variant hover:text-primary" aria-label="Undo">
              <AppIcon name="undo" size={20} />
            </button>
            <button type="button" className="p-1 text-on-surface-variant hover:text-primary" aria-label="Clear">
              <AppIcon name="trash" size={20} />
            </button>
          </div>
        </div>

        <div className="relative mt-2 mb-4 h-64 w-64 rounded-full border border-white/10 bg-[radial-gradient(circle,_#facc15_0%,_#facc15_20%,_transparent_20.5%),radial-gradient(circle,_#ef4444_0%,_#ef4444_40%,_transparent_40.5%),radial-gradient(circle,_#3b82f6_0%,_#3b82f6_60%,_transparent_60.5%),radial-gradient(circle,_#1f2937_0%,_#1f2937_80%,_transparent_80.5%),radial-gradient(circle,_#f9fafb_0%,_#f9fafb_100%)] shadow-2xl md:h-80 md:w-80">
          <div className="absolute inset-[20%] rounded-full border border-black/20" />
          <div className="absolute inset-[40%] rounded-full border border-black/20" />
          <div className="absolute inset-[60%] rounded-full border border-black/20" />
          <div className="absolute inset-[80%] rounded-full border border-black/20" />
          <div className="absolute left-1/2 top-1/2 h-full w-px -translate-x-1/2 -translate-y-1/2 bg-white/20" />
          <div className="absolute left-1/2 top-1/2 h-px w-full -translate-x-1/2 -translate-y-1/2 bg-white/20" />
          <div className="absolute left-[55%] top-[40%] h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary-fixed-dim bg-primary-fixed-dim/20 shadow-[0_0_8px_rgba(0,218,243,0.5)]" />
        </div>

        <div className="mt-4 flex w-full justify-center gap-stack-md">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full border border-primary-fixed-dim bg-primary-fixed-dim/20" />
            <span className="font-data-mono text-data-mono text-on-surface-variant">Predicted</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-yellow-400" />
            <span className="font-data-mono text-data-mono text-on-surface-variant">Actual</span>
          </div>
        </div>
      </section>

      <section className="mt-stack-md grid w-full grid-cols-1 gap-stack-md md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-surface-container p-stack-md">
          <h3 className="font-label-caps text-label-caps text-on-surface-variant">Manual Score Entry</h3>
          <div className="mt-stack-md grid grid-cols-4 gap-2">
            {['X', '10', '9', '8', '7', '6', 'M'].map((value, index) => (
              <button
                key={value}
                type="button"
                className={[
                  'flex h-12 items-center justify-center rounded border font-data-mono text-data-mono',
                  index === 1 ? 'border-primary-fixed bg-primary-fixed/10 text-primary-fixed' : 'border-white/10 bg-surface-variant text-on-surface hover:border-primary-fixed/30 hover:bg-surface-bright',
                ].join(' ')}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-surface-container p-stack-md">
          <h3 className="font-label-caps text-label-caps text-on-surface-variant">Notes</h3>
          <textarea
            className="mt-stack-sm min-h-[120px] w-full resize-none rounded-lg border border-white/10 bg-surface-container-low p-3 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary-fixed focus:outline-none"
            placeholder="Add context (e.g., wind gust, release timing...)"
          />
        </div>
      </section>

      <div className="mt-section-gap w-full">
        <ActionButton className="w-full justify-center text-surface-dim">Confirm Shot Result</ActionButton>
      </div>
    </div>
  );
}
