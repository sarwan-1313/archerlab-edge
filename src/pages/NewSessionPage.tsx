import { useState } from 'react';
import { AppIcon } from '../components/AppIcon';
import { PageHeader } from '../components/PageHeader';
import { SegmentedControl } from '../components/SegmentedControl';
import type { SessionConfiguration } from '../types';
import type { ArcherHandedness, CameraView } from '../types/biomechanics';
import type { ScoreEntryMethod } from '../types/gestureScore';
import { useAthleteProfile } from '../hooks/useAthleteProfile';

type NewSessionPageProps = {
  onStart?: (configuration: SessionConfiguration) => void;
  onGestureGuide?: () => void;
};

export function NewSessionPage({ onStart, onGestureGuide }: NewSessionPageProps) {
  const { profile } = useAthleteProfile();
  const [handedness, setHandedness] = useState<ArcherHandedness>(profile?.handedness ?? 'right');
  const [cameraView, setCameraView] = useState<CameraView>(profile?.defaultCameraAngle ?? 'side');
  const [scoreEntryMethod, setScoreEntryMethod] = useState<ScoreEntryMethod>('gesture-manual');
  const [shotCaptureMethod, setShotCaptureMethod] = useState<'manual' | 'experimental-auto-confirm'>('manual');
  return (
    <div className="session-setup-page">
      <PageHeader
        title="New Session"
        subtitle="Configure your training environment before calibration."
        compact
      />

      <form className="session-setup" onSubmit={(event) => { event.preventDefault(); onStart?.({ handedness, cameraView, scoreEntryMethod, shotCaptureMethod }); }}>
        <div className="session-setup__intro">
          <div>
            <span className="eyebrow">Session setup</span>
            <h2>Build your analysis profile</h2>
          </div>
          <span className="session-setup__count">8 settings</span>
        </div>

        <div className="session-setup__fields">
          <div className="field-group field-group--wide">
            <label className="field-label" htmlFor="session-name">Session name</label>
            <div className="premium-input">
              <AppIcon name="target" size={19} />
              <input id="session-name" placeholder="Morning practice · 70 m" />
            </div>
          </div>

          <div className="field-group field-group--wide">
            <label className="field-label" htmlFor="archer-profile">Archer profile</label>
            <div className="premium-select">
              <AppIcon name="accessibility" size={19} />
              <select id="archer-profile" defaultValue="elite">
                <option value="elite">Elite Archer (VNT-9200)</option>
                <option value="guest">Guest profile</option>
              </select>
              <AppIcon name="chevron-down" size={18} />
            </div>
          </div>

          <fieldset className="field-group field-group--wide">
            <legend className="field-label">Bow type</legend>
            <SegmentedControl
              name="bowType"
              columns={3}
              options={[
                { label: 'Recurve', value: 'recurve', checked: true, description: 'Olympic style' },
                { label: 'Compound', value: 'compound', description: 'Cam assisted' },
                { label: 'Barebow', value: 'barebow', description: 'Unassisted' },
              ]}
            />
          </fieldset>

          <fieldset className="field-group field-group--wide">
            <legend className="field-label">Hand dominance</legend>
            <SegmentedControl
              name="handedness"
              columns={2}
              onChange={(value) => setHandedness(value as ArcherHandedness)}
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
              onChange={(value) => setCameraView(value as CameraView)}
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

          <fieldset className="field-group">
            <legend className="field-label">Environment</legend>
            <SegmentedControl
              name="environment"
              columns={2}
              options={[
                { label: 'Indoor', value: 'indoor', checked: true },
                { label: 'Outdoor', value: 'outdoor' },
              ]}
            />
          </fieldset>

          <fieldset className="field-group">
            <legend className="field-label">Orientation</legend>
            <SegmentedControl
              name="orientation"
              columns={2}
              options={[
                { label: 'Landscape', value: 'landscape', checked: true },
                { label: 'Portrait', value: 'portrait' },
              ]}
            />
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
