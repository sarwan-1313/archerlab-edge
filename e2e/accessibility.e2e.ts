import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openPage } from './support/helpers';

const PAGES: Array<{ name: string; path: string; heading: string }> = [
  { name: 'Home', path: '/', heading: 'ArcherLab Edge' },
  { name: 'Video Analysis', path: '/video', heading: 'Video Analysis' },
  { name: 'Profile', path: '/profile', heading: 'Athlete Profile' },
];

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => ({ rule: violation.id, impact: violation.impact, help: violation.help, targets: violation.nodes.slice(0, 5).map((node) => node.target.join(' ')) }));
}

for (const { name, path, heading } of PAGES) {
  test(`${name} has no serious accessibility violations`, async ({ page }) => {
    await openPage(page, path, heading);
    // Let page transitions and entrance animations finish so contrast is measured on the settled page.
    await page.waitForTimeout(1500);
    expect(await seriousViolations(page)).toEqual([]);
  });
}
