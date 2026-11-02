// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CoachReview } from '../../cloud/ai/coachReview';
import { LoadCancelled, type ChatMessage, type CompleteOptions, type LoadProgress, type LocalEngine } from '../../local-coach/engine';
import { buildReport } from '../../video-analysis/buildReport';
import { makeScenario, scriptShots, syntheticSamples } from '../../video-analysis/testing/syntheticArcher';
import LocalCoachCard from './LocalCoachCard';

const mocks = vi.hoisted(() => ({
  support: { ok: true } as { ok: true } | { ok: false; reason: string },
  cached: false,
  load: vi.fn(),
}));

vi.mock('../../local-coach/webgpu', () => ({ checkLocalCoachSupport: async () => mocks.support }));
vi.mock('../../local-coach/engine', () => ({
  LoadCancelled: class LoadCancelled extends Error {},
  isModelCached: async () => mocks.cached,
  hasRoomForModel: async () => true,
  modelWasDownloaded: () => false,
  removeLocalModel: vi.fn(async () => undefined),
  loadLocalEngine: (...args: unknown[]) => mocks.load(...args),
}));

const REVIEW_JSON = JSON.stringify({
  level: 'advanced', confidence: 0.7, summary: 'Strong form.', strengths: [],
  improvements: [{ title: 'Relax the draw hand', detail: 'd', drill: 'x', priority: 1 }], disagreements: [], safety: [],
});

function fakeEngine(answers: string[] = ['Start with the bow arm.']) {
  const asked: ChatMessage[][] = [];
  const engine: LocalEngine & { unloaded: number } = {
    unloaded: 0,
    async complete(messages: ChatMessage[], options: CompleteOptions) {
      asked.push(messages);
      const text = options.jsonSchema ? REVIEW_JSON : answers.shift() ?? 'ok';
      options.onText?.(text);
      return { text, truncated: false, stopped: false };
    },
    interrupt: vi.fn(),
    async unload() { engine.unloaded += 1; },
  };
  return { engine, asked };
}

const report = (() => {
  const scenario = makeScenario({ shots: scriptShots(2, {}) });
  return buildReport({
    samples: syntheticSamples(scenario, 12),
    source: { fileName: 'c.mp4', fileSize: 1, mimeType: 'video/mp4', durationS: scenario.durationS, width: 1280, height: 720, nativeFps: 30, analysisFps: 12, hasAudio: false },
    settings: { quality: 'fast', requestedHandedness: 'auto', bowType: 'recurve', model: 'lite', delegate: 'CPU' },
    audio: null,
  });
})();

function Harness({ onReview }: { onReview?: (review: CoachReview | null) => void }) {
  const [review, setReview] = useState<CoachReview | null>(null);
  return <LocalCoachCard report={report} review={review} onReview={(next) => { setReview(next); onReview?.(next); }} />;
}

beforeEach(() => { mocks.support = { ok: true }; mocks.cached = false; mocks.load.mockReset(); });
afterEach(cleanup);

it('explains why it is unavailable instead of offering a button', async () => {
  mocks.support = { ok: false, reason: 'This browser does not offer WebGPU.' };
  render(<Harness />);
  expect(await screen.findByText(/This browser does not offer WebGPU/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Ask the private coach/ })).toBeNull();
  expect(mocks.load).not.toHaveBeenCalled();
});

it('shows the size and licence and downloads nothing until confirmed', async () => {
  render(<Harness />);
  fireEvent.click(await screen.findByRole('button', { name: /Ask the private coach/ }));
  expect(await screen.findByText('Download 886 MB?')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Apache License 2.0' }).getAttribute('href')).toMatch(/Qwen2\.5-1\.5B-Instruct/);
  expect(mocks.load).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
  await waitFor(() => expect(screen.getByRole('button', { name: /Ask the private coach/ })).toBeTruthy());
  expect(mocks.load).not.toHaveBeenCalled();
});

it('downloads after confirming, shows progress, then the review, and answers follow-ups from the report', async () => {
  const { engine, asked } = fakeEngine();
  let report_: (progress: LoadProgress) => void = () => undefined;
  let finish: () => void = () => undefined;
  mocks.load.mockImplementation((onProgress: (progress: LoadProgress) => void) => {
    report_ = onProgress;
    return new Promise<LocalEngine>((resolve) => { finish = () => resolve(engine); });
  });
  const onReview = vi.fn();
  render(<Harness onReview={onReview} />);
  fireEvent.click(await screen.findByRole('button', { name: /Ask the private coach/ }));
  fireEvent.click(await screen.findByRole('button', { name: /Download 886 MB and ask/ }));

  await waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());
  act(() => report_({ fraction: 0.42, text: 'Fetching param cache[3/31]' }));
  expect(screen.getByText(/Downloading the model… 42%/)).toBeTruthy();
  expect((screen.getByRole('progressbar') as HTMLProgressElement).value).toBeCloseTo(0.42);
  expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();

  await act(async () => { finish(); });
  await waitFor(() => expect(onReview).toHaveBeenCalledOnce());
  expect(onReview.mock.calls[0][0]).toMatchObject({ provider: 'local', level: 'advanced' });
  // The review was written from measurements only.
  expect(asked[0][1].content).toContain('No images are attached');

  fireEvent.change(await screen.findByLabelText('Question for the private coach'), { target: { value: 'What first?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
  expect(await screen.findByText('Start with the bow arm.')).toBeTruthy();
  expect(screen.getByText('What first?')).toBeTruthy();
  const chatSystem = asked[1][0];
  expect(chatSystem.role).toBe('system');
  expect(chatSystem.content).toContain('Use ONLY the report data');
  expect(asked[1].at(-1)).toEqual({ role: 'user', content: 'What first?' });
});

it('skips the confirmation when the model is already saved on the device', async () => {
  mocks.cached = true;
  mocks.load.mockResolvedValue(fakeEngine().engine);
  render(<Harness />);
  fireEvent.click(await screen.findByRole('button', { name: /Ask the private coach/ }));
  await waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());
  expect(screen.queryByText('Download 886 MB?')).toBeNull();
});

it('stops a download from the Stop button', async () => {
  let signal: AbortSignal | undefined;
  mocks.load.mockImplementation((_: unknown, abort: AbortSignal) => {
    signal = abort;
    return new Promise((_resolve, reject) => abort.addEventListener('abort', () => reject(new LoadCancelled())));
  });
  mocks.cached = true;
  render(<Harness />);
  fireEvent.click(await screen.findByRole('button', { name: /Ask the private coach/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
  expect(signal?.aborted).toBe(true);
  await waitFor(() => expect(screen.getByRole('button', { name: /Ask the private coach/ })).toBeTruthy());
  expect(screen.getByText('Stopped.')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('frees the model when the report is left', async () => {
  const { engine } = fakeEngine();
  mocks.cached = true;
  mocks.load.mockResolvedValue(engine);
  const view = render(<Harness />);
  fireEvent.click(await screen.findByRole('button', { name: /Ask the private coach/ }));
  await screen.findByLabelText('Question for the private coach');
  expect(engine.unloaded).toBe(0);
  view.unmount();
  await waitFor(() => expect(engine.unloaded).toBe(1));
});

it('shows a failure to the athlete and lets them try again', async () => {
  mocks.cached = true;
  mocks.load.mockRejectedValueOnce(new Error('Could not reach Hugging Face.'));
  render(<Harness />);
  fireEvent.click(await screen.findByRole('button', { name: /Ask the private coach/ }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/Could not reach Hugging Face/);
  expect(screen.getByRole('button', { name: /Ask the private coach/ })).toBeTruthy();
});
