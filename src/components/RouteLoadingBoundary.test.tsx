// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { lazy } from 'react';
import { RouteLoadingBoundary } from './RouteLoadingBoundary';
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('keeps the shell usable and offers reload when a lazy page fails', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const Broken = lazy(() => Promise.reject(new Error('Chunk unavailable')));
  render(<><nav>Home navigation</nav><RouteLoadingBoundary status="Loading guide"><Broken /></RouteLoadingBoundary></>);
  expect(await screen.findByRole('button', { name: 'Reload page' })).toBeTruthy();
  expect(screen.getByRole('navigation').textContent).toBe('Home navigation');
  expect(screen.queryByText('Chunk unavailable')).toBeNull();
});
