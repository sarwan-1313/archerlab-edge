/**
 * Guest mode: try ArcherLab without a profile and without keeping anything.
 * Everything works while the app is open; the next time it is opened (a new
 * browser session), the device's ArcherLab data is deleted. Creating a profile
 * or signing in ends guest mode, and from then on work is kept as usual.
 *
 * Kept small and free of heavy imports: it runs before the app starts.
 */

export const GUEST_MODE_KEY = 'archerlab-edge:guest-mode';
export const WELCOME_KEY = 'archerlab-edge:welcome-choice';
export const ONBOARDING_KEY = 'archerlab-edge:onboarding-complete';
/** In sessionStorage: this browser session has already been cleaned. Cleared by the browser when the app or tab closes. */
export const GUEST_VISIT_KEY = 'archerlab-edge:guest-visit';

/** The IndexedDB databases that hold the athlete's data (must match APP_DATABASES in privacy/localData.ts). */
export const GUEST_DATABASES = ['archerlab-edge-profiles', 'archerlab-edge-recordings', 'archerlab-edge-video', 'archerlab-edge-practice-log'] as const;

/** Device settings that are not personal and survive a guest clean-up. */
export const KEPT_KEYS = new Set([
  GUEST_MODE_KEY, WELCOME_KEY, ONBOARDING_KEY,
  'archerlab-edge:lite-mode', 'archerlab-edge:lite-mode-suggestion-dismissed', 'archerlab-edge:language',
  'archerlab-edge:local-coach-model', 'archerlab-edge:install-card-dismissed',
]);

export type WelcomeChoice = 'profile' | 'guest' | 'google';

function read(storage: Storage | undefined, key: string): string | null {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}
function write(storage: Storage | undefined, key: string, value: string | null) {
  try {
    if (value === null) storage?.removeItem(key);
    else storage?.setItem(key, value);
  } catch { /* storage unavailable */ }
}

export function isGuest(storage: Storage | undefined = globalThis.localStorage): boolean {
  return read(storage, GUEST_MODE_KEY) === '1';
}

export function welcomeChoice(storage: Storage | undefined = globalThis.localStorage): WelcomeChoice | null {
  const value = read(storage, WELCOME_KEY);
  return value === 'profile' || value === 'guest' || value === 'google' ? value : null;
}

/** Records how the athlete chose to start. Guest turns guest mode on; anything else turns it off. */
export function chooseStart(choice: WelcomeChoice, storage: Storage | undefined = globalThis.localStorage, session: Storage | undefined = globalThis.sessionStorage): void {
  write(storage, WELCOME_KEY, choice);
  write(storage, ONBOARDING_KEY, 'true');
  write(storage, GUEST_MODE_KEY, choice === 'guest' ? '1' : null);
  // The current visit counts as cleaned, so nothing is deleted until the app is next opened.
  if (choice === 'guest') write(session, GUEST_VISIT_KEY, '1');
  notify();
}

/** Ends guest mode (after creating a profile or signing in): from now on, work is kept. */
export function leaveGuestMode(storage: Storage | undefined = globalThis.localStorage): void {
  if (!isGuest(storage)) return;
  write(storage, GUEST_MODE_KEY, null);
  write(storage, WELCOME_KEY, 'profile');
  notify();
}

/** Whether to show the welcome screen: first visit, no choice made, and no profile yet. */
export function shouldWelcome(hasProfile: boolean, storage: Storage | undefined = globalThis.localStorage): boolean {
  if (hasProfile) return false;
  return welcomeChoice(storage) === null && read(storage, ONBOARDING_KEY) !== 'true';
}

/** True when this is a new visit in guest mode, so last visit's data should be removed. */
export function guestCleanupDue(storage: Storage | undefined = globalThis.localStorage, session: Storage | undefined = globalThis.sessionStorage): boolean {
  return isGuest(storage) && read(session, GUEST_VISIT_KEY) !== '1';
}

/** Removes the app's own keys except the device settings in KEPT_KEYS. */
export function clearGuestKeys(storage: Storage | undefined): number {
  if (!storage) return 0;
  try {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith('archerlab-edge:') && !KEPT_KEYS.has(key)) keys.push(key);
    }
    keys.forEach((key) => storage.removeItem(key));
    return keys.length;
  } catch { return 0; }
}

function deleteDatabase(name: string, factory: IDBFactory, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    try {
      const request = factory.deleteDatabase(name);
      const done = () => { clearTimeout(timer); resolve(); };
      request.onsuccess = done;
      request.onerror = done;
      // Another tab still has it open: it is deleted once that tab closes.
      request.onblocked = done;
    } catch { clearTimeout(timer); resolve(); }
  });
}

/** Deletes the last guest visit's data. Never throws, and gives up on a database after a few seconds. */
export async function cleanUpGuestVisit(
  storage: Storage | undefined = globalThis.localStorage,
  session: Storage | undefined = globalThis.sessionStorage,
  factory: IDBFactory | undefined = globalThis.indexedDB,
): Promise<boolean> {
  if (!guestCleanupDue(storage, session)) return false;
  if (factory) await Promise.all(GUEST_DATABASES.map((name) => deleteDatabase(name, factory, 3000)));
  clearGuestKeys(storage);
  clearGuestKeys(session);
  write(session, GUEST_VISIT_KEY, '1');
  return true;
}

const listeners = new Set<() => void>();
function notify() { listeners.forEach((listener) => listener()); }
export function subscribeGuestMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
