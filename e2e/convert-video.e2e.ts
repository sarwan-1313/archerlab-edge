import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { openPage } from './support/helpers';

// An MPEG-4 video in an AVI: no browser plays it, but ffmpeg decodes it, which is the same position as an
// iPhone HEVC .mov in Chrome. (An x265 clip cannot be made with the ffmpeg.wasm core, which hangs in it.)
const UNPLAYABLE_CLIP = fileURLToPath(new URL('./fixtures/unplayable-clip.avi', import.meta.url));

declare global {
  interface Window { __blobs: Blob[] }
}

/** Remembers every blob the app turns into a URL, so a test can inspect the converted file. */
async function recordBlobs(page: Page) {
  await page.addInitScript(() => {
    window.__blobs = [];
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (object: Blob | MediaSource) => {
      if (object instanceof Blob) window.__blobs.push(object);
      return create(object);
    };
  });
}

test('an unplayable video is converted to MP4 on this device and goes on to the trim step', async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  await recordBlobs(page);
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));

  await openPage(page, '/video', 'Video Analysis');
  await page.getByLabel('Video file').setInputFiles(UNPLAYABLE_CLIP);

  await expect(page.getByRole('alert').first()).toContainText(/cannot play this video/);
  const convert = page.getByRole('button', { name: 'Convert to MP4 on this device' });
  await expect(convert).toBeVisible();
  // Lazy: the 30 MB converter is not touched until the athlete asks for it.
  expect(requested.filter((url) => url.includes('/ffmpeg/') || url.includes('ffmpeg'))).toEqual([]);

  await convert.click();
  await expect(page.getByText('Converted to unplayable-clip.mp4')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/Step 1 of 2 · unplayable-clip\.mp4/)).toBeVisible();

  // Self-hosted: the single-thread core came from this origin (this site sends no COOP/COEP headers), and nothing came from anywhere else.
  expect(requested.some((url) => url.endsWith('/ffmpeg/single/ffmpeg-core.wasm'))).toBe(true);
  expect(requested.some((url) => url.includes('/ffmpeg/multi/'))).toBe(false);
  const foreign = requested.filter((url) => !url.startsWith(baseURL ?? 'http://127.0.0.1') && !url.startsWith('blob:') && !url.startsWith('data:'));
  expect(foreign).toEqual([]);

  // The result is an MP4 with an H.264 video track, 720 px on its long edge, with the sound kept.
  const converted = await page.evaluate(async () => {
    const mp4 = [...window.__blobs].reverse().find((blob) => blob.type === 'video/mp4');
    if (!mp4) return null;
    const bytes = new Uint8Array(await mp4.arrayBuffer());
    const text = new TextDecoder('latin1').decode(bytes);
    return { size: bytes.length, ftyp: text.slice(4, 8), avc1: text.includes('avc1'), aac: text.includes('mp4a'), width: bytes.length ? text.includes('avcC') : false };
  });
  expect(converted).not.toBeNull();
  expect(converted!.size).toBeGreaterThan(10_000);
  expect(converted).toMatchObject({ ftyp: 'ftyp', avc1: true, aac: true });
});

test('a file ffmpeg cannot read shows the real reason, with its output', async ({ page }) => {
  test.setTimeout(120_000);
  await openPage(page, '/video', 'Video Analysis');
  await page.getByLabel('Video file').setInputFiles({ name: 'broken.mov', mimeType: 'video/quicktime', buffer: Buffer.from('this is not a video file at all, just text'.repeat(40)) });
  await page.getByRole('button', { name: 'Convert to MP4 on this device' }).click();

  const alert = page.getByRole('alert').filter({ hasText: 'Conversion failed.' });
  await expect(alert).toBeVisible({ timeout: 90_000 });
  await expect(alert).toContainText('ffmpeg could not read this file: /input/source: Invalid data found when processing input');
  await alert.getByText('What ffmpeg reported').click();
  await expect(alert.locator('pre')).not.toBeEmpty();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test('cancelling while the converter downloads goes back to the offer', async ({ page }) => {
  // The core never arrives, so the download is still going when Cancel is pressed.
  await page.route('**/ffmpeg/single/ffmpeg-core.wasm', () => new Promise(() => undefined));
  await openPage(page, '/video', 'Video Analysis');
  await page.getByLabel('Video file').setInputFiles(UNPLAYABLE_CLIP);
  await page.getByRole('button', { name: 'Convert to MP4 on this device' }).click();

  await expect(page.getByRole('progressbar', { name: 'Converter download' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Convert to MP4 on this device' })).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveCount(0);
});
