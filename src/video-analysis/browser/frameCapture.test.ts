// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import { VIDEO_READ_ERROR_MESSAGE, VIDEO_STALLED_MESSAGE, captureRanges, resolveDuration } from './frameCapture';

type FrameCallback = (now: number, metadata: { mediaTime: number; presentedFrames: number }) => void;

/** Just enough of a playing <video> with requestVideoFrameCallback. */
class FakeVideo extends EventTarget {
  currentTime = 0;
  duration = 120;
  readyState = 4;
  videoWidth = 640;
  videoHeight = 360;
  playbackRate = 1;
  muted = false;
  paused = true;
  presented = 0;
  private callback: FrameCallback | null = null;
  requestVideoFrameCallback(callback: FrameCallback) { this.callback = callback; return 1; }
  cancelVideoFrameCallback() { this.callback = null; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  /** Presents frames from `from` to `to` seconds at `fps`. */
  present(from: number, to: number, fps = 10) {
    for (let t = from; t <= to + 1e-9; t += 1 / fps) {
      const callback = this.callback;
      this.callback = null;
      this.presented += 1;
      callback?.(0, { mediaTime: Number(t.toFixed(4)), presentedFrames: this.presented });
    }
  }
}

const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: () => undefined }) } as unknown as HTMLCanvasElement;
const landmarker = { detectForVideo: () => ({ landmarks: [], worldLandmarks: [] }) } as unknown as PoseLandmarker;

function capture(video: FakeVideo, options: { end?: number; allowPartial?: boolean; signal?: AbortSignal } = {}) {
  return captureRanges({
    video: video as unknown as HTMLVideoElement, canvas, landmarker, ranges: [[0, options.end ?? 60]], fps: 10,
    signal: options.signal ?? new AbortController().signal, allowPartial: options.allowPartial,
  });
}

const settle = () => vi.advanceTimersByTimeAsync(0);
const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(document, 'hidden', { value: false, configurable: true });
});

describe('captureRanges', () => {
  it('reads a whole range and leaves no timers behind', async () => {
    const video = new FakeVideo();
    const result = capture(video, { end: 3 });
    await settle();
    video.present(0, 3.2);
    const { samples, stalledAt } = await result;
    expect(samples.length).toBe(31);
    expect(stalledAt).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('fails clearly when the video reports a read error', async () => {
    const video = new FakeVideo();
    const result = capture(video);
    await settle();
    video.present(0, 2);
    video.dispatchEvent(new Event('error'));
    await expect(result).rejects.toThrow(VIDEO_READ_ERROR_MESSAGE);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps what was tracked when playback stops after enough of the clip', async () => {
    const video = new FakeVideo();
    const result = capture(video);
    await settle();
    video.present(0, 15);
    await vi.advanceTimersByTimeAsync(7000);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(2000);
    const { samples, stalledAt } = await result;
    expect(stalledAt).toBeCloseTo(15, 3);
    expect(samples.length).toBe(151);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('fails when playback stops before enough was tracked', async () => {
    const video = new FakeVideo();
    const result = capture(video);
    const assertion = expect(result).rejects.toThrow(VIDEO_STALLED_MESSAGE);
    await settle();
    video.present(0, 3);
    await vi.advanceTimersByTimeAsync(9000);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops quietly in the optional precision pass', async () => {
    const video = new FakeVideo();
    const result = capture(video, { allowPartial: true });
    await settle();
    video.present(0, 1);
    await vi.advanceTimersByTimeAsync(9000);
    expect((await result).stalledAt).toBeCloseTo(1, 3);
  });

  it('does not count time while the tab is hidden', async () => {
    const video = new FakeVideo();
    const result = capture(video, { end: 30 });
    let settled = false;
    void result.then(() => { settled = true; });
    await settle();
    video.present(0, 12);
    setHidden(true);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(settled).toBe(false);
    setHidden(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(settled).toBe(false);
    video.present(12.1, 30.2);
    expect((await result).stalledAt).toBeNull();
  });

  it('cleans up when cancelled', async () => {
    const video = new FakeVideo();
    const controller = new AbortController();
    const result = capture(video, { signal: controller.signal });
    const assertion = expect(result).rejects.toThrow('Analysis cancelled');
    await settle();
    controller.abort();
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('resolveDuration', () => {
  it('returns a known length straight away', async () => {
    await expect(resolveDuration(new FakeVideo() as unknown as HTMLVideoElement)).resolves.toBe(120);
  });

  it('works out an infinite length by seeking past the end, then rewinds', async () => {
    const video = new FakeVideo();
    video.duration = Infinity;
    const pending = resolveDuration(video as unknown as HTMLVideoElement);
    expect(video.currentTime).toBeGreaterThan(1e9);
    video.duration = 37.5;
    video.dispatchEvent(new Event('durationchange'));
    await expect(pending).resolves.toBe(37.5);
    expect(video.currentTime).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('gives up after a timeout', async () => {
    const video = new FakeVideo();
    video.duration = Infinity;
    const pending = resolveDuration(video as unknown as HTMLVideoElement, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toBe(Infinity);
  });
});
