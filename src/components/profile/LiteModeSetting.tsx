import { useEffect, useState } from 'react';
import { assessThisDevice, dismissLiteSuggestion, readLiteChoice, shouldSuggestLite, useLiteMode, useLiteSuggestionDismissed, writeLiteMode, type DeviceAssessment } from '../../settings/liteMode';
import { ActionButton } from '../ActionButton';

const LITE_SUMMARY = 'Lite pose model only, the Fast precision preset, a smaller analysis frame, no 3D view and fewer animations.';

/** The device check runs after the first paint, as its timing test blocks the main thread briefly. */
function useDeviceAssessment(): DeviceAssessment | null {
  const [assessment, setAssessment] = useState<DeviceAssessment | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setAssessment(assessThisDevice()), 300);
    return () => window.clearTimeout(timer);
  }, []);
  return assessment;
}

/** The "Lite mode" switch on the Profile page. */
export function LiteModeSetting() {
  const on = useLiteMode();
  const assessment = useDeviceAssessment();
  return (
    <section className="profile-card coach-tools-setting" aria-labelledby="lite-mode-title">
      <h2 id="lite-mode-title">Lite mode</h2>
      <label className="coach-tools-setting__toggle">
        <input type="checkbox" checked={on} onChange={(event) => writeLiteMode(event.target.checked)} />
        <span>Use Lite mode</span>
      </label>
      <p className="muted">For older or low-memory phones: {LITE_SUMMARY} Video analysis is a little less precise. This setting stays on this device.</p>
      {assessment?.lowEnd ? <p className="muted">This device looks low-end ({assessment.reasons.join(', ')}), so Lite mode is recommended.</p> : null}
    </section>
  );
}

/** A one-time suggestion to turn Lite mode on, shown only on a device that looks low-end until the athlete chooses. */
export function LiteModeSuggestion() {
  const on = useLiteMode();
  const dismissed = useLiteSuggestionDismissed();
  const assessment = useDeviceAssessment();
  if (on || !assessment || !shouldSuggestLite(assessment, readLiteChoice(), dismissed)) return null;
  return (
    <div className="va-callout va-callout--info lite-suggestion" role="status">
      <p><strong>This device looks low-end</strong> ({assessment.reasons.join(', ')}). Lite mode keeps analysis from running out of memory: {LITE_SUMMARY}</p>
      <div className="lite-suggestion__actions">
        <ActionButton variant="primary" type="button" onClick={() => writeLiteMode(true)}>Turn on Lite mode</ActionButton>
        <ActionButton variant="ghost" type="button" onClick={dismissLiteSuggestion}>Not now</ActionButton>
      </div>
      <small>You can change this any time on the Profile page.</small>
    </div>
  );
}
