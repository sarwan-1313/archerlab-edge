import { readFileSync } from 'node:fs';
import type { VitePWAOptions } from 'vite-plugin-pwa';

/** Matches --ath-ink in src/styles/athletic.css and the theme-color in index.html. */
export const THEME_COLOR = '#04060a';

/**
 * What the service worker keeps for offline use. This is an include list on purpose: a file that is
 * added to public/ later is not precached (and downloaded by every new install) until it is listed here.
 *
 * - The app shell, every lazily loaded page chunk and the self-hosted fonts. (The plugin adds the web app
 *   manifest and its icons itself.)
 * - MediaPipe's SIMD runtime. Only `forVisionTasks(path)` is used, which loads it on every browser with
 *   WebAssembly SIMD; the `module` variant is never requested.
 * - The Lite pose model, which both Live and Video Analysis start with, and the hand model that Live
 *   Analysis uses for gesture scoring. models.json says which pose models the deployment has.
 * - The converter's manifest (a few hundred bytes), so "Convert to MP4" can start offline once the core
 *   itself has been downloaded (see RUNTIME_CACHING). The core is never precached: it is 31 MB and most
 *   athletes never convert.
 */
export const PRECACHE_GLOBS = [
  'index.html',
  'favicon.svg',
  'pwa/apple-touch-icon.png',
  'assets/**/*',
  'fonts/*.woff',
  'mediapipe/wasm/vision_wasm_internal.{js,wasm}',
  'models/models.json',
  'models/pose_landmarker_lite.task',
  'models/hand_landmarker.task',
  'ffmpeg/manifest.json',
];

/** The big models are fetched on first use instead (see RUNTIME_CACHING), never at install. */
export const PRECACHE_IGNORES = ['**/pose_landmarker_full.task', '**/pose_landmarker_heavy.task'];

/** The largest precached file is the 11 MB wasm; Workbox skips anything bigger than this without failing the build. */
export const MAX_PRECACHE_FILE_BYTES = 16 * 1024 * 1024;

/**
 * The pinned ffmpeg core's version, from the manifest `npm run ffmpeg:core` writes. It is part of the cache
 * name below, so a new core is downloaded instead of being answered with the old files (they keep the same
 * URLs). The cache of an older core stays until the site's data is cleared.
 */
function ffmpegCoreVersion(): string {
  try {
    const { version } = JSON.parse(readFileSync(new URL('./public/ffmpeg/manifest.json', import.meta.url), 'utf8')) as { version?: unknown };
    return typeof version === 'string' ? version : 'unknown';
  } catch {
    return 'unknown';
  }
}

export const FFMPEG_CORE_CACHE = `archerlab-ffmpeg-core-${ffmpegCoreVersion()}`;

/**
 * Same-origin GETs the service worker answers from a runtime cache after the first download.
 *
 * These are the ONLY requests the service worker handles besides the precached files and page
 * navigations. Nothing cross-origin is ever intercepted, so Supabase and the AI providers (Claude, GPT,
 * Gemini) are never cached: their requests go straight to the network. e2e/pwa.e2e.ts checks this.
 *
 * The `urlPattern` functions are copied into sw.js as source, so they must not refer to anything outside
 * themselves. Bump the `-v1` in a cache name when the pinned model URLs in scripts/fetch-pose-models.mjs change.
 * (The converter's cache name follows its version by itself.)
 */
export const RUNTIME_CACHING: NonNullable<NonNullable<VitePWAOptions['workbox']>['runtimeCaching']> = [
  {
    // Full and Heavy pose models: 9 MB and 30 MB, so only fetched once an athlete picks one.
    urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/models\/pose_landmarker_(?:full|heavy)\.task$/.test(url.pathname),
    handler: 'CacheFirst',
    options: {
      cacheName: 'archerlab-pose-models-v1',
      cacheableResponse: { statuses: [200] },
      expiration: { maxEntries: 2, purgeOnQuotaError: true },
    },
  },
  {
    // MediaPipe's non-SIMD runtime, for browsers without WebAssembly SIMD (about 11 MB that nearly nobody needs).
    urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/mediapipe\/wasm\/vision_wasm_nosimd_internal\.(?:js|wasm)$/.test(url.pathname),
    handler: 'CacheFirst',
    options: {
      cacheName: 'archerlab-mediapipe-nosimd-v1',
      cacheableResponse: { statuses: [200] },
      expiration: { maxEntries: 2, purgeOnQuotaError: true },
    },
  },
  {
    // The "Convert to MP4" core (js + wasm, 31 MB; a multi-thread build adds a worker script): downloaded
    // when an athlete first converts, then kept, so later conversions do not download it again and also work offline.
    urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/ffmpeg\/(?:single|multi)\/ffmpeg-core\.(?:js|wasm|worker\.js)$/.test(url.pathname),
    handler: 'CacheFirst',
    options: {
      cacheName: FFMPEG_CORE_CACHE,
      cacheableResponse: { statuses: [200] },
      expiration: { maxEntries: 3, purgeOnQuotaError: true },
    },
  },
];

export const pwaOptions: Partial<VitePWAOptions> = {
  // The app shows its own "Update available" toast (src/components/UpdateToast.tsx) and registers the
  // worker itself (src/pwa/serviceWorker.ts), so a new version never takes over until the athlete says so.
  registerType: 'prompt',
  injectRegister: false,
  manifest: {
    id: '/',
    name: 'ArcherLab Edge',
    short_name: 'ArcherLab',
    description: 'On-device archery form analysis: pose tracking, shot capture and video review that run in your browser.',
    lang: 'en',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: THEME_COLOR,
    theme_color: THEME_COLOR,
    categories: ['sports', 'health', 'fitness'],
    icons: [
      { src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    globPatterns: PRECACHE_GLOBS,
    globIgnores: PRECACHE_IGNORES,
    maximumFileSizeToCacheInBytes: MAX_PRECACHE_FILE_BYTES,
    cleanupOutdatedCaches: true,
    // Take over a first-time visitor's page straight away, so lazy chunks come from the cache even before a reload.
    clientsClaim: true,
    // Page navigations get the app shell. Paths with a file extension are files, not app routes.
    navigateFallback: 'index.html',
    navigateFallbackDenylist: [/\/[^/]+\.[^/]+$/],
    runtimeCaching: RUNTIME_CACHING,
  },
};
