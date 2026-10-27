// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildReport } from '../../video-analysis/buildReport';
import { makeScenario, scriptShots, syntheticSamples } from '../../video-analysis/testing/syntheticArcher';
import { runCloudReview } from './runCloudReview';

const scenario = makeScenario({ shots: scriptShots(2) });
const report = buildReport({
  samples: syntheticSamples(scenario, 12),
  source: { fileName: 'c.mp4', fileSize: 1, mimeType: 'video/mp4', durationS: scenario.durationS, width: 1280, height: 720, nativeFps: 30, analysisFps: 12, hasAudio: false },
  settings: { quality: 'fast', requestedHandedness: 'auto', bowType: 'recurve', model: 'lite', delegate: 'CPU' },
  audio: null,
});

const review = JSON.stringify({ level: 'intermediate', confidence: 0.6, summary: 'Solid.', strengths: ['Stable'], improvements: [{ title: 'Bow arm', detail: 'Extend', drill: 'Wall', priority: 1 }] });

function answer(body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
}

afterEach(() => vi.unstubAllGlobals());

const run = (provider: 'anthropic' | 'openai' | 'gemini') => runCloudReview([{ provider, apiKey: 'k', model: '' }], report, [], null, new AbortController().signal).then((outcomes) => outcomes[0]);

describe('runCloudReview stop reasons', () => {
  it('reports a cut-off answer instead of an unreadable one, even when part of it parses', async () => {
    answer({ stop_reason: 'max_tokens', content: [{ type: 'text', text: `${review.slice(0, -40)}}` }] });
    expect(await run('anthropic')).toEqual({ provider: 'anthropic', status: 'failed', error: 'The review was too long and got cut off. Try again or pick another model.' });
    answer({ choices: [{ finish_reason: 'length', message: { content: review.slice(0, 30), refusal: null } }] });
    expect((await run('openai')).status).toBe('failed');
    answer({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: review.slice(0, 30) }] } }] });
    expect(await run('gemini')).toMatchObject({ status: 'failed', error: expect.stringMatching(/cut off/) });
  });

  it('reports refusals and safety blocks', async () => {
    answer({ stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber', explanation: null }, content: [] });
    expect(await run('anthropic')).toMatchObject({ status: 'failed', error: expect.stringMatching(/Claude declined/) });
    answer({ choices: [{ finish_reason: 'stop', message: { content: null, refusal: 'Sorry, I can’t help.' } }] });
    expect(await run('openai')).toMatchObject({ status: 'failed', error: expect.stringMatching(/GPT declined .*Sorry/) });
    answer({ promptFeedback: { blockReason: 'SAFETY' } });
    expect(await run('gemini')).toMatchObject({ status: 'failed', error: expect.stringMatching(/Gemini blocked this request for safety reasons \(SAFETY\)/) });
  });

  it('still returns a complete review', async () => {
    answer({ stop_reason: 'end_turn', content: [{ type: 'text', text: review }] });
    expect(await run('anthropic')).toMatchObject({ status: 'ok', review: { level: 'intermediate', summary: 'Solid.' } });
  });
});
