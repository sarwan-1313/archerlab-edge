import { useCoachTools, writeCoachTools } from '../../settings/coachTools';

/** The "Coach tools" switch on the Profile page. */
export function CoachToolsSetting({ onDatasetTools }: { onDatasetTools?: () => void } = {}) {
  const on = useCoachTools();
  return (
    <section className="profile-card coach-tools-setting" aria-labelledby="coach-tools-title">
      <h2 id="coach-tools-title">Coach tools</h2>
      <label className="coach-tools-setting__toggle">
        <input type="checkbox" checked={on} onChange={(event) => writeCoachTools(event.target.checked)} />
        <span>Show coach tools</span>
      </label>
      <p className="muted">For coaches and for checking the scores: label a video report with what you see (release times, missed and false shots, a 1–5 rating per area and a level) and export it as a test fixture without the video. Off by default; this setting stays on this device.</p>
      {on && onDatasetTools ? <p className="muted">Building a bow detection dataset from your own footage? <button type="button" className="privacy-link" onClick={onDatasetTools}>Dataset tools</button></p> : null}
    </section>
  );
}
