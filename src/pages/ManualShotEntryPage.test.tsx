// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ManualShotEntryPage } from './ManualShotEntryPage';
import type { ShotAnalysis } from '../types/shotAnalysis';
afterEach(cleanup);
it('saves a keypad score without requiring an unrelated target position', () => {
  const save = vi.fn();
  render(<ManualShotEntryPage shot={{ id: 'shot-1' } as ShotAnalysis} onSave={save} />);
  fireEvent.click(screen.getByRole('button', { name: '8' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm Shot Result' }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ score: 8, source: 'manual-score', targetX: null, targetY: null }));
});
it('offers recovery instead of unsaveable controls when no shot exists', () => {
  const back = vi.fn(); render(<ManualShotEntryPage onCancel={back} />);
  expect(screen.queryByRole('button', { name: 'Confirm Shot Result' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Back' })); expect(back).toHaveBeenCalledOnce();
});
