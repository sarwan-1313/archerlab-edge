import { useSyncExternalStore } from 'react';

/**
 * Lite mode, for low-end phones: the Lite pose model only, the Fast precision preset, a smaller
 * inference frame, no 3D viewer and fewer animations. The athlete turns it on or off on the Profile
 * page; until they choose, the app suggests it when the device looks low-end. Kept on this device only.
 */
export const LITE_MODE_KEY = 'archerlab-edge:lite-mode';
export const LITE_SUGGESTION_KEY = 'archerlab-edge:lite-mode-suggestion-dismissed';

/** At or below this much RAM (navigator.deviceMemory, in GB, which browsers round down to 0.25–8). */
export const LOW_MEMORY_GB = 2;
/** At or below this many logical cores. Only counts together with another sign, as many mid-range phones report 4. */
export const LOW_CORE_COUNT = 4;
/** The timing test taking longer than this (ms) marks a slow CPU. A recent phone takes about 5–15 ms. */
export const SLOW_TIMING_MS = 45;

export interface DeviceSignals {
  /** navigator.deviceMemory, when the browser reports it (Chromium only). */
  deviceMemoryGb?: number | null;
  /** navigator.hardwareConcurrency. */
  cores?: number | null;
  /** Result of runTimingTest, in ms. */
  timingMs?: number | null;
}

export interface DeviceAssessment {
  lowEnd: boolean;
  /** Why, in plain words, for the suggestion. Empty when not low-end. */
  reasons: string[];
}

const known = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

/**
 * Whether the device looks too weak for the default settings. Low memory alone is enough (it is what
 * crashes long analyses); a slow timing test alone is enough; few cores counts only alongside another sign.
 */
export function assessDevice(signals: DeviceSignals): DeviceAssessment {
  const lowMemory = known(signals.deviceMemoryGb) && signals.deviceMemoryGb <= LOW_MEMORY_GB;
  const fewCores = known(signals.cores) && signals.cores <= LOW_CORE_COUNT;
  const slow = known(signals.timingMs) && signals.timingMs > SLOW_TIMING_MS;
  const reasons: string[] = [];
  if (lowMemory) reasons.push(`about ${signals.deviceMemoryGb} GB of memory`);
  if (slow) reasons.push('a slow processor in a quick speed test');
  if (fewCores && (lowMemory || slow)) reasons.push(`${signals.cores} processor cores`);
  return { lowEnd: lowMemory || slow, reasons };
}

/**
 * A short, fixed CPU workload (about 5–15 ms on a recent phone). Returns the median of a few runs in ms,
 * so one hiccup does not decide it.
 */
export function runTimingTest(now: () => number = () => performance.now(), runs = 3): number {
  const times: number[] = [];
  let sink = 0;
  for (let run = 0; run < runs; run += 1) {
    const began = now();
    const data = new Float32Array(4096);
    for (let pass = 0; pass < 60; pass += 1) {
      for (let i = 0; i < data.length; i += 1) data[i] = Math.sqrt(data[i] + i * pass) * 0.5 + Math.sin(i);
    }
    sink += data[run];
    times.push(now() - began);
  }
  if (sink === Number.NEGATIVE_INFINITY) times.push(0); // Keeps the loop from being optimised away.
  return [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)];
}

type NavigatorWithMemory = Navigator & { deviceMemory?: number };

/** Reads this device's signals. The timing test is optional, as it blocks the main thread briefly. */
export function readDeviceSignals(withTiming = true): DeviceSignals {
  const nav = typeof navigator === 'undefined' ? undefined : navigator as NavigatorWithMemory;
  return {
    deviceMemoryGb: nav?.deviceMemory ?? null,
    cores: nav?.hardwareConcurrency ?? null,
    timingMs: withTiming ? runTimingTest() : null,
  };
}

/** The athlete's choice: on, off, or null when they have not chosen. */
export function readLiteChoice(): boolean | null {
  try {
    const value = localStorage.getItem(LITE_MODE_KEY);
    return value === '1' ? true : value === '0' ? false : null;
  } catch {
    return null;
  }
}

export function readLiteMode(): boolean {
  return readLiteChoice() === true;
}

const listeners = new Set<() => void>();

export function writeLiteMode(on: boolean): void {
  try { localStorage.setItem(LITE_MODE_KEY, on ? '1' : '0'); } catch { /* Storage unavailable: lasts for this page only. */ }
  applyLiteMode(on);
  listeners.forEach((listener) => listener());
}

/** Marks the document so the stylesheet can cut animations. */
export function applyLiteMode(on: boolean = readLiteMode()): void {
  if (typeof document === 'undefined') return;
  if (on) document.documentElement.dataset.lite = 'on';
  else delete document.documentElement.dataset.lite;
}

/** Whether to suggest Lite mode: the device looks low-end and the athlete has neither chosen nor dismissed it. */
export function shouldSuggestLite(assessment: DeviceAssessment, choice: boolean | null, dismissed: boolean): boolean {
  return assessment.lowEnd && choice === null && !dismissed;
}

export function readSuggestionDismissed(): boolean {
  try { return localStorage.getItem(LITE_SUGGESTION_KEY) === '1'; } catch { return false; }
}

export function dismissLiteSuggestion(): void {
  try { localStorage.setItem(LITE_SUGGESTION_KEY, '1'); } catch { /* ignore */ }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === LITE_MODE_KEY) applyLiteMode();
    if (event.key === LITE_MODE_KEY || event.key === LITE_SUGGESTION_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useLiteMode(): boolean {
  return useSyncExternalStore(subscribe, readLiteMode, () => false);
}

export function useLiteSuggestionDismissed(): boolean {
  return useSyncExternalStore(subscribe, readSuggestionDismissed, () => false);
}

let cachedAssessment: DeviceAssessment | null = null;

/** Assesses this device once per page load (the timing test runs only the first time). */
export function assessThisDevice(): DeviceAssessment {
  cachedAssessment ??= assessDevice(readDeviceSignals());
  return cachedAssessment;
}

/** Settings Lite mode changes elsewhere in the app. */
export const LITE_SETTINGS = {
  /** Long edge of the frame handed to the pose model in video analysis (default 720). */
  inferenceLongEdgePx: 480,
  /** Live camera inference rate (default 20). */
  liveInferenceFps: 12,
} as const;
