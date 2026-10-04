// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProfilePage } from './ProfilePage';
const profile = vi.hoisted(() => ({ save: vi.fn(), removePhoto: vi.fn(), profile: { displayName: 'Archer', profilePhotoBlob: new Blob(['photo']), profilePhotoUrl: 'blob:photo' } }));
vi.mock('../hooks/useAthleteProfile', () => ({ useAthleteProfile: () => profile }));
beforeEach(() => { profile.save.mockReset(); });
afterEach(cleanup);
it('retains the photo when saving edited profile fields and confirms success', async () => {
  profile.save.mockResolvedValue(undefined); render(<ProfilePage />);
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Updated' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }));
  expect((await screen.findByRole('status')).textContent).toContain('Profile saved');
  expect(profile.save).toHaveBeenCalledWith(expect.objectContaining({ displayName: 'Updated', profilePhotoBlob: profile.profile.profilePhotoBlob }));
});
it('explains a failed save and leaves the form available for retry', async () => {
  profile.save.mockRejectedValue(new Error('Storage full')); render(<ProfilePage />);
  fireEvent.click(screen.getByRole('button', { name: 'Save Profile' }));
  expect((await screen.findByRole('alert')).textContent).toContain('could not be saved');
  expect(screen.getByRole('button', { name: 'Save Profile' }).hasAttribute('disabled')).toBe(false);
});
