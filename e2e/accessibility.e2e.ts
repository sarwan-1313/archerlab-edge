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

test('Video Analysis has no serious accessibility violations while offering and after failing a conversion', async ({ page }) => {
  test.setTimeout(120_000);
  await openPage(page, '/video', 'Video Analysis');
  // A file no browser can play, so the preview offers the conversion (and ffmpeg then cannot read it either).
  await page.getByLabel('Video file').setInputFiles({ name: 'broken.mov', mimeType: 'video/quicktime', buffer: Buffer.from('not a video file '.repeat(60)) });
  const convert = page.getByRole('button', { name: 'Convert to MP4 on this device' });
  await expect(convert).toBeVisible();
  await page.waitForTimeout(1500);
  expect(await seriousViolations(page)).toEqual([]);

  await convert.click();
  await expect(page.getByRole('alert').filter({ hasText: 'Conversion failed.' })).toBeVisible({ timeout: 90_000 });
  await page.getByText('What ffmpeg reported').click();
  await page.waitForTimeout(500);
  expect(await seriousViolations(page)).toEqual([]);
});
