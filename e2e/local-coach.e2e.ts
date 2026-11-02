import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { E2E_CLIP_FILE } from './support/scenario';
import { expectReport, openPage, startClipAnalysis } from './support/helpers';

// The browser under test has no usable GPU, so this checks everything around the model: when the coach is
// offered, that nothing is downloaded before the athlete agrees, and that the pinned model files are what
// is requested (the real download is blocked, so no model is fetched).
test.describe.configure({ mode: 'serial' });

let context: BrowserContext;
let page: Page;
const modelRequests: string[] = [];

test.beforeAll(async ({ browser }) => {
  const { baseURL, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent } = test.info().project.use;
  context = await browser.newContext({ baseURL, viewport, isMobile, hasTouch, deviceScaleFactor, userAgent });
  // Lets a test switch between "no WebGPU" and "a device that has it"; the switch lives in sessionStorage so it survives reloads.
  await context.addInitScript(() => {
    const device = { requestAdapter: async () => ({ features: new Set(['shader-f16']) }) };
    Object.defineProperty(navigator, 'gpu', { configurable: true, get: () => (sessionStorage.getItem('fake-gpu') ? device : undefined) });
  });
  await context.route(/huggingface\.co|raw\.githubusercontent\.com/, async (route) => {
    modelRequests.push(route.request().url());
    await route.fulfill({ status: 404, body: 'blocked by the test' });
  });
  page = await context.newPage();
});

test.afterAll(async () => {
  await context.close();
});

const card = () => page.locator('.va-local');

async function reopenReport() {
  await openPage(page, '/video', 'Video Analysis');
  await page.getByRole('button', { name: new RegExp(E2E_CLIP_FILE.replace('.', '\\.')) }).click();
  await expectReport(page);
}

test('says why the private coach is unavailable when the browser has no WebGPU', async () => {
  await startClipAnalysis(page);
  await expectReport(page);
  await expect(page.getByRole('group', { name: /Private coach/ })).toBeVisible();
  await expect(card()).toContainText('does not offer WebGPU');
  await expect(card().getByRole('button', { name: /Ask the private coach/ })).toHaveCount(0);
  expect(modelRequests).toEqual([]);
});

test('asks before downloading, with the size and licence, and downloads nothing on "Not now"', async () => {
  await page.evaluate(() => sessionStorage.setItem('fake-gpu', '1'));
  await reopenReport();
  await card().getByRole('button', { name: /Ask the private coach/ }).click();
  const dialog = card().getByRole('alertdialog');
  await expect(dialog).toContainText('Download 886 MB?');
  await expect(dialog.getByRole('link', { name: 'Apache License 2.0' })).toBeVisible();
  expect(modelRequests).toEqual([]);

  const { violations } = await new AxeBuilder({ page }).include('.va-local').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);

  await dialog.getByRole('button', { name: 'Not now' }).click();
  await expect(card().getByRole('button', { name: /Ask the private coach/ })).toBeVisible();
  expect(modelRequests).toEqual([]);
});

test('requests only the pinned model files once confirmed, and recovers from a failed download', async () => {
  await card().getByRole('button', { name: /Ask the private coach/ }).click();
  await card().getByRole('button', { name: /Download 886 MB and ask/ }).click();
  await expect(card().getByRole('alert')).toBeVisible({ timeout: 30_000 });
  expect(modelRequests.length).toBeGreaterThan(0);
  expect(modelRequests[0]).toMatch(/^https:\/\/huggingface\.co\/mlc-ai\/Qwen2\.5-1\.5B-Instruct-q4f16_1-MLC\/resolve\/[0-9a-f]{40}\/mlc-chat-config\.json/);
  for (const url of modelRequests) expect(url).not.toMatch(/\/main\//);
  await expect(card().getByRole('button', { name: /Ask the private coach/ })).toBeVisible();
});

test('the private coach is described on the Privacy page', async () => {
  await openPage(page, '/privacy', 'Privacy');
  await expect(page.getByText(/It never sends data anywhere/)).toBeVisible();
});
