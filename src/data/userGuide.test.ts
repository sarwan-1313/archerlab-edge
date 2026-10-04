import { describe, expect, it } from 'vitest';
import { PAGE_PATHS } from '../navigation/routes';
import { guideManualSteps, guideStepForPage, isGuideDetailPage } from './userGuide';

describe('guide manual data', () => {
  it('defines ten ordered, uniquely routed manual steps', () => {
    expect(guideManualSteps).toHaveLength(10);
    expect(guideManualSteps.map((step) => step.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(new Set(guideManualSteps.map((step) => step.page)).size).toBe(10);
    expect(new Set(guideManualSteps.map((step) => step.slug)).size).toBe(10);

    for (const step of guideManualSteps) {
      expect(PAGE_PATHS[step.page]).toBe(`/guide/${step.slug}`);
      expect(guideStepForPage(step.page)).toBe(step);
      expect(isGuideDetailPage(step.page)).toBe(true);
    }
  });

  it('provides complete practical content for every step', () => {
    for (const step of guideManualSteps) {
      expect(step.title).not.toHaveLength(0);
      expect(step.purpose).not.toHaveLength(0);
      expect(step.introduction).not.toHaveLength(0);
      expect(step.procedure.length).toBeGreaterThanOrEqual(3);
      expect(step.expectedResult).not.toHaveLength(0);
      expect(step.tips.length).toBeGreaterThan(0);
      expect(step.troubleshooting.length).toBeGreaterThan(0);
    }
  });
});
