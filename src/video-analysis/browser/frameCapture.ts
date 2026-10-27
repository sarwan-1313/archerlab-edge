import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import { VIDEO_CONFIG } from '../config';
import { median } from '../signal';
import type { PoseSample } from '../types';

/**
 * Walks a video frame by frame and runs the pose model on each sampled frame.
 *
 * The fast path plays the clip and uses requestVideoFrameCallback, so frames
 * are decoded in order (seeking to every frame re-decodes from the previous
 * keyframe and is many times slower). Playback speed adapts to how fast the
 * model runs on this device, so frames are not skipped. Browsers without
 * requestVideoFrameCallback fall back to seeking.
 */

export interface CaptureProgress {
  t: number;
  processed: number;
  fraction: number;
  sample: PoseSample;
  playbackRate: number;
}

export interface CaptureOptions {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  landmarker: PoseLandmarker;
  ranges: Array<[number, number]>;
  fps: number;
  signal: AbortSignal;
  onProgress?: (progress: CaptureProgress) => void;
  /**
   * When playback stops partway: true stops quietly with the frames so far
   * (the optional precision pass); false keeps them only if enough of the clip
   * was tracked, and fails otherwise.
   */
  allowPartial?: boolean;
}

export interface CaptureResult {
  samples: PoseSample[];
  nativeFps: number | null;
  method: 'playback' | 'seek';
  /** Media time where playback stopped for good, or null when every range was read. */
  stalledAt: number | null;
}

type FrameMetadata = { mediaTime: number; presentedFrames: number };
type FrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: number, metadata: FrameMetadata) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

export class AnalysisCancelledError extends Error {
  constructor() {
    super('Analysis cancelled');
    this.name = 'AnalysisCancelledError';
  }
}

export const VIDEO_STALLED_MESSAGE = 'The video stopped playing partway. The file may be damaged; try exporting it again as MP4.';
export const VIDEO_READ_ERROR_MESSAGE = 'The video could not be read partway through. The file may be damaged; try exporting it again as MP4.';

/**
 * The clip's length in seconds. Files saved by MediaRecorder (screen and
 * camera recorders) often report an infinite duration until their end has been
 * read, so seek far past the end to make the browser work it out.
 */
export function resolveDuration(video: HTMLVideoElement, timeoutMs = 5000): Promise<number> {
  if (video.duration !== Infinity) return Promise.resolve(video.duration);
  return new Promise<number>((resolve) => {
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener('durationchange', onChange);
      video.removeEventListener('timeupdate', onChange);
    };
    const done = () => {
      cleanup();
      video.currentTime = 0;
      resolve(video.duration);
    };
    const onChange = () => { if (Number.isFinite(video.duration)) done(); };
    const timer = window.setTimeout(done, timeoutMs);
    video.addEventListener('durationchange', onChange);
    video.addEventListener('timeupdate', onChange);
    video.currentTime = Number.MAX_SAFE_INTEGER;
  });
}

export function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (Math.abs(video.currentTime - t) < 1e-4 && video.readyState >= 2) { resolve(); return; }
    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener('seeked', done);
      video.removeEventListener('error', fail);
    };
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error('The video could not be read at this point.')); };
    const timer = window.setTimeout(done, 5000);
    video.addEventListener('seeked', done);
    video.addEventListener('error', fail);
    video.currentTime = t;
  });
}

function toSample(t: number, result: ReturnType<PoseLandmarker['detectForVideo']>): PoseSample {
  const landmarks = result.landmarks?.[0];
  const world = result.worldLandmarks?.[0];
  if (!landmarks || landmarks.length < 33) return { t, image: null, world: null };
  const image = new Float32Array(33 * 4);
  for (let index = 0; index < 33; index += 1) {
    const point = landmarks[index];
    image[index * 4] = point.x;
    image[index * 4 + 1] = point.y;
    image[index * 4 + 2] = point.z;
    image[index * 4 + 3] = point.visibility ?? 0;
  }
  let worldArray: Float32Array | null = null;
  if (world && world.length >= 33) {
    worldArray = new Float32Array(33 * 3);
    for (let index = 0; index < 33; index += 1) {
      worldArray[index * 3] = world[index].x;
      worldArray[index * 3 + 1] = world[index].y;
      worldArray[index * 3 + 2] = world[index].z;
    }
  }
  return { t, image, world: worldArray };
}

function prepareCanvas(video: HTMLVideoElement, canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const longEdge = Math.max(video.videoWidth, video.videoHeight) || 1;
  const scale = Math.min(1, VIDEO_CONFIG.inferenceLongEdgePx / longEdge);
  const width = Math.max(2, Math.round(video.videoWidth * scale));
  const height = Math.max(2, Math.round(video.videoHeight * scale));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: false });
  if (!context) throw new Error('This browser could not create a drawing surface for frame analysis.');
  return context;
}

export async function captureRanges(options: CaptureOptions): Promise<CaptureResult> {
  const video = options.video as FrameCallbackVideo;
  const context = prepareCanvas(video, options.canvas);
  const totalSpan = options.ranges.reduce((sum, [start, end]) => sum + Math.max(0, end - start), 0) || 1;
  const samples: PoseSample[] = [];
  let lastTimestampMs = -1;
  let coveredBefore = 0;
  const frameIntervals: number[] = [];

  const detect = (t: number): PoseSample => {
    context.drawImage(video, 0, 0, options.canvas.width, options.canvas.height);
    let timestampMs = Math.round(t * 1000);
    if (timestampMs <= lastTimestampMs) timestampMs = lastTimestampMs + 1;
    lastTimestampMs = timestampMs;
    const result = options.landmarker.detectForVideo(options.canvas, timestampMs);
    const sample = toSample(t, result);
    (result as { close?: () => void }).close?.();
    return sample;
  };

  const report = (sample: PoseSample, start: number, playbackRate: number) => {
    options.onProgress?.({
      t: sample.t,
      processed: samples.length,
      fraction: Math.min(1, (coveredBefore + Math.max(0, sample.t - start)) / totalSpan),
      sample,
      playbackRate,
    });
  };

  const usePlayback = typeof video.requestVideoFrameCallback === 'function';
  video.muted = true;
  let stalledAt: number | null = null;
  for (const [start, end] of options.ranges) {
    if (options.signal.aborted) throw new AnalysisCancelledError();
    if (usePlayback) {
      const outcome = await playRange(video, start, end, options, (t, rate) => {
        const sample = detect(t);
        samples.push(sample);
        report(sample, start, rate);
      }, frameIntervals);
      if (outcome.stalledAt !== null) {
        // Later ranges would stall the same way, so stop here.
        if (!options.allowPartial && outcome.stalledAt - start < VIDEO_CONFIG.stallMinTrackedS) throw new Error(VIDEO_STALLED_MESSAGE);
        stalledAt = outcome.stalledAt;
        break;
      }
    } else {
      for (let t = start; t <= end + 1e-6; t += 1 / options.fps) {
        if (options.signal.aborted) throw new AnalysisCancelledError();
        await seekTo(video, Math.min(t, Math.max(0, video.duration - 0.001)));
        const sample = detect(video.currentTime);
        samples.push(sample);
        report(sample, start, 0);
        if (samples.length % 4 === 0) await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
    }
    coveredBefore += Math.max(0, end - start);
  }
  video.pause();
  const interval = frameIntervals.length >= 5 ? median(frameIntervals) : null;
  return { samples, nativeFps: interval ? Math.round(1 / interval) : null, method: usePlayback ? 'playback' : 'seek', stalledAt };
}

function playRange(
  video: FrameCallbackVideo,
  start: number,
  end: number,
  options: CaptureOptions,
  onFrame: (t: number, playbackRate: number) => void,
  frameIntervals: number[],
): Promise<{ stalledAt: number | null }> {
  return new Promise((resolve, reject) => {
    const interval = 1 / options.fps;
    let nextDue = start;
    let rate = 1;
    let handle = 0;
    let lastMediaTime = -1;
    let lastPresented = -1;
    let finished = false;
    let hiddenPaused = false;
    // Watchdog: when the video should be playing but no frame arrives for a while, the file is stuck.
    let lastProgressAt = 0;
    const watchdog = window.setInterval(() => {
      if (finished || !lastProgressAt || document.hidden || hiddenPaused) return;
      if (Date.now() - lastProgressAt >= VIDEO_CONFIG.stallTimeoutS * 1000) finish(undefined, lastMediaTime >= start ? lastMediaTime : start);
    }, 1000);
    const markProgress = () => { lastProgressAt = Date.now(); };

    const finish = (error?: unknown, stalledAt: number | null = null) => {
      if (finished) return;
      finished = true;
      window.clearInterval(watchdog);
      if (handle) video.cancelVideoFrameCallback?.(handle);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('error', onError);
      document.removeEventListener('visibilitychange', onVisibility);
      options.signal.removeEventListener('abort', onAbort);
      video.pause();
      if (error) reject(error);
      else resolve({ stalledAt });
    };
    const onEnded = () => finish();
    const onError = () => finish(new Error(VIDEO_READ_ERROR_MESSAGE));
    const onAbort = () => finish(new AnalysisCancelledError());
    // Hidden tabs stop presenting frames; pause instead of silently skipping them.
    const onVisibility = () => {
      if (document.hidden) { hiddenPaused = true; video.pause(); }
      else if (hiddenPaused) {
        hiddenPaused = false;
        markProgress();
        void video.play().catch(() => undefined);
      }
    };

    const onVideoFrame = (_now: number, metadata: FrameMetadata) => {
      if (finished) return;
      markProgress();
      const mediaTime = metadata.mediaTime;
      if (lastPresented >= 0 && metadata.presentedFrames === lastPresented + 1 && mediaTime > lastMediaTime) {
        frameIntervals.push(mediaTime - lastMediaTime);
      }
      lastPresented = metadata.presentedFrames;
      lastMediaTime = mediaTime;
      if (mediaTime > end + 1e-3) { finish(); return; }
      if (mediaTime >= nextDue - interval * 0.5) {
        const missed = Math.max(0, Math.floor((mediaTime - nextDue) / interval));
        const began = performance.now();
        try {
          onFrame(mediaTime, rate);
        } catch (error) {
          finish(error);
          return;
        }
        // A slow model run is not a stall.
        markProgress();
        const spentMs = performance.now() - began;
        const budgetMs = (interval * 1000) / rate;
        if (missed > 0 || spentMs > budgetMs * 0.75) rate = Math.max(0.1, rate * 0.7);
        else if (spentMs < budgetMs * 0.3) rate = Math.min(2, rate * 1.1);
        if (Math.abs(video.playbackRate - rate) > 0.01) video.playbackRate = rate;
        nextDue = mediaTime + interval;
      }
      handle = video.requestVideoFrameCallback!(onVideoFrame);
    };

    if (options.signal.aborted) { finish(new AnalysisCancelledError()); return; }
    options.signal.addEventListener('abort', onAbort);
    video.addEventListener('ended', onEnded);
    video.addEventListener('error', onError);
    document.addEventListener('visibilitychange', onVisibility);
    seekTo(video, start).then(() => {
      if (finished) return;
      video.playbackRate = rate;
      handle = video.requestVideoFrameCallback!(onVideoFrame);
      markProgress();
      return video.play();
    }).catch((error) => finish(error));
  });
}
