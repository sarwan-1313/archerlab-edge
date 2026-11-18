import { ActionButton } from '../components/ActionButton';
import { GoalProgressCard } from '../components/training/GoalProgressCard';
import { usePracticeLog } from '../practice-log/usePracticeLog';
import { AppIcon, type AppIconName } from '../components/AppIcon';
import '../landing/landing.css';
import { InstallCard } from '../components/InstallCard';

type HomePageProps = {
  onStart: () => void;
  onVideo?: () => void;
  onGuide: () => void;
  onProfile?: () => void;
  onSample?: () => void;
  hasProfile?: boolean;
  hasTrainingHistory?: boolean;
  onPrivacy?: () => void;
  onTraining?: () => void;
  onScoring?: () => void;
  onDrills?: () => void;
  onRanges?: () => void;
};

const steps: Array<{ icon: AppIconName; title: string; body: string }> = [
  { icon: 'camera', title: 'Set up a camera', body: 'Any phone or laptop, side-on to you.' },
  { icon: 'play', title: 'Shoot as normal', body: 'Each shot is captured while you train.' },
  { icon: 'history', title: 'Review your form', body: 'Replay shots and see what changed.' },
];

/** Home: one clear way to start, the next steps, and the other ways to train. Nothing else. */
export function HomePage({ onStart, onVideo, onGuide, onProfile, onSample, onPrivacy, onTraining, onScoring, onDrills, onRanges, hasProfile = false, hasTrainingHistory = false }: HomePageProps) {
  const practice = usePracticeLog();

  const setupItems = [
    { label: 'Set up your profile', complete: hasProfile, action: 'Open Profile', onClick: onProfile },
    { label: 'Prepare your camera', complete: false, action: 'Open Guide', onClick: onGuide },
    { label: 'Run your first analysis', complete: hasTrainingHistory, action: 'Begin', onClick: onStart, ariaLabel: 'Begin first analysis' },
  ];
  const showGettingStarted = !hasProfile || !hasTrainingHistory;
  const allTiles: Array<{ icon: AppIconName; label: string; note: string; onClick?: () => void }> = [
    { icon: 'target', label: 'Score a round', note: 'Ends, totals and a timer', onClick: onScoring },
    { icon: 'play-circle', label: 'Drills', note: 'Timed practice for each part of the shot', onClick: onDrills },
    { icon: 'calendar', label: 'Training log', note: 'Every session in one place', onClick: onTraining },
    { icon: 'map', label: 'Find a range', note: 'Archery ranges near you', onClick: onRanges },
  ];
  const tiles = allTiles.filter((tile) => tile.onClick);

  return (
    <div className="landing landing--clean" data-phase="ready">
      <section className="landing-hero landing-hero--compact">
        <div className="landing-hero__rings" aria-hidden="true"><span /><span /><span /><span /></div>
        <div className="landing-hero__content">
          <p className="landing-kicker"><span aria-hidden="true" /> Archery form analysis</p>
          <h1>ArcherLab <span>Edge</span></h1>
          <p className="landing-hero__lead">See your draw, hold and release the way a coach does, with the camera you already own.</p>
          <div className="landing-hero__actions">
            <ActionButton variant="primary" className="landing-cta" onClick={onStart}>
              <AppIcon name="play" size={18} />
              Start Analysis
              <AppIcon name="arrow-right" size={18} />
            </ActionButton>
            {onVideo ? (
              <ActionButton variant="secondary" className="landing-video" onClick={onVideo}>
                <AppIcon name="film" size={18} />
                Analyse a Video
              </ActionButton>
            ) : null}
          </div>
          <div className="home-hero__links">
            <button type="button" className="home-link" onClick={onGuide}>Explore User Guide</button>
            {onSample ? (
              <button type="button" className="landing-sample-link" onClick={onSample}>
                <span>No bow nearby?</span> Try a sample session <AppIcon name="arrow-right" size={15} />
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {/* Shown only once the athlete has set goals. */}
      <div className="landing-goals">
        <GoalProgressCard compact entries={practice.entries} goals={practice.goals} onOpen={onTraining} />
      </div>

      {showGettingStarted ? (
        <section className="home-section" aria-labelledby="home-start-title">
          <h2 id="home-start-title">Get started</h2>
          <ol className="landing-checklist" aria-label="Get started">
            {setupItems.map((item, index) => (
              <li key={item.label} className={item.complete ? 'is-complete' : ''}>
                <span className="landing-checklist__mark" aria-hidden="true">{item.complete ? <AppIcon name="check" size={14} /> : index + 1}</span>
                <strong>{item.label}</strong>
                {item.complete ? <small>Complete</small> : <button type="button" aria-label={item.ariaLabel} onClick={item.onClick}>{item.action}</button>}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {tiles.length ? (
        <section className="home-section" aria-labelledby="home-more-title">
          <h2 id="home-more-title">More ways to train</h2>
          <div className="home-tiles">
            {tiles.map((tile) => (
              <button key={tile.label} type="button" className="home-tile" onClick={tile.onClick}>
                <AppIcon name={tile.icon} size={22} />
                <strong>{tile.label}</strong>
                <small>{tile.note}</small>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {!hasTrainingHistory ? (
        <section className="home-section" aria-labelledby="home-how-title">
          <h2 id="home-how-title">How it works</h2>
          <ol className="home-steps">
            {steps.map((step, index) => (
              <li key={step.title}>
                <span className="home-steps__icon"><AppIcon name={step.icon} size={20} /></span>
                <span><strong>{index + 1}. {step.title}</strong><small>{step.body}</small></span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="landing-install">
        <InstallCard />
      </div>

      <footer className="landing-footer">
        <span><AppIcon name="shield" size={14} /> Your video stays on your device unless you opt in{onPrivacy ? <> · <button type="button" className="landing-footer__link" onClick={onPrivacy}>Privacy</button></> : null}</span>
        <span>Built by an archer · Version 0.2.0</span>
      </footer>
    </div>
  );
}
