import { AppIcon } from '../AppIcon';
import { StatusBadge } from '../StatusBadge';

export type ReadinessCheckItem = {
  name: string;
  state: 'checking' | 'ready' | 'attention' | 'unavailable';
  label: string;
  guidance: string;
};

export function ReadinessCheck({ checks, onTryAgain, retrying = false }: { checks: ReadinessCheckItem[]; onTryAgain: () => void; retrying?: boolean }) {
  const allReady = checks.every((check) => check.state === 'ready');
  const hasUnavailable = checks.some((check) => check.state === 'unavailable');
  const hasAttention = checks.some((check) => check.state === 'attention');
  const overallLabel = allReady ? 'Ready' : hasUnavailable ? 'Unavailable' : hasAttention ? 'Needs Attention' : 'Checking';
  const overallTone = allReady ? 'success' : hasUnavailable ? 'danger' : hasAttention ? 'warning' : 'info';
  return (
    <section className="readiness-card" aria-label="System readiness checks" aria-live="polite">
      <header>
        <div><span className="eyebrow">System check</span><h2>{allReady ? 'Everything is ready' : hasUnavailable ? 'Analysis is unavailable' : hasAttention ? 'Action required' : 'Preparing your session'}</h2></div>
        <StatusBadge label={overallLabel} tone={overallTone} compact />
      </header>
      <div className="readiness-list">
        {checks.map((check) => (
          <article key={check.name} className={`readiness-item readiness-item--${check.state}`}>
            <span className="readiness-item__icon"><AppIcon name={check.state === 'ready' ? 'check' : check.state === 'unavailable' ? 'close' : check.name === 'Camera' ? 'camera' : 'sensors'} size={18} /></span>
            <div><strong>{check.name}</strong><p>{check.guidance}</p></div>
            <span className="readiness-item__state">{check.label}</span>
          </article>
        ))}
      </div>
      {!allReady ? <button type="button" className="button button--secondary readiness-retry" onClick={onTryAgain} disabled={retrying}><AppIcon name="refresh" size={16} />Try Again</button> : null}
    </section>
  );
}
