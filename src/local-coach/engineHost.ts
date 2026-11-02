import type { MLCEngine } from '@mlc-ai/web-llm';
import type { ChatMessage, CompleteRequest, Completion, FromWorker, ToWorker } from './engineProtocol';
import { LOCAL_APP_CONFIG, LOCAL_MODEL } from './model';

/** The parts of WebLLM the worker uses, so tests can pass a fake. */
export interface WebLlmApi {
  CreateMLCEngine(modelId: string, config: { appConfig: typeof LOCAL_APP_CONFIG; initProgressCallback: (report: { progress: number; text: string }) => void }): Promise<Pick<MLCEngine, 'chat' | 'interruptGenerate' | 'unload'>>;
  hasModelInCache(modelId: string, appConfig: typeof LOCAL_APP_CONFIG): Promise<boolean>;
  deleteModelAllInfoInCache(modelId: string, appConfig: typeof LOCAL_APP_CONFIG): Promise<void>;
}

/** Answers the page's requests inside the worker. Only the pinned model is ever loaded. */
export function createEngineHost(webLlm: WebLlmApi, post: (message: FromWorker) => void) {
  let engine: Awaited<ReturnType<WebLlmApi['CreateMLCEngine']>> | null = null;

  const complete = async (id: number, messages: ChatMessage[], options: CompleteRequest): Promise<Completion> => {
    if (!engine) throw new Error('The private coach was closed.');
    const ready = engine;
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
        if (piece) { text += piece; post({ id, type: 'text', text }); }
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
  };

  const answer = async (request: ToWorker): Promise<boolean | Completion | undefined> => {
    switch (request.type) {
      case 'cached': return webLlm.hasModelInCache(LOCAL_MODEL.id, LOCAL_APP_CONFIG);
      case 'delete': await webLlm.deleteModelAllInfoInCache(LOCAL_MODEL.id, LOCAL_APP_CONFIG); return undefined;
      case 'load':
        engine = await webLlm.CreateMLCEngine(LOCAL_MODEL.id, {
          appConfig: LOCAL_APP_CONFIG,
          initProgressCallback: (report) => post({ id: request.id, type: 'progress', progress: { fraction: Math.min(1, Math.max(0, report.progress)), text: report.text } }),
        });
        return undefined;
      case 'complete': return complete(request.id, request.messages, request.options);
      case 'interrupt':
        try { engine?.interruptGenerate(); } catch { /* nothing is being written */ }
        return undefined;
      case 'unload': {
        const current = engine;
        engine = null;
        await current?.unload();
        return undefined;
      }
    }
  };

  return {
    async handle(request: ToWorker): Promise<void> {
      try {
        post({ id: request.id, type: 'done', value: await answer(request) });
      } catch (error) {
        post({ id: request.id, type: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    },
  };
}
