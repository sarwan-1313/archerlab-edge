import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LoadCancelled, loadLocalEngine } from './engine';
import { createEngineHost, type WebLlmApi } from './engineHost';
import type { FromWorker, ToWorker } from './engineProtocol';
import { LOCAL_APP_CONFIG, LOCAL_MODEL } from './model';

const web = { create: vi.fn(), hasModelInCache: vi.fn(), deleteModelAllInfoInCache: vi.fn() };
const fakeWebLlm = {
  CreateMLCEngine: (...args: unknown[]) => web.create(...args),
  hasModelInCache: (...args: unknown[]) => web.hasModelInCache(...args),
  deleteModelAllInfoInCache: (...args: unknown[]) => web.deleteModelAllInfoInCache(...args),
} as unknown as WebLlmApi;

// The worker runs in-process here: the same host the real worker uses, with WebLLM faked.
const terminate = vi.fn();
class FakeWorker {
  onmessage: ((event: { data: FromWorker }) => void) | null = null;
  private ended = false;
  private host = createEngineHost(fakeWebLlm, (data) => queueMicrotask(() => { if (!this.ended) this.onmessage?.({ data }); }));
  postMessage(message: ToWorker) { queueMicrotask(() => { if (!this.ended) void this.host.handle(message); }); }
  terminate() { this.ended = true; terminate(); }
}
beforeEach(() => {
  vi.stubGlobal('Worker', FakeWorker);
  web.create.mockReset();
  terminate.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const chunks = (...pieces: Array<{ text?: string; finish?: string }>) => (async function* () {
  for (const piece of pieces) yield { choices: [{ delta: { content: piece.text }, finish_reason: piece.finish ?? null }] };
})();

function fakeMlc(create: (request: Record<string, unknown>) => unknown) {
  return { chat: { completions: { create: vi.fn(async (request: Record<string, unknown>) => create(request)) } }, interruptGenerate: vi.fn(), unload: vi.fn(async () => undefined) };
}

it('loads only the pinned model, reporting progress', async () => {
  const mlc = fakeMlc(() => chunks());
  web.create.mockImplementation(async (id, config: { appConfig: unknown; initProgressCallback: (report: { progress: number; text: string }) => void }) => {
    config.initProgressCallback({ progress: 0.5, text: 'Fetching' });
    expect(id).toBe(LOCAL_MODEL.id);
    expect(config.appConfig).toBe(LOCAL_APP_CONFIG);
    return mlc;
  });
  const progress = vi.fn();
  await loadLocalEngine(progress, new AbortController().signal);
  expect(progress).toHaveBeenCalledWith({ fraction: 0.5, text: 'Fetching' });
});

it('ends the worker, and so the download, when aborted', async () => {
  web.create.mockImplementation(() => new Promise(() => undefined));
  const controller = new AbortController();
  const loading = loadLocalEngine(() => undefined, controller.signal);
  await vi.waitFor(() => expect(web.create).toHaveBeenCalled());
  controller.abort();
  await expect(loading).rejects.toBeInstanceOf(LoadCancelled);
  expect(terminate).toHaveBeenCalled();
});

it('does not start at all when already aborted', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(loadLocalEngine(() => undefined, controller.signal)).rejects.toBeInstanceOf(LoadCancelled);
  expect(web.create).not.toHaveBeenCalled();
});

it('streams the answer and tells a Stop apart from running out of room', async () => {
  const mlc = fakeMlc(() => chunks({ text: 'Hel' }, { text: 'lo', finish: 'abort' }));
  web.create.mockResolvedValue(mlc);
  const engine = await loadLocalEngine(() => undefined, new AbortController().signal);
  const seen: string[] = [];
  const result = await engine.complete([{ role: 'user', content: 'hi' }], { maxTokens: 10, temperature: 0.3, onText: (text) => seen.push(text) });
  expect(result).toEqual({ text: 'Hello', truncated: false, stopped: true });
  expect(seen).toEqual(['Hel', 'Hello']);
  mlc.chat.completions.create.mockImplementationOnce(async () => chunks({ text: '{"a"', finish: 'length' }));
  expect(await engine.complete([], { maxTokens: 1, temperature: 0 })).toMatchObject({ truncated: true, stopped: false });
});

it('constrains JSON to the schema, and retries without it only if the schema is rejected', async () => {
  const requests: Array<Record<string, unknown>> = [];
  const mlc = fakeMlc((request) => {
    requests.push(request);
    if (request.response_format) throw new Error('Failed to compile grammar for the schema');
    return chunks({ text: '{}', finish: 'stop' });
  });
  web.create.mockResolvedValue(mlc);
  const engine = await loadLocalEngine(() => undefined, new AbortController().signal);
  const result = await engine.complete([], { maxTokens: 5, temperature: 0, jsonSchema: { type: 'object' } });
  expect(result.text).toBe('{}');
  expect(requests[0].response_format).toEqual({ type: 'json_object', schema: '{"type":"object"}' });
  expect(requests[1].response_format).toBeUndefined();

  mlc.chat.completions.create.mockImplementation(async () => { throw new Error('Device was lost'); });
  await expect(engine.complete([], { maxTokens: 5, temperature: 0, jsonSchema: {} })).rejects.toThrow('Device was lost');
});

it('frees the model and worker once, and refuses use afterwards', async () => {
  const mlc = fakeMlc(() => chunks());
  web.create.mockResolvedValue(mlc);
  const engine = await loadLocalEngine(() => undefined, new AbortController().signal);
  await engine.unload();
  await engine.unload();
  expect(mlc.unload).toHaveBeenCalledOnce();
  expect(terminate).toHaveBeenCalled();
  await expect(engine.complete([], { maxTokens: 1, temperature: 0 })).rejects.toThrow(/closed/);
});
