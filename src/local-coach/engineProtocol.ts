/**
 * Messages between the page and the private coach's worker. WebLLM is imported
 * only by the worker, so the page never downloads its 6 MB of code; this file
 * holds types only.
 */

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

export interface CompleteRequest {
  maxTokens: number;
  temperature: number;
  /** A JSON schema the answer must follow; decoding is constrained to it. */
  jsonSchema?: object;
}

export interface Completion {
  text: string;
  /** Ran out of room before finishing, so the answer is cut off. */
  truncated: boolean;
  /** Ended by the Stop button. */
  stopped: boolean;
}

export interface LoadProgress { fraction: number; text: string }

export type ToWorker =
  | { id: number; type: 'cached' }
  | { id: number; type: 'delete' }
  | { id: number; type: 'load' }
  | { id: number; type: 'complete'; messages: ChatMessage[]; options: CompleteRequest }
  | { id: number; type: 'interrupt' }
  | { id: number; type: 'unload' };

export type FromWorker =
  | { id: number; type: 'progress'; progress: LoadProgress }
  | { id: number; type: 'text'; text: string }
  | { id: number; type: 'done'; value?: boolean | Completion }
  | { id: number; type: 'error'; message: string };
