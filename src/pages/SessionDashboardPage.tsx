import { MetricCard } from '../components/MetricCard';
import { AppIcon } from '../components/AppIcon';
import { ActionButton } from '../components/ActionButton';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { GESTURE_CONFIG } from '../gesture-entry/config';
import { SHOT_CONFIG } from '../shot-analysis/config';
import type { ShotAnalysis } from '../types/shotAnalysis';

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function metricValues(shots: ShotAnalysis[], select: (shot: ShotAnalysis) => number | null): number[] {
  return shots.flatMap((shot) => {
    const value = select(shot);
    return value === null || !Number.isFinite(value) ? [] : [value];
  });
}

function averageWhenSufficient(values: number[]): number | null {
  return values.length >= SHOT_CONFIG.sessionMinimumShots ? average(values) : null;
}

function sampleStandardDeviation(values: number[]): number | null {
  if (values.length < SHOT_CONFIG.sessionMinimumShots) return null;
  const mean = average(values)!;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}

export function SessionDashboardPage({ shots, selectedShotId, onSelectShot, onStart }: { shots: ShotAnalysis[]; selectedShotId?: string; onSelectShot?: (shotId: string) => void; onStart?: () => void }) {
  const scored = shots.filter((shot) => shot.actualResult);
  const gestureCount = scored.filter((shot) => shot.actualResult?.source === 'gesture').length;
  const manualCount = scored.length - gestureCount;
  const scores = scored.map((shot) => shot.actualResult!.score);
  const totalScore = scores.reduce((sum, score) => sum + score, 0);
  const scoreCoverage = shots.length ? Math.round((scored.length / shots.length) * 100) : 0;
  const shoulder = averageWhenSufficient(metricValues(shots, (shot) => shot.summary.holdShoulderVariationDeg.value));
  const bow = averageWhenSufficient(metricValues(shots, (shot) => shot.summary.bowHandMotionBeforeRelease.value));
  const head = averageWhenSufficient(metricValues(shots, (shot) => shot.summary.headMotionBeforeRelease.value));
  const variability = [
    { label: 'Release shoulder delta', unit: '°', values: metricValues(shots, (shot) => shot.releaseMetrics.shoulder.delta.value) },
    { label: 'Bow arm before release', unit: '°', values: metricValues(shots, (shot) => shot.releaseMetrics.bowArm.before.value) },
    { label: 'Head displacement', unit: '% SW', values: metricValues(shots, (shot) => shot.releaseMetrics.headDisplacement.value) },
    { label: 'Bow-hand displacement', unit: '% SW', values: metricValues(shots, (shot) => shot.releaseMetrics.bowHandDisplacement.value) },
  ];
  const highScores = scored.filter((shot) => shot.actualResult!.score >= 9);
  const lowerScores = scored.filter((shot) => shot.actualResult!.score <= 7);
  const groupMetric = (group: ShotAnalysis[], select: (shot: ShotAnalysis) => number | null) => averageWhenSufficient(metricValues(group, select));
  const highShoulder = groupMetric(highScores, (shot) => shot.summary.holdShoulderVariationDeg.value);
  const lowShoulder = groupMetric(lowerScores, (shot) => shot.summary.holdShoulderVariationDeg.value);
  const highBow = groupMetric(highScores, (shot) => shot.summary.bowHandMotionBeforeRelease.value);
  const lowBow = groupMetric(lowerScores, (shot) => shot.summary.bowHandMotionBeforeRelease.value);
  const correlationReady = scored.length >= GESTURE_CONFIG.minCorrelationShots && highShoulder !== null && lowShoulder !== null && highBow !== null && lowBow !== null;
  const cards = [
    { label: 'Captured shots', value: String(shots.length), detail: `${scored.length} scored · ${shots.length - scored.length} unscored`, tone: 'primary' as const, icon: 'target' as const },
    { label: 'Score coverage', value: `${scoreCoverage}%`, detail: scored.length === shots.length ? 'All results recorded' : 'Add missing results', tone: scoreCoverage === 100 ? 'primary' as const : 'warning' as const, icon: 'check' as const, progress: scoreCoverage },
    { label: 'Avg hold shoulder', value: shoulder === null ? '--' : `${shoulder.toFixed(1)}°`, detail: shoulder === null ? 'Needs 2 valid shots' : 'Across valid captures', tone: 'secondary' as const, icon: 'sensors' as const },
    { label: 'Avg bow-hand motion', value: bow === null ? '--' : `${bow.toFixed(1)} % SW`, detail: bow === null ? 'Needs 2 valid shots' : 'Pre-release window', tone: 'secondary' as const, icon: 'calibration' as const },
    { label: 'Avg head motion', value: head === null ? '--' : `${head.toFixed(1)} % SW`, detail: head === null ? 'Needs 2 valid shots' : 'Pre-release window', tone: 'neutral' as const, icon: 'accessibility' as const },
  ];

  if (shots.length === 0) {
    return (
      <div className="page-container page-container--wide analytics-page">
        <PageHeader title="Performance Analytics" subtitle="Review shot quality, biomechanics consistency, and athlete-reported results." actions={<StatusBadge label="No session data" tone="info" compact />} />
        <section className="empty-state analytics-empty-state">
          <span className="empty-state__icon"><AppIcon name="grid" size={28} /></span>
          <span className="eyebrow">Analytics workspace</span>
          <h2>No performance data yet</h2>
          <p>Capture at least two shots in Live Analysis to begin comparing movement consistency and reported scores.</p>
          <ActionButton onClick={onStart}>Start Analysis<AppIcon name="arrow-right" size={16} /></ActionButton>
        </section>
      </div>
    );
  }

  return (
    <div className="page-container page-container--wide analytics-page">
      <PageHeader
        title="Performance Analytics"
        subtitle="Review shot quality, biomechanics consistency, and athlete-reported results."
        actions={<StatusBadge label={`${shots.length} captured · ${scored.length} scored`} tone={scoreCoverage === 100 ? 'success' : 'primary'} compact />}
      />

      <section className="analytics-overview" aria-label="Performance overview">
        <div className="section-heading">
          <div><span className="eyebrow">Session overview</span><h2>Performance at a glance</h2></div>
          <span>Latest shot #{String(shots.length).padStart(2, '0')} · {shots.at(-1)?.dataQuality.label ?? 'Unknown'} quality</span>
        </div>
        <div className="metric-grid analytics-metric-grid">
          {cards.map((card) => <MetricCard key={card.label} title={card.label} value={card.value} status={card.detail} tone={card.tone} progress={card.progress} icon={<AppIcon name={card.icon} size={16} />} />)}
        </div>
      </section>

      <section className="analytics-score-strip" aria-label="Score summary">
        <div><span>Total score</span><strong>{scored.length ? totalScore : '--'}</strong><small>{scored.length} reported</small></div>
        <div><span>Average score</span><strong>{scored.length ? (totalScore / scored.length).toFixed(1) : '--'}</strong><small>Reported results</small></div>
        <div><span>10s / Xs / misses</span><strong>{scores.filter((score) => score === 10).length} / {scored.filter((shot) => shot.actualResult?.isX).length} / {scores.filter((score) => score === 0).length}</strong><small>Score distribution</small></div>
        <div><span>Entry sources</span><strong>{gestureCount} / {manualCount}</strong><small>Gesture / manual</small></div>
      </section>

      <div className="analytics-content-grid">
        <section className="dashboard-shot-list">
          <div className="section-heading">
            <div><span className="eyebrow">Shot history</span><h2>Captured events</h2></div>
            <StatusBadge label={`${shots.length} total`} tone="info" compact />
          </div>
          <div className="shot-table-head" aria-hidden="true"><span>Shot</span><span>Score</span><span>Entry</span><span>Quality</span><span>Review</span></div>
          <div className="analytics-shot-rows">
            {shots.map((shot, index) => (
              <button
                type="button"
                key={shot.id}
                onClick={() => onSelectShot?.(shot.id)}
                aria-label={`Review shot ${index + 1}`}
                aria-pressed={selectedShotId === shot.id}
                className={selectedShotId === shot.id ? 'is-selected' : ''}
              >
                <span data-label="Shot">#{String(index + 1).padStart(2, '0')}</span>
                <strong data-label="Score">{shot.actualResult ? shot.actualResult.isX ? 'X' : shot.actualResult.score : '--'}</strong>
                <span data-label="Entry">{shot.actualResult ? shot.actualResult.source === 'gesture' ? 'Gesture' : 'Manual' : 'Not entered'}</span>
                <span data-label="Quality"><i className={`quality-dot quality-dot--${shot.dataQuality.label.toLowerCase()}`} />{shot.dataQuality.label}</span>
                <span className="analytics-shot-row__action">Review<AppIcon name="arrow-right" size={14} /></span>
              </button>
            ))}
          </div>
        </section>

        <div className="analytics-side-stack">
          <section className="shot-correlation">
            <div className="section-heading">
              <div><span className="eyebrow">Consistency</span><h2>Cross-shot variability</h2></div>
            </div>
            <div className="variability-grid">
              {variability.map((item) => {
                const mean = averageWhenSufficient(item.values);
                const sd = sampleStandardDeviation(item.values);
                return (
                  <article key={item.label}>
                    <span>{item.label}</span>
                    <strong>{mean === null ? '--' : `${mean.toFixed(1)} ${item.unit}`}</strong>
                    <small>SD {sd === null ? '--' : `${sd.toFixed(1)} ${item.unit}`} · {item.values.length} shots</small>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="shot-correlation">
            <div className="section-heading">
              <div><span className="eyebrow">Descriptive comparison</span><h2>Biomechanics and result</h2></div>
              <StatusBadge label={correlationReady ? 'Ready' : 'More data needed'} tone={correlationReady ? 'success' : 'warning'} compact />
            </div>
            {correlationReady ? (
              <div className="score-comparison-grid">
                <article><span>Scores 9–10</span><strong>{highShoulder!.toFixed(1)}°</strong><small>Shoulder variation · {highBow!.toFixed(1)} % SW bow-hand motion</small></article>
                <article><span>Scores 7 and below</span><strong>{lowShoulder!.toFixed(1)}°</strong><small>Shoulder variation · {lowBow!.toFixed(1)} % SW bow-hand motion</small></article>
                <p>Descriptive association only; no causal conclusion is implied.</p>
              </div>
            ) : (
              <div className="analytics-feedback"><AppIcon name="grid" size={19} /><div><strong>Keep collecting scored shots</strong><span>High- and lower-score groups each need enough valid captures before a comparison is shown.</span></div></div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
