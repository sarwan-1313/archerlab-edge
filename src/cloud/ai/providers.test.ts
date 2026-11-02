import { describe, expect, it } from 'vitest';
import { ANTHROPIC_VERSION, CUT_OFF_MESSAGE, OUTPUT_TOKEN_LIMITS, buildRequest, describeHttpError, describeStopIssue, extractText, stopIssue, type CoachRequest } from './providers';

const request: CoachRequest = {
  system: 'You are a coach.',
  prompt: 'Review these shots.',
  media: [{ kind: 'image', mimeType: 'image/jpeg', base64: 'QUJD', caption: 'shot 1 at anchor' }],
};

describe('buildRequest', () => {
  it('builds a Claude Messages request for direct browser use', () => {
    const http = buildRequest('anthropic', 'claude-sonnet-5-5', 'sk-ant-test', request);
    expect(http.url).toBe('https://api.anthropic.com/v1/messages');
    expect(http.init.headers['x-api-key']).toBe('sk-ant-test');
    expect(http.init.headers['anthropic-version']).toBe(ANTHROPIC_VERSION);
    expect(http.init.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    const body = JSON.parse(http.init.body);
    expect(body.model).toBe('claude-sonnet-5-5');
    expect(body.system).toBe('You are a coach.');
    expect(body.temperature).toBeUndefined();
    const content = body.messages[0].content;
    expect(content.find((part: { type: string }) => part.type === 'image').source).toEqual({ type: 'base64', media_type: 'image/jpeg', data: 'QUJD' });
    expect(content.at(-1)).toEqual({ type: 'text', text: 'Review these shots.' });
  });

  it('builds an OpenAI chat request with data-URL images and JSON output', () => {
    const http = buildRequest('openai', 'gpt-5.6', 'sk-test', request);
    expect(http.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(http.init.headers.authorization).toBe('Bearer sk-test');
    const body = JSON.parse(http.init.body);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[0]).toEqual({ role: 'system', content: 'You are a coach.' });
    const image = body.messages[1].content.find((part: { type: string }) => part.type === 'image_url');
    expect(image.image_url.url).toBe('data:image/jpeg;base64,QUJD');
  });

  it('builds a Gemini generateContent request that can carry a whole video', () => {
    const http = buildRequest('gemini', 'gemini-3.8-flash', 'AIza-test', { ...request, media: [{ kind: 'video', mimeType: 'video/mp4', base64: 'VklE' }] });
    expect(http.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
    expect(http.init.headers['x-goog-api-key']).toBe('AIza-test');
    const body = JSON.parse(http.init.body);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.contents[0].parts[0]).toEqual({ inline_data: { mime_type: 'video/mp4', data: 'VklE' } });
    expect(body.system_instruction.parts[0].text).toBe('You are a coach.');
  });
});

describe('extractText', () => {
  it('reads each provider response shape', () => {
    expect(extractText('anthropic', { content: [{ type: 'thinking', thinking: 'x' }, { type: 'text', text: '{"a":1}' }] })).toBe('{"a":1}');
    expect(extractText('openai', { choices: [{ message: { content: '{"b":2}' } }] })).toBe('{"b":2}');
    expect(extractText('gemini', { candidates: [{ content: { parts: [{ text: 'thought', thought: true }, { text: '{"c":3}' }] } }] })).toBe('{"c":3}');
    expect(extractText('gemini', {})).toBe('');
  });
});

describe('describeHttpError', () => {
  it('turns status codes into actionable messages', () => {
    expect(describeHttpError('anthropic', 401, { error: { message: 'invalid x-api-key' } })).toContain('rejected the API key');
    expect(describeHttpError('openai', 404, { error: { message: 'model not found' } })).toContain('model name');
    expect(describeHttpError('gemini', 429, null)).toContain('rate-limiting');
    expect(describeHttpError('gemini', 500, { error: { message: 'boom' } })).toContain('boom');
  });
});

describe('output limits', () => {
  it('leaves room for thinking plus a full JSON review on every provider', () => {
    expect(JSON.parse(buildRequest('anthropic', 'claude-sonnet-5-5', 'k', request).init.body).max_tokens).toBe(8000);
    expect(JSON.parse(buildRequest('openai', 'gpt-5.6', 'k', request).init.body).max_completion_tokens).toBe(8000);
    expect(JSON.parse(buildRequest('gemini', 'gemini-3.8-flash', 'k', request).init.body).generationConfig.maxOutputTokens).toBe(8192);
    expect(OUTPUT_TOKEN_LIMITS).toEqual({ anthropic: 8000, openai: 8000, gemini: 8192 });
  });
});

describe('stopIssue', () => {
  it('reads Claude stop reasons', () => {
    expect(stopIssue('anthropic', { stop_reason: 'end_turn', content: [] })).toBeNull();
    expect(stopIssue('anthropic', { stop_reason: 'max_tokens' })).toEqual({ kind: 'cut-off' });
    expect(stopIssue('anthropic', { stop_reason: 'model_context_window_exceeded' })).toEqual({ kind: 'cut-off' });
    expect(stopIssue('anthropic', { stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber', explanation: null } })).toEqual({ kind: 'refused', detail: 'cyber' });
    expect(stopIssue('anthropic', { stop_reason: 'refusal', stop_details: null })).toEqual({ kind: 'refused', detail: undefined });
  });

  it('reads OpenAI finish reasons and refusals', () => {
    expect(stopIssue('openai', { choices: [{ finish_reason: 'stop', message: { content: '{}', refusal: null } }] })).toBeNull();
    expect(stopIssue('openai', { choices: [{ finish_reason: 'length', message: { content: '{"lev' } }] })).toEqual({ kind: 'cut-off' });
    expect(stopIssue('openai', { choices: [{ finish_reason: 'content_filter', message: { content: null } }] })).toEqual({ kind: 'blocked' });
    expect(stopIssue('openai', { choices: [{ finish_reason: 'stop', message: { content: null, refusal: 'I can’t help with that.' } }] })).toEqual({ kind: 'refused', detail: 'I can’t help with that.' });
    expect(stopIssue('openai', {})).toBeNull();
  });

  it('reads Gemini finish and block reasons', () => {
    expect(stopIssue('gemini', { candidates: [{ finishReason: 'STOP' }] })).toBeNull();
    expect(stopIssue('gemini', { candidates: [{ finishReason: 'MAX_TOKENS' }] })).toEqual({ kind: 'cut-off' });
    expect(stopIssue('gemini', { candidates: [{ finishReason: 'CONTINUATION' }] })).toEqual({ kind: 'cut-off' });
    expect(stopIssue('gemini', { candidates: [{ finishReason: 'SAFETY' }] })).toEqual({ kind: 'blocked', detail: 'SAFETY' });
    expect(stopIssue('gemini', { promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } })).toEqual({ kind: 'blocked', detail: 'PROHIBITED_CONTENT' });
    expect(stopIssue('gemini', { promptFeedback: { blockReason: 'BLOCK_REASON_UNSPECIFIED' }, candidates: [{ finishReason: 'STOP' }] })).toBeNull();
  });

  it('turns stop issues into clear messages', () => {
    expect(describeStopIssue('gemini', { kind: 'cut-off' })).toBe(CUT_OFF_MESSAGE);
    expect(CUT_OFF_MESSAGE).toBe('The review was too long and got cut off. Try again or pick another model.');
    expect(describeStopIssue('anthropic', { kind: 'refused', detail: 'cyber' })).toMatch(/^Claude declined to review this clip \(cyber\)/);
    expect(describeStopIssue('gemini', { kind: 'blocked', detail: 'SAFETY' })).toMatch(/^Gemini blocked this request for safety reasons \(SAFETY\)/);
  });
});
