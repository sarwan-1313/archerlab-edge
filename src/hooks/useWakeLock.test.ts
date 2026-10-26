// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isWakeLockSupported, useWakeLock } from './useWakeLock';

function installWakeLock(request: () => Promise<unknown>) {
  Object.defineProperty(navigator, 'wakeLock', { value: { request: vi.fn(request) }, configurable: true });
  return (navigator as unknown as { wakeLock: { request: ReturnType<typeof vi.fn> } }).wakeLock.request;
}

function fakeSentinel() {
  const sentinel = { released: false, release: vi.fn(async () => { sentinel.released = true; }) };
  return sentinel;
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

afterEach(() => {
  Reflect.deleteProperty(navigator, 'wakeLock');
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

describe('useWakeLock', () => {
  it('does nothing when the browser has no wake lock', () => {
    expect(isWakeLockSupported()).toBe(false);
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
  });

  it('holds the screen awake while active and releases it afterwards', async () => {
    const sentinel = fakeSentinel();
    const request = installWakeLock(async () => sentinel);
    const { rerender } = renderHook(({ active }) => useWakeLock(active), { initialProps: { active: false } });
    await flush();
    expect(request).not.toHaveBeenCalled();
    rerender({ active: true });
    await flush();
    expect(request).toHaveBeenCalledWith('screen');
    rerender({ active: false });
    expect(sentinel.release).toHaveBeenCalled();
  });

  it('takes the lock again when the tab becomes visible', async () => {
    const sentinels = [fakeSentinel(), fakeSentinel()];
    const request = installWakeLock(async () => sentinels[request.mock.calls.length - 1]);
    const { unmount } = renderHook(() => useWakeLock(true));
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
    // The browser releases the lock when the tab is hidden.
    sentinels[0].released = true;
    setVisibility('hidden');
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
    setVisibility('visible');
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
    unmount();
    expect(sentinels[1].release).toHaveBeenCalled();
  });

  it('ignores refused requests', async () => {
    const request = installWakeLock(async () => { throw new DOMException('Not allowed', 'NotAllowedError'); });
    const { unmount } = renderHook(() => useWakeLock(true));
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
    expect(() => unmount()).not.toThrow();
  });
});
