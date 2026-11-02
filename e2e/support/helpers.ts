import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import { E2E_CLIP_FILE, E2E_SHOT_COUNT } from './scenario';

export const CLIP_PATH = fileURLToPath(new URL(`../fixtures/${E2E_CLIP_FILE}`, import.meta.url));

/** Opens a page of the app by its URL and waits for its heading, so the lazy-loaded route has rendered. */
export async function openPage(page: Page, path: string, heading: string | RegExp) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
}

/** Uploads the synthetic clip on the Video Analysis page and starts the analysis at the fastest precision. */
export async function startClipAnalysis(page: Page, { keepVideo = false }: { keepVideo?: boolean } = {}) {
  await openPage(page, '/video', 'Video Analysis');
  await page.getByRole('radiogroup', { name: 'Precision' }).getByText('Fast', { exact: true }).click();
  if (keepVideo) await page.getByLabel(/Keep the video on this device/).check();
  await page.getByLabel('Video file').setInputFiles(CLIP_PATH);
  const analyse = page.getByRole('button', { name: 'Analyse', exact: true });
  await expect(analyse).toBeEnabled();
  await analyse.click();
}

/** Waits for the finished report and returns once its shot count is on screen. */
export async function expectReport(page: Page) {
  const stats = page.getByRole('region', { name: 'Form score' });
  await expect(stats).toBeVisible({ timeout: 100_000 });
  await expect(stats.locator('div', { has: page.getByText('Shots found') }).last().locator('strong')).toHaveText(String(E2E_SHOT_COUNT));
}
