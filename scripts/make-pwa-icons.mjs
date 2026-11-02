// Regenerates the PWA icons in public/pwa from public/favicon.svg, using the
// headless Chromium that Playwright already installs (no extra dependencies).
// Run `npm run pwa:icons` after changing public/favicon.svg, and commit the PNGs.
//
//   icon-192.png / icon-512.png   purpose "any": the logo on a transparent background
//   icon-maskable-512.png         purpose "maskable": full-bleed theme colour with the logo
//                                 inside the central safe zone, so any OS mask keeps it whole
//   apple-touch-icon.png          180 px, opaque (iOS fills transparency with black)
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'public/pwa');
const THEME = '#04060a';

// `logo` is the logo's width as a share of the icon. Maskable icons keep the logo inside the
// 80% safe-zone circle: the favicon's diagonal is about 1.39 times its width, so 0.56 fits.
const ICONS = [
  { file: 'icon-192.png', size: 192, logo: 0.78, background: null },
  { file: 'icon-512.png', size: 512, logo: 0.78, background: null },
  { file: 'icon-maskable-512.png', size: 512, logo: 0.56, background: THEME },
  { file: 'apple-touch-icon.png', size: 180, logo: 0.66, background: THEME },
];

const svg = await readFile(resolve(root, 'public/favicon.svg'));
const dataUrl = `data:image/svg+xml;base64,${svg.toString('base64')}`;

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
try {
  for (const { file, size, logo, background } of ICONS) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><style>
      html, body { margin: 0; width: ${size}px; height: ${size}px; background: ${background ?? 'transparent'}; }
      body { display: grid; place-items: center; }
      img { width: ${Math.round(size * logo)}px; height: auto; display: block; }
    </style><img alt="" src="${dataUrl}">`);
    await page.evaluate(() => document.querySelector('img').decode());
    await page.screenshot({ path: resolve(outDir, file), omitBackground: background === null });
    await page.close();
    console.log(`public/pwa/${file}`);
  }
} finally {
  await browser.close();
}
