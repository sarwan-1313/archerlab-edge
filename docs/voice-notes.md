# Voice notes

After a shot, the athlete can say the score and anything they noticed ("nine, dropped the bow arm"). The note is turned into text **on the device** with Whisper, the score in it is offered as a suggestion, and only the text the athlete confirms is saved. **The audio never leaves the device and is never stored.**

## Where it is

| Place | What it does |
| --- | --- |
| Live Analysis, shot review panel | **Voice note** button for the shot just captured, and **Listen for 4 s after each shot**. A heard score is offered as **Save note and score 9**; **Save note only** keeps just the text |
| Video report, *Shot by shot* table | **Add note** / **Edit** per shot. Saved with the report on this device. Video shots have no arrow score, so no score is offered there |
| Replay | Shows the shot's note under the reported result |

## Code

| File | Role |
| --- | --- |
| `src/voice-notes/config.ts` | Model folder, download sizes, languages, the athlete's settings (`archerlab-edge:voice-notes`) |
| `src/voice-notes/scoreParser.ts` | Finds a score in the text: "ten", "X", "inner ten", "a seven", "8", "miss". Words that are also ordinary words ("one", "for", "to", "too", "won", "ate") only count when clearly said as a score ("a four", or alone at the end) |
| `src/voice-notes/browser/transcriber.ts` | Loads Transformers.js, the runtime and the model on first use, and transcribes a recording |
| `src/components/VoiceNotePanel.tsx` | Consent, recording (MediaRecorder), progress, review and save |

## Model and download

- **Library:** `@huggingface/transformers` 4.3.1 (Apache-2.0), pinned. It is imported only when a note is transcribed, so it is not in the main bundle.
- **Model:** `onnx-community/whisper-tiny` (Apache-2.0, converted from `openai/whisper-tiny`), the 8-bit quantised encoder and merged decoder, pinned to commit `ff41770`. About 41.6 MiB (43.6 MB) with the tokenizer and configs.
- **Runtime:** ONNX Runtime Web (MIT), the `ort-wasm-simd-threaded.asyncify` build, which is the one `onnxruntime-web/webgpu` (imported by Transformers.js) is made for. About 27 MB. Using the plain build with that loader does not work.
- **Total first download:** about 70 MB. The panel asks before it, with the size, and remembers the answer.

Nothing is fetched from the model hub or a CDN at runtime: `env.allowRemoteModels` is off, models load from `/models/whisper-tiny/`, and the runtime from `/ort/` (Transformers.js would otherwise load it from jsDelivr).

| Files | Where they come from |
| --- | --- |
| `public/models/whisper-tiny/` | `npm run models:whisper`. Not committed (`.gitignore`); Vercel builds fetch it (`build:vercel`, optional: a failed download deploys without voice notes, and the panel says the model is not deployed) |
| `public/ort/` | `npm run ort:wasm` copies it from `node_modules`. Committed, like the MediaPipe and ffmpeg runtimes. Run it again after updating Transformers.js |

**Caching.** Transformers.js keeps the model files in the browser's Cache Storage after the first download. The service worker keeps the runtime after first use (`archerlab-ort-runtime-v1`, see `pwa.config.ts`; bump the version when the runtime changes). Neither is precached, so the app install stays small, and athletes who never record a note never download them.

## Languages

English is the default. Hindi and Punjabi are offered as **experimental**: whisper-tiny is multilingual and has both, but it is much weaker on them than on English. Scores are parsed from English words and from digits, so in Hindi or Punjabi saying the number as a digit works best. A larger model (whisper-base or small) would improve them, at several times the download.

## Limits

- Transcription runs on the main thread with one CPU thread (the site is not cross-origin isolated). A few seconds of speech take a few seconds.
- Creating the runtime session needs a few hundred MB of memory; on a device with very little free memory the tab can be closed by the browser.
- The athlete always confirms the text and the score; a misheard score is never saved by itself.

## Tests

- `src/voice-notes/scoreParser.test.ts`: the score parser.
- `src/components/VoiceNotePanel.test.tsx`: asking before the download, suggesting and confirming a score, saving without it, "listen after each shot", and releasing the microphone.
- `pwa.config.test.ts`: the runtime is cached after first use and never precached.
