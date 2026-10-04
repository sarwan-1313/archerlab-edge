import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react';
import { ActionButton } from '../components/ActionButton';
import { AppIcon } from '../components/AppIcon';
import { guideManualSteps, type GuideManualStep } from '../data/userGuide';
import { routeForPage } from '../navigation/routes';
import type { GuideDetailPageKey, PageKey } from '../types';

type GuideDetailPageProps = {
  step: GuideManualStep;
  onNavigate: (page: PageKey) => void;
  onProductNavigate: (page: Extract<PageKey, 'live-analysis' | 'saved-recordings' | 'dashboard'>) => void;
};

type GuideRouteLinkProps = {
  page: PageKey;
  onNavigate: (page: PageKey) => void;
  className?: string;
  ariaLabel?: string;
  children: ReactNode;
};

function isPlainLeftClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function GuideRouteLink({ page, onNavigate, className, ariaLabel, children }: GuideRouteLinkProps) {
  return (
    <a
      href={routeForPage(page)}
      className={className}
      aria-label={ariaLabel}
      onClick={(event) => {
        if (!isPlainLeftClick(event)) return;
        event.preventDefault();
        onNavigate(page);
      }}
    >
      {children}
    </a>
  );
}

export function GuideDetailPage({ step, onNavigate, onProductNavigate }: GuideDetailPageProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const currentIndex = guideManualSteps.findIndex((candidate) => candidate.page === step.page);
  const previousStep = guideManualSteps[currentIndex - 1];
  const nextStep = guideManualSteps[currentIndex + 1];
  const progress = (step.number / guideManualSteps.length) * 100;

  useEffect(() => {
    headingRef.current?.focus();
  }, [step.page]);

  return (
    <div className="guide-detail-page">
      <nav className="guide-breadcrumb" aria-label="Breadcrumb">
        <ol>
          <li><GuideRouteLink page="user-guide" onNavigate={onNavigate}>Guide</GuideRouteLink></li>
          <li aria-current="page">{step.title}</li>
        </ol>
      </nav>

      <label className="guide-contents-select">
        <span>Guide contents</span>
        <select value={step.page} onChange={(event) => onNavigate(event.target.value as GuideDetailPageKey)}>
          {guideManualSteps.map((candidate) => <option key={candidate.page} value={candidate.page}>{String(candidate.number).padStart(2, '0')} {candidate.title}</option>)}
        </select>
      </label>

      <div className="guide-detail-layout">
        <article className="guide-manual">
          <header className="guide-manual__hero">
            <div className="guide-manual__meta"><span>Step {step.number} of {guideManualSteps.length}</span><span>{step.category}</span></div>
            <h1 ref={headingRef} tabIndex={-1}>{step.title}</h1>
            <p className="guide-manual__purpose">{step.purpose}</p>
            <div className="guide-manual__progress" role="progressbar" aria-label="Guide progress" aria-valuemin={1} aria-valuemax={guideManualSteps.length} aria-valuenow={step.number}>
              <span style={{ width: `${progress}%` }} />
            </div>
          </header>

          <section className="guide-manual__section" aria-labelledby="manual-overview-heading">
            <span className="eyebrow">Overview</span>
            <h2 id="manual-overview-heading">Why this step matters</h2>
            <p>{step.introduction}</p>
          </section>

          {step.context ? (
            <section className="guide-manual__context" aria-labelledby="manual-context-heading">
              <div><AppIcon name="grid" size={18} /><h2 id="manual-context-heading">{step.context.title}</h2></div>
              <ul>{step.context.items.map((item) => <li key={item}><AppIcon name="check" size={14} />{item}</li>)}</ul>
            </section>
          ) : null}

          <section className="guide-manual__section" aria-labelledby="manual-procedure-heading">
            <span className="eyebrow">Procedure</span>
            <h2 id="manual-procedure-heading">Step-by-step</h2>
            <ol className="guide-procedure">
              {step.procedure.map((item, index) => (
                <li key={item.title}>
                  <span className="guide-procedure__number">{String(index + 1).padStart(2, '0')}</span>
                  <div><h3>{item.title}</h3><p>{item.description}</p></div>
                </li>
              ))}
            </ol>
          </section>

          <aside className="guide-result" aria-labelledby="manual-result-heading">
            <span className="guide-result__icon"><AppIcon name="check" size={20} /></span>
            <div><span className="eyebrow">What you should see</span><h2 id="manual-result-heading">Expected result</h2><p>{step.expectedResult}</p></div>
          </aside>

          <section className="guide-manual__section" aria-labelledby="manual-tips-heading">
            <span className="eyebrow">Practical guidance</span>
            <h2 id="manual-tips-heading">Tips</h2>
            <ul className="guide-tips">{step.tips.map((tip) => <li key={tip}><AppIcon name="check" size={15} /><span>{tip}</span></li>)}</ul>
          </section>

          {step.notice ? (
            <aside className={`guide-callout guide-callout--${step.notice.tone}`} aria-label={step.notice.tone === 'warning' ? 'Important warning' : 'Important information'}>
              <AppIcon name={step.notice.tone === 'warning' ? 'sensors' : 'shield'} size={19} />
              <div><h2>{step.notice.title}</h2><p>{step.notice.body}</p></div>
            </aside>
          ) : null}

          <section className="guide-manual__section" aria-labelledby="manual-troubleshooting-heading">
            <span className="eyebrow">Support</span>
            <h2 id="manual-troubleshooting-heading">Troubleshooting</h2>
            <div className="guide-troubleshooting">
              {step.troubleshooting.map((item) => (
                <article key={item.issue}>
                  <span className="guide-troubleshooting__icon"><AppIcon name="sensors" size={16} /></span>
                  <div><h3>{item.issue}</h3><p>{item.solution}</p></div>
                </article>
              ))}
            </div>
          </section>

          {step.productAction ? (
            <aside className="guide-product-action">
              <div><span className="eyebrow">Open the product</span><h2>Try this step in ArcherLab Edge</h2><p>This action opens the existing product workflow; it does not complete a manual step or start session recording automatically.</p></div>
              <ActionButton variant="secondary" onClick={() => onProductNavigate(step.productAction!.page)}>{step.productAction.label}<AppIcon name="arrow-right" size={16} /></ActionButton>
            </aside>
          ) : null}

          <nav className="guide-manual-nav" aria-label="Manual step navigation">
            <div>
              {previousStep ? <GuideRouteLink page={previousStep.page} onNavigate={onNavigate} className="guide-manual-nav__step" ariaLabel={`Previous step: ${previousStep.title}`}><AppIcon name="arrow-left" size={16} /><span><small>Previous</small><strong>{previousStep.title}</strong></span></GuideRouteLink> : null}
            </div>
            <GuideRouteLink page="user-guide" onNavigate={onNavigate} className="guide-manual-nav__back"><AppIcon name="grid" size={15} />Back to Guide</GuideRouteLink>
            <div>
              {nextStep ? <GuideRouteLink page={nextStep.page} onNavigate={onNavigate} className="guide-manual-nav__step guide-manual-nav__step--next" ariaLabel={`Next step: ${nextStep.title}`}><span><small>Next</small><strong>{nextStep.title}</strong></span><AppIcon name="arrow-right" size={16} /></GuideRouteLink> : null}
            </div>
          </nav>
        </article>

        <aside className="guide-contents">
          <nav aria-label="Guide contents">
            <span className="eyebrow">Guide contents</span>
            <ol>
              {guideManualSteps.map((candidate) => (
                <li key={candidate.page}>
                  <GuideRouteLink page={candidate.page} onNavigate={onNavigate} className={candidate.page === step.page ? 'is-current' : undefined} ariaLabel={`Step ${candidate.number}: ${candidate.title}`}>
                    <span>{String(candidate.number).padStart(2, '0')}</span><strong>{candidate.title}</strong>
                  </GuideRouteLink>
                </li>
              ))}
            </ol>
          </nav>
        </aside>
      </div>
    </div>
  );
}
