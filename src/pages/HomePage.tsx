import { useEffect, useRef } from 'react';
import { ActionButton } from '../components/ActionButton';
import { AppIcon, type AppIconName } from '../components/AppIcon';
import { mountScrollScene } from '../landing/scrollScene';
import '../landing/landing.css';

type HomePageProps = {
  onStart: () => void;
  onGuide: () => void;
  onProfile?: () => void;
  onSample?: () => void;
  hasProfile?: boolean;
  hasTrainingHistory?: boolean;
};

const sceneSteps = [
  { phase: 'draw', label: 'Draw', title: 'Pose tracking follows your draw', body: 'Shoulders, bow arm, elbow and torso are tracked frame by frame from a single camera.' },
  { phase: 'hold', label: 'Hold', title: 'Stability before the shot', body: 'Micro-movement of the head and bow hand is measured in the moments before release.' },
  { phase: 'release', label: 'Release', title: 'The release is captured', body: 'Frames before and after release are kept, so alignment changes are measurable, not guessed.' },
  { phase: 'impact', label: 'Impact', title: 'Form meets the score', body: 'Log the result with a hand gesture, then see how your movement relates to where arrows land.' },
] as const;

const capabilities: Array<{ icon: AppIconName; title: string; body: string }> = [
  { icon: 'sensors', title: 'Live biomechanics', body: 'Shoulder alignment, bow-arm angle and torso lean, measured live with on-device pose landmarks.' },
  { icon: 'target', title: 'Shot-cycle analysis', body: 'Each shot is split into draw, hold, release and follow-through, with metrics for every phase.' },
  { icon: 'scan', title: 'Gesture scoring', body: 'Show your score with your hand after each end. No phone tapping between arrows.' },
  { icon: 'grid', title: 'Session analytics', body: 'Consistency across shots, and how form differs between your high- and low-scoring arrows.' },
];

const sessionFlow: Array<{ icon: AppIconName; title: string; body: string }> = [
  { icon: 'camera', title: 'Set up a camera', body: 'Any laptop or phone camera. Place it side-on and check the readiness view.' },
  { icon: 'play', title: 'Shoot as normal', body: 'Shots are detected and captured while you train. Nothing to wear, nothing to sync.' },
  { icon: 'history', title: 'Review and compare', body: 'Replay any shot, check its metrics, and track consistency across the session.' },
];

export function HomePage({ onStart, onGuide, onProfile, onSample, hasProfile = false, hasTrainingHistory = false }: HomePageProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => (rootRef.current ? mountScrollScene(rootRef.current) : undefined), []);

  const setupItems = [
    { label: 'Set up your profile', complete: hasProfile, action: 'Open Profile', onClick: onProfile },
    { label: 'Prepare your camera', complete: false, action: 'Open Guide', onClick: onGuide },
    { label: 'Run your first analysis', complete: hasTrainingHistory, action: 'Begin', onClick: onStart, ariaLabel: 'Start first analysis' },
  ];
  const showGettingStarted = !hasProfile || !hasTrainingHistory;
  const scrollToStory = () => rootRef.current?.querySelector('#landing-story')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="landing" ref={rootRef} data-phase="ready">
      <section className="landing-hero">
        <div className="landing-hero__rings" aria-hidden="true"><span /><span /><span /><span /></div>
        <div className="landing-hero__content">
          <p className="landing-kicker"><span aria-hidden="true" /> Archery performance intelligence</p>
          <h1>ArcherLab <span>Edge</span></h1>
          <p className="landing-hero__lead">
            Computer vision that watches your form the way a coach does. Draw, hold, release, and see exactly what changed, using only the camera you already own.
          </p>
          <div className="landing-hero__actions">
            <ActionButton variant="primary" className="landing-cta" onClick={onStart}>
              <AppIcon name="play" size={18} />
              Start Analysis
              <AppIcon name="arrow-right" size={18} />
            </ActionButton>
            <ActionButton variant="ghost" className="landing-ghost" aria-label="User Guide" onClick={onGuide}>Explore User Guide</ActionButton>
          </div>
          {onSample ? (
            <button type="button" className="landing-sample-link" onClick={onSample}>
              <span>No bow nearby?</span> Explore a sample session <AppIcon name="arrow-right" size={15} />
            </button>
          ) : null}
          <ul className="landing-hero__facts" aria-label="Key facts">
            <li><strong>100%</strong><span>on-device processing</span></li>
            <li><strong>33</strong><span>body landmarks tracked</span></li>
            <li><strong>0</strong><span>sensors or wearables</span></li>
          </ul>
        </div>
        <button type="button" className="landing-scroll-cue" onClick={scrollToStory}>
          <span>See how a shot is analysed</span>
          <AppIcon name="chevron-down" size={18} />
        </button>
      </section>

      <section className="landing-story" id="landing-story" data-scene="track" aria-labelledby="landing-story-title">
        <div className="landing-story__sticky">
          <div className="landing-story__header">
            <span className="landing-eyebrow">One shot, four moments</span>
            <h2 id="landing-story-title">From full draw to the gold</h2>
          </div>
          <div className="landing-story__stage">
            <figure className="landing-scene">
              <svg viewBox="0 28 1000 356" role="img" aria-label="Illustration: a bow is drawn, the arrow is released and lands in the centre of the target">
                <defs>
                  <radialGradient id="landing-gold" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#ffe9a3" />
                    <stop offset="70%" stopColor="#f2b84b" />
                    <stop offset="100%" stopColor="#c98a1e" />
                  </radialGradient>
                  <linearGradient id="landing-trail" x1="0" x2="1">
                    <stop offset="0%" stopColor="#27d9ee" stopOpacity="0" />
                    <stop offset="100%" stopColor="#27d9ee" stopOpacity="0.9" />
                  </linearGradient>
                  <filter id="landing-glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="6" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>

                <g className="landing-scene__grid" aria-hidden="true">
                  {Array.from({ length: 11 }, (_, i) => <line key={`v${i}`} x1={i * 100} y1="0" x2={i * 100} y2="400" />)}
                  {Array.from({ length: 5 }, (_, i) => <line key={`h${i}`} x1="0" y1={i * 100} x2="1000" y2={i * 100} />)}
                </g>
                <line className="landing-scene__range" x1="40" y1="372" x2="960" y2="372" />

                <g data-scene="target" className="landing-scene__target">
                  <rect x="848" y="320" width="24" height="52" rx="3" className="landing-scene__stand" />
                  <circle cx="860" cy="200" r="126" className="ring ring--1" />
                  <circle cx="860" cy="200" r="102" className="ring ring--2" />
                  <circle cx="860" cy="200" r="78" className="ring ring--3" />
                  <circle cx="860" cy="200" r="54" className="ring ring--4" />
                  <circle cx="860" cy="200" r="30" fill="url(#landing-gold)" className="ring ring--gold" />
                  <circle cx="860" cy="200" r="12" className="ring ring--x" />
                  <circle data-scene="pulse" cx="860" cy="200" r="26" className="landing-scene__pulse" />
                  <circle data-scene="pulse" cx="860" cy="200" r="26" className="landing-scene__pulse" />
                  <circle data-scene="pulse" cx="860" cy="200" r="26" className="landing-scene__pulse" />
                </g>

                <line data-scene="trail" x1="20" y1="200" x2="20" y2="200" className="landing-scene__trail" stroke="url(#landing-trail)" />

                <g className="landing-scene__bow">
                  <path d="M112 62 C 150 92, 164 150, 150 186 L 150 214 C 164 250, 150 308, 112 338" className="landing-scene__limb" />
                  <rect x="141" y="178" width="18" height="44" rx="6" className="landing-scene__grip" />
                  <polyline data-scene="string" points="112,62 112,200 112,338" className="landing-scene__string" />
                </g>

                <g data-scene="arrow" transform="translate(112 200)" className="landing-scene__arrow">
                  <line x1="0" y1="0" x2="222" y2="0" className="landing-scene__shaft" />
                  <path d="M222 -6 L 238 0 L 222 6 Z" className="landing-scene__point" />
                  <path d="M4 0 L 22 -11 L 34 -11 L 18 0 Z" className="landing-scene__fletch" />
                  <path d="M4 0 L 22 11 L 34 11 L 18 0 Z" className="landing-scene__fletch" />
                  <rect x="-4" y="-3" width="8" height="6" rx="2" className="landing-scene__nock" />
                </g>

                <g data-scene="score" className="landing-scene__score" style={{ opacity: 0 }}>
                  <rect x="890" y="44" width="92" height="46" rx="12" />
                  <text x="936" y="76" textAnchor="middle">10</text>
                </g>
              </svg>
              <figcaption className="landing-hud" aria-hidden="true">
                <div><span>Draw</span><strong data-meter="draw">0%</strong></div>
                <div><span>Hold sway</span><strong data-meter="hold">--</strong></div>
                <div><span>Release Δ</span><strong data-meter="release">--</strong></div>
                <div><span>Score</span><strong data-meter="score">--</strong></div>
              </figcaption>
            </figure>

            <ol className="landing-steps">
              {sceneSteps.map((step, index) => (
                <li key={step.phase} className="landing-step" data-step={step.phase}>
                  <span className="landing-step__index">0{index + 1}</span>
                  <div>
                    <span className="landing-step__label">{step.label}</span>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="landing-story__progress" aria-hidden="true"><span /></div>
        </div>
      </section>

      <section className="landing-section" aria-labelledby="landing-capabilities-title">
        <header className="landing-section__header" data-reveal>
          <span className="landing-eyebrow">What it measures</span>
          <h2 id="landing-capabilities-title">The small details that decide a score</h2>
          <p>Precision archery is won in fractions of a degree. ArcherLab Edge makes those fractions visible.</p>
        </header>
        <div className="landing-cards">
          {capabilities.map((item, index) => (
            <article key={item.title} className="landing-card" data-reveal style={{ transitionDelay: `${index * 70}ms` }}>
              <span className="landing-card__icon"><AppIcon name={item.icon} size={20} /></span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section" aria-labelledby="landing-flow-title">
        <header className="landing-section__header" data-reveal>
          <span className="landing-eyebrow">A training session</span>
          <h2 id="landing-flow-title">Three steps. No extra equipment.</h2>
        </header>
        <ol className="landing-flow">
          {sessionFlow.map((item, index) => (
            <li key={item.title} data-reveal style={{ transitionDelay: `${index * 90}ms` }}>
              <span className="landing-flow__icon"><AppIcon name={item.icon} size={20} /></span>
              <span className="landing-flow__index">Step {index + 1}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-privacy" aria-labelledby="landing-privacy-title" data-reveal>
        <span className="landing-privacy__icon"><AppIcon name="shield" size={26} /></span>
        <div>
          <h2 id="landing-privacy-title">Your video never leaves your device</h2>
          <p>Pose models run in the browser with WebAssembly. No uploads, no accounts, no cloud processing. Recordings stay on the device you trained with.</p>
        </div>
      </section>

      <section className="landing-final" aria-labelledby="landing-final-title" data-reveal>
        <div className="landing-final__rings" aria-hidden="true"><span /><span /><span /></div>
        <h2 id="landing-final-title">Ready to shoot?</h2>
        <p>Set up your camera and capture your first analysed shot in a few minutes.</p>
        {onSample ? <button type="button" className="landing-sample-link landing-sample-link--center" onClick={onSample}>Or explore a 12-arrow sample session <AppIcon name="arrow-right" size={15} /></button> : null}
        {showGettingStarted ? (
          <ol className="landing-checklist" aria-label="Get started">
            {setupItems.map((item, index) => (
              <li key={item.label} className={item.complete ? 'is-complete' : ''}>
                <span className="landing-checklist__mark" aria-hidden="true">{item.complete ? <AppIcon name="check" size={14} /> : index + 1}</span>
                <strong>{item.label}</strong>
                {item.complete ? <small>Complete</small> : <button type="button" aria-label={item.ariaLabel} onClick={item.onClick}>{item.action}</button>}
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      <footer className="landing-footer">
        <span><AppIcon name="shield" size={14} /> Video processing stays on your device</span>
        <span>Built by an archer · Version 0.1.0</span>
      </footer>
    </div>
  );
}
