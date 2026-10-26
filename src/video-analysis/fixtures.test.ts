import { describe, expect, it } from 'vitest';
import { buildReport } from './buildReport';
import { parseReportFile } from './reportFile';

/**
 * Regression checks against real clips. Each fixtures/*.json file is an
 * exported report with an added "expected" block (see fixtures/README.md);
 * it is scored again with the current engine and compared with what a person
 * counted in the video. With no fixtures, only the loader is checked.
 */

interface FixtureExpectation {
  shots: number;
  releases?: number[];
  toleranceS?: number;
}

const DEFAULT_TOLERANCE_S = 0.1;

const fixtures = import.meta.glob<string>('./fixtures/*.json', { eager: true, query: '?raw', import: 'default' });

function expectation(name: string, text: string): FixtureExpectation {
  const expected = (JSON.parse(text) as { expected?: unknown }).expected as Partial<FixtureExpectation> | undefined;
  if (!expected || typeof expected.shots !== 'number') throw new Error(`${name}: add an "expected" block with at least "shots" (see fixtures/README.md).`);
  if (expected.releases && (!Array.isArray(expected.releases) || expected.releases.length !== expected.shots)) {
    throw new Error(`${name}: "releases" must list one time in seconds per expected shot.`);
  }
  return { shots: expected.shots, releases: expected.releases, toleranceS: expected.toleranceS ?? DEFAULT_TOLERANCE_S };
}

describe('real-clip fixtures', () => {
  it('loads fixture files', () => {
    for (const [name, text] of Object.entries(fixtures)) expect(typeof text, name).toBe('string');
  });

  for (const [path, text] of Object.entries(fixtures)) {
    const name = path.replace('./fixtures/', '');
    it(name, () => {
      const expected = expectation(name, text);
      const report = buildReport(parseReportFile(text));
      expect(report.shots.length, `${name}: shots found`).toBe(expected.shots);
      expected.releases?.forEach((release, index) => {
        const found = report.shots[index].release;
        expect(Math.abs(found - release), `${name}: shot ${index + 1} released at ${found.toFixed(2)} s, expected ${release} s`).toBeLessThanOrEqual(expected.toleranceS as number);
      });
    });
  }
});
