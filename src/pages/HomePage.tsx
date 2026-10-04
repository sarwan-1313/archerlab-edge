import { ActionButton } from '../components/ActionButton';
import { AppIcon } from '../components/AppIcon';

type HomePageProps = {
  onStart: () => void;
  onGuide: () => void;
  onProfile?: () => void;
  hasProfile?: boolean;
  hasTrainingHistory?: boolean;
};

const highlights = [
  { icon: 'camera' as const, label: 'Live biomechanics', detail: 'Private, on-device analysis' },
  { icon: 'target' as const, label: 'Shot intelligence', detail: 'Form and release insights' },
  { icon: 'grid' as const, label: 'Progress analytics', detail: 'Review captured shots' },
];

export function HomePage({ onStart, onGuide, onProfile, hasProfile = false, hasTrainingHistory = false }: HomePageProps) {
  const setupItems = [
    { label: 'Set up your profile', complete: hasProfile, action: 'Open Profile' },
    { label: 'Prepare your camera', complete: false, action: 'Open Guide' },
    { label: 'Run your first analysis', complete: hasTrainingHistory, action: 'Start Analysis' },
  ];
  const showGettingStarted = !hasProfile || !hasTrainingHistory;
  return (
    <div className="welcome-page">
      <div className="welcome-page__grid" aria-hidden="true" />
      <section className="welcome-hero">
        <div className="welcome-mark" aria-hidden="true">
          <span className="welcome-mark__ring" />
          <AppIcon name="target" size={30} />
        </div>
        <p className="welcome-eyebrow">Archery performance intelligence</p>
        <h1>ArcherLab <span>Edge</span></h1>
        <p className="welcome-subtitle">Analyze form, review shots, and understand training performance from one focused workspace.</p>
        <div className="welcome-actions">
          <ActionButton variant="primary" className="welcome-actions__primary" onClick={onStart}>
            <AppIcon name="play" size={18} />
            Start Analysis
            <AppIcon name="arrow-right" size={18} />
          </ActionButton>
          <div className="welcome-actions__secondary">
            <ActionButton variant="ghost" aria-label="User Guide" onClick={onGuide}>Explore User Guide</ActionButton>
          </div>
        </div>
        <div className="welcome-highlights" aria-label="Product highlights">
          {highlights.map((item) => (
            <article key={item.label}>
              <span><AppIcon name={item.icon} size={18} /></span>
              <div><strong>{item.label}</strong><small>{item.detail}</small></div>
            </article>
          ))}
        </div>
        {showGettingStarted ? (
          <section className="welcome-getting-started" aria-labelledby="getting-started-title">
            <div><span className="eyebrow">First session</span><h2 id="getting-started-title">Get started</h2><p>A short path from setup to your first recorded analysis.</p></div>
            <ol>
              {setupItems.map((item, index) => (
                <li key={item.label} className={item.complete ? 'is-complete' : ''}>
                  <span aria-hidden="true">{item.complete ? '✓' : index + 1}</span>
                  <strong>{item.label}</strong>
                  {item.complete ? <small>Complete</small> : <button type="button" aria-label={index === 2 ? 'Start first analysis' : undefined} onClick={index === 0 ? onProfile : index === 1 ? onGuide : onStart}>{item.action}</button>}
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        <section className="welcome-preview" aria-label="ArcherLab Edge product preview">
          <div className="welcome-preview__header"><span className="eyebrow">Product preview</span><span><i /> On-device analysis</span></div>
          <div className="welcome-preview__frame">
            <div className="welcome-preview__scan" aria-hidden="true"><span /><span /><span /></div>
            <div className="welcome-preview__pose" aria-hidden="true"><i /><i /><i /><i /></div>
            <div className="welcome-preview__status"><strong>Live analysis</strong><span>Camera frame and pose landmarks appear here during a session.</span></div>
          </div>
          <div className="welcome-preview__metrics">
            <div><span>Shot phase</span><strong>Ready for release</strong></div>
            <div><span>Form signals</span><strong>Shoulders · Elbow · Torso</strong></div>
            <div><span>Processing</span><strong>Private on this device</strong></div>
          </div>
        </section>
      </section>
      <footer className="welcome-footer">
        <span><AppIcon name="shield" size={14} /> Video processing stays on your device</span>
        <span>Version 0.1.0</span>
      </footer>
    </div>
  );
}
