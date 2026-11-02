// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ save: vi.fn(async () => undefined), existing: 0 }));
vi.mock('../hooks/useAthleteProfile', () => ({ useAthleteProfile: () => ({ save: runtime.save, profile: null, loading: false }) }));
vi.mock('../cloud/account/useCloudAccount', () => ({ useCloudAccount: () => ({ configured: false, signInWithGoogle: vi.fn() }) }));
vi.mock('../practice-log/storage', () => ({ listPracticeEntries: async () => Array.from({ length: runtime.existing }) }));
vi.mock('../video-analysis/storage', () => ({ listVideoReports: async () => [] }));
vi.mock('../recording/recordingStorage', () => ({ listRecordings: async () => [] }));

import WelcomeScreen from './WelcomeScreen';

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); runtime.save.mockClear(); runtime.existing = 0; });
afterEach(() => cleanup());

describe('welcome screen', () => {
  it('creates a profile', async () => {
    const onDone = vi.fn();
    render(<WelcomeScreen onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: /Create my profile/ }));
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Sarwan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Left hand' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save and start' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(runtime.save).toHaveBeenCalledWith(expect.objectContaining({ displayName: 'Sarwan', handedness: 'left', bowType: 'recurve' }));
    expect(localStorage.getItem('archerlab-edge:welcome-choice')).toBe('profile');
    expect(localStorage.getItem('archerlab-edge:guest-mode')).toBeNull();
  });

  it('continues as a guest after explaining that nothing is kept', async () => {
    const onDone = vi.fn();
    render(<WelcomeScreen onDone={onDone} />);
    expect(screen.queryByRole('button', { name: /Continue with Google/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Skip, continue as guest/ }));
    expect(screen.getByText(/nothing is kept/)).toBeTruthy();
    const go = await screen.findByRole('button', { name: 'Continue as guest' });
    fireEvent.click(go);
    expect(onDone).toHaveBeenCalled();
    expect(localStorage.getItem('archerlab-edge:guest-mode')).toBe('1');
  });

  it('warns a guest when the device already has saved work', async () => {
    runtime.existing = 3;
    render(<WelcomeScreen onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Skip, continue as guest/ }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/already has 3/);
  });
});
