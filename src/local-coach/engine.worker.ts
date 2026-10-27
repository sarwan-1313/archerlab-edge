import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

// Runs the model off the page's main thread so the interface stays responsive while it works.
const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (message: MessageEvent) => handler.onmessage(message);
