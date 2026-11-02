// Regenerates e2e/fixtures/synthetic-archer.webm: a drawn archer plus release
// sounds, built from src/video-analysis/testing/. The clip is drawn and encoded
// (VP8 + Opus) by headless Chromium's WebCodecs, so no extra tools are needed.
// Run `npm run e2e:clip` after changing e2e/support/scenario.ts, and commit the result.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { build } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'e2e/fixtures/synthetic-archer.webm');

const result = await build({
  root,
  configFile: false,
  logLevel: 'warn',
  build: {
    write: false,
    minify: false,
    lib: { entry: resolve(root, 'e2e/clip/render.ts'), formats: ['iife'], name: 'ClipRender', fileName: 'render' },
  },
});
const bundle = (Array.isArray(result) ? result[0] : result).output[0].code;

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  // WebCodecs needs a secure context.
  await page.route('https://clip.test/', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>clip</title>' }));
  await page.goto('https://clip.test/');
  await page.addScriptTag({ content: bundle });
  const bytes = await page.evaluate(() => window.renderClip());
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, Uint8Array.from(bytes));
  console.log(`Wrote ${output} (${(bytes.length / 1024).toFixed(0)} KiB)`);
} finally {
  await browser.close();
}
