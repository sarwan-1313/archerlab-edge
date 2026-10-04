import { useEffect, useState } from 'react';
import type { ReportedShotResult, ScoreEntryMethod } from '../../types/gestureScore';
import type { BiomechanicsMetric } from '../../types/biomechanics';
import type { ShotAnalysis } from '../../types/shotAnalysis';
import { AppIcon } from '../AppIcon';
import { StatusBadge } from '../StatusBadge';

const SCORE_OPTIONS = ['X', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1', 'M'] as const;

function metricValue(metric: BiomechanicsMetric): string {
  if (!metric.available || metric.value === null) return '--';
  return `${metric.value.toFixed(1)} ${metric.unit}`;
}

export function ShotReviewPanel({ shot, shotNumber, scoreEntryMethod, gestureActive, manualEntryRequested = false, onScore, onContinue }: {
  shot: ShotAnalysis;
  shotNumber: number;
  scoreEntryMethod: ScoreEntryMethod;
  gestureActive: boolean;
  manualEntryRequested?: boolean;
  onScore: (result: ReportedShotResult) => void;
  onContinue: () => void;
}) {
  const [manualEntry, setManualEntry] = useState(scoreEntryMethod === 'manual-only');
  const [manualCandidate, setManualCandidate] = useState<string>();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setManualEntry(scoreEntryMethod === 'manual-only');
    setManualCandidate(undefined);
    setExpanded(false);
  }, [scoreEntryMethod, shot.id]);

  useEffect(() => {
    if (manualEntryRequested) setManualEntry(true);
  }, [manualEntryRequested]);

  const confirmManualScore = () => {
    if (!manualCandidate) return;
    onScore({
      score: manualCandidate === 'X' ? 10 : manualCandidate === 'M' ? 0 : Number(manualCandidate),
      isX: manualCandidate === 'X',
      source: 'manual-score',
      capturedAt: Date.now(),
    });
    setManualEntry(false);
  };

  return (
    <section className="shot-review-panel" aria-live="polite">
      <header>
        <div><span className="eyebrow">Shot #{String(shotNumber).padStart(2, '0')}</span><h2>Shot Recorded</h2><p>The complete shot cycle was captured from the existing analyzer.</p></div>
        <div className="shot-review-panel__score"><span>Score</span><strong>{shot.actualResult ? shot.actualResult.isX ? 'X' : shot.actualResult.score : '--'}</strong></div>
      </header>

      <div className="shot-review-panel__metrics">
        <div><span>Data quality</span><strong>{shot.dataQuality.label}</strong></div>
        <div><span>Hold stability</span><strong>{metricValue(shot.summary.holdShoulderVariationDeg)}</strong></div>
        <div><span>Alignment change</span><strong>{metricValue(shot.summary.releaseShoulderDeltaDeg)}</strong></div>
        <div><span>Follow-through</span><strong>{metricValue(shot.summary.followThroughShoulderVariationDeg)}</strong></div>
      </div>

      {(manualEntry || (!shot.actualResult && scoreEntryMethod !== 'none')) ? (
        <div className="shot-review-panel__scoring">
          <div>
            <span className="eyebrow">Record score</span>
            <strong>{manualEntry ? 'Choose the athlete-reported result' : gestureActive ? 'Show your score to the camera' : 'Score entry is ready'}</strong>
            <p>{manualEntry ? 'Select a value, then confirm it.' : 'Gesture scoring remains active, with manual entry available as a fallback.'}</p>
          </div>
          {!manualEntry ? <button type="button" className="button button--secondary" onClick={() => setManualEntry(true)}>Enter Manually</button> : null}
          {manualEntry ? (
            <div className="quick-score-entry">
              <div>{SCORE_OPTIONS.map((score) => <button type="button" key={score} aria-pressed={manualCandidate === score} className={manualCandidate === score ? 'is-selected' : ''} onClick={() => setManualCandidate(score)}>{score}</button>)}</div>
              <button type="button" className="button button--primary" disabled={!manualCandidate} onClick={confirmManualScore}>Confirm Score</button>
            </div>
          ) : null}
        </div>
      ) : null}

      {shot.actualResult && !manualEntry ? (
        <div className="shot-review-panel__result"><StatusBadge label={`${shot.actualResult.source} score`} tone="success" compact /><span>Recorded as <strong>{shot.actualResult.isX ? 'X' : shot.actualResult.score}</strong></span><button type="button" onClick={() => { setManualCandidate(shot.actualResult?.isX ? 'X' : shot.actualResult?.score === 0 ? 'M' : String(shot.actualResult?.score)); setManualEntry(true); }}>Edit Score</button></div>
      ) : null}

      {expanded ? (
        <div className="shot-review-panel__details">
          <div><span>Shot phases</span><strong>{shot.phases.map((phase) => phase.phase.replace('-', ' ')).join(' · ')}</strong></div>
          <div><span>Pose confidence</span><strong>{Math.round(shot.dataQuality.averagePoseConfidence * 100)}%</strong></div>
          <div><span>Usable frames</span><strong>{Math.round(shot.dataQuality.usableFrameRatio * 100)}%</strong></div>
          <div><span>Tracking loss</span><strong>{Math.round(shot.dataQuality.trackingLossMs)} ms</strong></div>
        </div>
      ) : null}

      <footer>
        <button type="button" className="button button--secondary" onClick={() => setExpanded((value) => !value)}>{expanded ? 'Hide Details' : 'Review Details'}</button>
        <button type="button" className="button button--primary" onClick={onContinue}>Continue Session<AppIcon name="arrow-right" size={16} /></button>
      </footer>
    </section>
  );
}
