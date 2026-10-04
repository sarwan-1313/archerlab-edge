import { useMemo, useState } from 'react';
import type { ShotAnalysis } from '../../types/shotAnalysis';
import { ActionButton } from '../ActionButton';
import { AppIcon } from '../AppIcon';
import { PageHeader } from '../PageHeader';
import { StatusBadge } from '../StatusBadge';

function formatDuration(durationMs: number): string {
  const seconds = Math.max(0, Math.round(durationMs / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function SessionSummary({ shots, durationMs, saveError, onViewSession, onViewAnalytics, onStartNew, onHome }: {
  shots: ShotAnalysis[];
  durationMs: number;
  saveError?: string;
  onViewSession: () => void;
  onViewAnalytics: () => void;
  onStartNew: () => void;
  onHome: () => void;
}) {
  const [selectedShotId, setSelectedShotId] = useState(shots.at(-1)?.id);
  const selectedShot = shots.find((shot) => shot.id === selectedShotId);
  const scored = useMemo(() => shots.filter((shot) => shot.actualResult), [shots]);
  const scoreValues = scored.map((shot) => shot.actualResult!.score);
  const averageScore = scoreValues.length ? scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length : null;
  const bestScore = scoreValues.length ? Math.max(...scoreValues) : null;

  return (
    <div className="session-summary-page motion-section-enter">
      <PageHeader title="Session Complete" subtitle="Your completed shots and available session data are ready to review." actions={<StatusBadge label={saveError ? 'Save needs attention' : 'Saved locally'} tone={saveError ? 'warning' : 'success'} compact />} />
      {saveError ? <div className="session-summary-warning"><AppIcon name="sensors" size={18} /><div><strong>Recording save was not completed</strong><span>{saveError} Your captured shots remain available in this summary.</span></div></div> : null}

      <section className="session-summary-cards" aria-label="Session summary">
        <article><span>Total shots</span><strong>{shots.length}</strong><small>Completed captures</small></article>
        {averageScore !== null ? <article><span>Average score</span><strong>{averageScore.toFixed(1)}</strong><small>{scored.length} reported results</small></article> : null}
        {durationMs > 0 ? <article><span>Session duration</span><strong>{formatDuration(durationMs)}</strong><small>Recorded training time</small></article> : null}
        {bestScore !== null ? <article><span>Best score</span><strong>{bestScore}</strong><small>{scored.some((shot) => shot.actualResult?.isX) ? 'Includes an X result' : 'Athlete reported'}</small></article> : null}
      </section>

      <div className="session-summary-layout">
        <section className="session-summary-shots">
          <div className="section-heading"><div><span className="eyebrow">Shot timeline</span><h2>Review individual shots</h2></div><span>{shots.length} captured</span></div>
          {shots.length ? shots.map((shot, index) => (
            <button type="button" key={shot.id} className={selectedShotId === shot.id ? 'is-selected' : ''} aria-pressed={selectedShotId === shot.id} onClick={() => setSelectedShotId(shot.id)}>
              <span>#{String(index + 1).padStart(2, '0')}</span>
              <strong>{shot.actualResult ? shot.actualResult.isX ? 'X' : shot.actualResult.score : '--'}</strong>
              <span>{shot.dataQuality.label} quality</span>
              <AppIcon name="arrow-right" size={15} />
            </button>
          )) : <div className="analytics-feedback"><AppIcon name="target" size={18} /><div><strong>No shots were captured</strong><span>Start another session when you are ready.</span></div></div>}
        </section>

        <section className="session-summary-detail">
          <div className="section-heading"><div><span className="eyebrow">Selected capture</span><h2>{selectedShot ? `Shot #${shots.findIndex((shot) => shot.id === selectedShot.id) + 1}` : 'No shot selected'}</h2></div>{selectedShot ? <StatusBadge label={selectedShot.dataQuality.label} tone={selectedShot.dataQuality.label === 'Good' ? 'success' : 'warning'} compact /> : null}</div>
          {selectedShot ? <div key={selectedShot.id} className="session-summary-detail__grid motion-tab-panel">
            <div><span>Score</span><strong>{selectedShot.actualResult ? selectedShot.actualResult.isX ? 'X' : selectedShot.actualResult.score : 'Not entered'}</strong></div>
            <div><span>Captured</span><strong>{new Date(selectedShot.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</strong></div>
            <div><span>Hold stability</span><strong>{selectedShot.summary.holdShoulderVariationDeg.available ? `${selectedShot.summary.holdShoulderVariationDeg.value!.toFixed(1)}°` : '--'}</strong></div>
            <div><span>Release alignment</span><strong>{selectedShot.summary.releaseShoulderDeltaDeg.available ? `${selectedShot.summary.releaseShoulderDeltaDeg.value!.toFixed(1)}°` : '--'}</strong></div>
          </div> : <p className="session-summary-detail__empty">Captured biomechanics will appear here when a shot is selected.</p>}
        </section>
      </div>

      <section className="session-summary-actions">
        <div><span className="eyebrow">Next step</span><h2>Continue your training review</h2></div>
        <div>{!saveError ? <ActionButton variant="secondary" onClick={onViewSession}>View Full Session</ActionButton> : null}<ActionButton variant="secondary" onClick={onViewAnalytics}>View Analytics</ActionButton><ActionButton variant="secondary" onClick={onHome}>Return Home</ActionButton><ActionButton onClick={onStartNew}>Start New Session<AppIcon name="arrow-right" size={16} /></ActionButton></div>
      </section>
    </div>
  );
}
