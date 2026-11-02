import { VIDEO_CONFIG } from './config';
import { CATEGORY_INFO, CATEGORY_ORDER, METRIC_RUBRIC, SESSION_METRICS, bandScore, rubricFor } from './rubric';
import { median } from './signal';
import type { BowType, CategoryId, CategoryScore, ConfidenceLabel, MetricKey, MetricMap, ScoreSummary, SkillLevel } from './types';

/** Areas where a clear fault limits the level an archer can be rated at. */
const CORE_CATEGORIES: CategoryId[] = ['alignment', 'release', 'stability', 'posture'];

const LEVELS: SkillLevel[] = ['beginner', 'intermediate', 'advanced', 'elite'];

export const LEVEL_LABEL: Record<SkillLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  elite: 'Elite-level form',
};

export function levelFor(score: number): SkillLevel {
  const t = VIDEO_CONFIG.scoring.levelThresholds;
  if (score >= t.elite) return 'elite';
  if (score >= t.advanced) return 'advanced';
  if (score >= t.intermediate) return 'intermediate';
  return 'beginner';
}

function thresholdFor(level: SkillLevel): number {
  const t = VIDEO_CONFIG.scoring.levelThresholds;
  return level === 'elite' ? t.elite : level === 'advanced' ? t.advanced : level === 'intermediate' ? t.intermediate : 0;
}

export function metricApplies(metric: MetricKey, bowType: BowType): boolean {
  return !METRIC_RUBRIC[metric].skipFor?.includes(bowType);
}

/** Confidence-weighted score for each area of the shot. */
export function categoryBreakdown(metrics: MetricMap, bowType: BowType): CategoryScore[] {
  return CATEGORY_ORDER.map((id) => {
    const metricKeys = (Object.keys(METRIC_RUBRIC) as MetricKey[]).filter((key) => METRIC_RUBRIC[key].category === id && metricApplies(key, bowType));
    let weighted = 0;
    let evidence = 0;
    let possible = 0;
    const used: MetricKey[] = [];
    for (const key of metricKeys) {
      const rubric = METRIC_RUBRIC[key];
      possible += rubric.weight;
      const metric = metrics[key];
      if (!metric || metric.confidence < 0.2) continue;
      const score = bandScore(metric.value, rubricFor(key, bowType).band);
      weighted += score * rubric.weight * metric.confidence;
      evidence += rubric.weight * metric.confidence;
      used.push(key);
    }
    return {
      id,
      label: CATEGORY_INFO[id].label,
      score: evidence > 0 ? weighted / evidence : null,
      confidence: possible > 0 ? Math.min(1, evidence / possible) : 0,
      metrics: used,
    };
  });
}

/** Overall = (1 − w) × weighted average of the areas + w × the weakest area. */
export function blendCategories(categories: readonly CategoryScore[], minimumAreas: number): number | null {
  const scored = categories.filter((category) => category.score !== null && category.confidence >= 0.2);
  if (scored.length < minimumAreas) return null;
  let weighted = 0;
  let total = 0;
  for (const category of scored) {
    const weight = CATEGORY_INFO[category.id].weight * category.confidence;
    weighted += (category.score as number) * weight;
    total += weight;
  }
  const average = weighted / total;
  const weakest = Math.min(...scored.map((category) => category.score as number));
  const blend = VIDEO_CONFIG.scoring.weakestAreaWeight;
  return (1 - blend) * average + blend * weakest;
}

/** Scores each metric of one shot, and the shot as a whole on the same scale as the overall score. */
export function scoreMetrics(metrics: MetricMap, bowType: BowType): { scores: Partial<Record<MetricKey, number>>; formScore: number | null } {
  const scores: Partial<Record<MetricKey, number>> = {};
  for (const [key, metric] of Object.entries(metrics) as Array<[MetricKey, NonNullable<MetricMap[MetricKey]>]>) {
    if (metricApplies(key, bowType)) scores[key] = bandScore(metric.value, rubricFor(key, bowType).band);
  }
  return { scores, formScore: blendCategories(categoryBreakdown(metrics, bowType), 2) };
}

/** Combines per-shot metrics (median across shots) with the session-level consistency metrics. */
export function aggregateMetrics(perShot: readonly MetricMap[], session: MetricMap): MetricMap {
  const out: MetricMap = {};
  const keys = new Set<MetricKey>();
  perShot.forEach((metrics) => (Object.keys(metrics) as MetricKey[]).forEach((key) => keys.add(key)));
  for (const key of keys) {
    const entries = perShot.map((metrics) => metrics[key]).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry && entry.confidence >= 0.15));
    if (!entries.length) continue;
    const factor = entries.length >= 3 ? 1 : entries.length === 2 ? 0.9 : 0.75;
    out[key] = { value: median(entries.map((entry) => entry.value)), confidence: median(entries.map((entry) => entry.confidence)) * factor };
  }
  for (const key of SESSION_METRICS) if (session[key]) out[key] = session[key];
  return out;
}

export interface ScoringContext {
  bowType: BowType;
  shotCount: number;
  trackedRatio: number;
  viewConfidence: number;
  audioUsed: boolean;
}

export function scoreSession(aggregated: MetricMap, context: ScoringContext): ScoreSummary {
  const categories = categoryBreakdown(aggregated, context.bowType);
  const scored = categories.filter((category) => category.score !== null && category.confidence >= 0.2);
  const overall = blendCategories(categories, 3);

  const reasons: string[] = [];
  const shotFactor = context.shotCount >= 3 ? 1 : context.shotCount === 2 ? 0.8 : context.shotCount === 1 ? 0.6 : 0;
  if (context.shotCount === 0) reasons.push('No complete shot was found in the clip.');
  else if (context.shotCount < 3) reasons.push(`Only ${context.shotCount} shot${context.shotCount === 1 ? '' : 's'} found — film 3 or more for consistency measures and a steadier level.`);
  if (context.trackedRatio < 0.75) reasons.push(`The archer was tracked in ${Math.round(context.trackedRatio * 100)}% of frames. Keep the whole body in view and well lit.`);
  if (context.viewConfidence < 0.5) reasons.push('The camera angle was hard to classify, so view-dependent measurements count for less.');
  if (!context.audioUsed) reasons.push('No usable audio, so release timing comes from video frames only.');
  if (scored.length < 3) reasons.push('Too few areas could be measured to give an overall level.');
  const categoryConfidence = scored.length ? scored.reduce((sum, category) => sum + category.confidence, 0) / CATEGORY_ORDER.length : 0;
  const numeric = categoryConfidence * shotFactor * (0.6 + 0.4 * Math.min(1, context.trackedRatio)) * (0.8 + 0.2 * context.viewConfidence);
  const confidence: ConfidenceLabel = overall === null ? 'low' : numeric >= 0.6 ? 'high' : numeric >= 0.38 ? 'medium' : 'low';

  let level = overall === null ? null : levelFor(overall);
  // A clear fault in a fundamental area caps the level, however strong the rest of the shot is.
  let levelCap: ScoreSummary['levelCap'];
  if (level) {
    let worst: { metric: MetricKey; score: number } | null = null;
    for (const key of Object.keys(aggregated) as MetricKey[]) {
      const metric = aggregated[key];
      const rubric = METRIC_RUBRIC[key];
      if (!metric || metric.confidence < 0.45 || rubric.experimental || !CORE_CATEGORIES.includes(rubric.category) || !metricApplies(key, context.bowType)) continue;
      const score = bandScore(metric.value, rubricFor(key, context.bowType).band);
      if (!worst || score < worst.score) worst = { metric: key, score };
    }
    const cap: SkillLevel | null = worst ? (worst.score < 45 ? 'intermediate' : worst.score < 60 ? 'advanced' : null) : null;
    if (worst && cap && LEVELS.indexOf(level) > LEVELS.indexOf(cap)) {
      levelCap = { level: cap, metric: worst.metric, reason: `${METRIC_RUBRIC[worst.metric].label} needs work, so the level is capped at ${LEVEL_LABEL[cap]} until it improves.` };
      level = cap;
    }
  }
  const summary: ScoreSummary = { overall, level, confidence, confidenceReasons: reasons, categories, levelCap };
  if (level && overall !== null && level !== 'elite') {
    const next = LEVELS[LEVELS.indexOf(level) + 1];
    const threshold = thresholdFor(next);
    const weakest = [...scored].sort((a, b) => (a.score as number) - (b.score as number)).map((category) => category.id as CategoryId);
    const capCategory = levelCap ? METRIC_RUBRIC[levelCap.metric].category : null;
    const focus = capCategory ? [capCategory, ...weakest.filter((id) => id !== capCategory)].slice(0, 2) : weakest.slice(0, 2);
    summary.nextLevel = { level: next, threshold, gap: Math.max(0, threshold - overall), focus };
  }
  return summary;
}
