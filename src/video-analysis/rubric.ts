import type { BowType, CameraViewKind, CategoryId, JointName, MetricKey } from './types';

/**
 * The scoring rubric. Every threshold here is a coaching heuristic chosen for
 * this prototype — not a validated standard — and is kept in one place so it
 * can be tuned against real footage and coach feedback.
 *
 * Band semantics:
 *  - 'lower':  value ≤ excellent → 100, = good → 82, = fair → 58, = poor → 30, worse → down to 10
 *  - 'higher': mirror image
 *  - 'range':  inside [low, high] → 100; distance outside the range maps through good/fair/poor tolerances
 */
export type Band =
  | { kind: 'lower' | 'higher'; excellent: number; good: number; fair: number; poor: number }
  | { kind: 'range'; low: number; high: number; good: number; fair: number; poor: number };

export interface MetricRubric {
  label: string;
  short: string;
  unit: string;
  decimals: number;
  category: CategoryId;
  weight: number;
  band: Band;
  view: Record<CameraViewKind, number>;
  joints: JointName[];
  /** Where in the shot the finding is best shown, relative to release (seconds). */
  showAt: number;
  experimental?: boolean;
  /** Bow types this metric should not be scored for. */
  skipFor?: BowType[];
}

const allViews = (value: number): Record<CameraViewKind, number> => ({ broadside: value, oblique: value, 'down-the-line': value, unknown: value * 0.8 });

export const METRIC_RUBRIC: Record<MetricKey, MetricRubric> = {
  bowElbowAngle: {
    label: 'Bow-arm angle at anchor', short: 'Bow arm', unit: '°', decimals: 0, category: 'alignment', weight: 1.2,
    band: { kind: 'higher', excellent: 172, good: 165, fair: 155, poor: 145 },
    view: { broadside: 1, oblique: 0.9, 'down-the-line': 0.7, unknown: 0.7 }, joints: ['bowElbow'], showAt: -0.3,
  },
  drawForearmAlignment: {
    label: 'Draw elbow line', short: 'Elbow line', unit: '°', decimals: 0, category: 'alignment', weight: 1,
    band: { kind: 'lower', excellent: 10, good: 18, fair: 28, poor: 40 },
    view: { broadside: 0.7, oblique: 0.85, 'down-the-line': 0.9, unknown: 0.6 }, joints: ['drawElbow', 'drawWrist'], showAt: -0.3,
  },
  shoulderAlignment: {
    label: 'Shoulder line vs arrow', short: 'Shoulders', unit: '°', decimals: 0, category: 'alignment', weight: 0.8,
    band: { kind: 'lower', excellent: 8, good: 14, fair: 22, poor: 32 },
    view: { broadside: 0.8, oblique: 0.85, 'down-the-line': 0.75, unknown: 0.6 }, joints: ['shoulders'], showAt: -0.3,
  },
  bowShoulderRise: {
    label: 'Shoulder height difference', short: 'Shoulder height', unit: 'SW', decimals: 2, category: 'posture', weight: 1.2,
    band: { kind: 'lower', excellent: 0.04, good: 0.08, fair: 0.13, poor: 0.2 },
    view: { broadside: 0.9, oblique: 0.9, 'down-the-line': 0.8, unknown: 0.7 }, joints: ['bowShoulder', 'drawShoulder'], showAt: -0.3,
  },
  torsoLean: {
    label: 'Torso lean', short: 'Lean', unit: '°', decimals: 0, category: 'posture', weight: 1,
    band: { kind: 'lower', excellent: 4, good: 7, fair: 11, poor: 16 },
    view: allViews(0.85), joints: ['torso'], showAt: -0.3,
  },
  bowHandSway: {
    label: 'Bow-hand movement while aiming', short: 'Bow-hand sway', unit: '% torso', decimals: 1, category: 'stability', weight: 1.3,
    band: { kind: 'lower', excellent: 1.5, good: 2.5, fair: 4, poor: 6 },
    view: { broadside: 1, oblique: 0.9, 'down-the-line': 0.75, unknown: 0.7 }, joints: ['bowWrist'], showAt: -0.6,
  },
  headSway: {
    label: 'Head movement while aiming', short: 'Head sway', unit: '% torso', decimals: 1, category: 'stability', weight: 0.8,
    band: { kind: 'lower', excellent: 0.8, good: 1.5, fair: 2.5, poor: 4 },
    view: { broadside: 1, oblique: 0.9, 'down-the-line': 0.85, unknown: 0.7 }, joints: ['head'], showAt: -0.6,
  },
  anchorSway: {
    label: 'Anchor steadiness', short: 'Anchor', unit: '% torso', decimals: 1, category: 'stability', weight: 1,
    band: { kind: 'lower', excellent: 1, good: 1.8, fair: 3, poor: 5 },
    view: { broadside: 1, oblique: 0.9, 'down-the-line': 0.8, unknown: 0.7 }, joints: ['drawWrist', 'head'], showAt: -0.6,
  },
  drawCreep: {
    label: 'Draw-length change before release', short: 'Creep / expansion', unit: '%SW/s', decimals: 1, category: 'stability', weight: 0.5,
    band: { kind: 'higher', excellent: 0, good: -2.5, fair: -5, poor: -9 },
    view: allViews(0.6), joints: ['drawWrist'], showAt: -0.4, experimental: true,
  },
  releaseBackFraction: {
    label: 'Release direction (backwards along the arrow)', short: 'Release line', unit: '', decimals: 2, category: 'release', weight: 1,
    band: { kind: 'higher', excellent: 0.85, good: 0.7, fair: 0.5, poor: 0.3 },
    view: { broadside: 0.85, oblique: 0.85, 'down-the-line': 0.7, unknown: 0.6 }, joints: ['drawWrist'], showAt: 0.08,
  },
  releaseTravel: {
    label: 'Draw-hand travel after release', short: 'Release travel', unit: 'SW', decimals: 2, category: 'release', weight: 0.7,
    band: { kind: 'higher', excellent: 0.35, good: 0.22, fair: 0.12, poor: 0.06 },
    view: { broadside: 0.9, oblique: 0.85, 'down-the-line': 0.65, unknown: 0.6 }, joints: ['drawWrist'], showAt: 0.08,
    skipFor: ['compound'],
  },
  headMoveAtRelease: {
    label: 'Head movement at release', short: 'Head at release', unit: '% torso', decimals: 1, category: 'release', weight: 1,
    band: { kind: 'lower', excellent: 1, good: 2, fair: 3.5, poor: 6 },
    view: { broadside: 1, oblique: 0.9, 'down-the-line': 0.85, unknown: 0.7 }, joints: ['head'], showAt: 0.1,
  },
  bowArmDrop: {
    label: 'Bow-arm drop after release', short: 'Bow-arm drop', unit: 'SW', decimals: 2, category: 'followThrough', weight: 0.8,
    band: { kind: 'lower', excellent: 0.08, good: 0.15, fair: 0.25, poor: 0.4 },
    view: allViews(0.85), joints: ['bowWrist', 'bowElbow'], showAt: 0.25,
  },
  followThroughHold: {
    label: 'Follow-through hold', short: 'Follow-through', unit: 's', decimals: 2, category: 'followThrough', weight: 1,
    band: { kind: 'higher', excellent: 1.2, good: 0.8, fair: 0.5, poor: 0.25 },
    view: allViews(0.9), joints: ['bowWrist'], showAt: 0.5,
  },
  holdDuration: {
    label: 'Aiming time (anchor to release)', short: 'Aiming time', unit: 's', decimals: 1, category: 'rhythm', weight: 1,
    band: { kind: 'range', low: 1.5, high: 4.5, good: 0.5, fair: 1.2, poor: 2.5 },
    view: allViews(1), joints: [], showAt: -1,
  },
  drawDuration: {
    label: 'Draw time', short: 'Draw time', unit: 's', decimals: 1, category: 'rhythm', weight: 0.5,
    band: { kind: 'range', low: 1, high: 3, good: 0.4, fair: 1, poor: 2 },
    view: allViews(0.9), joints: [], showAt: -1.5,
  },
  clickerReaction: {
    label: 'Clicker-to-release reaction', short: 'Clicker reaction', unit: 's', decimals: 2, category: 'rhythm', weight: 0.4,
    band: { kind: 'lower', excellent: 0.15, good: 0.25, fair: 0.4, poor: 0.6 },
    view: allViews(0.7), joints: [], showAt: -0.1, experimental: true,
  },
  anchorSpread: {
    label: 'Anchor position consistency', short: 'Anchor consistency', unit: 'SW', decimals: 3, category: 'rhythm', weight: 1.3,
    band: { kind: 'lower', excellent: 0.03, good: 0.06, fair: 0.1, poor: 0.16 },
    view: { broadside: 1, oblique: 0.9, 'down-the-line': 0.8, unknown: 0.7 }, joints: ['drawWrist', 'head'], showAt: -0.3,
  },
  anchorContactPoint: {
    label: 'Anchor contact point', short: 'Anchor contact', unit: 'FH', decimals: 2, category: 'rhythm', weight: 0.6,
    // Distance from the draw hand's index fingertip to the nearer of chin and mouth corner, in face heights.
    band: { kind: 'lower', excellent: 0.06, good: 0.1, fair: 0.16, poor: 0.25 },
    view: allViews(0.8), joints: ['drawWrist', 'head'], showAt: -0.3, experimental: true,
  },
  anchorFaceSpread: {
    label: 'Anchor consistency (face)', short: 'Anchor on face', unit: 'FH', decimals: 3, category: 'rhythm', weight: 0.8,
    // Mean distance of each shot's fingertip point from their centre, in face heights.
    band: { kind: 'lower', excellent: 0.03, good: 0.06, fair: 0.1, poor: 0.16 },
    view: allViews(0.8), joints: ['drawWrist', 'head'], showAt: -0.3, experimental: true,
  },
  holdTimeCv: {
    label: 'Aiming-time consistency', short: 'Rhythm', unit: 'CV', decimals: 2, category: 'rhythm', weight: 1,
    band: { kind: 'lower', excellent: 0.08, good: 0.15, fair: 0.25, poor: 0.4 },
    view: allViews(1), joints: [], showAt: -1,
  },
  drawTimeCv: {
    label: 'Draw-time consistency', short: 'Draw rhythm', unit: 'CV', decimals: 2, category: 'rhythm', weight: 0.4,
    band: { kind: 'lower', excellent: 0.1, good: 0.18, fair: 0.3, poor: 0.45 },
    view: allViews(0.9), joints: [], showAt: -1.5,
  },
  elbowAngleSd: {
    label: 'Bow-arm consistency', short: 'Bow-arm consistency', unit: '°', decimals: 1, category: 'rhythm', weight: 0.8,
    band: { kind: 'lower', excellent: 1.5, good: 3, fair: 5, poor: 8 },
    view: { broadside: 1, oblique: 0.9, 'down-the-line': 0.75, unknown: 0.7 }, joints: ['bowElbow'], showAt: -0.3,
  },
};

export const SESSION_METRICS: MetricKey[] = ['anchorSpread', 'anchorFaceSpread', 'holdTimeCv', 'drawTimeCv', 'elbowAngleSd'];

export const CATEGORY_INFO: Record<CategoryId, { label: string; weight: number; blurb: string }> = {
  posture: { label: 'Stance & posture', weight: 0.14, blurb: 'Upright torso and level, settled shoulders.' },
  alignment: { label: 'Draw alignment', weight: 0.2, blurb: 'Bow arm, shoulders and draw elbow in line with the arrow.' },
  stability: { label: 'Aiming stability', weight: 0.2, blurb: 'How still the bow hand, head and anchor stay while aiming.' },
  release: { label: 'Release', weight: 0.2, blurb: 'A clean release that moves back along the arrow line without disturbing the head.' },
  followThrough: { label: 'Follow-through', weight: 0.1, blurb: 'Holding the finish with the bow arm up after the arrow leaves.' },
  rhythm: { label: 'Rhythm & consistency', weight: 0.16, blurb: 'Repeatable timing and the same anchor shot after shot.' },
};

export const CATEGORY_ORDER: CategoryId[] = ['posture', 'alignment', 'stability', 'release', 'followThrough', 'rhythm'];

function interpolate(value: number, from: number, to: number, scoreFrom: number, scoreTo: number): number {
  if (from === to) return scoreTo;
  const fraction = (value - from) / (to - from);
  return scoreFrom + (scoreTo - scoreFrom) * Math.min(1, Math.max(0, fraction));
}

/** Maps a measured value onto 0–100 using a band. */
export function bandScore(value: number, band: Band): number {
  if (band.kind === 'range') {
    const distance = value < band.low ? band.low - value : value > band.high ? value - band.high : 0;
    if (distance === 0) return 100;
    if (distance <= band.good) return interpolate(distance, 0, band.good, 100, 82);
    if (distance <= band.fair) return interpolate(distance, band.good, band.fair, 82, 58);
    if (distance <= band.poor) return interpolate(distance, band.fair, band.poor, 58, 30);
    return Math.max(10, interpolate(distance, band.poor, band.poor * 2, 30, 10));
  }
  // Normalise 'higher' into 'lower' by negating.
  const sign = band.kind === 'lower' ? 1 : -1;
  const v = value * sign;
  const [excellent, good, fair, poor] = [band.excellent, band.good, band.fair, band.poor].map((threshold) => threshold * sign);
  if (v <= excellent) return 100;
  if (v <= good) return interpolate(v, excellent, good, 100, 82);
  if (v <= fair) return interpolate(v, good, fair, 82, 58);
  if (v <= poor) return interpolate(v, fair, poor, 58, 30);
  return Math.max(10, interpolate(v, poor, poor + (poor - fair) * 2, 30, 10));
}

/** Rubric adjustments per bow type (compound archers keep a slightly softer bow arm). */
export function rubricFor(metric: MetricKey, bowType: BowType): MetricRubric {
  const base = METRIC_RUBRIC[metric];
  if (metric === 'bowElbowAngle' && bowType === 'compound') {
    return { ...base, band: { kind: 'higher', excellent: 168, good: 160, fair: 150, poor: 140 } };
  }
  return base;
}

/**
 * Human-readable value. Shoulder-width ratios read as "% of shoulder width" and
 * coefficients of variation as "±%", which mean more to an archer than raw ratios.
 */
export function formatMetric(metric: MetricKey, value: number): string {
  const rubric = METRIC_RUBRIC[metric];
  const unit = rubric.unit;
  if (unit === 'SW') {
    const percent = value * 100;
    return `${percent < 10 ? percent.toFixed(1) : Math.round(percent)}% of shoulder width`;
  }
  if (unit === 'CV') return `±${Math.round(value * 100)}%`;
  if (unit === '%SW/s') return `${value.toFixed(1)}% of shoulder width per second`;
  if (unit === '% torso') return `${value.toFixed(1)}% of torso length`;
  const number = value.toFixed(rubric.decimals);
  if (!unit) return number;
  if (unit === '°') return `${number}°`;
  if (unit === 's') return `${number} s`;
  return `${number} ${unit}`;
}

/** Compact variant for tables and tiles. */
export function formatMetricShort(metric: MetricKey, value: number): string {
  const unit = METRIC_RUBRIC[metric].unit;
  if (unit === 'SW') return `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}% SW`;
  if (unit === '% torso') return `${value.toFixed(1)}%`;
  return formatMetric(metric, value);
}
