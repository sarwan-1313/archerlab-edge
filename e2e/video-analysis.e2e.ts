import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { E2E_CLIP_FILE, E2E_SHOT_COUNT } from './support/scenario';
import { expectReport, openPage, startClipAnalysis } from './support/helpers';

// One analysis per project: the tests below build on the report (and the saved history and profile) it leaves behind.
test.describe.configure({ mode: 'serial' });

let context: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }) => {
  const { baseURL, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent, serviceWorkers } = test.info().project.use;
  context = await browser.newContext({ baseURL, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent, serviceWorkers });
  page = await context.newPage();
});

test.afterAll(async () => {
  await context.close();
});

test('uploading a clip shows progress and a report with the right number of shots', async () => {
  await startClipAnalysis(page, { keepVideo: true });

  const progress = page.getByRole('progressbar', { name: 'Analysis progress' });
  await expect(progress).toBeVisible();
  await expect.poll(async () => Number(await progress.getAttribute('aria-valuenow')), { timeout: 60_000 }).toBeGreaterThan(5);

  await expectReport(page);
  const rows = page.locator('.va-table tbody tr');
  await expect(rows).toHaveCount(E2E_SHOT_COUNT);
  // The scripted releases are at 6.6 s and 14.6 s of the clip.
  await expect(rows.nth(0)).toContainText(/6\.[4-8]\d s/);
  await expect(rows.nth(1)).toContainText(/14\.[4-8]\d s/);
  await expect(page.getByText('Estimate from movement only, not a validated rating')).toBeVisible();
});

test('"Show me" moves the replay to the moment in question', async () => {
  const time = page.locator('.va-time');
  const showMe = page.getByRole('button', { name: /Show me/ }).first();
  await expect(showMe).toBeVisible();

  // Step away from wherever the replay starts, so the jump is visible whatever moment the finding points at.
  for (let step = 0; step < 6; step += 1) await page.getByRole('button', { name: 'Next frame' }).click();
  const before = await time.textContent();

  await showMe.click();
  await expect(time).not.toHaveText(before ?? '');
  await expect(page.getByRole('slider', { name: 'Timeline' })).toBeVisible();
});

test('a saved report reopens from the history', async () => {
  await openPage(page, '/video', 'Video Analysis');
  const row = page.getByRole('button', { name: new RegExp(E2E_CLIP_FILE.replace('.', '\\.')) });
  await expect(row).toBeVisible();
  await expect(row).toContainText(`${E2E_SHOT_COUNT} shots`);
  await row.click();
  await expectReport(page);
  await expect(page.getByRole('region', { name: 'Frame-by-frame review' })).toBeVisible();
});

test('the Profile page shows the form status the analysis left behind', async () => {
  await openPage(page, '/profile', 'Athlete Profile');
  await expect(page.getByText('Form status · ArcherLab estimate')).toBeVisible();
  await expect(page.getByText(/confidence · updated/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Analyse a video' })).toHaveCount(0);
});
