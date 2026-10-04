import { useEffect, useRef, useState } from 'react';
import { AppIcon } from '../components/AppIcon';
import { PageHeader } from '../components/PageHeader';
import { SegmentedControl } from '../components/SegmentedControl';
import { useAthleteProfile } from '../hooks/useAthleteProfile';
import type { SessionConfiguration } from '../types';
import type { ArcherHandedness, CameraView } from '../types/biomechanics';
import type { ScoreEntryMethod } from '../types/gestureScore';

type NewSessionPageProps = {
  initialConfiguration?: SessionConfiguration;
  onStart?: (configuration: SessionConfiguration) => void;
  onGestureGuide?: () => void;
};

export function NewSessionPage({ initialConfiguration, onStart, onGestureGuide }: NewSessionPageProps) {
  const { profile } = useAthleteProfile();
  const [handedness, setHandedness] = useState<ArcherHandedness>(initialConfiguration?.handedness ?? 'right');
  const [cameraView, setCameraView] = useState<CameraView>(initialConfiguration?.cameraView ?? 'side');
  const [scoreEntryMethod, setScoreEntryMethod] = useState<ScoreEntryMethod>('gesture-manual');
  const [shotCaptureMethod, setShotCaptureMethod] = useState<'manual' | 'experimental-auto-confirm'>('manual');
  const changedRef = useRef(false);
  useEffect(() => {
    if (changedRef.current || !initialConfiguration) return;
    const nextHandedness = profile?.handedness === 'left' || profile?.handedness === 'right' ? profile.handedness : initialConfiguration.handedness;
    const nextCameraView = profile?.defaultCameraAngle === 'side' || profile?.defaultCameraAngle === 'front' || profile?.defaultCameraAngle === 'rear' ? profile.defaultCameraAngle : initialConfiguration.cameraView;
    setHandedness(nextHandedness);
    setCameraView(nextCameraView);
  }, [initialConfiguration, profile]);
  return (
    <div className="session-setup-page">
      <PageHeader
        title="New Session"
        subtitle="Configure your training environment before camera setup."
        compact
      />

      <form className="session-setup" onSubmit={(event) => { event.preventDefault(); onStart?.({ handedness, cameraView, scoreEntryMethod, shotCaptureMethod }); }}>
        <div className="session-setup__intro">
          <div>
            <span className="eyebrow">Session setup</span>
            <h2>Build your analysis profile</h2>
          </div>
          <span className="session-setup__count">4 settings</span>
        </div>

        <div className="session-setup__fields">

          <fieldset className="field-group field-group--wide">
            <legend className="field-label">Hand dominance</legend>
            <SegmentedControl
              name="handedness"
              columns={2}
              onChange={(value) => { changedRef.current = true; setHandedness(value as ArcherHandedness); }}
              options={[
                { label: 'Right hand', value: 'right', checked: true, description: 'Bow held left' },
                { label: 'Left hand', value: 'left', description: 'Bow held right' },
              ]}
            />
          </fieldset>

          <fieldset className="field-group field-group--wide">
            <legend className="field-label">Camera view</legend>
            <SegmentedControl
              name="cameraView"
              columns={3}
              onChange={(value) => { changedRef.current = true; setCameraView(value as CameraView); }}
              options={[
                { label: 'Side view', value: 'side', checked: true, description: 'Recommended for draw form' },
                { label: 'Front view', value: 'front', description: 'Shoulder alignment' },
                { label: 'Rear view', value: 'rear', description: 'Torso symmetry' },
              ]}
            />
          </fieldset>

          <fieldset className="field-group field-group--wide">
            <legend className="field-label">Shot Capture</legend>
            <SegmentedControl name="shotCaptureMethod" columns={2} onChange={(value) => setShotCaptureMethod(value as 'manual' | 'experimental-auto-confirm')} options={[
              { label: 'Manual Release', value: 'manual', checked: true, description: 'Use MARK RELEASE' },
              { label: 'Experimental Auto + Confirm', value: 'experimental-auto-confirm', description: 'Confirm likely releases' },
            ]} />
          </fieldset>

          <fieldset className="field-group field-group--wide">
            <legend className="field-label">Score Entry Method</legend>
            <SegmentedControl name="scoreEntryMethod" columns={3} onChange={(value) => setScoreEntryMethod(value as ScoreEntryMethod)} options={[
              { label: 'Gesture + Manual', value: 'gesture-manual', checked: true, description: 'Hands-free scoring with fallback' },
              { label: 'Manual Only', value: 'manual-only', description: 'Touchscreen result entry' },
              { label: 'No Score Entry', value: 'none', description: 'Biomechanics only' },
            ]} />
            <button type="button" className="gesture-guide-link" onClick={onGestureGuide}>? Gesture Guide</button>
          </fieldset>


        </div>

        <button className="analysis-cta" type="submit">
          <span className="analysis-cta__icon"><AppIcon name="play" size={22} /></span>
          <span className="analysis-cta__copy">
            <strong>Start analysis</strong>
            <span>Begin your private, AI-assisted archery session</span>
          </span>
          <AppIcon name="arrow-right" size={22} className="analysis-cta__arrow" />
        </button>
      </form>
    </div>
  );
}
