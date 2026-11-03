import { useSyncExternalStore } from 'react';
import type { SmoothingMode } from '../utils/poseSmoothing';

/** How much the live skeleton is smoothed. Kept on this device only. */
export const TRACKING_SMOOTHING_KEY = 'archerlab-edge:tracking-smoothing';

const MODES: readonly SmoothingMode[] = ['off', 'balanced', 'steady'];
let current: SmoothingMode | null = null;
const listeners = new Set<() => void>();

/** Cached, because the pose loop reads it every frame. */
export function readTrackingSmoothing(): SmoothingMode {
  if (current) return current;
  let saved: string | null = null;
  try { saved = localStorage.getItem(TRACKING_SMOOTHING_KEY); } catch { /* use the default */ }
  current = MODES.find((mode) => mode === saved) ?? 'balanced';
  return current;
}

export function writeTrackingSmoothing(mode: SmoothingMode): void {
  current = mode;
  try { localStorage.setItem(TRACKING_SMOOTHING_KEY, mode); } catch { /* lasts for this visit only */ }
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

export function useTrackingSmoothing(): [SmoothingMode, (mode: SmoothingMode) => void] {
  const mode = useSyncExternalStore(subscribe, readTrackingSmoothing, () => 'balanced' as SmoothingMode);
  return [mode, writeTrackingSmoothing];
}
