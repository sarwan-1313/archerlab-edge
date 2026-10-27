# Converting a video to MP4 on the device

Some clips cannot be played by the browser, typically an iPhone `.mov` recorded in HEVC and opened in Chrome or Firefox. Video Analysis then says why and offers **Convert to MP4 on this device**: ffmpeg compiled to WebAssembly re-encodes the clip as an H.264 MP4 inside the browser. **The clip is never uploaded**, and the converter itself is only downloaded once the athlete asks for it.

## Where the code is

| File | Role |
| --- | --- |
| `src/video-analysis/convert.ts` | Pure helpers: manifest parsing, choice of core, `ffprobe` parsing, ffmpeg arguments, output file name, time estimate, error wording. Unit-tested |
| `src/video-analysis/browser/convertVideo.ts` | Browser side: downloads the core, runs `@ffmpeg/ffmpeg` in a Web Worker, probes and converts the clip, and cleans up |
| `src/components/video/ConvertPanel.tsx` | The interface: offer, download progress, confirmation for long clips, progress with time left, cancel, failure with the ffmpeg log |
| `src/components/video/TrimPreview.tsx` | Shows the panel when the preview cannot play the clip or read its length |
| `scripts/copy-ffmpeg-core.mjs` | `npm run ffmpeg:core`: copies the core from `node_modules` into `public/ffmpeg/` |
| `public/ffmpeg/` | The self-hosted core, `manifest.json` and `NOTICE.txt` |

## What happens

1. The preview step cannot play the clip, so it shows the browser's reason and the **Convert** button. Nothing is downloaded yet.
2. The athlete presses the button. The app reads `ffmpeg/manifest.json`, loads `@ffmpeg/ffmpeg` (a separate chunk of 3 kB plus a 2.5 kB worker, and nothing in the main bundle refers to ffmpeg, so athletes who never convert never download any of it) and downloads the core. The progress bar uses the uncompressed sizes from the manifest, so it is right even when the host compresses the response.
3. ffmpeg starts in a Web Worker. The clip is mounted (`WORKERFS`) and read in place instead of copied, falling back to a copy where mounting is not available. `ffprobe` reads its length, size, frame rate and codec.
4. A clip longer than 5 minutes (`CONVERT_CONFIG.warnDurationS`) waits for a yes, because it takes a long time and a lot of memory. Anything shorter starts at once.
5. The conversion runs with progress and an estimate of the time left. **Cancel** stops the worker and frees the downloaded core.
6. The MP4 replaces the original for the rest of the flow: the page returns to the trim and preview step with the converted file and the notice "Converted to … on this device. Nothing was uploaded."

## What the conversion does

`buildConvertArgs` in `convert.ts`, with the numbers in `CONVERT_CONFIG`:

| Setting | Value | Why |
| --- | --- | --- |
| Size | Long edge capped at 720 px, never enlarged, both sides even | Pose tracking downsamples to about this anyway, and H.264 needs even sides. ffmpeg applies the rotation flag first, so a portrait phone clip is measured the way it is shown |
| Video | H.264 (`libx264`), `veryfast`, CRF 24, `yuv420p` | `veryfast` keeps a WebAssembly encode practical; `yuv420p` plays everywhere |
| Audio | AAC, 128 kbit/s | The sound is used to time releases, so it is kept |
| Streams | First video stream and first audio stream only | iPhone `.mov` files carry timecode and metadata tracks that MP4 cannot hold |
| Container | MP4 with `+faststart` | Starts playing without reading the whole file |

The output is named `clip.mp4` for `clip.mov`, and `clip-converted.mp4` for a file that is already an `.mp4`.

## Which core

| Core | Package | Used when |
| --- | --- | --- |
| `single` | `@ffmpeg/core` (a dependency) | Always available |
| `multi` | `@ffmpeg/core-mt` | Only if installed (the script then copies it) **and** the page is cross-origin isolated (`crossOriginIsolated` and `SharedArrayBuffer`) |

Isolation needs the host to send `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. This deployment sends neither (see `vercel.json`) and does not install `@ffmpeg/core-mt`, so every conversion uses the single-thread core. Isolation changes how the whole site loads cross-origin resources, so check the rest of the app, including the optional cloud features, before adding those headers.

## Updating the core

```bash
npm run ffmpeg:core
```

Run it after changing the pinned `@ffmpeg/core` version, and commit `public/ffmpeg/`. It writes `manifest.json` with the version, the licence and the uncompressed size of each file, and stops with an error if `@ffmpeg/core` is not installed. `CONVERT_CONFIG.approxDownloadBytes`, which the offer text shows before the manifest has been read, must match those sizes, so update it with the core.

## Offline, caching and cost

- **The first conversion needs a connection.** The core (about 31 MB) is not precached, because most athletes never convert: it is downloaded when a conversion starts. In a production build the service worker then keeps it in a runtime cache named `archerlab-ffmpeg-core-<version>` (see `pwa.config.ts`), so later conversions neither download it again nor need a connection. `ffmpeg/manifest.json` is precached, so the converter can start offline. A new core gets a new cache name; the old one stays until the site's data is cleared. `npm run dev` has no service worker, so there only the browser's HTTP cache helps. Offline with no downloaded core, the converter cannot start: the panel says so and disables its button (`converterIsCached()` asks the Cache API; while that is still pending, or if it fails, the button stays enabled). Everything else in Video Analysis works offline ([pwa.md](pwa.md)).
- **Size.** The core is 32,344,223 bytes (30.8 MiB; `ffmpeg-core.wasm` is 30.7 MiB of that). Compressed in a local test it is 9.8 MiB with gzip level 6 and 8.9 MiB with brotli quality 4, so a host that compresses `application/wasm` sends far less; what a given host actually serves has not been checked.
- **Memory.** The converted file is held in memory, next to ffmpeg's own WebAssembly heap. A device that runs out and reports it gets a message suggesting a shorter clip or a lower-resolution MP4 from the phone. A tab that is simply killed cannot say anything: the real-conversion e2e specs crashed the page on an 8 GB VM while only 1.5 to 2.7 GB was free, and passed with about 3.5 GB free. Give them room when running them.
- **The tab must stay open and in front** while a conversion runs. The panel says so.

## Time estimate

`estimateConvertSeconds` models the work per frame: length × frame rate × (`encodePerFrame` + `decodePerSourceMegapixel` × source megapixels), using the length, size and frame rate from `ffprobe` (`fallbackFps` and `fallbackMegapixels` stand in for what a file does not report). It is shown before the conversion starts and while only a few percent is done; after that `remainingSeconds` uses the rate measured so far.

The constants in `CONVERT_CONFIG.estimate` come from timing the single-thread core in headless Chromium on a 2-vCPU VM, as recorded in `convert.ts`: synthetic H.264 sources ran at 0.040 s/frame at 1280×720, 0.050 at 1920×1080 and 0.053 at 1080×1920. They are padded, because real footage encodes slower than synthetic and HEVC decodes slower than H.264. Re-time them after changing the preset, the quality, the size cap or the core.

## Errors

`describeConvertFailure` turns whatever went wrong into words an archer can act on: out of memory, converter not downloadable, or the last line ffmpeg printed that reads like a problem. A file ffmpeg cannot read gets that reason (`describeNoVideo`), and a file with no video track says so. The panel's **What ffmpeg reported** disclosure shows the last lines of ffmpeg's output.

Two quirks of this core: its `ffprobe` returns exit code -1 even when it worked, so `openConverter` ignores the code and judges by whether the probe wrote readable output; and libx265 hangs in it, so no HEVC test clip can be made here.

## Licence

The ffmpeg core is licensed GPL-2.0-or-later (the single-thread build is configured with `--enable-gpl --enable-libx264 --enable-libx265 --disable-pthreads`, and the configuration is embedded in the wasm); ArcherLab Edge is MIT. The core runs as a separate program in a Web Worker and the app talks to it by messages. `public/ffmpeg/NOTICE.txt` has the licence and where to get the source, and the panel links to it. Deploy it together with the core files.

## Testing it

- `src/video-analysis/convert.test.ts`: the pure helpers.
- `src/components/video/ConvertPanel.test.tsx`: the panel, with a fake converter.
- `src/video-analysis/browser/convertVideo.test.ts`: downloading and cleaning up, with a fake ffmpeg. This includes freeing the downloaded core when the athlete cancels.
- `pwa.config.test.ts`: the manifest is precached, the core is not, and the core's runtime cache is named after its version.
- `src/video-analysis/browser/convertVideoCache.test.ts` and the offline cases in `ConvertPanel.test.tsx` and `TrimPreview.test.tsx`: finding the stored converter (including the revision key Workbox precaches the manifest under), and the disabled button with its explanation.
- `e2e/pwa.e2e.ts`, with a real service worker: offline with no converter the button is disabled and says why; after the core has been fetched once the button works offline and the requests a conversion makes are answered from the cache; and a clip is really converted with the network off, without asking the server for the core again.
- `e2e/convert-video.e2e.ts` runs the **real** core: an unplayable clip is converted to an H.264/AAC MP4 and goes on to the trim step (self-hosted, nothing from another origin), a file ffmpeg cannot read shows its real reason, and cancelling during the download returns to the offer. Its fixture, `e2e/fixtures/unplayable-clip.avi`, is MPEG-4 in AVI: no browser plays it but ffmpeg decodes it, which is the same position as an iPhone HEVC `.mov` in Chrome.
- A real HEVC `.mov` is not covered by any test. After changing the arguments or the core, convert one by hand: `npm run build && npm run preview`.
