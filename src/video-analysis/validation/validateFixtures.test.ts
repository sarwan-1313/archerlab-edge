import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildReport } from '../buildReport';
import { parseReportFile } from '../reportFile';
import { CATEGORY_ORDER } from '../rubric';
import { categoryBreakdown } from '../scoring';
import type { CategoryId } from '../types';
import { levelAgreement, matchShots, median, precisionRecall, spearman, type ShotMatch } from './stats';

/**
 * npm run validate:fixtures — runs the current engine on every fixture in src/video-analysis/fixtures and
 * compares it with what a person (ideally a coach) labelled: shot detection precision and recall, release
 * timing error, Spearman correlation between the engine's area scores and the coach's 1–5 ratings, and level
 * agreement. See docs/validation.md.
 *
 * It fails only when detection gets worse than the stored baseline (validation-baseline.json), never because
 * of the correlations, which are there to learn from. Set UPDATE_VALIDATION_BASELINE=1 to store a new baseline.
 */

interface Expected {
  shots: number;
  releases?: number[];
  toleranceS?: number;
  ratings?: Array<Partial<Record<CategoryId, number>>>;
  level?: string | null;
}

const fixtures = import.meta.glob<string>('../fixtures/*.json', { eager: true, query: '?raw', import: 'default' });
const BASELINE = new URL('./validation-baseline.json', import.meta.url);
const pct = (value: number | null) => (value === null ? '–' : `${(value * 100).toFixed(1)}%`);
const num = (value: number | null, digits = 2) => (value === null ? '–' : value.toFixed(digits));

describe('fixture validation', () => {
  it('measures the engine against the labelled fixtures', () => {
    const matches: ShotMatch[] = [];
    const areaPairs = new Map<CategoryId, { engine: number[]; coach: number[] }>(CATEGORY_ORDER.map((id) => [id, { engine: [], coach: [] }]));
    const levels: Array<{ engine: string | null; coach: string | null }> = [];
    const lines: string[] = [];

    for (const [path, text] of Object.entries(fixtures)) {
      const name = path.replace('../fixtures/', '');
      const expected = (JSON.parse(text) as { expected?: Expected }).expected;
      if (!expected?.releases) {
        lines.push(`  ${name}: skipped (needs "releases" in its expected block)`);
        continue;
      }
      const report = buildReport(parseReportFile(text));
      const detected = report.shots.map((shot) => shot.release);
      const match = matchShots(detected, expected.releases, expected.toleranceS ?? 0.1);
      matches.push(match);
      for (const [d, e] of match.pairs) {
        const rated = expected.ratings?.[e];
        if (!rated) continue;
        const engineAreas = categoryBreakdown(report.shots[d].metrics, report.settings.bowType);
        for (const area of engineAreas) {
          const coach = rated[area.id];
          if (typeof coach === 'number' && area.score !== null) {
            areaPairs.get(area.id)!.engine.push(area.score);
            areaPairs.get(area.id)!.coach.push(coach);
          }
        }
      }
      if (expected.level !== undefined) levels.push({ engine: report.scores.level, coach: expected.level });
      lines.push(`  ${name}: ${match.truePositives}/${expected.releases.length} shots found, ${match.falsePositives} extra, median release error ${num(median(match.errorsMs.map(Math.abs)), 0)} ms`);
    }

    const { precision, recall } = precisionRecall(matches);
    const errors = matches.flatMap((match) => match.errorsMs);
    const agreement = levelAgreement(levels);
    lines.unshift(`Fixture validation: ${matches.length} labelled fixture${matches.length === 1 ? '' : 's'}`);
    lines.push(
      '',
      `Shot detection   precision ${pct(precision)}   recall ${pct(recall)}`,
      `Release timing   median |error| ${num(median(errors.map(Math.abs)), 0)} ms   median signed ${num(median(errors), 0)} ms (engine minus label)`,
      'Area scores vs coach ratings (Spearman, matched shots):',
      ...CATEGORY_ORDER.map((id) => {
        const pair = areaPairs.get(id)!;
        return `  ${id.padEnd(14)} ρ = ${num(spearman(pair.engine, pair.coach))}   n = ${pair.engine.length}`;
      }),
      `Level agreement  exact ${pct(agreement.exact)}   within one level ${pct(agreement.withinOne)}   n = ${agreement.count}`,
    );
    console.log(lines.join('\n'));

    if (process.env.UPDATE_VALIDATION_BASELINE === '1') {
      writeFileSync(BASELINE, `${JSON.stringify({ precision, recall, fixtures: matches.length, updated: new Date().toISOString().slice(0, 10) }, null, 2)}\n`);
      return;
    }
    // Only detection can fail the run, and only against a stored baseline.
    if (!existsSync(BASELINE) || !matches.length) return;
    const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as { precision: number | null; recall: number | null };
    if (baseline.precision !== null && precision !== null) expect(precision, 'shot detection precision fell below the baseline').toBeGreaterThanOrEqual(baseline.precision - 1e-9);
    if (baseline.recall !== null && recall !== null) expect(recall, 'shot detection recall fell below the baseline').toBeGreaterThanOrEqual(baseline.recall - 1e-9);
  });
});
