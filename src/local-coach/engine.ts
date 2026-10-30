import type { ChatMessage, Completion, CompleteRequest, FromWorker, LoadProgress, ToWorker } from './engineProtocol';
import { LOCAL_MODEL, LOCAL_MODEL_FLAG } from './model';

/**
 * The page's side of the private coach. WebLLM (about 6 MB of code) and the model
 * load only inside a worker, and only when the athlete asks for them, so the page
 * never downloads WebLLM and the interface stays responsive.
 */

export type { ChatMessage, Completion, LoadProgress } from './engineProtocol';

export interface CompleteOptions extends CompleteRequest {
  /** Called with the whole answer so far each time it grows. */
  onText?: (text: string) => void;
}

export interface LocalEngine {
  complete(messages: ChatMessage[], options: CompleteOptions): Promise<Completion>;
  /** Ends the answer being written, keeping what was written so far. */
  interrupt(): void;
  /** Releases the model from graphics memory and ends the worker. Safe to call twice. */
  unload(): Promise<void>;
}

export class LoadCancelled extends Error {
  constructor() {
    super('Cancelled.');
    this.name = 'LoadCancelled';
  }
}

type Request = ToWorker extends infer R ? R extends { id: number } ? Omit<R, 'id'> : never : never;

/** A worker running WebLLM, with request/answer pairs matched by id. */
function startWorker() {
  const worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; onEvent?: (message: FromWorker) => void }>();
  let nextId = 1;
  worker.onmessage = (event: MessageEvent<FromWorker>) => {
    const message = event.data;
    const entry = pending.get(message.id);
    if (!entry) return;
    if (message.type === 'done') { pending.delete(message.id); entry.resolve(message.value); }
    else if (message.type === 'error') { pending.delete(message.id); entry.reject(new Error(message.message)); }
    else entry.onEvent?.(message);
  };
  return {
    send<T>(request: Request, onEvent?: (message: FromWorker) => void): Promise<T> {
      const id = nextId++;
      return new Promise<T>((resolve, reject) => {
        pending.set(id, { resolve: resolve as (value: unknown) => void, reject, onEvent });
        worker.postMessage({ ...request, id } as ToWorker);
      });
    },
    terminate() {
      worker.terminate();
      for (const entry of pending.values()) entry.reject(new LoadCancelled());
      pending.clear();
    },
  };
}

/** Runs one request in a short-lived worker. */
async function once<T>(request: Request): Promise<T> {
  const worker = startWorker();
  try { return await worker.send<T>(request); } finally { worker.terminate(); }
}

/** True once the model's files are saved in this browser, so loading it needs no download. */
export async function isModelCached(): Promise<boolean> {
  try {
    return await once<boolean>({ type: 'cached' });
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
  await once({ type: 'delete' });
  rememberModelDownloaded(false);
}

/**
 * Downloads the model on first use (later loads read the saved copy), and puts it
 * in graphics memory. Aborting ends the worker, which stops the download; files
 * already saved are kept, so the next try carries on from there.
 */
export async function loadLocalEngine(onProgress: (progress: LoadProgress) => void, signal: AbortSignal): Promise<LocalEngine> {
  if (signal.aborted) throw new LoadCancelled();
  const worker = startWorker();
  const onAbort = () => worker.terminate();
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    await worker.send({ type: 'load' }, (message) => { if (message.type === 'progress') onProgress(message.progress); });
  } catch (error) {
    worker.terminate();
    throw signal.aborted ? new LoadCancelled() : error;
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
  rememberModelDownloaded(true);
  let released = false;

  return {
    async complete(messages, { onText, ...options }) {
      if (released) throw new Error('The private coach was closed.');
      return worker.send<Completion>({ type: 'complete', messages, options }, (message) => { if (message.type === 'text') onText?.(message.text); });
    },
    interrupt() {
      if (!released) void worker.send({ type: 'interrupt' }).catch(() => undefined);
    },
    async unload() {
      if (released) return;
      released = true;
      try { await worker.send({ type: 'unload' }); } catch { /* the worker is ended below either way */ }
      worker.terminate();
    },
  };
}
