import { registerSW } from 'virtual:pwa-register';
import { updateStore, type UpdateStore } from './updateStore';

const UPDATE_CHECK_MS = 60 * 60 * 1000;

type RegisterOptions = {
  store?: UpdateStore;
  reload?: () => void;
};

/**
 * An installed app can stay open for days without a page navigation, which is what normally makes the
 * browser look for a new service worker, so look on a timer and when the app comes back to the front.
 */
function checkForUpdatesRegularly(registration: ServiceWorkerRegistration) {
  let lastCheck = Date.now();
  const check = () => {
    if (!navigator.onLine || registration.installing) return;
    lastCheck = Date.now();
    // Offline or the host is unreachable: the next check will try again.
    registration.update().catch(() => undefined);
  };
  window.setInterval(check, UPDATE_CHECK_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastCheck > UPDATE_CHECK_MS) check();
  });
}

/**
 * Registers the service worker (a no-op in development and where the browser has none). A new version
 * installs in the background and waits: the page only reloads for it when the athlete presses Reload.
 */
export function registerServiceWorker({ store = updateStore, reload = () => window.location.reload() }: RegisterOptions = {}): void {
  let reloading = false;
  const reloadOnce = () => {
    if (reloading) return;
    reloading = true;
    reload();
  };

  // A new worker took control of a page that is still running the old version's code: the athlete accepted
  // the update here or in another tab. Reload unless an analysis is running; then the Reload button is left
  // to finish the job. The first takeover of a page that had no worker is only the install claiming it.
  // (The registration helper reports takeovers only for pages that were already controlled when they opened,
  // so a tab opened by a first-time visitor would never reload; this covers every page.)
  let controlled = Boolean(navigator.serviceWorker?.controller);
  navigator.serviceWorker?.addEventListener('controllerchange', () => {
    if (controlled) {
      store.announceTakeover(reloadOnce);
      if (!store.isHeld()) reloadOnce();
    }
    controlled = true;
  });

  const updateServiceWorker = registerSW({
    immediate: true,
    // A new version is installed and waiting. Reload hands it control; the page reloads once it has it.
    onNeedRefresh: () => store.announceUpdate(() => { void updateServiceWorker(true); }),
    // Replaces the helper's own reload, which would ignore a running analysis. See controllerchange above.
    onNeedReload: () => undefined,
    onRegisteredSW: (_url, registration) => { if (registration) checkForUpdatesRegularly(registration); },
    onRegisterError: (error) => console.warn('The service worker could not be registered, so the app will not work offline.', error),
  });
}
