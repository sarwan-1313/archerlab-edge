import type { WebWorkerMLCEngine } from '@mlc-ai/web-llm';
import { LOCAL_APP_CONFIG, LOCAL_MODEL, LOCAL_MODEL_FLAG } from './model';

/**
 * The only file that talks to WebLLM. WebLLM (about 6 MB of code) and the model
 * are loaded when the athlete asks for them, never with the page, and the model
 * runs in a worker so the interface stays responsive.
 */

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

export interface CompleteOptions {
  maxTokens: number;
  temperature: number;
  /** A JSON schema the answer must follow; decoding is constrained to it. */
  jsonSchema?: object;
  /** Called with the whole answer so far each time it grows. */
  onText?: (text: string) => void;
}

export interface Completion {
  text: string;
  /** Ran out of room before finishing, so the answer is cut off. */
  truncated: boolean;
  /** Ended by the Stop button. */
  stopped: boolean;
}

export interface LocalEngine {
  complete(messages: ChatMessage[], options: CompleteOptions): Promise<Completion>;
  /** Ends the answer being written, keeping what was written so far. */
  interrupt(): void;
  /** Releases the model from graphics memory and ends the worker. Safe to call twice. */
  unload(): Promise<void>;
}

export interface LoadProgress { fraction: number; text: string }

export class LoadCancelled extends Error {
  constructor() {
    super('Cancelled.');
    this.name = 'LoadCancelled';
  }
}

const loadWebLlm = () => import('@mlc-ai/web-llm');

/** True once the model's files are saved in this browser, so loading it needs no download. */
export async function isModelCached(): Promise<boolean> {
  try {
    return await (await loadWebLlm()).hasModelInCache(LOCAL_MODEL.id, LOCAL_APP_CONFIG);
  } catch {
    return false;
  }
}

export function rememberModelDownloaded(downloaded: boolean): void {
  try {
    if (downloaded) localStorage.setItem(LOCAL_MODEL_FLAG, '1');
    else localStorage.removeItem(LOCAL_MODEL_FLAG);
  } catch { /* storage unavailable: the panel just asks the browser's cache instead */ }
}

export function modelWasDownloaded(): boolean {
  try { return localStorage.getItem(LOCAL_MODEL_FLAG) === '1'; } catch { return false; }
}

/** Whether the browser has room to save the model; null when it cannot tell. */
export async function hasRoomForModel(): Promise<boolean | null> {
  try {
    const { quota, usage } = await navigator.storage.estimate();
    if (quota === undefined || usage === undefined) return null;
    return quota - usage > LOCAL_MODEL.downloadBytes * 1.1;
  } catch {
    return null;
  }
}

/** Deletes the downloaded model from this browser. */
export async function removeLocalModel(): Promise<void> {
  const webLlm = await loadWebLlm();
  await webLlm.deleteModelAllInfoInCache(LOCAL_MODEL.id, LOCAL_APP_CONFIG);
  rememberModelDownloaded(false);
}

/**
 * Downloads the model on first use (later loads read the saved copy), and puts it
 * in graphics memory. Aborting ends the worker, which stops the download; files
 * already saved are kept, so the next try carries on from there.
 */
export async function loadLocalEngine(onProgress: (progress: LoadProgress) => void, signal: AbortSignal): Promise<LocalEngine> {
  if (signal.aborted) throw new LoadCancelled();
  const webLlm = await loadWebLlm();
  if (signal.aborted) throw new LoadCancelled();
  const worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
  let engine: WebWorkerMLCEngine | null = null;
  const release = async () => {
    const current = engine;
    engine = null;
    try { await current?.unload(); } catch { /* the worker is ended below either way */ }
    worker.terminate();
  };

  let onAbort: (() => void) | undefined;
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => { worker.terminate(); reject(new LoadCancelled()); };
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    engine = await Promise.race([
      webLlm.CreateWebWorkerMLCEngine(worker, LOCAL_MODEL.id, {
        appConfig: LOCAL_APP_CONFIG,
        initProgressCallback: (report) => onProgress({ fraction: Math.min(1, Math.max(0, report.progress)), text: report.text }),
      }),
      cancelled,
    ]);
  } catch (error) {
    worker.terminate();
    throw error;
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort);
  }
  rememberModelDownloaded(true);
  const ready = engine;
  let released = false;

  return {
    async complete(messages, options) {
      if (released) throw new Error('The private coach was closed.');
      const run = async (constrained: boolean): Promise<Completion> => {
        const stream = await ready.chat.completions.create({
          messages,
          stream: true,
          max_tokens: options.maxTokens,
          temperature: options.temperature,
          top_p: 0.9,
          repetition_penalty: 1.05,
          ...(constrained && options.jsonSchema ? { response_format: { type: 'json_object' as const, schema: JSON.stringify(options.jsonSchema) } } : {}),
        });
        let text = '';
        let finish: string | null = null;
        for await (const chunk of stream) {
          const piece = chunk.choices[0]?.delta?.content;
          if (piece) { text += piece; options.onText?.(text); }
          finish = chunk.choices[0]?.finish_reason ?? finish;
        }
        return { text, truncated: finish === 'length', stopped: finish === 'abort' };
      };
      try {
        return await run(true);
      } catch (error) {
        // If this build's grammar support rejects the schema, ask again without it rather than failing outright.
        if (options.jsonSchema && error instanceof Error && /schema|grammar|response_format/i.test(error.message)) return run(false);
        throw error;
      }
    },
    interrupt() {
      try { ready.interruptGenerate(); } catch { /* nothing is being written */ }
    },
    async unload() {
      released = true;
      await release();
    },
  };
}
