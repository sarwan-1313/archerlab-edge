import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test as base, type Page } from '@playwright/test';
import { E2E_SHOT_COUNT } from './support/scenario';
import { expectReport, openPage, startClipAnalysis } from './support/helpers';
import { serveDist, type StaticSite } from './support/staticSite';

// These tests run against a small server over the e2e build, so a test can change what is "deployed".
const test = base.extend<object, { site: StaticSite }>({
  site: [async ({}, use) => {
    const site = await serveDist();
    await use(site);
    await site.close();
  }, { scope: 'worker' }],
  baseURL: async ({ site }, use) => { await use(site.origin); },
});
test.use({ serviceWorkers: 'allow' });

// An MPEG-4 video in an AVI: no browser plays it, but the bundled ffmpeg converts it (see convert-video.e2e.ts).
const UNPLAYABLE_CLIP = fileURLToPath(new URL('./fixtures/unplayable-clip.avi', import.meta.url));
const FFMPEG_CORE = '/ffmpeg/single/ffmpeg-core.wasm';

const FULL_MODEL = '/models/pose_landmarker_full.task';
const HEAVY_MODEL = '/models/pose_landmarker_heavy.task';
const AI_AND_CLOUD_HOSTS = /supabase|anthropic|openai|googleapis/i;

/** Opens the app and waits until the service worker has installed, precached everything and taken control. */
async function installApp(page: Page, path = '/', heading: string | RegExp = 'ArcherLab Edge') {
  await openPage(page, path, heading);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
    }
  });
}

const isCached = (page: Page, path: string, ignoreSearch = false) =>
  page.evaluate(async ([url, ignore]) => Boolean(await caches.match(url as string, { ignoreSearch: ignore as boolean })), [path, ignoreSearch] as const);

const downloadedBytes = (page: Page, path: string) =>
  page.evaluate(async (url) => (await (await fetch(url)).arrayBuffer()).byteLength, path);

async function checkForUpdate(page: Page) {
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())?.update(); });
}

const hasWaitingWorker = (page: Page) =>
  page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting));

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => ({ rule: violation.id, targets: violation.nodes.slice(0, 5).map((node) => node.target.join(' ')) }));
}

function pngSize(png: Buffer) {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

test.describe('installable', () => {
  test('has a web app manifest with correctly sized icons', async ({ page, request }) => {
    await openPage(page, '/', 'ArcherLab Edge');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#04060a');
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/pwa/apple-touch-icon.png');

    const response = await request.get('/manifest.webmanifest');
    expect(response.ok()).toBe(true);
    const manifest = await response.json();
    expect(manifest).toMatchObject({ name: 'ArcherLab Edge', short_name: 'ArcherLab', display: 'standalone', theme_color: '#04060a', start_url: '/', scope: '/' });

    const purposes = manifest.icons.map((icon: { sizes: string; purpose: string }) => `${icon.sizes} ${icon.purpose}`).sort();
    expect(purposes).toEqual(['192x192 any', '512x512 any', '512x512 maskable']);
    for (const icon of manifest.icons as Array<{ src: string; sizes: string; type: string }>) {
      const file = await request.get(icon.src);
      expect(file.ok(), icon.src).toBe(true);
      expect(file.headers()['content-type']).toBe(icon.type);
      const [width, height] = icon.sizes.split('x').map(Number);
      expect(pngSize(await file.body()), icon.src).toEqual({ width, height });
    }
    expect((await request.get('/pwa/apple-touch-icon.png')).ok()).toBe(true);
  });

  test('installs a service worker that precaches the app, fonts, MediaPipe and the Lite model', async ({ page }) => {
    await installApp(page);
    for (const path of ['/index.html', '/manifest.webmanifest', '/fonts/inter-var.woff', '/fonts/barlow-condensed-extrabolditalic.woff',
      '/mediapipe/wasm/vision_wasm_internal.js', '/mediapipe/wasm/vision_wasm_internal.wasm',
      '/models/pose_landmarker_lite.task', '/models/hand_landmarker.task', '/models/models.json', '/pwa/icon-192.png']) {
      expect(await isCached(page, path, true), path).toBe(true);
    }
    // Large and optional files are not part of the install.
    for (const path of [FULL_MODEL, HEAVY_MODEL, '/mediapipe/wasm/vision_wasm_nosimd_internal.wasm', '/mediapipe/wasm/vision_wasm_module_internal.wasm']) {
      expect(await isCached(page, path, true), path).toBe(false);
    }
  });
});

test.describe('offline', () => {
  test('the app opens with the network off, and says so', async ({ page, context }) => {
    await installApp(page);
    await expect(page.locator('.offline-indicator')).toHaveCount(0);
    await context.setOffline(true);

    await page.goto('/profile');
    await expect(page.getByRole('heading', { level: 1, name: 'Athlete Profile' })).toBeVisible();
    await expect(page.locator('.offline-indicator')).toContainText('Offline');
    // The network really is off: anything that is not in the cache fails.
    expect(await page.evaluate(() => fetch(`/not-cached-${Date.now()}.json`).then(() => 'reached', () => 'unreachable'))).toBe('unreachable');
    expect(await seriousViolations(page)).toEqual([]);

    await context.setOffline(false);
    await expect(page.locator('.offline-indicator')).toHaveCount(0);
  });

  test('offline, Video Analysis falls back to the Lite model when Full has never been used, and analyses a clip', async ({ page, context, site }) => {
    site.addFile('/models/models.json', Buffer.from(JSON.stringify({ available: ['lite', 'full', 'heavy'] })));
    site.addFile(FULL_MODEL, Buffer.alloc(2048, 1));
    site.addFile(HEAVY_MODEL, Buffer.alloc(2048, 2));
    const modelChip = (name: 'lite' | 'full' | 'heavy') => page.locator(`input[name="Pose model"][value="${name}"]`);

    await installApp(page, '/video', 'Video Analysis');
    // Online, Full is deployed, so it is the default.
    await expect(modelChip('full')).toBeEnabled();
    await expect(modelChip('full')).toBeChecked();

    await context.setOffline(true);
    await expect(modelChip('lite')).toBeChecked();
    await expect(modelChip('full')).toBeDisabled();
    await expect(modelChip('heavy')).toBeDisabled();
    await expect(page.getByText(/You are offline, so only models already used on this device can run/)).toBeVisible();

    // Upload to report, with the network off.
    await startClipAnalysis(page);
    await expectReport(page);
    await expect(page.locator('.va-table tbody tr')).toHaveCount(E2E_SHOT_COUNT);
    await expect(page.locator('.offline-indicator')).toContainText('Offline');
  });

  test('Full is saved the first time it is used, then offered and served offline', async ({ page, context, site }) => {
    site.addFile('/models/models.json', Buffer.from(JSON.stringify({ available: ['lite', 'full', 'heavy'] })));
    site.addFile(FULL_MODEL, Buffer.alloc(4096, 1));
    site.addFile(HEAVY_MODEL, Buffer.alloc(4096, 2));
    const modelChip = (name: 'full' | 'heavy') => page.locator(`input[name="Pose model"][value="${name}"]`);

    await installApp(page, '/video', 'Video Analysis');
    expect(await isCached(page, FULL_MODEL)).toBe(false);

    // First use downloads it once...
    expect(await downloadedBytes(page, FULL_MODEL)).toBe(4096);
    await expect.poll(() => isCached(page, FULL_MODEL)).toBe(true);
    expect(site.requestCount(FULL_MODEL)).toBe(1);

    // ...and later it comes from the cache, even with the network off. Heavy was never used.
    await context.setOffline(true);
    expect(await downloadedBytes(page, FULL_MODEL)).toBe(4096);
    expect(site.requestCount(FULL_MODEL)).toBe(1);
    await expect(modelChip('full')).toBeEnabled();
    await expect(modelChip('heavy')).toBeDisabled();
    expect(await isCached(page, HEAVY_MODEL)).toBe(false);
  });

  test('offline, Convert to MP4 explains that the converter has not been downloaded yet', async ({ page, context }) => {
    await installApp(page, '/video', 'Video Analysis');
    await context.setOffline(true);
    await page.getByLabel('Video file').setInputFiles(UNPLAYABLE_CLIP);

    await expect(page.getByRole('alert').first()).toContainText(/cannot play this video/);
    await expect(page.getByText(/You are offline, and the converter has not been downloaded/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Convert to MP4 on this device' })).toBeDisabled();
    // The small manifest is part of the install; the 31 MB core is not.
    expect(await isCached(page, '/ffmpeg/manifest.json', true)).toBe(true);
    expect(await isCached(page, FFMPEG_CORE)).toBe(false);
  });

  test('once the converter has been downloaded, Convert to MP4 is available offline', async ({ page, context, site }) => {
    await installApp(page, '/video', 'Video Analysis');
    const requestedBefore = site.requestCount(FFMPEG_CORE);

    // Online, a first conversion fetches the core files from the server, once. Only the fetches are done
    // here: running ffmpeg itself is convert-video.e2e.ts's job and needs a lot of memory.
    expect(await downloadedBytes(page, '/ffmpeg/single/ffmpeg-core.js')).toBeGreaterThan(50_000);
    expect(await downloadedBytes(page, FFMPEG_CORE)).toBeGreaterThan(10_000_000);
    expect(site.requestCount(FFMPEG_CORE)).toBe(requestedBefore + 1);
    await expect.poll(() => isCached(page, FFMPEG_CORE)).toBe(true);

    // Offline, on a fresh page: the app finds the converter on the device, so the button works...
    await context.setOffline(true);
    await page.goto('/video');
    await expect(page.getByRole('heading', { level: 1, name: 'Video Analysis' })).toBeVisible();
    await page.getByLabel('Video file').setInputFiles(UNPLAYABLE_CLIP);
    await expect(page.getByRole('alert').first()).toContainText(/cannot play this video/);
    await expect(page.getByRole('button', { name: 'Convert to MP4 on this device' })).toBeEnabled();
    await expect(page.getByText(/You are offline, and the converter has not been downloaded/)).toHaveCount(0);

    // ...and the requests a conversion makes are answered without the network: the manifest (read with
    // `no-cache`, as openConverter does) and the core, which is not requested from the server again.
    expect(await page.evaluate(() => fetch('/ffmpeg/manifest.json', { cache: 'no-cache' }).then((response) => response.json().then((manifest) => manifest.cores.single.wasm)))).toBe('single/ffmpeg-core.wasm');
    expect(await downloadedBytes(page, FFMPEG_CORE)).toBeGreaterThan(10_000_000);
    expect(site.requestCount(FFMPEG_CORE)).toBe(requestedBefore + 1);
  });

  test('with the network off, a clip is converted by the converter kept from the first conversion', async ({ page, context, site }) => {
    // Two real ffmpeg runs: they need a few GB of free memory (see convert-video.e2e.ts).
    test.setTimeout(300_000);
    await installApp(page, '/video', 'Video Analysis');
    const requestedBefore = site.requestCount(FFMPEG_CORE);

    // Online: the first conversion downloads the converter from the server, once.
    await page.getByLabel('Video file').setInputFiles(UNPLAYABLE_CLIP);
    await page.getByRole('button', { name: 'Convert to MP4 on this device' }).click();
    await expect(page.getByText('Converted to unplayable-clip.mp4')).toBeVisible({ timeout: 180_000 });
    expect(site.requestCount(FFMPEG_CORE)).toBe(requestedBefore + 1);
    await expect.poll(() => isCached(page, FFMPEG_CORE)).toBe(true);

    // Offline, on a fresh page: the same conversion runs, and the server is not asked for the converter again.
    await context.setOffline(true);
    await page.goto('/video');
    await expect(page.getByRole('heading', { level: 1, name: 'Video Analysis' })).toBeVisible();
    await page.getByLabel('Video file').setInputFiles(UNPLAYABLE_CLIP);
    await page.getByRole('button', { name: 'Convert to MP4 on this device' }).click();
    await expect(page.getByText('Converted to unplayable-clip.mp4')).toBeVisible({ timeout: 180_000 });
    await expect(page.getByText(/Step 1 of 2 · unplayable-clip\.mp4/)).toBeVisible();
    expect(site.requestCount(FFMPEG_CORE)).toBe(requestedBefore + 1);
  });

  test('never caches Supabase or AI provider requests', async ({ page, context, request }) => {
    await installApp(page);
    await context.route(AI_AND_CLOUD_HOSTS, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'cache-control': 'public, max-age=3600' },
      body: '{"ok":true}',
    }));
    const urls = [
      'https://demo-project.supabase.co/rest/v1/video_reports',
      'https://demo-project.supabase.co/storage/v1/object/videos/user/report.mp4',
      'https://api.anthropic.com/v1/messages',
      'https://api.openai.com/v1/chat/completions',
      'https://generativelanguage.googleapis.com/v1beta/models/gemini:generateContent',
    ];
    const statuses = await page.evaluate(async (targets) => {
      const results: number[] = [];
      for (const url of targets) {
        for (const method of ['GET', 'POST']) {
          for (let attempt = 0; attempt < 2; attempt += 1) results.push((await fetch(url, { method, body: method === 'POST' ? '{}' : undefined })).status);
        }
      }
      return results;
    }, urls);
    expect(statuses.every((status) => status === 200)).toBe(true);

    const cachedUrls = await page.evaluate(async () => {
      const found: string[] = [];
      for (const name of await caches.keys()) for (const entry of await (await caches.open(name)).keys()) found.push(entry.url);
      return found;
    });
    expect(cachedUrls.length).toBeGreaterThan(30);
    expect(cachedUrls.filter((url) => AI_AND_CLOUD_HOSTS.test(url))).toEqual([]);

    // The worker's own code does not mention them either, so it cannot answer for them.
    expect(await (await request.get('/sw.js')).text()).not.toMatch(AI_AND_CLOUD_HOSTS);
  });
});

test.describe('updates', () => {
  test('a new version waits for the athlete: toast first, Reload applies it, nothing reloads by itself', async ({ page, site }) => {
    await installApp(page);
    await page.evaluate(() => { (window as unknown as Record<string, unknown>).openedBeforeUpdate = true; });

    site.deployNewVersion();
    await checkForUpdate(page);
    const toast = page.locator('.update-toast');
    await expect(toast).toContainText('Update available');
    await expect(toast.getByRole('button', { name: 'Reload' })).toBeVisible();
    expect(await hasWaitingWorker(page)).toBe(true);
    expect(await seriousViolations(page)).toEqual([]);

    // It stays a prompt: the page is still the one that was open.
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).openedBeforeUpdate)).toBe(true);

    await toast.getByRole('button', { name: 'Reload' }).click();
    await page.waitForFunction(() => (window as unknown as Record<string, unknown>).openedBeforeUpdate === undefined);
    await expect(page.getByRole('heading', { level: 1, name: 'ArcherLab Edge' })).toBeVisible();
    await expect(page.locator('.update-toast')).toHaveCount(0);
    expect(await hasWaitingWorker(page)).toBe(false);
    expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  });

  test('"Later" hides the toast without applying the update', async ({ page, site }) => {
    await installApp(page);
    site.deployNewVersion();
    await checkForUpdate(page);
    await expect(page.locator('.update-toast')).toBeVisible();
    await page.getByRole('button', { name: 'Dismiss update notice' }).click();
    await expect(page.locator('.update-toast')).toHaveCount(0);
    // The registration helper repeats its "update waiting" call a fraction of a second after the first.
    await page.waitForTimeout(800);
    await expect(page.locator('.update-toast')).toHaveCount(0);
    expect(await hasWaitingWorker(page)).toBe(true);
  });

  test('an update never interrupts a video analysis: the toast waits until it is done', async ({ page, site }) => {
    await installApp(page);
    await startClipAnalysis(page);
    const progress = page.getByRole('progressbar', { name: 'Analysis progress' });
    await expect(progress).toBeVisible();
    await page.evaluate(() => { (window as unknown as Record<string, unknown>).openedBeforeUpdate = true; });

    site.deployNewVersion();
    await checkForUpdate(page);
    await expect.poll(() => hasWaitingWorker(page)).toBe(true);
    // The new version is ready, but the analysis is still running and nothing has been said or reloaded.
    await expect(progress).toBeVisible();
    await expect(page.locator('.update-toast')).toHaveCount(0);

    await expectReport(page);
    await expect(page.locator('.update-toast')).toContainText('Update available');
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).openedBeforeUpdate)).toBe(true);
    await expect(page.locator('.va-table tbody tr')).toHaveCount(E2E_SHOT_COUNT);
  });
});
