// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnboardingModal } from './OnboardingModal';

vi.mock('../motion/runPresentationTransition', () => ({ runPresentationTransition: (update: () => void) => update() }));
afterEach(cleanup);

describe('How It Works from Welcome', () => {
  it('keeps rapid Next and Back clicks within the available slides', () => {
    render(<OnboardingModal onClose={vi.fn()} onStart={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Go to step 3/ }));
    const next = screen.getByRole('button', { name: 'Next' });
    act(() => { next.click(); next.click(); });
    expect(screen.getByText('Step 4 of 4')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Go to step 2/ }));
    const back = screen.getByRole('button', { name: 'Back' });
    act(() => { back.click(); back.click(); });
    expect(screen.getByText('Step 1 of 4')).toBeTruthy();
  });

  it('contains keyboard focus and restores it to the opener on close', () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const view = render(<OnboardingModal onClose={onClose} onStart={vi.fn()} />);
    const close = screen.getByRole('button', { name: 'Close onboarding' });
    const next = screen.getByRole('button', { name: 'Next' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(next);
    fireEvent.keyDown(next, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
