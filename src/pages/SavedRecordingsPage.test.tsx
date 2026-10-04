// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SavedRecordingsPage } from './SavedRecordingsPage';
const storage = vi.hoisted(() => ({ listRecordings: vi.fn(), getChunksForRecording: vi.fn(), getTelemetryForRecording: vi.fn() }));
vi.mock('../recording/recordingStorage', () => ({ ...storage, deleteRecording: vi.fn(), exportRecordingData: vi.fn() }));
beforeEach(() => {
  storage.listRecordings.mockResolvedValue([{ id: 'one', startedAt: 1, durationMs: 5000 }]);
  storage.getChunksForRecording.mockResolvedValue([{ index: 0, blob: new Blob(['video']) }]);
  storage.getTelemetryForRecording.mockResolvedValue([{ tMs: 1000, type: 'shot', poseConfidence: null }, { tMs: 2000, type: 'shot' }]);
  URL.createObjectURL = vi.fn(() => 'blob:recording'); URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('waits for metadata, advances consecutive markers, and leaves missing telemetry unavailable', async () => {
  const { container, unmount } = render(<SavedRecordingsPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open session' }));
  await waitFor(() => expect(container.querySelector('video')).toBeTruthy());
  const video = container.querySelector('video')!;
  fireEvent.loadedMetadata(video); expect(video.currentTime).toBeCloseTo(.2);
  fireEvent.timeUpdate(video);
  fireEvent.click(screen.getByRole('button', { name: /Next shot/ }));
  expect(video.currentTime).toBeCloseTo(1.2);
  fireEvent.timeUpdate(video);
  expect(screen.getByRole('button', { name: /Next shot/ }).hasAttribute('disabled')).toBe(true);
  expect(container.querySelector('.session-player__metrics')?.textContent).not.toContain('0%');
  fireEvent.click(screen.getByRole('button', { name: /Previous shot/ }));
  expect(video.currentTime).toBeCloseTo(.2);
  unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:recording');
});
it('rejects an empty recording with actionable feedback', async () => {
  storage.getChunksForRecording.mockResolvedValue([]);
  render(<SavedRecordingsPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open session' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Use Open session to retry');
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it('does not create an object URL for an open request that finishes after navigation', async () => {
  let resolve!: (data: unknown[]) => void;
  storage.getTelemetryForRecording.mockReturnValue(new Promise(done => { resolve = done; }));
  const { unmount } = render(<SavedRecordingsPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open session' }));
  await waitFor(() => expect(storage.getTelemetryForRecording).toHaveBeenCalled());
  unmount(); await act(async () => { resolve([]); });
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it('reconstructs replay media with the manifest MIME type', async () => {
  storage.listRecordings.mockResolvedValue([{ id: 'one', startedAt: 1, durationMs: 5000, mimeType: 'video/mp4; codecs="avc1.4d401f"', chunkCount: 1 }]);
  const { container } = render(<SavedRecordingsPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open session' }));
  await waitFor(() => expect(container.querySelector('video')).toBeTruthy());
  expect(URL.createObjectURL).toHaveBeenCalled();
  const blob = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0][0] as Blob;
  expect(blob.type).toBe('video/mp4; codecs="avc1.4d401f"');
});
