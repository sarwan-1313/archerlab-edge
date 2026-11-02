import { useState } from 'react';
import { CATEGORY_INFO, CATEGORY_ORDER } from '../../video-analysis/rubric';
import { LEVEL_LABEL } from '../../video-analysis/scoring';
import type { CategoryId, ReportLabels, ShotLabel, SkillLevel, VideoAnalysisReport } from '../../video-analysis/types';
import { initialLabels, stepRelease } from '../../video-analysis/validation/labels';
import { ActionButton } from '../ActionButton';
import { AppIcon } from '../AppIcon';
import { StatusBadge } from '../StatusBadge';

type LabelPanelProps = {
  report: VideoAnalysisReport;
  /** The replay's current time, for adding a shot the engine missed. */
  currentTime: () => number;
  onSeek: (t: number) => void;
  onSave: (labels: ReportLabels) => void;
  onExportFixture: (labels: ReportLabels) => void;
};

const STATUS_LABEL: Record<ShotLabel['status'], string> = { shot: 'Shot', false: 'Not a shot', 'let-down': 'Let-down' };
const LEVELS: SkillLevel[] = ['beginner', 'intermediate', 'advanced', 'elite'];

/**
 * Coach tools → "Label this clip": correct each release frame by frame, mark false and missed shots and
 * let-downs, rate each area 1–5 per shot and give a level. The labels are saved with the report and can be
 * exported as a fixture (landmarks and labels, no video) for npm run validate:fixtures. See docs/validation.md.
 */
export function LabelPanel({ report, currentTime, onSeek, onSave, onExportFixture }: LabelPanelProps) {
  const [labels, setLabels] = useState<ReportLabels>(() => report.labels ?? initialLabels(report));
  const [dirty, setDirty] = useState(false);
  const fps = report.source.nativeFps ?? report.source.analysisFps ?? 30;

  const change = (next: ReportLabels) => { setLabels(next); setDirty(true); };
  const updateShot = (index: number, shot: ShotLabel) => change({ ...labels, shots: labels.shots.map((item, i) => (i === index ? shot : item)) });
  const rate = (index: number, area: CategoryId, value: string) => {
    const shot = labels.shots[index];
    const ratings = { ...shot.ratings };
    if (value) ratings[area] = Number(value) as 1 | 2 | 3 | 4 | 5;
    else delete ratings[area];
    updateShot(index, { ...shot, ratings });
  };
  const addMissed = () => {
    const release = Number(currentTime().toFixed(3));
    change({ ...labels, shots: [...labels.shots, { engineIndex: null, release, status: 'shot' as const, ratings: {} }].sort((a, b) => a.release - b.release) });
  };
  const removeShot = (index: number) => change({ ...labels, shots: labels.shots.filter((_, i) => i !== index) });
  const save = () => { const stamped = { ...labels, labelledAt: Date.now() }; setLabels(stamped); onSave(stamped); setDirty(false); };

  return (
    <section className="va-panel va-labels" aria-labelledby="va-labels-title">
      <h2 id="va-labels-title">Label this clip <StatusBadge label="Coach tools" tone="info" compact /></h2>
      <p className="va-muted">Record what you see, shot by shot. Step each release to the frame the string leaves, mark anything that was not a shot, add shots the engine missed at the replay's current time, and rate each area from 1 (poor) to 5 (excellent). Labels are saved with this report on this device. <strong>Export as fixture</strong> writes the body landmarks, sound onsets and your labels, never the video.</p>
      <div className="va-table-wrap">
        <table className="va-table va-labels__table">
          <thead>
            <tr><th>#</th><th>Release</th><th>What it was</th>{CATEGORY_ORDER.map((id) => <th key={id} title={CATEGORY_INFO[id].blurb}>{CATEGORY_INFO[id].label}</th>)}<th /></tr>
          </thead>
          <tbody>
            {labels.shots.map((shot, index) => (
              <tr key={`${shot.engineIndex ?? 'added'}-${index}`} className={shot.status === 'shot' ? undefined : 'va-labels__not-shot'}>
                <td>{shot.engineIndex ?? <span title="Added: the engine missed this shot">+</span>}</td>
                <td>
                  <div className="va-labels__release">
                    <button type="button" aria-label={`Shot ${index + 1}: release one frame earlier`} onClick={() => { const next = stepRelease(shot, -1, fps); updateShot(index, next); onSeek(next.release); }}>−1f</button>
                    <button type="button" className="va-link-button" onClick={() => onSeek(shot.release)} aria-label={`Show the release of shot ${index + 1}`}>{shot.release.toFixed(3)} s</button>
                    <button type="button" aria-label={`Shot ${index + 1}: release one frame later`} onClick={() => { const next = stepRelease(shot, 1, fps); updateShot(index, next); onSeek(next.release); }}>+1f</button>
                  </div>
                </td>
                <td>
                  <select aria-label={`What shot ${index + 1} was`} value={shot.status} onChange={(event) => updateShot(index, { ...shot, status: event.target.value as ShotLabel['status'] })}>
                    {(Object.keys(STATUS_LABEL) as ShotLabel['status'][]).map((status) => <option key={status} value={status}>{STATUS_LABEL[status]}</option>)}
                  </select>
                </td>
                {CATEGORY_ORDER.map((area) => (
                  <td key={area}>
                    <select aria-label={`Shot ${index + 1}: ${CATEGORY_INFO[area].label} rating`} value={shot.ratings[area] ?? ''} disabled={shot.status !== 'shot'} onChange={(event) => rate(index, area, event.target.value)}>
                      <option value="">–</option>
                      {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </td>
                ))}
                <td>{shot.engineIndex === null ? <button type="button" className="va-link-button" onClick={() => removeShot(index)}>Remove</button> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="va-labels__footer">
        <ActionButton variant="secondary" type="button" onClick={addMissed}><AppIcon name="plus" size={16} /> Add a missed shot here</ActionButton>
        <label className="va-labels__level">
          <span>Overall level</span>
          <select aria-label="Overall level" value={labels.level ?? ''} onChange={(event) => change({ ...labels, level: (event.target.value || null) as SkillLevel | null })}>
            <option value="">Not rated</option>
            {LEVELS.map((level) => <option key={level} value={level}>{LEVEL_LABEL[level]}</option>)}
          </select>
        </label>
      </div>
      <div className="va-actions">
        <ActionButton type="button" onClick={save} disabled={!dirty}><AppIcon name="check" size={16} /> {dirty ? 'Save labels' : 'Labels saved'}</ActionButton>
        <ActionButton variant="secondary" type="button" onClick={() => onExportFixture(labels)}><AppIcon name="download" size={16} /> Export as fixture</ActionButton>
      </div>
      <p className="va-faint">A fixture holds the body landmarks of the person in the clip. Export only clips of yourself, or of an archer who agreed (and a parent or guardian for under-18s). See docs/validation.md.</p>
    </section>
  );
}
