import { useEffect } from 'react';

export function isWakeLockSupported(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator && typeof navigator.wakeLock?.request === 'function';
}

/**
 * Keeps the screen on while `active`, using the Screen Wake Lock API. Browsers
 * drop the lock when the tab is hidden, so it is taken again when the tab comes
 * back. Unsupported browsers and refused requests (e.g. battery saver) are ignored.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !isWakeLockSupported()) return;
    let sentinel: WakeLockSentinel | null = null;
    let requesting = false;
    let stopped = false;

    const acquire = async () => {
      if (stopped || requesting || document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return;
      requesting = true;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (stopped) void next.release().catch(() => undefined);
        else sentinel = next;
      } catch { /* The page works without it. */ } finally {
        requesting = false;
      }
    };
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') void acquire(); };

    void acquire();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => undefined);
      sentinel = null;
    };
  }, [active]);
}
