import { afterEach, describe, expect, it, vi } from 'vitest';
import { converterIsCached } from './convertVideo';

const MANIFEST = { version: '0.12.10', cores: { single: { js: 'single/ffmpeg-core.js', wasm: 'single/ffmpeg-core.wasm', bytes: { js: 4, wasm: 4 } } } };

describe('converterIsCached', () => {
  afterEach(() => vi.unstubAllGlobals());

  const MANIFEST_URL = '/ffmpeg/manifest.json';
  const CORE_URLS = ['/ffmpeg/single/ffmpeg-core.js', '/ffmpeg/single/ffmpeg-core.wasm'];

  /**
   * A Cache API that holds exactly these keys, and matches like the real one: a key with a query string
   * (Workbox stores precached files as `url?__WB_REVISION__=hash`) only matches when the search is ignored.
   * The manifest answers with the real manifest.
   */
  function stubCaches(held: string[]) {
    vi.stubGlobal('caches', {
      match: vi.fn(async (url: string, options?: { ignoreSearch?: boolean }) => {
        const key = held.find((entry) => entry === url || (options?.ignoreSearch && entry.split('?')[0] === url));
        return key === undefined ? undefined : new Response(key.split('?')[0] === MANIFEST_URL ? JSON.stringify(MANIFEST) : 'core');
      }),
    });
  }

  it('is true when the service worker holds the manifest and the core files it lists', async () => {
    stubCaches([MANIFEST_URL, ...CORE_URLS]);
    expect(await converterIsCached()).toBe(true);
  });

  it('finds the manifest under the revision key the service worker precaches it with', async () => {
    stubCaches([`${MANIFEST_URL}?__WB_REVISION__=98f9bdd684ae54419ad02800663f5dec`, ...CORE_URLS]);
    expect(await converterIsCached()).toBe(true);
  });

  it('is false when the core has never been downloaded, even though the manifest is precached', async () => {
    stubCaches([MANIFEST_URL]);
    expect(await converterIsCached()).toBe(false);
  });

  it('is false when only part of the core is held', async () => {
    stubCaches([MANIFEST_URL, CORE_URLS[0]]);
    expect(await converterIsCached()).toBe(false);
  });

  it('is false when there is no manifest', async () => {
    stubCaches(CORE_URLS);
    expect(await converterIsCached()).toBe(false);
  });

  it('is false in a browser without the Cache API', async () => {
    vi.stubGlobal('caches', undefined);
    expect(await converterIsCached()).toBe(false);
  });
});
