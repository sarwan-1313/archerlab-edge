import { AppIcon } from './AppIcon';

type AppLoadingScreenProps = {
  title?: string;
  subtitle?: string;
  status?: string;
  variant?: 'fullscreen' | 'route' | 'inline';
};

export function AppLoadingScreen({
  title = 'ArcherLab Edge',
  subtitle = 'Precision analysis for every shot',
  status = 'Preparing your workspace...',
  variant = 'fullscreen',
}: AppLoadingScreenProps) {
  const compact = variant !== 'fullscreen';
  return (
    <div
      className={`app-loading-screen app-loading-screen--${variant}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="app-loading-screen__panel">
        <div className="app-loading-screen__brand" aria-hidden="true">
          <span className="app-loading-screen__mark">
            <AppIcon name="target" size={compact ? 22 : 30} />
          </span>
        </div>

        <div className="app-loading-screen__copy">
          <p className="app-loading-screen__eyebrow">ArcherLab Edge</p>
          <h1 className="app-loading-screen__title">{title}</h1>
          {!compact ? <p className="app-loading-screen__subtitle">{subtitle}</p> : null}
        </div>

        <div className="app-loading-screen__indicator" aria-hidden="true">
          <span className="app-loading-screen__dot" />
          <span className="app-loading-screen__dot app-loading-screen__dot--delay-1" />
          <span className="app-loading-screen__dot app-loading-screen__dot--delay-2" />
        </div>

        <p className="app-loading-screen__status">{status}</p>
      </div>
    </div>
  );
}
