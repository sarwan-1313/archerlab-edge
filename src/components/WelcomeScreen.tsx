import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useCloudAccount } from '../cloud/account/useCloudAccount';
import { useAthleteProfile } from '../hooks/useAthleteProfile';
import { chooseStart } from '../onboarding/guestMode';
import { listPracticeEntries } from '../practice-log/storage';
import { listRecordings } from '../recording/recordingStorage';
import { listVideoReports } from '../video-analysis/storage';
import { ActionButton } from './ActionButton';
import { AppIcon } from './AppIcon';

type Step = 'start' | 'profile' | 'guest';

function Illustration() {
  return (
    <svg className="welcome__art" viewBox="0 0 240 200" aria-hidden="true">
      <defs>
        <radialGradient id="welcome-glow" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#2ee6ff" stopOpacity=".35" /><stop offset="100%" stopColor="#2ee6ff" stopOpacity="0" /></radialGradient>
      </defs>
      <circle cx="150" cy="100" r="96" fill="url(#welcome-glow)" />
      {['#f4f4f0', '#1d1d1f', '#2f8fd8', '#e0393e', '#ffd23f'].map((colour, index) => (
        <circle key={colour} cx="150" cy="100" r={72 - index * 14} fill={colour} stroke={index === 1 ? '#f4f4f0' : '#1d1d1f'} strokeWidth="1" />
      ))}
      <g stroke="#2ee6ff" strokeWidth="3" strokeLinecap="round" fill="none">
        <circle cx="46" cy="52" r="9" fill="#04060a" />
        <path d="M46 61v52M46 70l40 0M46 70l-22 8M46 113l-12 42M46 113l14 42" />
        <path d="M86 46c10 14 10 34 0 48" stroke="#ffc53d" />
      </g>
      <path d="M24 78L146 100" stroke="#f3f6fa" strokeWidth="2" />
      <path d="M146 100l-10-6m10 6l-10 5" stroke="#f3f6fa" strokeWidth="2" strokeLinecap="round" />
      <circle cx="150" cy="100" r="3" fill="#04060a" />
    </svg>
  );
}

/**
 * The first screen a new visitor sees: create a profile (kept on this device),
 * continue with Google (when accounts are set up), or skip as a guest, which
 * keeps nothing after the app closes.
 */
export default function WelcomeScreen({ onDone, onOpenPrivacy }: { onDone: () => void; onOpenPrivacy?: () => void }) {
  const [step, setStep] = useState<Step>('start');
  const { save } = useAthleteProfile();
  const account = useCloudAccount();
  const [name, setName] = useState('');
  const [handedness, setHandedness] = useState<'right' | 'left'>('right');
  const [bowType, setBowType] = useState('recurve');
  const [experience, setExperience] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<number | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => { headingRef.current?.focus(); }, [step]);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);
  useEffect(() => {
    if (step !== 'guest') return;
    let alive = true;
    Promise.all([listPracticeEntries().catch(() => []), listVideoReports().catch(() => []), listRecordings().catch(() => [])])
      .then(([entries, reports, recordings]) => { if (alive) setExisting(entries.length + reports.length + recordings.length); });
    return () => { alive = false; };
  }, [step]);

  const createProfile = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await save({ displayName: name.trim() || 'Archer', handedness, bowType, experienceLevel: experience, defaultCameraAngle: 'side' });
      chooseStart('profile');
      onDone();
    } catch {
      setError('Your profile could not be saved in this browser. Check that storage is allowed, or continue as a guest.');
    } finally {
      setSaving(false);
    }
  };

  const google = () => {
    chooseStart('google');
    account.signInWithGoogle();
  };

  const guest = () => { chooseStart('guest'); onDone(); };

  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="welcome__card">
        <div className="welcome__brand"><span className="welcome__mark"><AppIcon name="target" size={20} /></span>ARCHERLAB <strong>EDGE</strong></div>

        {step === 'start' ? (
          <>
            <Illustration />
            <h1 id="welcome-title" ref={headingRef} tabIndex={-1}>Welcome to <span>ArcherLab Edge</span></h1>
            <p className="welcome__lead">Your private archery coach: form analysis from your camera, scoring with groupings, drills and a practice log. Video never leaves your phone.</p>
            <div className="welcome__actions">
              <ActionButton variant="primary" type="button" className="welcome__primary" onClick={() => setStep('profile')}><AppIcon name="user" size={18} /> Create my profile</ActionButton>
              {account.configured ? (
                <button type="button" className="welcome__google" onClick={google}>
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7Z" /><path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24Z" /><path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.8l4-3Z" /><path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8Z" /></svg>
                  Continue with Google
                </button>
              ) : null}
              <button type="button" className="welcome__skip" onClick={() => setStep('guest')}>Skip, continue as guest</button>
            </div>
            <p className="welcome__fine"><AppIcon name="shield" size={14} /> Your profile stays on this device.{onOpenPrivacy ? <> <button type="button" className="welcome__link" onClick={() => { onDone(); onOpenPrivacy(); }}>How your data is handled</button></> : null}</p>
          </>
        ) : null}

        {step === 'profile' ? (
          <form className="welcome__form" onSubmit={(event) => void createProfile(event)}>
            <button type="button" className="welcome__back" onClick={() => setStep('start')} aria-label="Back"><AppIcon name="arrow-left" size={20} /></button>
            <h1 id="welcome-title" ref={headingRef} tabIndex={-1}>Create your profile</h1>
            <p className="welcome__lead">This sets up the analysis for you. It stays on this device, and you can change it any time.</p>
            <label className="welcome__field"><span>Your name</span><input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Sarwan" /></label>
            <fieldset className="welcome__field">
              <legend>Which hand draws the string?</legend>
              <div className="welcome__segments">
                {(['right', 'left'] as const).map((hand) => (
                  <button key={hand} type="button" aria-pressed={handedness === hand} className={handedness === hand ? 'is-selected' : ''} onClick={() => setHandedness(hand)}>{hand === 'right' ? 'Right hand' : 'Left hand'}</button>
                ))}
              </div>
            </fieldset>
            <label className="welcome__field"><span>Bow</span>
              <select value={bowType} onChange={(event) => setBowType(event.target.value)}>
                <option value="recurve">Recurve</option><option value="compound">Compound</option><option value="barebow">Barebow</option><option value="other">Other / traditional</option>
              </select>
            </label>
            <label className="welcome__field"><span>Experience</span>
              <select value={experience} onChange={(event) => setExperience(event.target.value)}>
                <option value="">Prefer not to say</option><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option><option value="competitive">Competitive</option>
              </select>
            </label>
            {error ? <p className="welcome__error" role="alert">{error}</p> : null}
            <ActionButton variant="primary" type="submit" className="welcome__primary" disabled={saving}>{saving ? 'Saving…' : 'Save and start'}</ActionButton>
          </form>
        ) : null}

        {step === 'guest' ? (
          <div className="welcome__form">
            <button type="button" className="welcome__back" onClick={() => setStep('start')} aria-label="Back"><AppIcon name="arrow-left" size={20} /></button>
            <h1 id="welcome-title" ref={headingRef} tabIndex={-1}>Continue as a guest?</h1>
            <p className="welcome__lead">Everything works, but <strong>nothing is kept</strong>: your sessions, video reports, scores and settings are deleted the next time you open ArcherLab. Create a profile at any time to keep your work from then on.</p>
            {existing ? <p className="welcome__error" role="alert">This device already has {existing} saved session{existing === 1 ? '' : 's'}, report{existing === 1 ? '' : 's'} or log entr{existing === 1 ? 'y' : 'ies'}. Guest mode would delete {existing === 1 ? 'it' : 'them'} next time. Create a profile instead to keep {existing === 1 ? 'it' : 'them'}.</p> : null}
            <ActionButton variant="secondary" type="button" className="welcome__primary" onClick={guest} disabled={existing === null}>{existing === null ? 'Checking…' : 'Continue as guest'}</ActionButton>
            <button type="button" className="welcome__skip" onClick={() => setStep('profile')}>Create a profile instead</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
