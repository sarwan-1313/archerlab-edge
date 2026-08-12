import { AppIcon } from '../components/AppIcon';
import { PageHeader } from '../components/PageHeader';
import { SegmentedControl } from '../components/SegmentedControl';

type NewSessionPageProps = {
  onStart?: () => void;
};

export function NewSessionPage({ onStart }: NewSessionPageProps) {
  return (
    <div className="session-setup-page">
      <PageHeader
        title="New Session"
        subtitle="Configure your training environment before calibration."
        compact
      />

      <form className="session-setup" onSubmit={(event) => { event.preventDefault(); onStart?.(); }}>
        <div className="session-setup__intro">
          <div>
            <span className="eyebrow">Session setup</span>
            <h2>Build your analysis profile</h2>
          </div>
          <span className="session-setup__count">4 settings</span>
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
              options={[
                { label: 'Right hand', value: 'right', checked: true, description: 'Bow held left' },
                { label: 'Left hand', value: 'left', description: 'Bow held right' },
              ]}
            />
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
