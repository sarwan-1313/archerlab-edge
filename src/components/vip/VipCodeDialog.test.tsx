// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VipCodeDialog } from './VipCodeDialog';
import { isVip } from '../../vip/vip';

vi.mock('../../vip/confetti', () => ({ confetti: vi.fn() }));

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

const type = (code: string) => code.split('').forEach((char, index) => fireEvent.change(screen.getByLabelText(`Character ${index + 1}`), { target: { value: char } }));

describe('VIP code dialog', () => {
  it('unlocks VIP mode with the right code', async () => {
    const onUnlocked = vi.fn();
    render(<VipCodeDialog onClose={vi.fn()} onUnlocked={onUnlocked} />);
    type('1313');
    await waitFor(() => expect(onUnlocked).toHaveBeenCalled());
    expect(isVip()).toBe(true);
  });

  it('says how many tries are left after a wrong code', async () => {
    render(<VipCodeDialog onClose={vi.fn()} onUnlocked={vi.fn()} />);
    type('ABCD');
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/4 tries left/));
    expect(isVip()).toBe(false);
  });
});
