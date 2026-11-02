// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUpdateStore } from '../pwa/updateStore';
import { UpdateToast } from './UpdateToast';

afterEach(cleanup);

describe('UpdateToast', () => {
  it('shows nothing until an update is available', () => {
    render(<UpdateToast store={createUpdateStore()} />);
    expect(screen.queryByText('Update available')).toBeNull();
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('offers a Reload button that applies the update, and only then', () => {
    const store = createUpdateStore();
    const applyUpdate = vi.fn();
    render(<UpdateToast store={store} />);
    act(() => store.announceUpdate(applyUpdate));
    expect(screen.getByText('Update available')).toBeTruthy();
    expect(applyUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(applyUpdate).toHaveBeenCalledTimes(1);
  });

  it('is hidden by Later, even if the same update is announced again', () => {
    const store = createUpdateStore();
    render(<UpdateToast store={store} />);
    act(() => store.announceUpdate(vi.fn()));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss update notice' }));
    expect(screen.queryByText('Update available')).toBeNull();
    act(() => store.announceUpdate(vi.fn()));
    expect(screen.queryByText('Update available')).toBeNull();
  });

  it('comes back when a new worker has taken over a page running old code', () => {
    const store = createUpdateStore();
    render(<UpdateToast store={store} />);
    act(() => store.announceUpdate(vi.fn()));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss update notice' }));
    act(() => store.announceTakeover(vi.fn()));
    expect(screen.getByText('Update available')).toBeTruthy();
  });

  it('stays out of the way of a running analysis, and appears when it ends', () => {
    const store = createUpdateStore();
    render(<UpdateToast store={store} />);
    let release = () => undefined as void;
    act(() => { release = store.hold(); });
    act(() => store.announceUpdate(vi.fn()));
    expect(screen.queryByText('Update available')).toBeNull();
    act(() => release());
    expect(screen.getByText('Update available')).toBeTruthy();
  });
});
