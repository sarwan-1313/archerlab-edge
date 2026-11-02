import { describe, expect, it, vi } from 'vitest';
import { createUpdateStore } from './updateStore';

describe('update store', () => {
  it('starts with no update, and keeps its snapshot until something changes', () => {
    const store = createUpdateStore();
    const first = store.getSnapshot();
    expect(first).toEqual({ updateReady: false, dismissed: false, held: false });
    store.dismiss();
    store.dismiss();
    const second = store.getSnapshot();
    expect(second).toEqual({ updateReady: false, dismissed: true, held: false });
    store.dismiss();
    expect(store.getSnapshot()).toBe(second);
  });

  it('runs the update only when asked, not when it is announced', () => {
    const store = createUpdateStore();
    const applyUpdate = vi.fn();
    store.announceUpdate(applyUpdate);
    expect(store.getSnapshot().updateReady).toBe(true);
    expect(applyUpdate).not.toHaveBeenCalled();
    store.apply();
    expect(applyUpdate).toHaveBeenCalledTimes(1);
  });

  it('keeps Later even when the same update is announced again', () => {
    const store = createUpdateStore();
    store.announceUpdate(vi.fn());
    store.dismiss();
    store.announceUpdate(vi.fn());
    expect(store.getSnapshot()).toMatchObject({ updateReady: true, dismissed: true });
  });

  it('brings the toast back when a new worker takes over a page that still runs the old code', () => {
    const store = createUpdateStore();
    const reload = vi.fn();
    store.announceUpdate(vi.fn());
    store.dismiss();
    store.announceTakeover(reload);
    expect(store.getSnapshot()).toMatchObject({ updateReady: true, dismissed: false });
    store.apply();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('is held while any analysis holds it, and counts each hold once', () => {
    const store = createUpdateStore();
    const releaseVideo = store.hold();
    const releaseLive = store.hold();
    expect(store.isHeld()).toBe(true);
    releaseVideo();
    releaseVideo();
    expect(store.isHeld()).toBe(true);
    releaseLive();
    expect(store.isHeld()).toBe(false);
    expect(store.getSnapshot().held).toBe(false);
  });

  it('tells subscribers about every change and stops after unsubscribing', () => {
    const store = createUpdateStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.announceUpdate(vi.fn());
    const release = store.hold();
    release();
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
    store.dismiss();
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
