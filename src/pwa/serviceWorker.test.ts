// @vitest-environment jsdom
import type { RegisterSWOptions } from 'vite-plugin-pwa/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUpdateStore } from './updateStore';

const registerSW = vi.hoisted(() => vi.fn());
vi.mock('virtual:pwa-register', () => ({ registerSW }));

const { registerServiceWorker } = await import('./serviceWorker');

/** The browser's service worker container, which is not there in jsdom. */
function installContainer(controlled: boolean) {
  const container = Object.assign(new EventTarget(), { controller: controlled ? {} : null });
  Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true });
  return container;
}

function setup({ controlled = true } = {}) {
  const container = installContainer(controlled);
  const updateServiceWorker = vi.fn(async () => undefined);
  registerSW.mockReturnValue(updateServiceWorker);
  const store = createUpdateStore();
  const reload = vi.fn();
  registerServiceWorker({ store, reload });
  const options = registerSW.mock.calls.at(-1)?.[0] as RegisterSWOptions;
  const takeOver = () => container.dispatchEvent(new Event('controllerchange'));
  return { options, store, reload, updateServiceWorker, takeOver };
}

beforeEach(() => registerSW.mockReset());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('registerServiceWorker', () => {
  it('announces a waiting version but does nothing until Reload is pressed', () => {
    const { options, store, reload, updateServiceWorker } = setup();
    options.onNeedRefresh?.();
    expect(store.getSnapshot().updateReady).toBe(true);
    expect(updateServiceWorker).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    store.apply();
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads once the new worker takes over, and only once', () => {
    const { options, reload, takeOver } = setup();
    options.onNeedRefresh?.();
    takeOver();
    takeOver();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('can be told about the same waiting version twice without bringing back a dismissed toast', () => {
    const { options, store } = setup();
    options.onNeedRefresh?.();
    store.dismiss();
    options.onNeedRefresh?.();
    expect(store.getSnapshot().dismissed).toBe(true);
  });

  it('reloads a page that was opened by a first-time visitor, but not when the install first claims it', () => {
    const { store, reload, takeOver } = setup({ controlled: false });
    takeOver();
    expect(reload).not.toHaveBeenCalled();
    expect(store.getSnapshot().updateReady).toBe(false);
    takeOver();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload under a running analysis, and leaves the Reload button to finish the job', () => {
    const { store, reload, takeOver } = setup();
    const release = store.hold();
    takeOver();
    expect(reload).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toMatchObject({ updateReady: true, held: true });
    release();
    expect(reload).not.toHaveBeenCalled();
    store.apply();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('works in a browser with no service worker support', () => {
    Reflect.deleteProperty(navigator, 'serviceWorker');
    registerSW.mockReturnValue(vi.fn());
    expect(() => registerServiceWorker({ store: createUpdateStore(), reload: vi.fn() })).not.toThrow();
  });

  it('warns instead of throwing when the worker cannot be registered', () => {
    const { options } = setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() => options.onRegisterError?.(new Error('blocked'))).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });

  describe('looking for new versions', () => {
    const HOUR = 60 * 60 * 1000;
    const registration = () => ({ installing: null, update: vi.fn(async () => undefined) });
    const online = (value: boolean) => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value);

    it('checks every hour while online', () => {
      vi.useFakeTimers();
      const { options } = setup();
      const current = registration();
      options.onRegisteredSW?.('/sw.js', current as unknown as ServiceWorkerRegistration);
      vi.advanceTimersByTime(HOUR);
      expect(current.update).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(HOUR);
      expect(current.update).toHaveBeenCalledTimes(2);
    });

    it('skips the check while offline', () => {
      vi.useFakeTimers();
      online(false);
      const { options } = setup();
      const current = registration();
      options.onRegisteredSW?.('/sw.js', current as unknown as ServiceWorkerRegistration);
      vi.advanceTimersByTime(HOUR);
      expect(current.update).not.toHaveBeenCalled();
    });

    it('does not stop checking when a check fails', async () => {
      vi.useFakeTimers();
      const { options } = setup();
      const current = { installing: null, update: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) };
      options.onRegisteredSW?.('/sw.js', current as unknown as ServiceWorkerRegistration);
      await vi.advanceTimersByTimeAsync(2 * HOUR);
      expect(current.update).toHaveBeenCalledTimes(2);
    });
  });
});
