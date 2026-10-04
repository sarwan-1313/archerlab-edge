// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { EndSessionDialog } from './EndSessionDialog';
afterEach(cleanup);
it('contains keyboard focus, cancels with Escape, and restores the trigger', () => {
  const trigger = document.createElement('button'); document.body.append(trigger); trigger.focus();
  const cancel = vi.fn();
  const { unmount } = render(<EndSessionDialog isEnding={false} onCancel={cancel} onConfirm={vi.fn()} />);
  const first = screen.getByRole('button', { name: 'Continue Session' });
  const last = screen.getByRole('button', { name: 'End Session' });
  expect(document.activeElement).toBe(first);
  fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(last);
  fireEvent.keyDown(last, { key: 'Tab' });
  expect(document.activeElement).toBe(first);
  fireEvent.keyDown(first, { key: 'Escape' }); expect(cancel).toHaveBeenCalledOnce();
  unmount(); expect(document.activeElement).toBe(trigger); trigger.remove();
});
