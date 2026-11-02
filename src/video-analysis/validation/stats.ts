/**
 * Statistics for checking the engine against coaches' labels (npm run validate:fixtures, docs/validation.md).
 * Pure functions, tested in stats.test.ts.
 */

export interface ShotMatch {
  /** Pairs of (engine index, expected index), both 0-based, matched within the tolerance. */
  pairs: Array<[number, number]>;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  /** Signed release-time error of each matched pair, engine minus expected, milliseconds. */
  errorsMs: number[];
}

/** Matches detected releases to expected ones, closest pairs first, each used at most once. */
export function matchShots(detected: readonly number[], expected: readonly number[], toleranceS: number): ShotMatch {
  const candidates: Array<{ d: number; e: number; gap: number }> = [];
  detected.forEach((release, d) => expected.forEach((target, e) => {
    const gap = Math.abs(release - target);
    if (gap <= toleranceS) candidates.push({ d, e, gap });
  }));
  candidates.sort((a, b) => a.gap - b.gap);
  const usedD = new Set<number>();
  const usedE = new Set<number>();
  const pairs: Array<[number, number]> = [];
  for (const { d, e } of candidates) {
    if (usedD.has(d) || usedE.has(e)) continue;
    usedD.add(d);
    usedE.add(e);
    pairs.push([d, e]);
  }
  pairs.sort((a, b) => a[1] - b[1]);
  return {
    pairs,
    truePositives: pairs.length,
    falsePositives: detected.length - pairs.length,
    falseNegatives: expected.length - pairs.length,
    errorsMs: pairs.map(([d, e]) => (detected[d] - expected[e]) * 1000),
  };
}

/** Precision and recall over all fixtures; null when there is nothing to divide by. */
export function precisionRecall(matches: readonly ShotMatch[]): { precision: number | null; recall: number | null } {
  const tp = matches.reduce((sum, match) => sum + match.truePositives, 0);
  const fp = matches.reduce((sum, match) => sum + match.falsePositives, 0);
  const fn = matches.reduce((sum, match) => sum + match.falseNegatives, 0);
  return { precision: tp + fp ? tp / (tp + fp) : null, recall: tp + fn ? tp / (tp + fn) : null };
}

export function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Ranks from 1, with tied values sharing the average of their ranks. */
export function ranks(values: readonly number[]): number[] {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const out = new Array<number>(values.length);
  for (let i = 0; i < order.length;) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].value === order[i].value) j += 1;
    const rank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) out[order[k].index] = rank;
    i = j + 1;
  }
  return out;
}

/**
 * Spearman's rank correlation (Pearson on tie-averaged ranks). Null below 3 pairs, or when either side is
 * constant, because the correlation is then undefined.
 */
export function spearman(x: readonly number[], y: readonly number[]): number | null {
  if (x.length !== y.length || x.length < 3) return null;
  const rx = ranks(x);
  const ry = ranks(y);
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const mx = mean(rx);
  const my = mean(ry);
  let num = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < rx.length; i += 1) {
    num += (rx[i] - mx) * (ry[i] - my);
    sx += (rx[i] - mx) ** 2;
    sy += (ry[i] - my) ** 2;
  }
  return sx && sy ? num / Math.sqrt(sx * sy) : null;
}

const LEVELS = ['beginner', 'intermediate', 'advanced', 'elite'] as const;

/** How often the engine's level equals the coach's, and how often it is at most one level away. */
export function levelAgreement(pairs: ReadonlyArray<{ engine: string | null; coach: string | null }>): { exact: number | null; withinOne: number | null; count: number } {
  const usable = pairs.filter((pair) => pair.engine && pair.coach) as Array<{ engine: string; coach: string }>;
  if (!usable.length) return { exact: null, withinOne: null, count: 0 };
  const position = (level: string) => LEVELS.indexOf(level as (typeof LEVELS)[number]);
  const exact = usable.filter((pair) => pair.engine === pair.coach).length;
  const withinOne = usable.filter((pair) => Math.abs(position(pair.engine) - position(pair.coach)) <= 1).length;
  return { exact: exact / usable.length, withinOne: withinOne / usable.length, count: usable.length };
}
