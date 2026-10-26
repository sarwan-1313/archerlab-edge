import { describe, expect, it } from 'vitest';
import { buildReport } from '../../video-analysis/buildReport';
import { makeScenario, scriptShots, syntheticSamples } from '../../video-analysis/testing/syntheticArcher';
import { buildCoachRequest, buildConsensus, extractJsonObject, parseCoachReview, type CoachReview } from './coachReview';

function sampleReport() {
  const scenario = makeScenario({ shots: scriptShots(2, { faults: { bowElbowBend: 30 } }) });
  return buildReport({
    samples: syntheticSamples(scenario, 12),
    source: { fileName: 'c.mp4', fileSize: 1, mimeType: 'video/mp4', durationS: scenario.durationS, width: 1280, height: 720, nativeFps: 30, analysisFps: 12, hasAudio: false },
    settings: { quality: 'fast', requestedHandedness: 'auto', bowType: 'recurve', model: 'lite', delegate: 'CPU' },
    audio: null,
  });
}

describe('buildCoachRequest', () => {
  it('describes the measurements and asks for strict JSON', () => {
    const request = buildCoachRequest(sampleReport(), [{ kind: 'image', mimeType: 'image/jpeg', base64: 'x', caption: 'shot 1' }]);
    expect(request.system).toContain('Respond with ONLY a JSON object');
    expect(request.prompt).toContain('Bow-arm angle at anchor');
    expect(request.prompt).toContain('Shots detected: 2');
    expect(request.prompt).toContain('1 still frame');
  });
});

describe('parseCoachReview', () => {
  it('reads fenced JSON and normalises fields', () => {
    const text = 'Here you go:\n```json\n{"level":"Intermediate","confidence":1.4,"summary":" Good base. ","strengths":["Steady head",""],"improvements":[{"title":"Straighten bow arm","detail":"d","drill":"wall push","priority":2},{"title":"Hold follow-through","priority":1},{"nope":true}],"disagreements":[],"safety":["See a coach if it hurts"]}\n```';
    const review = parseCoachReview('openai', 'gpt-5.6', text, false);
    expect(review.level).toBe('intermediate');
    expect(review.confidence).toBe(1);
    expect(review.summary).toBe('Good base.');
    expect(review.strengths).toEqual(['Steady head']);
    expect(review.improvements.map((item) => item.title)).toEqual(['Hold follow-through', 'Straighten bow arm']);
    expect(review.safety).toHaveLength(1);
  });

  it('rejects answers that are not JSON', () => {
    expect(() => parseCoachReview('gemini', 'm', 'I cannot see the archer clearly.', false)).toThrow('readable review');
    expect(extractJsonObject('nonsense')).toBeNull();
  });
});

describe('buildConsensus', () => {
  const review = (provider: CoachReview['provider'], level: CoachReview['level'], titles: string[]): CoachReview => ({
    provider, model: 'm', level, confidence: 0.7, summary: '', strengths: [], disagreements: [], safety: [], usedVideo: false,
    improvements: titles.map((title, index) => ({ title, detail: '', drill: '', priority: index + 1 })),
  });

  it('votes on the level, including the on-device estimate', () => {
    const consensus = buildConsensus([review('anthropic', 'advanced', []), review('openai', 'intermediate', []), review('gemini', 'advanced', [])], 'intermediate');
    expect(consensus.level).toBe('intermediate');
    const clear = buildConsensus([review('anthropic', 'advanced', []), review('openai', 'advanced', [])], 'intermediate');
    expect(clear.level).toBe('advanced');
  });

  it('merges the same advice from different coaches', () => {
    const consensus = buildConsensus([
      review('anthropic', 'beginner', ['Straighten the bow arm', 'Hold your follow-through']),
      review('openai', 'beginner', ['Bow arm is bent at anchor']),
      review('gemini', 'beginner', ['Relax the draw hand']),
    ], null);
    expect(consensus.agreed[0].votes).toBe(2);
    expect(consensus.agreed[0].providers.sort()).toEqual(['anthropic', 'openai']);
  });
});
