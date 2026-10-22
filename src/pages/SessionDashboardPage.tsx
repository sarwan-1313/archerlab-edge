import { AppIcon } from '../components/AppIcon';
import { ActionButton } from '../components/ActionButton';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { GESTURE_CONFIG } from '../gesture-entry/config';
import { SHOT_CONFIG } from '../shot-analysis/config';
import type { ShotAnalysis } from '../types/shotAnalysis';

const ARROWS_PER_END = 6;

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

/** Ring colour for a score, matching a World Archery target face. */
function scoreTone(score: number | undefined): string {
  if (score === undefined) return 'none';
  if (score >= 9) return 'gold';
  if (score >= 7) return 'red';
  if (score >= 5) return 'blue';
  if (score >= 3) return 'black';
  return 'white';
}

function scoreLabel(shot: ShotAnalysis): string {
  if (!shot.actualResult) return '–';
  if (shot.actualResult.isX) return 'X';
  return shot.actualResult.score === 0 ? 'M' : String(shot.actualResult.score);
}

type TrendMetric = { label: string; unit: string; lowerIsBetter: boolean; select: (shot: ShotAnalysis) => number | null };

const TREND_METRICS: TrendMetric[] = [
  { label: 'Hold shoulder variation', unit: '°', lowerIsBetter: true, select: (shot) => shot.summary.holdShoulderVariationDeg.value },
  { label: 'Bow-hand motion before release', unit: '% SW', lowerIsBetter: true, select: (shot) => shot.summary.bowHandMotionBeforeRelease.value },
  { label: 'Head motion before release', unit: '% SW', lowerIsBetter: true, select: (shot) => shot.summary.headMotionBeforeRelease.value },
  { label: 'Release shoulder delta', unit: '°', lowerIsBetter: true, select: (shot) => shot.releaseMetrics.shoulder.delta.value },
];

function TrendChart({ shots, metric, selectedShotId, onSelectShot }: { shots: ShotAnalysis[]; metric: TrendMetric; selectedShotId?: string; onSelectShot?: (id: string) => void }) {
  const values = shots.map((shot) => {
    const value = metric.select(shot);
    return value === null || !Number.isFinite(value) ? null : Math.abs(value);
  });
  const valid = values.filter((value): value is number => value !== null);
  const max = Math.max(...valid, 0.0001) * 1.15;
  const mean = average(valid);
  const width = 100 / Math.max(shots.length, 1);
  return (
    <figure className="trend-chart">
      <figcaption>
        <span>{metric.label}</span>
        <strong>{mean === null ? '--' : mean.toFixed(1)}<small>{metric.unit} avg</small></strong>
      </figcaption>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={`${metric.label} for each arrow`}>
        {mean !== null ? <line x1="0" x2="100" y1={40 - (mean / max) * 40} y2={40 - (mean / max) * 40} className="trend-chart__mean" /> : null}
        {values.map((value, index) => {
          const shot = shots[index];
          const height = value === null ? 0 : Math.max(1.2, (value / max) * 40);
          return (
            <rect
              key={shot.id}
              x={index * width + width * 0.18}
              width={width * 0.64}
              y={40 - height}
              height={height}
              className={`trend-chart__bar trend-chart__bar--${scoreTone(shot.actualResult?.score)} ${shot.id === selectedShotId ? 'is-selected' : ''}`}
              onClick={() => onSelectShot?.(shot.id)}
            />
          );
        })}
      </svg>
      <div className="trend-chart__axis" aria-hidden="true">
        <span>Arrow 1</span><span>{metric.lowerIsBetter ? 'Lower is steadier' : ''}</span><span>{shots.length}</span>
      </div>
    </figure>
  );
}

function TargetGroup({ shots, selectedShotId }: { shots: ShotAnalysis[]; selectedShotId?: string }) {
  const placed = shots.flatMap((shot, index) => {
    const result = shot.actualResult;
    if (!result || typeof result.targetX !== 'number' || typeof result.targetY !== 'number') return [];
    return [{ id: shot.id, index, x: result.targetX, y: result.targetY }];
  });
  const rings = [
    { r: 100, tone: 'white' }, { r: 80, tone: 'black' }, { r: 60, tone: 'blue' }, { r: 40, tone: 'red' }, { r: 20, tone: 'gold' },
  ];
  const centre = placed.length ? { x: average(placed.map((p) => p.x))!, y: average(placed.map((p) => p.y))! } : null;
  return (
    <div className="target-group">
      <svg viewBox="-110 -110 220 220" role="img" aria-label={placed.length ? `Arrow group: ${placed.length} arrows plotted on the target` : 'Target face with no plotted arrows'}>
        {rings.map((ring) => (
          <g key={ring.r}>
            <circle r={ring.r} className={`target-group__ring target-group__ring--${ring.tone}`} />
            <circle r={ring.r - 10} className={`target-group__ring target-group__ring--${ring.tone} target-group__ring--inner`} />
          </g>
        ))}
        <circle r="5" className="target-group__x" />
        <line x1="-6" x2="6" y1="0" y2="0" className="target-group__cross" />
        <line y1="-6" y2="6" x1="0" x2="0" className="target-group__cross" />
        {centre ? <circle cx={centre.x * 100} cy={centre.y * 100} r="9" className="target-group__centre" /> : null}
        {placed.map((point) => (
          <g key={point.id} className={`target-group__arrow ${point.id === selectedShotId ? 'is-selected' : ''}`} transform={`translate(${point.x * 100} ${point.y * 100})`}>
            <circle r={point.id === selectedShotId ? 6 : 4.4} />
            <text y="-8" textAnchor="middle">{point.index + 1}</text>
          </g>
        ))}
      </svg>
      {placed.length === 0 ? <p>Arrow positions appear here when results are entered on the target.</p> : null}
    </div>
  );
}

type SessionDashboardPageProps = {
  shots: ShotAnalysis[];
  selectedShotId?: string;
  onSelectShot?: (shotId: string) => void;
  onStart?: () => void;
  onSample?: () => void;
  onClearSample?: () => void;
};

export function SessionDashboardPage({ shots, selectedShotId, onSelectShot, onStart, onSample, onClearSample }: SessionDashboardPageProps) {
  const scored = shots.filter((shot) => shot.actualResult);
  const gestureCount = scored.filter((shot) => shot.actualResult?.source === 'gesture').length;
  const manualCount = scored.length - gestureCount;
  const scores = scored.map((shot) => shot.actualResult!.score);
  const totalScore = scores.reduce((sum, score) => sum + score, 0);
  const maxScore = scored.length * 10;
  const scoreCoverage = shots.length ? Math.round((scored.length / shots.length) * 100) : 0;
  const tens = scores.filter((score) => score === 10).length;
  const xs = scored.filter((shot) => shot.actualResult?.isX).length;
  const misses = scores.filter((score) => score === 0).length;
  const shoulderValues = metricValues(shots, (shot) => shot.summary.holdShoulderVariationDeg.value);
  const shoulder = averageWhenSufficient(shoulderValues);
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
  const ends = Array.from({ length: Math.ceil(shots.length / ARROWS_PER_END) }, (_, end) => shots.slice(end * ARROWS_PER_END, end * ARROWS_PER_END + ARROWS_PER_END));
  const bestShot = scored.reduce<ShotAnalysis | undefined>((best, shot) => (!best || shot.actualResult!.score > best.actualResult!.score ? shot : best), undefined);

  if (shots.length === 0) {
    return (
      <div className="page-container page-container--wide analytics-page">
        <PageHeader title="Performance Analytics" subtitle="Review shot quality, biomechanics consistency, and athlete-reported results." actions={<StatusBadge label="No session data" tone="info" compact />} />
        <section className="empty-state analytics-empty-state">
          <span className="empty-state__icon"><AppIcon name="grid" size={28} /></span>
          <span className="eyebrow">Analytics workspace</span>
          <h2>No performance data yet</h2>
          <p>Capture at least two shots in Live Analysis to begin comparing movement consistency and reported scores.</p>
          <div className="analytics-empty-state__actions">
            <ActionButton onClick={onStart}>Start Analysis<AppIcon name="arrow-right" size={16} /></ActionButton>
            {onSample ? <ActionButton variant="secondary" onClick={onSample}>Explore a sample session</ActionButton> : null}
          </div>
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

      {onClearSample ? (
        <aside className="sample-banner" aria-label="Sample session notice">
          <span className="sample-banner__tag">Sample</span>
          <p><strong>You are viewing a sample session.</strong> The numbers come from the real analysis engine, run on synthetic movement of a 12-arrow round.</p>
          <div>
            {onStart ? <ActionButton onClick={onStart}>Start your own</ActionButton> : null}
            <ActionButton variant="ghost" onClick={onClearSample}>Clear sample</ActionButton>
          </div>
        </aside>
      ) : null}

      <section className="scoreboard" aria-label="Score summary">
        <div className="scoreboard__total">
          <span>Total score</span>
          <strong>{scored.length ? totalScore : '--'}</strong>
          <small>{scored.length ? `of ${maxScore} · ${scored.length} arrows reported` : 'No results entered yet'}</small>
        </div>
        <div className="scoreboard__stats">
          <div><span>Average</span><strong>{scored.length ? (totalScore / scored.length).toFixed(1) : '--'}</strong><small>per arrow</small></div>
          <div><span>10s / Xs / misses</span><strong>{tens} / {xs} / {misses}</strong><small>Score distribution</small></div>
          <div><span>Best arrow</span><strong>{bestShot ? scoreLabel(bestShot) : '--'}</strong><small>{bestShot ? `Arrow ${shots.indexOf(bestShot) + 1}` : 'Waiting for results'}</small></div>
          <div><span>Score coverage</span><strong>{scoreCoverage}%</strong><small>{gestureCount} gesture · {manualCount} manual</small></div>
        </div>
      </section>

      <div className="analytics-row">
        <section className="scorecard" aria-labelledby="scorecard-title">
          <div className="section-heading">
            <div><span className="eyebrow">Scorecard</span><h2 id="scorecard-title">Ends of {ARROWS_PER_END}</h2></div>
            <span>Select an arrow to review it</span>
          </div>
          <div className="scorecard__ends">
            {ends.map((end, endIndex) => {
              const endScores = end.flatMap((shot) => shot.actualResult ? [shot.actualResult.score] : []);
              return (
                <div className="scorecard__end" key={endIndex}>
                  <span className="scorecard__end-label">End {endIndex + 1}</span>
                  <div className="scorecard__arrows">
                    {end.map((shot) => {
                      const index = shots.indexOf(shot);
                      return (
                        <button
                          type="button"
                          key={shot.id}
                          className={`score-chip score-chip--${scoreTone(shot.actualResult?.score)} ${selectedShotId === shot.id ? 'is-selected' : ''}`}
                          onClick={() => onSelectShot?.(shot.id)}
                          aria-label={`Arrow ${index + 1}: ${shot.actualResult ? `scored ${scoreLabel(shot)}` : 'no score entered'}`}
                        >
                          {scoreLabel(shot)}
                        </button>
                      );
                    })}
                  </div>
                  <strong className="scorecard__end-total">{endScores.length ? endScores.reduce((a, b) => a + b, 0) : '–'}</strong>
                </div>
              );
            })}
          </div>
          <div className="form-tiles">
            <div><span>Avg hold shoulder</span><strong>{shoulder === null ? '--' : `${shoulder.toFixed(1)}°`}</strong><small>{shoulder === null ? 'Needs 2 valid shots' : 'Across valid captures'}</small></div>
            <div><span>Avg bow-hand motion</span><strong>{bow === null ? '--' : bow.toFixed(1)}<em>{bow === null ? '' : '% SW'}</em></strong><small>{bow === null ? 'Needs 2 valid shots' : 'Pre-release window'}</small></div>
            <div><span>Avg head motion</span><strong>{head === null ? '--' : head.toFixed(1)}<em>{head === null ? '' : '% SW'}</em></strong><small>{head === null ? 'Needs 2 valid shots' : 'Pre-release window'}</small></div>
          </div>
        </section>

        <section className="group-panel" aria-labelledby="group-title">
          <div className="section-heading">
            <div><span className="eyebrow">Group</span><h2 id="group-title">Where arrows landed</h2></div>
          </div>
          <TargetGroup shots={shots} selectedShotId={selectedShotId} />
        </section>
      </div>

      <section className="trend-panel" aria-labelledby="trend-title">
        <div className="section-heading">
          <div><span className="eyebrow">Form across the session</span><h2 id="trend-title">Arrow by arrow</h2></div>
          <span className="trend-legend"><i className="trend-legend__gold" />9–10 <i className="trend-legend__red" />7–8 <i className="trend-legend__blue" />5–6 <i className="trend-legend__none" />No score</span>
        </div>
        <div className="trend-grid">
          {TREND_METRICS.map((metric) => <TrendChart key={metric.label} shots={shots} metric={metric} selectedShotId={selectedShotId} onSelectShot={onSelectShot} />)}
        </div>
      </section>

      <div className="analytics-content-grid">
        <section className="dashboard-shot-list">
          <div className="section-heading">
            <div><span className="eyebrow">Shot history</span><h2>Arrow log</h2></div>
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
                <strong data-label="Score" className={`analytics-score analytics-score--${scoreTone(shot.actualResult?.score)}`}>{shot.actualResult ? shot.actualResult.isX ? 'X' : shot.actualResult.score : '--'}</strong>
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
              <div><span className="eyebrow">Descriptive comparison</span><h2>Form vs. result</h2></div>
              <StatusBadge label={correlationReady ? 'Ready' : 'More data needed'} tone={correlationReady ? 'success' : 'warning'} compact />
            </div>
            {correlationReady ? (
              <div className="score-comparison-grid">
                <article className="is-high"><span>Scores 9–10</span><strong>{highShoulder!.toFixed(1)}°</strong><small>Shoulder variation · {highBow!.toFixed(1)} % SW bow-hand motion</small></article>
                <article className="is-low"><span>Scores 7 and below</span><strong>{lowShoulder!.toFixed(1)}°</strong><small>Shoulder variation · {lowBow!.toFixed(1)} % SW bow-hand motion</small></article>
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
