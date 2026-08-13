import { MetricCard } from '../components/MetricCard';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { GESTURE_CONFIG } from '../gesture-entry/config';
import { SHOT_CONFIG } from '../shot-analysis/config';
import type { ShotAnalysis } from '../types/shotAnalysis';

function average(values: number[]): number | null { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function metricValues(shots: ShotAnalysis[], select: (shot: ShotAnalysis) => number | null): number[] { return shots.flatMap((shot) => { const value = select(shot); return value === null || !Number.isFinite(value) ? [] : [value]; }); }
function averageWhenSufficient(values: number[]): number | null { return values.length >= SHOT_CONFIG.sessionMinimumShots ? average(values) : null; }
function sampleStandardDeviation(values: number[]): number | null {
  if (values.length < SHOT_CONFIG.sessionMinimumShots) return null;
  const mean = average(values)!;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}

export function SessionDashboardPage({ shots, onSelectShot }: { shots: ShotAnalysis[]; onSelectShot?: (shotId: string) => void }) {
  const scored = shots.filter((shot) => shot.actualResult); const gestureCount = scored.filter((shot) => shot.actualResult?.source === 'gesture').length; const manualCount = scored.length - gestureCount;
  const scores = scored.map((shot) => shot.actualResult!.score); const totalScore = scores.reduce((sum, score) => sum + score, 0);
  const shoulder = averageWhenSufficient(metricValues(shots, (shot) => shot.summary.holdShoulderVariationDeg.value)); const bow = averageWhenSufficient(metricValues(shots, (shot) => shot.summary.bowHandMotionBeforeRelease.value)); const head = averageWhenSufficient(metricValues(shots, (shot) => shot.summary.headMotionBeforeRelease.value));
  const variability = [
    { label: 'Release shoulder delta', unit: '°', values: metricValues(shots, (shot) => shot.releaseMetrics.shoulder.delta.value) },
    { label: 'Bow arm before release', unit: '°', values: metricValues(shots, (shot) => shot.releaseMetrics.bowArm.before.value) },
    { label: 'Head displacement', unit: '% SW', values: metricValues(shots, (shot) => shot.releaseMetrics.headDisplacement.value) },
    { label: 'Bow-hand displacement', unit: '% SW', values: metricValues(shots, (shot) => shot.releaseMetrics.bowHandDisplacement.value) },
  ];
  const highScores = scored.filter((shot) => shot.actualResult!.score >= 9); const lowerScores = scored.filter((shot) => shot.actualResult!.score <= 7);
  const groupMetric = (group: ShotAnalysis[], select: (shot: ShotAnalysis) => number | null) => averageWhenSufficient(metricValues(group, select));
  const highShoulder = groupMetric(highScores, (shot) => shot.summary.holdShoulderVariationDeg.value); const lowShoulder = groupMetric(lowerScores, (shot) => shot.summary.holdShoulderVariationDeg.value);
  const highBow = groupMetric(highScores, (shot) => shot.summary.bowHandMotionBeforeRelease.value); const lowBow = groupMetric(lowerScores, (shot) => shot.summary.bowHandMotionBeforeRelease.value);
  const correlationReady = scored.length >= GESTURE_CONFIG.minCorrelationShots && highShoulder !== null && lowShoulder !== null && highBow !== null && lowBow !== null;
  const cards = [
    { label: 'Total Shots', value: String(shots.length), detail: `${scored.length} scored · ${shots.length - scored.length} missing` },
    { label: 'Latest Shot', value: shots.length ? `#${shots.length}` : '--', detail: shots.at(-1)?.dataQuality.label ?? 'No captured shot' },
    { label: 'Avg Hold Shoulder', value: shoulder === null ? '--' : `${shoulder.toFixed(1)}°`, detail: shoulder === null ? 'Needs 2 valid shots' : 'Real captured shots' },
    { label: 'Avg Bow-Hand Motion', value: bow === null ? '--' : `${bow.toFixed(1)} % SW`, detail: bow === null ? 'Needs 2 valid shots' : 'Pre-release hold' },
    { label: 'Avg Head Motion', value: head === null ? '--' : `${head.toFixed(1)} % SW`, detail: head === null ? 'Needs 2 valid shots' : 'Pre-release hold' },
  ];
  return <div className="page-container page-container--wide"><PageHeader title="Session Dashboard" subtitle="Local shot capture and athlete-reported results" actions={<StatusBadge label={`${shots.length} captured / ${scored.length} scored`} tone="primary" compact />} />
    <div className="metric-grid">{cards.map((card) => <MetricCard key={card.label} title={card.label} value={card.value} status={card.detail} />)}</div>
    <section className="match-summary"><div><span>Total score</span><strong>{scored.length ? totalScore : '--'}</strong></div><div><span>Average score</span><strong>{scored.length ? (totalScore / scored.length).toFixed(1) : '--'}</strong></div><div><span>10s / Xs / Misses</span><strong>{scores.filter((score) => score === 10).length} / {scored.filter((shot) => shot.actualResult?.isX).length} / {scores.filter((score) => score === 0).length}</strong></div><div><span>Entry sources</span><strong>{gestureCount} gesture · {manualCount} manual</strong></div></section>
    <section className="dashboard-shot-list"><div className="analytics-panel__header"><div><span className="eyebrow">Shot history</span><h2>Captured events</h2></div></div>{shots.length ? shots.map((shot, index) => <button type="button" key={shot.id} onClick={() => onSelectShot?.(shot.id)}><span>#{String(index + 1).padStart(2, '0')}</span><span>{shot.actualResult ? shot.actualResult.isX ? 'X' : shot.actualResult.score : '--'}</span><span>{shot.actualResult ? shot.actualResult.source === 'gesture' ? 'Gesture' : 'Manual' : 'Not entered'}</span><span>{shot.dataQuality.label}</span></button>) : <p>No shots captured yet.</p>}</section>
    <section className="shot-correlation"><span className="eyebrow">Cross-shot variability</span><div className="release-comparison-grid">{variability.map((item) => { const mean = averageWhenSufficient(item.values); const sd = sampleStandardDeviation(item.values); return <article key={item.label}><strong>{item.label}</strong><span>Mean {mean === null ? '--' : `${mean.toFixed(1)} ${item.unit}`}</span><span>SD {sd === null ? '--' : `${sd.toFixed(1)} ${item.unit}`}</span><span>Shots {item.values.length}</span></article>; })}</div></section>
    <section className="shot-correlation"><span className="eyebrow">Biomechanics + result comparison</span>{correlationReady ? <div className="release-comparison-grid"><article><strong>Score 9–10 shots</strong><span>Shoulder variation {highShoulder!.toFixed(1)}°</span><span>Bow-hand motion {highBow!.toFixed(1)} % SW</span><span>{highScores.length} reported shots</span></article><article><strong>Score ≤ 7 shots</strong><span>Shoulder variation {lowShoulder!.toFixed(1)}°</span><span>Bow-hand motion {lowBow!.toFixed(1)} % SW</span><span>{lowerScores.length} reported shots</span></article><p>Descriptive association only; no causal conclusion is implied.</p></div> : <p>More scored shots are needed for comparison.</p>}</section>
  </div>;
}
