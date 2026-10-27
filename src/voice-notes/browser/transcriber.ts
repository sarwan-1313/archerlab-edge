import { decodeAudioTrack } from '../../video-analysis/browser/audioDecode';
import { VOICE_CONFIG, VOICE_LANGUAGES, type VoiceLanguage } from '../config';

const appBase = import.meta.env.BASE_URL.replace(/\/$/, '');
const MODEL_DIR = `${appBase}/models/${VOICE_CONFIG.modelFolder}`;
const WHISPER_SAMPLE_RATE = 16_000;

export interface ModelProgress {
  loadedBytes: number;
  totalBytes: number;
}

type AsrOutput = { text: string } | Array<{ text: string }>;
type Asr = (audio: Float32Array, options: Record<string, unknown>) => Promise<AsrOutput>;

let asrPromise: Promise<Asr> | null = null;

/** Whether this deployment has the model (`npm run models:whisper`; Vercel builds fetch it). */
export async function voiceModelDeployed(): Promise<boolean> {
  try {
    const response = await fetch(`${MODEL_DIR}/config.json`, { method: 'HEAD', cache: 'no-cache' });
    return response.ok && !(response.headers.get('content-type') ?? '').includes('text/html');
  } catch {
    return false;
  }
}

/**
 * Loads Whisper the first time it is needed: Transformers.js, the self-hosted ONNX Runtime (public/ort) and
 * the self-hosted model (public/models/whisper-tiny). Remote models are switched off, so nothing is fetched
 * from the model hub or a CDN. Transformers.js keeps the model files in the browser's Cache Storage, so the
 * download happens once.
 */
export function loadTranscriber(onProgress: (progress: ModelProgress) => void): Promise<Asr> {
  if (asrPromise) return asrPromise;
  asrPromise = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = `${appBase}/models/`;
    env.useBrowserCache = true;
    const wasm = env.backends.onnx.wasm;
    if (wasm) {
      // The asyncify build is the one onnxruntime-web/webgpu (imported by Transformers.js) is made for.
      wasm.wasmPaths = { mjs: `${appBase}/ort/ort-wasm-simd-threaded.asyncify.mjs`, wasm: `${appBase}/ort/ort-wasm-simd-threaded.asyncify.wasm` };
      wasm.proxy = false;
      // No cross-origin isolation here, so no SharedArrayBuffer: one thread, chosen explicitly.
      wasm.numThreads = 1;
    }
    const files = new Map<string, { loaded: number; total: number }>();
    const asr = await pipeline('automatic-speech-recognition', VOICE_CONFIG.modelFolder, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (event: { status?: string; file?: string; loaded?: number; total?: number }) => {
        if (event.status !== 'progress' || !event.file || !event.total) return;
        files.set(event.file, { loaded: event.loaded ?? 0, total: event.total });
        let loadedBytes = 0;
        let totalBytes = 0;
        files.forEach((file) => { loadedBytes += file.loaded; totalBytes += file.total; });
        onProgress({ loadedBytes, totalBytes: Math.max(totalBytes, VOICE_CONFIG.modelBytes) });
      },
    });
    return asr as unknown as Asr;
  })();
  // A failed load (offline, model missing) can be tried again.
  asrPromise.catch(() => { asrPromise = null; });
  return asrPromise;
}

/** Transcribes a recorded note on this device. The audio never leaves it. */
export async function transcribe(recording: Blob, language: VoiceLanguage, onProgress: (progress: ModelProgress) => void): Promise<string> {
  const asr = await loadTranscriber(onProgress);
  const decoded = await decodeAudioTrack(recording, WHISPER_SAMPLE_RATE);
  if (decoded.status !== 'decoded') throw new Error('The recording could not be decoded.');
  const output = await asr(decoded.samples, { language: VOICE_LANGUAGES[language].whisper, task: 'transcribe', chunk_length_s: 30 });
  const text = Array.isArray(output) ? output.map((part) => part.text).join(' ') : output.text;
  return text.trim();
}
