/**
 * Cloud AI coaches. Each provider is called straight from the browser with the
 * athlete's own API key (it is never sent to ArcherLab, which has no server).
 * Request building and response parsing are pure so they can be unit-tested.
 */

export type CloudProviderId = 'anthropic' | 'openai' | 'gemini';

export interface ProviderInfo {
  id: CloudProviderId;
  name: string;
  company: string;
  defaultModel: string;
  keyHint: string;
  keyUrl: string;
  /** Inline request limit we stay under, bytes. */
  maxInlineBytes: number;
  supportsVideo: boolean;
}

export const PROVIDERS: Record<CloudProviderId, ProviderInfo> = {
  anthropic: {
    id: 'anthropic', name: 'Claude', company: 'Anthropic', defaultModel: 'claude-sonnet-5-5',
    keyHint: 'sk-ant-…', keyUrl: 'https://platform.claude.com/', maxInlineBytes: 20 * 1024 * 1024, supportsVideo: false,
  },
  openai: {
    id: 'openai', name: 'GPT', company: 'OpenAI', defaultModel: 'gpt-5.6',
    keyHint: 'sk-…', keyUrl: 'https://platform.openai.com/api-keys', maxInlineBytes: 20 * 1024 * 1024, supportsVideo: false,
  },
  gemini: {
    id: 'gemini', name: 'Gemini', company: 'Google', defaultModel: 'gemini-3.8-flash',
    keyHint: 'AIza…', keyUrl: 'https://aistudio.google.com/apikey', maxInlineBytes: 19 * 1024 * 1024, supportsVideo: true,
  },
};

export const ANTHROPIC_VERSION = '2026-10-21';

/**
 * Output-token limits per request. Every default model thinks before it
 * answers, and its thinking counts toward these limits, so they leave room for
 * that plus a full JSON review.
 */
export const OUTPUT_TOKEN_LIMITS: Record<CloudProviderId, number> = {
  anthropic: 8000,
  openai: 8000,
  gemini: 8192,
};

export interface MediaPart {
  kind: 'image' | 'video';
  mimeType: string;
  base64: string;
  caption?: string;
}

export interface CoachRequest {
  system: string;
  prompt: string;
  media: MediaPart[];
}

export interface HttpRequest {
  url: string;
  init: { method: 'POST'; headers: Record<string, string>; body: string };
}

export function buildRequest(provider: CloudProviderId, model: string, apiKey: string, request: CoachRequest): HttpRequest {
  if (provider === 'anthropic') {
    const content: unknown[] = [];
    request.media.filter((part) => part.kind === 'image').forEach((part, index) => {
      content.push({ type: 'text', text: `Image ${index + 1}: ${part.caption ?? ''}`.trim() });
      content.push({ type: 'image', source: { type: 'base64', media_type: part.mimeType, data: part.base64 } });
    });
    content.push({ type: 'text', text: request.prompt });
    return {
      url: 'https://api.anthropic.com/v1/messages',
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model, max_tokens: OUTPUT_TOKEN_LIMITS.anthropic, system: request.system, messages: [{ role: 'user', content }] }),
      },
    };
  }
  if (provider === 'openai') {
    const content: unknown[] = [{ type: 'text', text: request.prompt }];
    request.media.filter((part) => part.kind === 'image').forEach((part, index) => {
      content.push({ type: 'text', text: `Image ${index + 1}: ${part.caption ?? ''}`.trim() });
      content.push({ type: 'image_url', image_url: { url: `data:${part.mimeType};base64,${part.base64}`, detail: 'high' } });
    });
    return {
      url: 'https://api.openai.com/v1/chat/completions',
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: request.system }, { role: 'user', content }],
          response_format: { type: 'json_object' },
          max_completion_tokens: OUTPUT_TOKEN_LIMITS.openai,
        }),
      },
    };
  }
  const parts: unknown[] = [];
  request.media.forEach((part, index) => {
    if (part.caption) parts.push({ text: `${part.kind === 'video' ? 'Video' : `Image ${index + 1}`}: ${part.caption}` });
    parts.push({ inline_data: { mime_type: part.mimeType, data: part.base64 } });
  });
  parts.push({ text: request.prompt });
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: request.system }] },
        contents: [{ role: 'user', parts }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: OUTPUT_TOKEN_LIMITS.gemini },
      }),
    },
  };
}

/** Pulls the model's text out of each provider's response shape. */
export function extractText(provider: CloudProviderId, body: unknown): string {
  const data = body as Record<string, unknown>;
  if (provider === 'anthropic') {
    const blocks = Array.isArray(data.content) ? data.content as Array<{ type?: string; text?: string }> : [];
    return blocks.filter((block) => block.type === 'text' && typeof block.text === 'string').map((block) => block.text).join('\n');
  }
  if (provider === 'openai') {
    const choices = Array.isArray(data.choices) ? data.choices as Array<{ message?: { content?: unknown } }> : [];
    const content = choices[0]?.message?.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) return content.map((part) => (typeof part === 'object' && part && 'text' in part ? String((part as { text: unknown }).text) : '')).join('');
    return '';
  }
  const candidates = Array.isArray(data.candidates) ? data.candidates as Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> : [];
  return (candidates[0]?.content?.parts ?? []).filter((part) => !part.thought && typeof part.text === 'string').map((part) => part.text).join('');
}

/** Why an answer is unusable even though the request succeeded. */
export type StopIssue =
  | { kind: 'cut-off' }
  | { kind: 'refused'; detail?: string }
  | { kind: 'blocked'; detail?: string };

const GEMINI_CUT_OFF = new Set(['MAX_TOKENS', 'CONTINUATION']);
const GEMINI_BLOCKED = new Set(['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY', 'IMAGE_PROHIBITED_CONTENT', 'PUP_LIMITED_DISABLED', 'ESCALATION']);

/** Reads each provider's stop reason: a review that was cut off, refused or blocked cannot be used. */
export function stopIssue(provider: CloudProviderId, body: unknown): StopIssue | null {
  const data = (body ?? {}) as Record<string, unknown>;
  if (provider === 'anthropic') {
    if (data.stop_reason === 'max_tokens' || data.stop_reason === 'model_context_window_exceeded') return { kind: 'cut-off' };
    if (data.stop_reason === 'refusal') {
      const details = data.stop_details as { category?: unknown; explanation?: unknown } | null | undefined;
      const detail = typeof details?.explanation === 'string' ? details.explanation : typeof details?.category === 'string' ? details.category : undefined;
      return { kind: 'refused', detail };
    }
    return null;
  }
  if (provider === 'openai') {
    const choice = (Array.isArray(data.choices) ? data.choices[0] : undefined) as { finish_reason?: unknown; message?: { refusal?: unknown } } | undefined;
    if (typeof choice?.message?.refusal === 'string' && choice.message.refusal.trim()) return { kind: 'refused', detail: choice.message.refusal.trim() };
    if (choice?.finish_reason === 'length') return { kind: 'cut-off' };
    if (choice?.finish_reason === 'content_filter') return { kind: 'blocked' };
    return null;
  }
  const feedback = data.promptFeedback as { blockReason?: unknown } | undefined;
  if (typeof feedback?.blockReason === 'string' && feedback.blockReason !== 'BLOCK_REASON_UNSPECIFIED') return { kind: 'blocked', detail: feedback.blockReason };
  const candidate = (Array.isArray(data.candidates) ? data.candidates[0] : undefined) as { finishReason?: unknown } | undefined;
  const reason = typeof candidate?.finishReason === 'string' ? candidate.finishReason : '';
  if (GEMINI_CUT_OFF.has(reason)) return { kind: 'cut-off' };
  if (GEMINI_BLOCKED.has(reason)) return { kind: 'blocked', detail: reason };
  return null;
}

export const CUT_OFF_MESSAGE = 'The review was too long and got cut off. Try again or pick another model.';

/** Message for a review that was cut off, refused or blocked. */
export function describeStopIssue(provider: CloudProviderId, issue: StopIssue): string {
  const name = PROVIDERS[provider].name;
  const detail = issue.kind !== 'cut-off' && issue.detail ? ` (${issue.detail.slice(0, 160)})` : '';
  if (issue.kind === 'cut-off') return CUT_OFF_MESSAGE;
  if (issue.kind === 'refused') return `${name} declined to review this clip${detail}. Try again, or ask another coach.`;
  return `${name} blocked this request for safety reasons${detail}. Try again with fewer frames, or ask another coach.`;
}

/** Error text from a failed provider response, kept short and human. */
export function describeHttpError(provider: CloudProviderId, status: number, body: unknown): string {
  const name = PROVIDERS[provider].name;
  const message = (() => {
    const data = body as { error?: { message?: unknown } | string; message?: unknown };
    if (typeof data?.error === 'string') return data.error;
    if (data?.error && typeof data.error === 'object' && typeof data.error.message === 'string') return data.error.message;
    if (typeof data?.message === 'string') return data.message;
    return '';
  })();
  if (status === 401 || status === 403) return `${name} rejected the API key. Check it was copied fully and has access to this model.`;
  if (status === 404) return `${name} could not find that model name. Check the model field. ${message}`.trim();
  if (status === 429) return `${name} is rate-limiting this key or the account is out of credit. Try again shortly.`;
  if (status === 413) return `The request was too large for ${name}. Try fewer frames, or turn off full-video mode.`;
  return `${name} returned an error (${status}). ${message.slice(0, 240)}`.trim();
}
