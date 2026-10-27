// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrimPreview } from './TrimPreview';

let duration = 0;
let currentTime = 0;
let realDuration = 0;

beforeEach(() => {
  currentTime = 0;
  Object.defineProperty(HTMLMediaElement.prototype, 'duration', { get: () => duration, configurable: true });
  Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
    get: () => currentTime,
    set(this: HTMLMediaElement, value: number) {
      currentTime = value;
      // Like a recorder WebM: seeking far past the end makes the browser work out the real length.
      if (duration === Infinity && value > 1e9) { duration = realDuration; this.dispatchEvent(new Event('durationchange')); }
    },
    configurable: true,
  });
});
afterEach(cleanup);

async function renderPreview(length: number, reported = length) {
  duration = reported;
  realDuration = length;
  const onAnalyse = vi.fn();
  render(<TrimPreview file={new File(['x'], 'session.mp4', { type: 'video/mp4' })} url="blob:clip" onAnalyse={onAnalyse} onCancel={() => undefined} />);
  fireEvent.loadedMetadata(screen.getByLabelText('Video preview'));
  await screen.findByText(/Selected:/);
  return onAnalyse;
}

const analyse = () => screen.getByRole('button', { name: /Analyse/ });

describe('TrimPreview', () => {
  it('selects a short clip whole', async () => {
    const onAnalyse = await renderPreview(95);
    expect(screen.getByText(/The whole clip is selected/)).toBeTruthy();
    expect(screen.getByText('1:35.0')).toBeTruthy();
    fireEvent.click(analyse());
    expect(onAnalyse).toHaveBeenCalledWith({ start: 0, end: 95 });
  });

  it('limits the selection, not the file, to 15 minutes', async () => {
    const onAnalyse = await renderPreview(40 * 60);
    expect(screen.getByText(/This video is 40:00 long/)).toBeTruthy();
    expect(screen.getByText('15:00.0')).toBeTruthy();
    expect((analyse() as HTMLButtonElement).disabled).toBe(false);

    fireEvent.change(screen.getByLabelText('End of the analysed part'), { target: { value: '2400' } });
    expect(screen.getByRole('alert').textContent).toMatch(/up to 15 minutes/);
    expect((analyse() as HTMLButtonElement).disabled).toBe(true);

    // Move to 26:40 in the preview and start the range there.
    currentTime = 1600;
    fireEvent.timeUpdate(screen.getByLabelText('Video preview'));
    fireEvent.click(screen.getByRole('button', { name: 'Set start here' }));
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(analyse());
    expect(onAnalyse).toHaveBeenCalledWith({ start: 1600, end: 2400 });
  });

  it('sets the end at the current frame and keeps a minimum length', async () => {
    const onAnalyse = await renderPreview(60);
    currentTime = 0.5;
    fireEvent.timeUpdate(screen.getByLabelText('Video preview'));
    fireEvent.click(screen.getByRole('button', { name: 'Set end here' }));
    fireEvent.click(analyse());
    expect(onAnalyse).toHaveBeenCalledWith({ start: 0, end: 2 });
  });

  it('works out the length of a recorder file that reports an infinite one', async () => {
    const onAnalyse = await renderPreview(42, Infinity);
    expect(screen.getByText('0:42.0')).toBeTruthy();
    expect(currentTime).toBe(0);
    fireEvent.click(analyse());
    expect(onAnalyse).toHaveBeenCalledWith({ start: 0, end: 42 });
  });

  it('explains a video the browser cannot play', async () => {
    await renderPreview(10);
    fireEvent.error(screen.getByLabelText('Video preview'));
    expect(screen.getByRole('alert').textContent).toMatch(/cannot play this video/);
    expect((analyse() as HTMLButtonElement).disabled).toBe(true);
  });
});
