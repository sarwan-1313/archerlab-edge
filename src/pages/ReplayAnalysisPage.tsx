import { ActionButton } from '../components/ActionButton';
import { AppIcon } from '../components/AppIcon';
import { ShotMetricCard } from '../components/shot/ShotMetricCard';
import { ShotMetricChart } from '../components/shot/ShotMetricChart';
import { ShotTimeline } from '../components/shot/ShotTimeline';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import type { BiomechanicsMetric } from '../types/biomechanics';
import type { ReleaseSource, ShotAnalysis } from '../types/shotAnalysis';

type ReplayAnalysisPageProps = {
  shot?: ShotAnalysis;
  shotNumber: number;
  shotCount?: number;
  onShowShot?: (shotNumber: number) => void;
  onManualEntry?: () => void;
  onUndoScore?: () => void;
};

const RELEASE_SOURCE_LABEL: Record<ReleaseSource, string> = {
  manual: 'Manual',
  'automatic-candidate-confirmed': 'Automatic candidate confirmed',
  'video-detected': 'Detected in uploaded video',
};

function scoreTone(score: number | undefined): string {
  if (score === undefined) return 'none';
  if (score >= 9) return 'gold';
  if (score >= 7) return 'red';
  if (score >= 5) return 'blue';
  if (score >= 3) return 'black';
  return 'white';
}

function degrees(metric: BiomechanicsMetric): string {
  return metric.available && metric.value !== null ? `${metric.value.toFixed(1)}°` : '--';
}

export function ReplayAnalysisPage({ shot, shotNumber, shotCount = 0, onShowShot, onManualEntry, onUndoScore }: ReplayAnalysisPageProps) {
  if (!shot) return <div className="page-container"><PageHeader title="Biomechanics Replay" subtitle="Capture a shot in Live Analysis to create a replay." /></div>;
  const release = shot.releaseMetrics;
  const result = shot.actualResult;
  const scoreText = result ? (result.isX ? 'X' : result.score === 0 ? 'M' : String(result.score)) : '–';
  const comparisons = [
    { label: 'Shoulder line', item: release.shoulder },
    { label: 'Bow arm', item: release.bowArm },
    { label: 'Torso lean', item: release.torso },
  ];

  return (
    <div className="replay-page">
      <PageHeader
        title={`Shot #${shotNumber}`}
        subtitle={`Release source: ${RELEASE_SOURCE_LABEL[shot.releaseSource]}${shot.videoSource ? ` · ${shot.videoSource.fileName}` : ''}`}
        actions={
          <div className="replay-header-actions">
            <StatusBadge label={`Data quality: ${shot.dataQuality.label}`} tone={shot.dataQuality.label === 'Good' ? 'success' : 'warning'} compact />
            {onShowShot && shotCount > 1 ? (
              <div className="replay-stepper" role="group" aria-label="Step between arrows">
                <button type="button" className="icon-button" onClick={() => onShowShot(shotNumber - 1)} disabled={shotNumber <= 1} aria-label="Previous arrow"><AppIcon name="arrow-left" size={18} /></button>
                <span>{shotNumber} / {shotCount}</span>
                <button type="button" className="icon-button" onClick={() => onShowShot(shotNumber + 1)} disabled={shotNumber >= shotCount} aria-label="Next arrow"><AppIcon name="arrow-right" size={18} /></button>
              </div>
            ) : null}
          </div>
        }
      />

      <section className="replay-hero" aria-label="Shot result and data quality">
        <div className="replay-hero__score">
          <span className={`replay-medal replay-medal--${scoreTone(result?.score)}`} aria-hidden="true">{scoreText}</span>
          <div>
            <span className="eyebrow">Athlete reported</span>
            <strong>{result ? (result.isX ? 'X — inner ten' : `${result.score} points`) : 'No result yet'}</strong>
            <small>{result ? `${result.source} entry` : 'Not entered'}</small>
            {shot.notes ?? result?.notes ? <p className="replay-notes"><span className="eyebrow">Notes</span> {shot.notes ?? result?.notes}</p> : null}
            <div className="replay-actions">
              <ActionButton variant={result ? 'secondary' : 'primary'} onClick={onManualEntry}>Add Actual Result</ActionButton>
              {result ? <ActionButton variant="ghost" onClick={onUndoScore}>Undo Score</ActionButton> : null}
            </div>
          </div>
        </div>
        <div className="shot-result-header">
          <div><span>Captured samples</span><strong>{shot.frames.length}</strong></div>
          <div><span>Usable frames</span><strong>{Math.round(shot.dataQuality.usableFrameRatio * 100)}%</strong></div>
          <div><span>Average pose confidence</span><strong>{Math.round(shot.dataQuality.averagePoseConfidence * 100)}%</strong></div>
          <div><span>Tracking loss</span><strong>{Math.round(shot.dataQuality.trackingLossMs)} ms</strong><small>{shot.dataQuality.releaseWindowComplete ? 'Release window complete' : 'Release window incomplete'}</small></div>
        </div>
      </section>

      <section className="replay-section" aria-labelledby="replay-timeline-title">
        <div className="section-heading"><div><span className="eyebrow">Shot cycle</span><h2 id="replay-timeline-title">Hold, release, follow-through</h2></div></div>
        <ShotTimeline shot={shot} />
        <div className="shot-chart-grid">
          <ShotMetricChart shot={shot} field="shoulderLineAngleDeg" label="Shoulder Line Angle" unit="°" />
          <ShotMetricChart shot={shot} field="bowArmElbowAngleDeg" label="Bow Arm Angle" unit="°" />
          <ShotMetricChart shot={shot} field="torsoLeanDeg" label="Torso Lean" unit="°" />
          <ShotMetricChart shot={shot} field="headMotion" label="Head Motion" unit="% SW" />
          <ShotMetricChart shot={shot} field="bowHandMotion" label="Bow-Hand Motion" unit="% SW" />
        </div>
      </section>

      <section className="replay-section" aria-labelledby="replay-release-title">
        <div className="section-heading"><div><span className="eyebrow">Release comparison</span><h2 id="replay-release-title">Before / after / delta</h2></div></div>
        <div className="release-compare">
          {comparisons.map(({ label, item }) => (
            <article key={label}>
              <span>{label}</span>
              <div className="release-compare__values">
                <strong>{degrees(item.before)}</strong>
                <AppIcon name="arrow-right" size={16} />
                <strong>{degrees(item.after)}</strong>
              </div>
              <em className={item.delta.available && item.delta.value !== null && Math.abs(item.delta.value) >= 1 ? 'is-notable' : ''}>
                Δ {item.delta.available && item.delta.value !== null ? `${item.delta.value >= 0 ? '+' : ''}${item.delta.value.toFixed(1)}°` : '--'}
              </em>
            </article>
          ))}
          <article>
            <span>Head displacement</span>
            <div className="release-compare__values"><strong>{release.headDisplacement.available ? `${release.headDisplacement.value!.toFixed(1)}` : '--'}</strong><small>% SW</small></div>
            <em>{release.headDisplacement.available ? 'Across release' : release.headDisplacement.reason ?? 'Unavailable'}</em>
          </article>
          <article>
            <span>Bow-hand displacement</span>
            <div className="release-compare__values"><strong>{release.bowHandDisplacement.available ? `${release.bowHandDisplacement.value!.toFixed(1)}` : '--'}</strong><small>% SW</small></div>
            <em>{release.bowHandDisplacement.available ? 'Across release' : release.bowHandDisplacement.reason ?? 'Unavailable'}</em>
          </article>
        </div>
      </section>

      <section className="replay-section" aria-labelledby="replay-detail-title">
        <div className="section-heading"><div><span className="eyebrow">Stability detail</span><h2 id="replay-detail-title">Hold and follow-through</h2></div></div>
        <div className="shot-summary-grid">
          <ShotMetricCard title="Hold shoulder variation" metric={shot.summary.holdShoulderVariationDeg} />
          <ShotMetricCard title="Hold bow-arm variation" metric={shot.summary.holdBowArmVariationDeg} />
          <ShotMetricCard title="Hold torso variation" metric={shot.summary.holdTorsoVariationDeg} />
          <ShotMetricCard title="Follow-through shoulder variation" metric={release.followThroughShoulderVariation} />
          <ShotMetricCard title="Follow-through torso variation" metric={release.followThroughTorsoVariation} />
          <ShotMetricCard title="Follow-through head motion" metric={release.followThroughHeadMotion} />
          <ShotMetricCard title="Follow-through bow-hand motion" metric={release.followThroughBowHandMotion} />
        </div>
      </section>
    </div>
  );
}
