// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const account = vi.hoisted(() => ({
  configured: true,
  client: null,
  session: null,
  ready: true,
  busy: false,
  message: null,
  setMessage: vi.fn(),
  signInWithEmail: vi.fn(async () => true),
  verifyEmailCode: vi.fn(async () => undefined),
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
  freshSession: vi.fn(),
}));
vi.mock('../../cloud/account/useCloudAccount', () => ({ useCloudAccount: () => account }));
vi.mock('../../practice-log/storage', () => ({ mergePracticeLog: vi.fn(), readPracticeLog: vi.fn() }));

import { AccountPanel } from './AccountPanel';

beforeEach(() => {
  account.signInWithEmail.mockReset().mockResolvedValue(true);
  account.verifyEmailCode.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

const renderPanel = () => render(<AccountPanel profile={null} onRestoreProfile={async () => undefined} />);

function sendLink(email = 'a@b.co') {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: 'Email me a sign-in link' }));
}

describe('email code sign-in', () => {
  it('shows the code box only once the sign-in email has been sent', async () => {
    renderPanel();
    expect(screen.queryByRole('button', { name: 'Sign in with code' })).toBeNull();
    sendLink();
    expect(await screen.findByLabelText('6-digit code sent to a@b.co')).toBeTruthy();
    expect(account.signInWithEmail).toHaveBeenCalledWith('a@b.co');
  });

  it('keeps the code box hidden when the email could not be sent', async () => {
    account.signInWithEmail.mockResolvedValue(false);
    renderPanel();
    sendLink();
    await waitFor(() => expect(account.signInWithEmail).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Sign in with code' })).toBeNull();
  });

  it('accepts only six digits and verifies them for the address the email went to', async () => {
    renderPanel();
    sendLink();
    const box = await screen.findByLabelText('6-digit code sent to a@b.co') as HTMLInputElement;
    // Edited after sending: the code still belongs to the address it was sent to.
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'other@b.co' } });
    const button = screen.getByRole('button', { name: 'Sign in with code' });

    fireEvent.change(box, { target: { value: '12 3a4' } });
    expect(box.value).toBe('1234');
    expect(button.hasAttribute('disabled')).toBe(true);

    fireEvent.change(box, { target: { value: '1234567' } });
    expect(box.value).toBe('123456');
    expect(button.hasAttribute('disabled')).toBe(false);
    fireEvent.click(button);
    expect(account.verifyEmailCode).toHaveBeenCalledWith('a@b.co', '123456');
  });
});
