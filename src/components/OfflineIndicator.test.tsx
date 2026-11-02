// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OfflineIndicator } from './OfflineIndicator';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function setOnline(online: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
  act(() => { window.dispatchEvent(new Event(online ? 'online' : 'offline')); });
}

describe('OfflineIndicator', () => {
  it('shows nothing while online, in a live region that is already on the page', () => {
    render(<OfflineIndicator />);
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('appears when the connection drops and goes when it returns', () => {
    render(<OfflineIndicator />);
    setOnline(false);
    expect(screen.getByRole('status').textContent).toContain('Offline');
    expect(screen.getByRole('status').textContent).toContain('Analysis still works');
    setOnline(true);
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('shows at once when the page opens offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<OfflineIndicator />);
    expect(screen.getByText('Offline')).toBeTruthy();
  });
});
