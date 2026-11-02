import { useEffect, useState } from 'react';

/**
 * Installing ArcherLab from the browser. Chrome and Edge fire
 * `beforeinstallprompt`, which is kept so an "Install" button can show the
 * browser's own prompt; Safari on iPhone and iPad has no prompt, so the card
 * explains Share → Add to Home Screen instead.
 */

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallPlatform = 'ios' | 'android' | 'desktop' | 'other';
export const INSTALL_DISMISSED_KEY = 'archerlab-edge:install-card-dismissed';

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/** Starts listening for the browser's install offer. Call once, early, before the event can fire. */
export function captureInstallPrompt(target: Window = window): void {
  target.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    notify();
  });
  target.addEventListener('appinstalled', () => { installed = true; deferred = null; notify(); });
}

export function platformOf(userAgent: string, touchPoints = 0): InstallPlatform {
  // iPadOS reports a Mac user agent; touch support gives it away.
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && touchPoints > 1)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  if (/Windows|Macintosh|Linux|CrOS/i.test(userAgent)) return 'desktop';
  return 'other';
}

/** True when ArcherLab is already running as an installed app. */
export function runningInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  return installed
    || window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable';
  const event = deferred;
  deferred = null;
  notify();
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === 'accepted') { installed = true; notify(); }
  return outcome;
}

export function useInstallPrompt() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((tick) => tick + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  return {
    canPrompt: deferred !== null,
    installed: runningInstalled(),
    platform: typeof navigator === 'undefined' ? 'other' as InstallPlatform : platformOf(navigator.userAgent, navigator.maxTouchPoints ?? 0),
    prompt: promptInstall,
  };
}
