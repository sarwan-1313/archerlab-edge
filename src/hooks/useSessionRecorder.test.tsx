// @vitest-environment jsdom
import { StrictMode, useEffect, useRef } from 'react';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSessionRecorder } from './useSessionRecorder';

const storage = vi.hoisted(() => ({ addChunk: vi.fn(), addTelemetry: vi.fn(), finalizeRecording: vi.fn() }));
vi.mock('../recording/recordingStorage', () => storage);

class TestRecorder {
  static instances: TestRecorder[] = [];
  static isTypeSupported = () => true;
  state = 'inactive';
  onstop: (() => Promise<void>) | null = null;
  ondataavailable: ((event: { data: Blob }) => Promise<void>) | null = null;
  onerror: (() => void) | null = null;
  constructor() { TestRecorder.instances.push(this); }
  start = vi.fn(() => { this.state = 'recording'; });
  pause = vi.fn(() => { this.state = 'paused'; });
  resume = vi.fn(() => { this.state = 'recording'; });
  stop = vi.fn(() => {
    if (this.state === 'inactive') throw new Error('Recorder already stopped');
    this.state = 'inactive';
    // Browser stop events are delivered separately from the synchronous stop call.
  });
}
const stream = { getVideoTracks: () => [{ getSettings: () => ({ width: 640, height: 480 }) }] } as unknown as MediaStream;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-05T12:00:00Z'));
  TestRecorder.instances = [];
  vi.stubGlobal('MediaRecorder', TestRecorder);
  storage.addChunk.mockResolvedValue(undefined);
  storage.addTelemetry.mockResolvedValue(undefined);
  storage.finalizeRecording.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('starts, pauses, resumes, saves existing event fields, and clears timers on repeated stop/unmount', async () => {
  const { result, unmount } = renderHook(() => useSessionRecorder(stream));
  await act(async () => { expect((await result.current.start()).ok).toBe(true); });
  const recorder = TestRecorder.instances[0];
  expect(recorder.start).toHaveBeenCalledWith(1000);
  act(() => { vi.advanceTimersByTime(500); });
  expect(result.current.durationMs).toBe(500);
  act(() => { result.current.pause(); }); expect(result.current.state).toBe('paused');
  act(() => { result.current.resume(); }); expect(result.current.state).toBe('recording');
  const blob = new Blob(['video']);
  await act(async () => {
    await recorder.ondataavailable!({ data: blob });
    await result.current.recordEvent({ type: 'release', tMs: 250, source: 'manual' });
  });
  expect(storage.addChunk).toHaveBeenCalledWith(expect.any(String), 0, blob, 500);
  expect(storage.addTelemetry).toHaveBeenCalledWith(expect.any(String), { type: 'release', tMs: 250, source: 'manual' });
  act(() => { result.current.stop(); result.current.stop(); });
  expect(vi.getTimerCount()).toBe(0);
  await act(async () => { await recorder.onstop!(); });
  expect(result.current.state).toBe('idle');
  expect(storage.finalizeRecording).toHaveBeenCalledWith(expect.objectContaining({ durationMs: 500, chunkCount: 1, approximateBytes: blob.size }));
  unmount();
  expect(recorder.stop).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('keeps the new effect-owned recorder alive after StrictMode cleanup and releases it on unmount', () => {
  function RecordingOnMount() {
    const recorder = useSessionRecorder(stream);
    const startRef = useRef(recorder.start);
    useEffect(() => { void startRef.current(); }, []);
    return null;
  }
  const { unmount } = render(<StrictMode><RecordingOnMount /></StrictMode>);
  expect(TestRecorder.instances).toHaveLength(2);
  const [older, newer] = TestRecorder.instances;
  expect(older.stop).toHaveBeenCalledTimes(1);
  expect(newer.stop).not.toHaveBeenCalled();
  expect(newer.state).toBe('recording');
  expect(vi.getTimerCount()).toBe(1);
  unmount();
  expect(older.stop).toHaveBeenCalledTimes(1);
  expect(newer.stop).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('waits for an asynchronous chunk write before finalizing the manifest', async () => {
  let resolveChunk!: () => void;
  storage.addChunk.mockReturnValueOnce(new Promise<void>((resolve) => { resolveChunk = resolve; }));
  const { result } = renderHook(() => useSessionRecorder(stream));
  await act(async () => { await result.current.start(); });
  const recorder = TestRecorder.instances[0];
  const blob = new Blob(['final']);
  await act(async () => { void recorder.ondataavailable!({ data: blob }); });
  await act(async () => { void recorder.onstop!(); });
  expect(storage.finalizeRecording).not.toHaveBeenCalled();
  await act(async () => { resolveChunk(); await Promise.resolve(); });
  await waitForFinalization();
  expect(storage.finalizeRecording).toHaveBeenCalledWith(expect.objectContaining({ chunkCount: 1, approximateBytes: blob.size }));
});

it('waits for accepted telemetry writes before finalizing', async () => {
  let resolveTelemetry!: () => void;
  storage.addTelemetry.mockReturnValueOnce(new Promise<void>((resolve) => { resolveTelemetry = resolve; }));
  const { result } = renderHook(() => useSessionRecorder(stream));
  await act(async () => { await result.current.start(); });
  const recorder = TestRecorder.instances[0];
  await act(async () => { void result.current.recordEvent({ type: 'release' }); });
  await act(async () => { void recorder.onstop!(); });
  expect(storage.finalizeRecording).not.toHaveBeenCalled();
  await act(async () => { resolveTelemetry(); await Promise.resolve(); });
  await waitForFinalization();
  expect(storage.finalizeRecording).toHaveBeenCalled();
});

it('does not replace an active recording when start is called again', async () => {
  const { result } = renderHook(() => useSessionRecorder(stream));
  await act(async () => { expect((await result.current.start()).ok).toBe(true); });
  let secondStart: { ok: boolean; error?: string };
  await act(async () => { secondStart = await result.current.start(); });
  expect(secondStart!).toEqual({ ok: false, error: 'Recording already active' });
  expect(TestRecorder.instances).toHaveLength(1);
});

it('releases a failed recorder lifecycle so a later recording can start', async () => {
  const { result } = renderHook(() => useSessionRecorder(stream));
  await act(async () => { await result.current.start(); });
  const failedRecorder = TestRecorder.instances[0];
  act(() => { failedRecorder.onerror!(); });
  expect(result.current.state).toBe('error');
  await act(async () => { expect((await result.current.start()).ok).toBe(true); });
  expect(TestRecorder.instances).toHaveLength(2);
});

async function waitForFinalization() {
  for (let i = 0; i < 5 && !storage.finalizeRecording.mock.calls.length; i += 1) await Promise.resolve();
}
