import type { MouseEvent } from 'react';
import { ActionButton } from '../components/ActionButton';
import { AppIcon } from '../components/AppIcon';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { guideCategoryMetadata, guideManualSteps, type GuideCategory } from '../data/userGuide';
import { routeForPage } from '../navigation/routes';
import type { GuideDetailPageKey } from '../types';

const orderedCategories = (Object.keys(guideCategoryMetadata) as GuideCategory[])
  .sort((left, right) => guideCategoryMetadata[left].order - guideCategoryMetadata[right].order);

type UserGuidePageProps = {
  onStart: () => void;
  onHome: () => void;
  onOnboarding: () => void;
  onOpenStep: (page: GuideDetailPageKey) => void;
};

function isPlainLeftClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function UserGuidePage({ onStart, onHome, onOnboarding, onOpenStep }: UserGuidePageProps) {
  const openStep = (event: MouseEvent<HTMLAnchorElement>, page: GuideDetailPageKey) => {
    if (!isPlainLeftClick(event)) return;
    event.preventDefault();
    onOpenStep(page);
  };

  return (
    <div className="guide-page">
      <PageHeader title="User Guide" subtitle="A practical path from camera setup to a useful performance review." actions={<ActionButton variant="secondary" onClick={onOnboarding}><AppIcon name="play-circle" size={17} />Replay quick start</ActionButton>} />

      <section className="guide-intro">
        <div><span className="eyebrow">Before you begin</span><h2>Set up once. Train naturally.</h2></div>
        <p>Use a stable camera position, keep the athlete fully visible, and select the view that supports the movement you want to review.</p>
        <div className="guide-intro__checks"><span><AppIcon name="check" size={14} />Stable camera</span><span><AppIcon name="check" size={14} />Full athlete visible</span><span><AppIcon name="shield" size={14} />Local processing</span></div>
      </section>

      <div className="guide-sections">
        {orderedCategories.map((category) => {
          const metadata = guideCategoryMetadata[category];
          const steps = guideManualSteps.filter((step) => step.category === category);
          return (
            <section className="guide-section" key={category} aria-labelledby={`guide-category-${category.toLowerCase()}`}>
              <header className="guide-section__header">
                <span className="guide-section__icon"><AppIcon name={metadata.icon} size={21} /></span>
                <div><span className="eyebrow">{String(metadata.order).padStart(2, '0')} - {category}</span><h2 id={`guide-category-${category.toLowerCase()}`}>{metadata.title}</h2></div>
                <StatusBadge label={`${steps.length} steps`} tone="info" compact />
              </header>
              <ol className="guide-list" start={steps[0]?.number}>
                {steps.map((step) => (
                  <li key={step.page}>
                    <a className="guide-step-link" href={routeForPage(step.page)} aria-label={`Step ${step.number}: ${step.title}`} onClick={(event) => openStep(event, step.page)}>
                      <span className="guide-list__number" aria-hidden="true">{String(step.number).padStart(2, '0')}</span>
                      <div className="guide-step-link__copy"><h3>{step.title}</h3><p>{step.overview}</p></div>
                      <span className="guide-step-link__arrow" aria-hidden="true"><AppIcon name="arrow-right" size={17} /></span>
                    </a>
                  </li>
                ))}
              </ol>
            </section>
          );
        })}
      </div>

      <section className="guide-section guide-install" aria-labelledby="guide-install-title">
        <header className="guide-section__header">
          <span className="guide-section__icon"><AppIcon name="smartphone" size={21} /></span>
          <div><span className="eyebrow">Optional</span><h2 id="guide-install-title">Install on your phone</h2></div>
        </header>
        <div className="guide-install__body">
          <p>Open ArcherLab Edge from your home screen, full screen, and keep analysing at the range without a signal. Visit once on Wi-Fi first: the app saves itself to your phone (roughly 26 MB).</p>
          <div className="guide-install__platforms">
            <div>
              <h3>iPhone or iPad (Safari)</h3>
              <ol>
                <li>Open ArcherLab Edge in Safari.</li>
                <li>Tap the <strong>Share</strong> button.</li>
                <li>Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
              </ol>
            </div>
            <div>
              <h3>Android (Chrome)</h3>
              <ol>
                <li>Open ArcherLab Edge in Chrome.</li>
                <li>Tap the <strong>⋮</strong> menu.</li>
                <li>Choose <strong>Install app</strong> (or <strong>Add to Home screen</strong>).</li>
              </ol>
            </div>
          </div>
          <p className="guide-install__note">Live and video analysis work offline. Backup, AI review and imports need a connection.</p>
        </div>
      </section>

      <aside className="guide-note">
        <AppIcon name="sensors" size={19} />
        <div><strong>Metrics pause when visibility drops</strong><span>Improve lighting or framing before using a value for comparison. The app keeps unavailable and low-confidence readings explicit.</span></div>
      </aside>

      <section className="guide-cta">
        <div><span className="eyebrow">Ready to train?</span><h2>Start your next analysis session.</h2></div>
        <div><ActionButton variant="secondary" onClick={onHome}>Back to Home</ActionButton><ActionButton onClick={onStart}>Start Analysis<AppIcon name="arrow-right" size={17} /></ActionButton></div>
      </section>
    </div>
  );
}
