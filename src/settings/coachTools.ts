import { useSyncExternalStore } from 'react';

/**
 * "Coach tools": off by default. Turns on tools for coaches and for whoever tunes the engine: labelling a
 * video report against what a coach sees and exporting it as a fixture (docs/validation.md), and the dataset
 * tools for bow detection. Kept on this device only.
 */
export const COACH_TOOLS_KEY = 'archerlab-edge:coach-tools';

const listeners = new Set<() => void>();

export function readCoachTools(): boolean {
  try { return localStorage.getItem(COACH_TOOLS_KEY) === '1'; } catch { return false; }
}

export function writeCoachTools(on: boolean): void {
  try {
    if (on) localStorage.setItem(COACH_TOOLS_KEY, '1');
    else localStorage.removeItem(COACH_TOOLS_KEY);
  } catch { /* Storage unavailable: the setting lasts for this page only. */ }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changed it.
  const onStorage = (event: StorageEvent) => { if (event.key === COACH_TOOLS_KEY) listener(); };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useCoachTools(): boolean {
  return useSyncExternalStore(subscribe, readCoachTools, () => false);
}
