// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PrivacyPage } from './PrivacyPage';

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

it('explains what stays on the device and what the optional features send', () => {
  render(<PrivacyPage />);
  expect(screen.getByRole('heading', { name: /What runs on this device/ })).toBeTruthy();
  expect(screen.getByRole('heading', { name: /What is stored on this device/ })).toBeTruthy();
  expect(screen.getByText(/without the video, only the measurements are sent/)).toBeTruthy();
  expect(screen.getByText(/Import from a link/)).toBeTruthy();
  expect(screen.getByText(/parent or guardian/)).toBeTruthy();
  // The private coach is described as sending nothing, with its one download named.
  expect(screen.getByText(/It never sends data anywhere/)).toBeTruthy();
  expect(screen.getByText(/886 MB, Qwen2\.5 1\.5B Instruct, Apache License 2\.0/)).toBeTruthy();
  expect(screen.getByText(/sends nothing\. Its one download/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'GitHub issues' }).getAttribute('href')).toBe('https://github.com/sarwan-1313/archerlab-edge/issues');
  // This build has no accounts configured, so there are no account controls.
  expect(screen.queryByRole('button', { name: /Delete my account/ })).toBeNull();
});

it('asks before deleting and does nothing when cancelled', () => {
  localStorage.setItem('archerlab-edge:video-options', '{}');
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const deleteDatabase = vi.fn();
  vi.stubGlobal('indexedDB', { deleteDatabase });
  render(<PrivacyPage />);
  fireEvent.click(screen.getByRole('button', { name: /Delete everything on this device/ }));
  fireEvent.click(screen.getByRole('button', { name: /Delete all video analyses on this device/ }));
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(confirm.mock.calls[0][0]).toMatch(/cannot be undone/);
  expect(deleteDatabase).not.toHaveBeenCalled();
  expect(localStorage.getItem('archerlab-edge:video-options')).toBe('{}');
  vi.unstubAllGlobals();
});
