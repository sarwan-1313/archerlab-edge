# Installing and working offline (PWA)

ArcherLab Edge is a progressive web app: athletes can install it on a phone or computer, and **Live Analysis and Video Analysis work with the network off**. Everything is configured in [`pwa.config.ts`](../pwa.config.ts) (via `vite-plugin-pwa`, which generates the service worker with Workbox) and wired into the app in [`src/pwa/`](../src/pwa).

The service worker only exists in production builds. `npm run dev` registers none; to try it, run `npm run build && npm run preview`.

## What is cached

| Kept | How | Why |
| --- | --- | --- |
| The app shell, every page chunk, the self-hosted fonts, the icons | Precached at install | The app opens offline from the first visit on |
| MediaPipe's SIMD runtime (`mediapipe/wasm/vision_wasm_internal.*`) | Precached | Loaded by every browser with WebAssembly SIMD |
| The Lite pose model, the hand and face models, `models/models.json` | Precached | Live Analysis (pose and gesture scoring) and Video Analysis (including anchor detail) start with these |
| Full and Heavy pose models (9 MB and 30 MB) | Cached the first time they are used | Too large to download for every install |
| MediaPipe's non-SIMD runtime (`vision_wasm_nosimd_internal.*`) | Cached the first time it is used | About 11 MB, for browsers without WebAssembly SIMD |
| The converter's manifest (`ffmpeg/manifest.json`) | Precached | A few hundred bytes; lets Convert to MP4 start offline |
| The ffmpeg converter core (`ffmpeg/single/ffmpeg-core.*`) | Cached the first time an athlete converts | About 31 MB that most athletes never need ([video-conversion.md](video-conversion.md)) |

The precache is about 26 MB, so the first visit is best done on Wi-Fi. The `module` MediaPipe runtime is never requested by the app, so it is not cached.

The precache is an include list (`PRECACHE_GLOBS`): a file added to `public/` is not downloaded by every install until it is listed. Workbox skips files over `MAX_PRECACHE_FILE_BYTES` without failing the build, so `e2e/pwa.e2e.ts` checks that the files above really are in the cache.

### Never cached

The service worker answers only precached files, page navigations and the same-origin runtime routes above. **Requests to another origin are never intercepted**, so Supabase (accounts and backup), the AI providers (Anthropic, OpenAI, Google), Dropbox, Google Drive and links an athlete pastes go straight to the network and are never stored. `pwa.config.test.ts` and `e2e/pwa.e2e.ts` check this against the real service worker. Keep it that way: do not add a catch-all runtime route.

## Offline behaviour

- **Offline badge.** A small badge in the top bar shows while the device is offline (`navigator.onLine`).
- **Pose models.** Full is preselected when a deployment has it, but offline only models already on the device can load. Video Analysis then offers Lite, and Full or Heavy once they have been used online (`availableModels()` in `src/video-analysis/browser/poseModel.ts`).
- **Sign-in.** An expired cloud session is kept, not deleted, when it cannot be refreshed because the device is offline or the service is down, busy or timing out, so an athlete is not signed out at a range with no signal. Only the server refusing the refresh token (HTTP 400, 401 or 403) ends the session.
- **Convert to MP4** works offline once a first conversion has downloaded the converter (about 31 MB, kept like the larger pose models). Before that it needs a connection: offline, the button is disabled and says so ([video-conversion.md](video-conversion.md)).
- **Cloud features** (backup, AI review, imports) need a connection and say so when they fail.

## Updates

A new version installs in the background and **waits**: nothing reloads until the athlete presses **Reload** in the "Update available" toast ([`UpdateToast`](../src/components/UpdateToast.tsx)). The toast stays hidden while a live session or a video analysis is running (`useHoldUpdates`) and appears when it ends. "Later" hides it until the app is opened again.

When the athlete accepts an update in one tab, other open tabs reload, unless they are mid-analysis; then they wait for their own Reload button. The app also looks for a new version every hour and when it comes back to the front, because an installed app can stay open for days.

Why `registerType: 'prompt'` and not `autoUpdate`: auto-update reloads the page as soon as a new worker is ready, which would cut an analysis short.

## Icons and manifest

The manifest (name, short name, `#04060a` theme colour, standalone display) is in `pwa.config.ts`. The icons in `public/pwa/` are generated from `public/favicon.svg`:

```bash
npm run pwa:icons
```

It renders 192 and 512 px icons, a maskable 512 px icon (full-bleed theme colour, logo inside the safe zone) and a 180 px Apple touch icon with the Chromium that Playwright installs, so it needs no extra dependencies. Run `npx playwright install chromium` first if you have not already. To change the app icon, replace `public/favicon.svg` and run it again.

## Testing it

- `pwa.config.test.ts`, `src/pwa/`, `src/components/UpdateToast.test.tsx` and `OfflineIndicator.test.tsx`: caching rules, update state, the toast and the badge.
- `npm run test:e2e` includes `e2e/pwa.e2e.ts`, which runs the e2e build (stubbed pose model) behind a small server that can publish "a new version": install and precache, opening and analysing a clip with the network off, runtime caching of Full, never caching cloud requests, and the update flow (toast, Reload, Later, and no toast during an analysis). Other e2e specs run with service workers blocked.
- By hand, with the real MediaPipe: `npm run build && npm run preview`, open the app, wait a few seconds, switch the browser's network to Offline (DevTools → Network) and reload.
