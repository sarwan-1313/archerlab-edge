# Private coach (on-device AI)

An optional second opinion in a video report that runs entirely in the browser, with [WebLLM](https://github.com/mlc-ai/web-llm). It is off until the athlete asks for it, needs no key or account, and sends nothing anywhere: the only network use is the one-time download of the model.

## What it does

1. **Review.** Builds the same measurements-only prompt as the cloud coaches (`buildCoachRequest` with no images), asks the model for the same JSON, and reads it with `parseCoachReview`. The result is shown with the same review card and counts in the combined consensus.
2. **Follow-up chat.** Questions are answered from the report's measurements only (`buildChatSystem`). The video is never given to the model, and the system prompt tells it to say so when the report does not hold the answer.

## The model

| | |
|---|---|
| Model | Qwen2.5-1.5B-Instruct, 4-bit (`q4f16_1`), MLC build |
| Download | 886 MB: 880,289,238 bytes of weights + 6,031,744 bytes of WebAssembly runtime. Saved in the browser's Cache Storage after the first download |
| Licence | Apache License 2.0 ([text](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct/blob/main/LICENSE)). Keep the licence link visible in the confirmation dialog. The 3B Qwen model uses a non-commercial licence, so do not switch to it |
| Needs | WebGPU with `shader-f16`; about 1.6 GB of graphics memory while loaded; 4,096-token context |
| Comes from | `huggingface.co/mlc-ai/...` (weights) and `raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/...` (runtime) |

Both sources are pinned to exact commits in `src/local-coach/model.ts`, and the config, runtime and tokenizer are checked against SHA-384 hashes (a mismatch fails the load). The weight shards are not hash-checked by WebLLM; pinning the Hugging Face commit is what protects them.

## Memory and lifetime

- WebLLM and the model run in a worker (`engine.worker.ts`), loaded only when the athlete clicks.
- **Stop** ends the review or answer being written (keeping any partial chat answer) or, during loading, ends the worker, which stops the download. Files already saved are kept.
- Leaving the report (or the page) unloads the model from graphics memory and ends the worker.
- "Remove model" in the card, and "Delete everything on this device" on the Privacy page, delete the saved files.

## Updating the model

1. Pick a model from `prebuiltAppConfig.model_list` in the installed `@mlc-ai/web-llm`; check its licence on the original model's page.
2. Set `WEIGHTS_REVISION` (Hugging Face `sha`) and `RUNTIME_REVISION` (latest commit touching the `.wasm`) in `model.ts`.
3. Recompute the SHA-384 of `mlc-chat-config.json`, `tokenizer.json` and the `.wasm`: `openssl dgst -sha384 -binary FILE | openssl base64 -A`, prefixed with `sha384-`.
4. Update `downloadBytes` (sum of the weight files plus the `.wasm`) and `gpuMemoryMb`, then the numbers on this page and the Privacy page text follow from `model.ts`.

## Offline and the service worker

The model is cached by WebLLM itself, not by the app's service worker, and the WebLLM chunk is large. If the app precaches its build output (see the PWA work), exclude the `@mlc-ai/web-llm` chunk and `engine.worker` from the precache list.
