import { describe, expect, it, vi } from 'vitest';
import { buildReport } from '../video-analysis/buildReport';
import { makeScenario, scriptShots, syntheticSamples } from '../video-analysis/testing/syntheticArcher';
import type { ChatMessage, Completion, CompleteOptions, LocalEngine } from './engine';
import { LocalCoachStopped, REVIEW_SCHEMA, askFollowUp, buildChatMessages, buildChatSystem, buildLocalReviewMessages, estimateTokens, runLocalReview } from './localReview';
import { LOCAL_MODEL } from './model';

function sampleReport() {
  const scenario = makeScenario({ shots: scriptShots(2, { faults: { bowElbowBend: 30 } }) });
  return buildReport({
    samples: syntheticSamples(scenario, 12),
    source: { fileName: 'secret-name.mp4', fileSize: 1, mimeType: 'video/mp4', durationS: scenario.durationS, width: 1280, height: 720, nativeFps: 30, analysisFps: 12, hasAudio: false },
    settings: { quality: 'fast', requestedHandedness: 'auto', bowType: 'recurve', model: 'lite', delegate: 'CPU' },
    audio: null,
  });
}

function fakeEngine(result: Partial<Completion> | ((messages: ChatMessage[]) => Partial<Completion>)) {
  const calls: Array<{ messages: ChatMessage[]; options: CompleteOptions }> = [];
  const engine: LocalEngine = {
    complete: vi.fn(async (messages: ChatMessage[], options: CompleteOptions) => {
      calls.push({ messages, options });
      const partial = typeof result === 'function' ? result(messages) : result;
      return { text: '', truncated: false, stopped: false, ...partial };
    }),
    interrupt: vi.fn(),
    unload: vi.fn(async () => undefined),
  };
  return { engine, calls };
}

const GOOD = JSON.stringify({
  level: 'intermediate', confidence: 0.6, summary: 'Solid base.', strengths: ['Steady anchor'],
  improvements: [{ title: 'Straighten the bow arm', detail: 'It bends at anchor.', drill: 'Wall push', priority: 1 }],
  disagreements: [], safety: [],
});

describe('buildLocalReviewMessages', () => {
  it('sends the same measurements as the cloud coaches, and no images or file names', () => {
    const [system, user] = buildLocalReviewMessages(sampleReport());
    expect(system.role).toBe('system');
    expect(system.content).toContain('Respond with ONLY a JSON object');
    expect(system.content).toMatch(/NO images and NO video/);
    expect(user.content).toContain('Bow-arm angle at anchor');
    expect(user.content).toContain('Shots detected: 2');
    expect(user.content).toContain('No images are attached');
    expect(user.content).not.toContain('secret-name');
  });

  it('constrains the answer to the review shape', () => {
    expect(REVIEW_SCHEMA.required).toContain('improvements');
    expect(REVIEW_SCHEMA.properties.level.enum).toEqual(['beginner', 'intermediate', 'advanced', 'elite']);
  });
});

describe('runLocalReview', () => {
  it('turns the model’s JSON into a review labelled as the private coach', async () => {
    const { engine, calls } = fakeEngine({ text: GOOD });
    const review = await runLocalReview(engine, sampleReport());
    expect(review.provider).toBe('local');
    expect(review.model).toBe(LOCAL_MODEL.name);
    expect(review.usedVideo).toBe(false);
    expect(review.level).toBe('intermediate');
    expect(review.improvements[0].title).toBe('Straighten the bow arm');
    expect(calls[0].options.jsonSchema).toBe(REVIEW_SCHEMA);
  });

  it('reports Stop as a stop, not as a failure', async () => {
    const { engine } = fakeEngine({ text: '{"lev', stopped: true });
    await expect(runLocalReview(engine, sampleReport())).rejects.toBeInstanceOf(LocalCoachStopped);
  });

  it('says so when the answer was cut off or unusable', async () => {
    await expect(runLocalReview(fakeEngine({ text: '{"level":"be', truncated: true }).engine, sampleReport())).rejects.toThrow(/ran out of room/);
    await expect(runLocalReview(fakeEngine({ text: 'I am not sure.' }).engine, sampleReport())).rejects.toThrow(/readable review/);
    await expect(runLocalReview(fakeEngine({ text: '{"level":"beginner"}' }).engine, sampleReport())).rejects.toThrow(/usable advice/);
  });
});

describe('follow-up chat', () => {
  const report = sampleReport();

  it('grounds the system message in the report only', () => {
    const system = buildChatSystem(report, null);
    expect(system).toMatch(/Use ONLY the report data/);
    expect(system).toContain('Bow-arm angle at anchor');
    expect(system).not.toContain('secret-name');
  });

  it('includes the earlier review when it fits, and drops it when it would not', () => {
    const review = { provider: 'local' as const, model: 'm', level: null, confidence: null, summary: 'Solid base.', strengths: [], improvements: [{ title: 'Straighten the bow arm', detail: 'x', drill: '', priority: 1 }], disagreements: [], safety: [], usedVideo: false };
    expect(buildChatSystem(report, review)).toContain('Straighten the bow arm');
    const huge = { ...review, summary: 'long '.repeat(5000) };
    expect(buildChatSystem(report, huge)).not.toContain('long long');
  });

  it('keeps the newest turns that fit, starting at a question', () => {
    const system = buildChatSystem(report, null);
    const filler = 'word '.repeat(1000);
    const history = [
      { role: 'user' as const, content: 'old question' },
      { role: 'assistant' as const, content: 'old answer' },
      { role: 'user' as const, content: filler },
      { role: 'assistant' as const, content: filler },
      { role: 'user' as const, content: 'recent question' },
      { role: 'assistant' as const, content: 'recent answer' },
    ];
    const messages = buildChatMessages(system, history, 'next?');
    const text = messages.map((message) => message.content).join('\n');
    expect(messages[0]).toEqual({ role: 'system', content: system });
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'next?' });
    expect(text).not.toContain('old question');
    expect(text).toContain('recent answer');
    expect(messages[1].role).toBe('user');
    expect(messages.reduce((sum, message) => sum + estimateTokens(message.content), 0)).toBeLessThan(LOCAL_MODEL.contextTokens);
  });

  it('refuses a question that cannot fit alongside the report', () => {
    expect(() => buildChatMessages('system', [], 'q'.repeat(20000))).toThrow(/too long/);
  });

  it('answers through the engine without constrained JSON', async () => {
    const { engine, calls } = fakeEngine({ text: ' Work on your bow arm first. ' });
    const answer = await askFollowUp(engine, buildChatSystem(report, null), [], 'What first?');
    expect(answer).toEqual({ text: 'Work on your bow arm first.', truncated: false, stopped: false });
    expect(calls[0].options.jsonSchema).toBeUndefined();
    expect(calls[0].messages.at(-1)?.content).toBe('What first?');
  });

  it('keeps a partly written answer when stopped', async () => {
    const answer = await askFollowUp(fakeEngine({ text: 'Your bow', stopped: true }).engine, 'sys', [], 'q');
    expect(answer).toMatchObject({ text: 'Your bow', stopped: true });
  });
});
