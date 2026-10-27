import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FFMPEG_CORE_CACHE, PRECACHE_GLOBS, PRECACHE_IGNORES, pwaOptions, RUNTIME_CACHING, THEME_COLOR } from './pwa.config.ts';

type Route = (typeof RUNTIME_CACHING)[number];

function matches(route: Route, href: string, sameOrigin: boolean): boolean {
  if (typeof route.urlPattern !== 'function') throw new Error('Runtime routes are written as functions.');
  return Boolean(route.urlPattern({ url: new URL(href), sameOrigin } as Parameters<typeof route.urlPattern>[0]));
}
const handles = (href: string, sameOrigin = true) => RUNTIME_CACHING.some((route) => matches(route, href, sameOrigin));

describe('precache', () => {
  it('has what Live and Video Analysis need to start offline', () => {
    expect(PRECACHE_GLOBS).toEqual(expect.arrayContaining([
      'index.html',
      'assets/**/*',
      'fonts/*.woff',
      'mediapipe/wasm/vision_wasm_internal.{js,wasm}',
      'models/pose_landmarker_lite.task',
      'models/hand_landmarker.task',
      'models/models.json',
    ]));
  });

  it('has the converter\'s manifest, so Convert to MP4 can start offline, but never the 31 MB core itself', () => {
    expect(PRECACHE_GLOBS).toContain('ffmpeg/manifest.json');
    expect(PRECACHE_GLOBS.join('\n')).not.toMatch(/ffmpeg-core|ffmpeg\/(?:single|multi)/);
  });

  it('leaves the large optional files out', () => {
    const listed = PRECACHE_GLOBS.join('\n');
    expect(listed).not.toMatch(/full|heavy|nosimd|module/);
    expect(PRECACHE_IGNORES).toEqual(expect.arrayContaining(['**/pose_landmarker_full.task', '**/pose_landmarker_heavy.task']));
  });

  it('allows files as large as MediaPipe\'s 11 MB wasm', () => {
    expect(pwaOptions.workbox?.maximumFileSizeToCacheInBytes).toBeGreaterThan(11.5 * 1024 * 1024);
  });
});

describe('runtime caching', () => {
  it('caches the Full and Heavy pose models after first use', () => {
    expect(handles('https://app.test/models/pose_landmarker_full.task')).toBe(true);
    expect(handles('https://app.test/models/pose_landmarker_heavy.task')).toBe(true);
    expect(handles('https://app.test/archerlab/models/pose_landmarker_full.task')).toBe(true);
  });

  it('caches the non-SIMD MediaPipe runtime after first use', () => {
    expect(handles('https://app.test/mediapipe/wasm/vision_wasm_nosimd_internal.wasm')).toBe(true);
    expect(handles('https://app.test/mediapipe/wasm/vision_wasm_nosimd_internal.js')).toBe(true);
  });

  it('caches the ffmpeg converter core after the first conversion', () => {
    for (const file of ['single/ffmpeg-core.js', 'single/ffmpeg-core.wasm', 'multi/ffmpeg-core.js', 'multi/ffmpeg-core.wasm', 'multi/ffmpeg-core.worker.js']) {
      expect(handles(`https://app.test/ffmpeg/${file}`), file).toBe(true);
    }
    expect(handles('https://app.test/archerlab/ffmpeg/single/ffmpeg-core.wasm')).toBe(true);
  });

  it('caches the voice-note runtime after first use, but never precaches it or the speech model', () => {
    expect(handles('https://app.test/ort/ort-wasm-simd-threaded.asyncify.wasm')).toBe(true);
    expect(handles('https://app.test/ort/ort-wasm-simd-threaded.asyncify.mjs')).toBe(true);
    expect(PRECACHE_GLOBS.join('\n')).not.toMatch(/ort|whisper/);
    expect(handles('https://cdn.example.com/ort/ort-wasm-simd-threaded.asyncify.wasm', false)).toBe(false);
  });

  it('names the converter\'s cache after its version, so a new core is not answered with the old files', () => {
    expect(FFMPEG_CORE_CACHE).toMatch(/^archerlab-ffmpeg-core-.+/);
    const manifestUrl = new URL('./public/ffmpeg/manifest.json', import.meta.url);
    const version = existsSync(manifestUrl) ? (JSON.parse(readFileSync(manifestUrl, 'utf8')) as { version: string }).version : 'unknown';
    expect(FFMPEG_CORE_CACHE).toBe(`archerlab-ffmpeg-core-${version}`);
  });

  it('does not touch what is precached, or anything else of the app\'s', () => {
    expect(handles('https://app.test/models/pose_landmarker_lite.task')).toBe(false);
    expect(handles('https://app.test/mediapipe/wasm/vision_wasm_internal.wasm')).toBe(false);
    expect(handles('https://app.test/ffmpeg/manifest.json')).toBe(false);
    expect(handles('https://app.test/ffmpeg/NOTICE.txt')).toBe(false);
    expect(handles('https://app.test/video')).toBe(false);
  });

  it('never handles a request to another origin, so Supabase and the AI providers are never cached', () => {
    const others = [
      'https://abc123.supabase.co/rest/v1/video_reports',
      'https://abc123.supabase.co/storage/v1/object/videos/u/r.mp4',
      'https://abc123.supabase.co/auth/v1/token?grant_type=refresh_token',
      'https://api.anthropic.com/v1/messages',
      'https://api.openai.com/v1/chat/completions',
      'https://generativelanguage.googleapis.com/v1beta/models/gemini:generateContent',
      // Even a look-alike of a cached file, on another origin.
      'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
      'https://cdn.example.com/ffmpeg/single/ffmpeg-core.wasm',
    ];
    for (const href of others) expect(handles(href, false), href).toBe(false);
  });

  it('only caches successful responses, and bounds each cache', () => {
    for (const route of RUNTIME_CACHING) {
      expect(route.handler).toBe('CacheFirst');
      expect(route.options?.cacheableResponse?.statuses).toEqual([200]);
      expect(route.options?.expiration?.maxEntries).toBeLessThanOrEqual(3);
      expect(route.options?.expiration?.purgeOnQuotaError).toBe(true);
    }
  });
});

describe('manifest', () => {
  const manifest = (() => {
    if (!pwaOptions.manifest) throw new Error('The web app manifest is required.');
    return pwaOptions.manifest;
  })();

  it('is installable and themed like the app', () => {
    expect(manifest.name).toBe('ArcherLab Edge');
    expect(manifest.short_name).toBe('ArcherLab');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe('#04060a');
    expect(manifest.theme_color).toBe(THEME_COLOR);
    expect(manifest.start_url).toBe('/');
  });

  it('has 192 and 512 icons and a maskable one', () => {
    const icons = manifest.icons ?? [];
    expect(icons.find((icon) => icon.sizes === '192x192' && icon.purpose === 'any')).toBeTruthy();
    expect(icons.find((icon) => icon.sizes === '512x512' && icon.purpose === 'any')).toBeTruthy();
    expect(icons.find((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable')).toBeTruthy();
  });
});

describe('updates', () => {
  it('waits for the athlete instead of taking over on its own', () => {
    expect(pwaOptions.registerType).toBe('prompt');
    expect(pwaOptions.workbox?.skipWaiting).not.toBe(true);
    expect(pwaOptions.workbox?.clientsClaim).toBe(true);
  });
});
