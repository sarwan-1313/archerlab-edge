import * as webLlm from '@mlc-ai/web-llm';
import { createEngineHost } from './engineHost';
import type { FromWorker, ToWorker } from './engineProtocol';

// Runs the model off the page's main thread so the interface stays responsive while it works.
// This worker is the only code that imports WebLLM.
const host = createEngineHost(webLlm, (message: FromWorker) => self.postMessage(message));
self.onmessage = (message: MessageEvent<ToWorker>) => { void host.handle(message.data); };
