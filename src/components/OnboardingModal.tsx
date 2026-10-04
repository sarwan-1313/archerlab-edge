import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionButton } from './ActionButton';
import { AppIcon } from './AppIcon';
import { runPresentationTransition } from '../motion/runPresentationTransition';

const slides = [
  { icon: 'target' as const, eyebrow: 'Precision training', title: 'Welcome to ArcherLab Edge', text: 'Turn a standard camera into a private archery analysis workspace.', detail: 'Live form · Shot capture · Session review' },
  { icon: 'camera' as const, eyebrow: 'Camera setup', title: 'Frame the complete athlete', text: 'Use a stable camera position with the upper body and bow arm clearly visible.', detail: 'Side view is recommended for bow-arm angles' },
  { icon: 'sensors' as const, eyebrow: 'Live analysis', title: 'Follow the shot cycle', text: 'Track landmark visibility, biomechanics, and release timing while you train.', detail: 'Values pause when visibility is insufficient' },
  { icon: 'grid' as const, eyebrow: 'Private review', title: 'Build a useful training history', text: 'Replay local recordings and compare valid captures across the session.', detail: 'Recordings stay on this device until exported' },
];

type OnboardingModalProps = { onClose: () => void; onStart: () => void };

export function OnboardingModal({ onClose, onStart }: OnboardingModalProps) {
  const [step, setStep] = useState(0);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isLast = step === slides.length - 1;
  const slide = slides[step];
  const closeWithMotion = useCallback(
    () => runPresentationTransition(onClose, { kind: 'modal' }),
    [onClose],
  );

  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex="0"]') ?? []);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) {
          event.preventDefault();
          first?.focus();
        }
      }
      if (event.key === 'Escape') closeWithMotion();
      if (event.key === 'ArrowRight') setStep((value) => Math.min(slides.length - 1, value + 1));
      if (event.key === 'ArrowLeft') setStep((value) => Math.max(0, value - 1));
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [closeWithMotion]);

  return (
    <div className="onboarding-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeWithMotion(); }}>
      <section ref={dialogRef} className="onboarding-modal" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
        <header className="onboarding-modal__header">
          <div><span className="onboarding-modal__brand"><AppIcon name="target" size={15} />ArcherLab Edge</span><span>Quick start</span></div>
          <button ref={closeButtonRef} type="button" className="icon-button" onClick={closeWithMotion} aria-label="Close onboarding">
            <AppIcon name="close" size={18} />
          </button>
        </header>
        <div key={step} className="onboarding-modal__body motion-tab-panel">
          <div className="onboarding-modal__visual"><span /><AppIcon name={slide.icon} size={38} /></div>
          <span className="onboarding-modal__step">Step {step + 1} of {slides.length}</span>
          <span className="onboarding-modal__eyebrow">{slide.eyebrow}</span>
          <h2 id="onboarding-title">{slide.title}</h2>
          <p>{slide.text}</p>
          <div className="onboarding-modal__detail"><AppIcon name={step === slides.length - 1 ? 'shield' : 'check'} size={14} />{slide.detail}</div>
          <div className="onboarding-progress" aria-label={`Step ${step + 1} of ${slides.length}`}>
            {slides.map((item, index) => <button type="button" key={item.title} aria-label={`Go to step ${index + 1}: ${item.title}`} aria-current={index === step ? 'step' : undefined} onClick={() => setStep(index)} className={index === step ? 'is-active' : index < step ? 'is-complete' : ''}><span /></button>)}
          </div>
        </div>
        <footer className="onboarding-modal__footer">
          <button type="button" className="text-button" onClick={closeWithMotion}>Skip for now</button>
          <div>
            {step > 0 ? <ActionButton variant="secondary" onClick={() => setStep((value) => Math.max(0, value - 1))}>Back</ActionButton> : null}
            <ActionButton onClick={() => { if (isLast) onStart(); else setStep((value) => Math.min(slides.length - 1, value + 1)); }}>
              {isLast ? 'Start Analysis' : 'Next'}
              <AppIcon name="arrow-right" size={17} />
            </ActionButton>
          </div>
        </footer>
      </section>
    </div>
  );
}
