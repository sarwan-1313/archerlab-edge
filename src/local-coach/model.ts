import type { AppConfig, ModelRecord } from '@mlc-ai/web-llm';

/**
 * The model behind the private coach. Everything here is pinned: the weights to
 * a Hugging Face commit and the WebAssembly runtime to a GitHub commit, so what
 * runs on the athlete's device cannot change underneath us. The config, runtime
 * and tokenizer are also checked against SHA-384 hashes (see docs/local-coach.md
 * for how to update them).
 *
 * Qwen2.5-1.5B-Instruct was chosen because it is licensed Apache-2.0 at this
 * size (the 3B model is not), is small enough for phones with a recent GPU,
 * and follows a JSON answer format reliably when decoding is constrained.
 */
const WEIGHTS_REVISION = '9bd564b064631febf14deadcac492efb761d60c3';
const RUNTIME_REVISION = '00fe7a40e57e5e8eb9fef87526a4bf28ad5846c0';

export const LOCAL_MODEL = {
  id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
  name: 'Qwen2.5 1.5B Instruct',
  maker: 'Alibaba Cloud (Qwen team)',
  licence: 'Apache License 2.0',
  licenceUrl: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct/blob/main/LICENSE',
  sourceUrl: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct',
  /** Weights (880,289,238 bytes) plus the WebAssembly runtime (6,031,744 bytes), exactly as downloaded. */
  downloadBytes: 886_320_982,
  /** GPU memory the model needs while it is loaded, from WebLLM's own table. */
  gpuMemoryMb: 1630,
  /** The prompt plus the answer must fit in this many tokens. */
  contextTokens: 4096,
} as const;

/** Models are never read from WebLLM's default list, so a package update cannot swap the model. */
export const LOCAL_MODEL_RECORD: ModelRecord = {
  model: `https://huggingface.co/mlc-ai/${LOCAL_MODEL.id}/resolve/${WEIGHTS_REVISION}`,
  model_id: LOCAL_MODEL.id,
  model_lib: `https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/${RUNTIME_REVISION}/web-llm-models/v0_2_86/base/Qwen2-1.5B-Instruct-q4f16_1_cs1k-webgpu.wasm`,
  vram_required_MB: LOCAL_MODEL.gpuMemoryMb,
  low_resource_required: true,
  required_features: ['shader-f16'],
  overrides: { context_window_size: LOCAL_MODEL.contextTokens },
  integrity: {
    config: 'sha384-edTpAfxnd5O5jvlUbExraVs/Bmqwpni3s8wpFZMcNPSG+5O9sr1ltJJG9zQaM/Vb',
    model_lib: 'sha384-fulpsruohkPyMTwf0apV5cWRZWzfOsLlBQjxRbwiNdFg7CZD+iBrRJ5+IL9MenBN',
    tokenizer: { 'tokenizer.json': 'sha384-l5K5CpBtbywB5lTHysuesWqCadOP0PqIM5CaLYNPn2xpBA30Q5pAgRo4L1K2EjDM' },
    onFailure: 'error',
  },
};

export const LOCAL_APP_CONFIG: AppConfig = { model_list: [LOCAL_MODEL_RECORD] };

/** Remembers that the model was downloaded, so the panel can say so without loading the engine. */
export const LOCAL_MODEL_FLAG = 'archerlab-edge:local-coach-model';

/** The download size as an operating system or browser would show it (decimal megabytes). */
export const LOCAL_MODEL_SIZE_LABEL = `${Math.round(LOCAL_MODEL.downloadBytes / 1e6)} MB`;
