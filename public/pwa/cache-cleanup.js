// Imported by the generated service worker (`workbox.importScripts` in pwa.config.ts).
//
// The converter's cache is named after the ffmpeg core version (FFMPEG_CORE_CACHE in pwa.config.ts), so a new
// core is downloaded instead of being answered with the old files, which keep their URLs. This removes the
// caches of older cores when a new worker takes over, so each one does not leave 31 MB behind.
//
// The current version is read from the precached manifest. If that cannot be read, nothing is deleted.
const FFMPEG_CORE_CACHE_PREFIX = 'archerlab-ffmpeg-core-';

async function deleteOlderFfmpegCores() {
  try {
    const response = await fetch(new URL('ffmpeg/manifest.json', self.registration.scope));
    if (!response.ok) return;
    const { version } = await response.json();
    if (typeof version !== 'string' || !version) return;
    const current = FFMPEG_CORE_CACHE_PREFIX + version;
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(FFMPEG_CORE_CACHE_PREFIX) && name !== current).map((name) => caches.delete(name)));
  } catch {
    // Housekeeping only: the next activation tries again.
  }
}

self.addEventListener('activate', (event) => event.waitUntil(deleteOlderFfmpegCores()));
