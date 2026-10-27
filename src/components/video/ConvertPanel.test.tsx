// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Converter, OpenConverterOptions } from '../../video-analysis/browser/convertVideo';
import { ConvertCancelledError, ConvertError, type MediaInfo } from '../../video-analysis/convert';

const openConverter = vi.fn<(file: File, options: OpenConverterOptions) => Promise<Converter>>();
const converterIsCached = vi.fn<() => Promise<boolean>>();
vi.mock('../../video-analysis/browser/convertVideo', () => ({
  openConverter: (file: File, options: OpenConverterOptions) => openConverter(file, options),
  converterIsCached: () => converterIsCached(),
}));

const { ConvertPanel } = await import('./ConvertPanel');

const clip = new File(['x'], 'IMG_0042.MOV', { type: 'video/quicktime' });
const info = (durationS: number | null): MediaInfo => ({ durationS, width: 1920, height: 1080, fps: 30, videoCodec: 'hevc', hasAudio: true });

interface Control {
  options: OpenConverterOptions;
  progress: (fraction: number | null) => void;
  finish: (file?: File) => void;
  fail: (error: Error) => void;
  close: ReturnType<typeof vi.fn>;
}

/** A converter whose progress and result the test drives. */
function fakeConverter(mediaInfo: MediaInfo): { control: () => Control; open: (file: File, options: OpenConverterOptions) => Promise<Converter> } {
  let current: Control | null = null;
  return {
    control: () => current!,
    open: async (_file, options) => {
      const close = vi.fn();
      let onProgress: (p: { fraction: number | null }) => void = () => undefined;
      let resolve: (file: File) => void = () => undefined;
      let reject: (error: Error) => void = () => undefined;
      const done = new Promise<File>((res, rej) => { resolve = res; reject = rej; });
      current = { options, progress: (fraction) => onProgress({ fraction }), finish: (file = new File(['mp4'], 'IMG_0042.mp4', { type: 'video/mp4' })) => resolve(file), fail: reject, close };
      options.onDownload({ loadedBytes: 16_000_000, totalBytes: 32_000_000 });
      options.onDownload({ loadedBytes: 32_000_000, totalBytes: 32_000_000 });
      return { core: 'single', info: mediaInfo, close, convert: (cb) => { onProgress = cb; return done; } };
    },
  };
}

beforeEach(() => { openConverter.mockReset(); converterIsCached.mockReset(); converterIsCached.mockResolvedValue(true); });
afterEach(cleanup);

describe('ConvertPanel', () => {
  it('offers the conversion without downloading anything yet', () => {
    render(<ConvertPanel file={clip} onConverted={() => undefined} />);
    expect(screen.getByRole('button', { name: /Convert to MP4 on this device/ })).toBeTruthy();
    expect(screen.getByText(/not uploaded/)).toBeTruthy();
    expect(screen.getByText(/downloads the converter, about 30.8 MB/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Licence and source' }).getAttribute('href')).toMatch(/ffmpeg\/NOTICE\.txt$/);
    expect(openConverter).not.toHaveBeenCalled();
  });

  it('downloads, converts with progress and time left, and hands over the MP4', async () => {
    const fake = fakeConverter(info(60));
    openConverter.mockImplementation(fake.open);
    const onConverted = vi.fn();
    render(<ConvertPanel file={clip} onConverted={onConverted} />);
    fireEvent.click(screen.getByRole('button', { name: /Convert to MP4/ }));

    const bar = await screen.findByRole('progressbar', { name: 'Conversion progress' });
    expect(bar.getAttribute('aria-valuenow')).toBe('0');
    expect(screen.getByText(/Estimated total:/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Cancel/ })).toBeTruthy();

    act(() => fake.control().progress(0.5));
    expect(screen.getByRole('progressbar', { name: 'Conversion progress' }).getAttribute('aria-valuenow')).toBe('50');
    expect(screen.getByText(/H\.264 MP4, 720 px/)).toBeTruthy();

    const mp4 = new File(['mp4'], 'IMG_0042.mp4', { type: 'video/mp4' });
    await act(async () => fake.control().finish(mp4));
    await waitFor(() => expect(onConverted).toHaveBeenCalledWith(mp4));
    expect(fake.control().close).toHaveBeenCalled();
  });

  it('shows the converter download as its own progress bar', async () => {
    let release: (c: Converter) => void = () => undefined;
    openConverter.mockImplementation(async (_file, options) => {
      options.onDownload({ loadedBytes: 8_000_000, totalBytes: 32_000_000 });
      return new Promise<Converter>((resolve) => { release = resolve; });
    });
    render(<ConvertPanel file={clip} onConverted={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /Convert to MP4/ }));
    const bar = await screen.findByRole('progressbar', { name: 'Converter download' });
    expect(bar.getAttribute('aria-valuenow')).toBe('25');
    expect(screen.getByText(/7.6 MB of 30.5 MB/)).toBeTruthy();
    release({ core: 'single', info: info(10), close: () => undefined, convert: () => new Promise(() => undefined) });
  });

  it('asks before converting a clip over 5 minutes, and does not start until told to', async () => {
    const fake = fakeConverter(info(6 * 60));
    openConverter.mockImplementation(fake.open);
    const onConverted = vi.fn();
    render(<ConvertPanel file={clip} onConverted={onConverted} />);
    fireEvent.click(screen.getByRole('button', { name: /Convert to MP4/ }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/This clip is 6:00 long.*over 5 minutes.*roughly/s);
    expect(screen.queryByRole('progressbar')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Convert anyway' }));
    await screen.findByRole('progressbar', { name: 'Conversion progress' });
    await act(async () => fake.control().finish());
    await waitFor(() => expect(onConverted).toHaveBeenCalled());
  });

  it('does not warn for a clip of exactly 5 minutes', async () => {
    const fake = fakeConverter(info(5 * 60));
    openConverter.mockImplementation(fake.open);
    render(<ConvertPanel file={clip} onConverted={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /Convert to MP4/ }));
    await screen.findByRole('progressbar', { name: 'Conversion progress' });
    expect(screen.queryByRole('button', { name: 'Convert anyway' })).toBeNull();
  });

  it('cancelling during the conversion stops it and offers the conversion again', async () => {
    const fake = fakeConverter(info(60));
    openConverter.mockImplementation(fake.open);
    const onConverted = vi.fn();
    render(<ConvertPanel file={clip} onConverted={onConverted} />);
    fireEvent.click(screen.getByRole('button', { name: /Convert to MP4/ }));
    await screen.findByRole('progressbar', { name: 'Conversion progress' });
    const { options, fail } = fake.control();

    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    expect(options.signal.aborted).toBe(true);
    await act(async () => fail(new ConvertCancelledError()));
    expect(await screen.findByRole('button', { name: /Convert to MP4 on this device/ })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onConverted).not.toHaveBeenCalled();
  });

  it('stops the conversion when the panel goes away', async () => {
    const fake = fakeConverter(info(60));
    openConverter.mockImplementation(fake.open);
    const { unmount } = render(<ConvertPanel file={clip} onConverted={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /Convert to MP4/ }));
    await screen.findByRole('progressbar', { name: 'Conversion progress' });
    const { options } = fake.control();
    unmount();
    expect(options.signal.aborted).toBe(true);
  });

  it('shows the real reason a conversion failed, with ffmpeg\'s output, and lets the athlete retry', async () => {
    const fake = fakeConverter(info(60));
    openConverter.mockImplementation(fake.open);
    render(<ConvertPanel file={clip} onConverted={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /Convert to MP4/ }));
    await screen.findByRole('progressbar', { name: 'Conversion progress' });
    await act(async () => fake.control().fail(new ConvertError('ffmpeg could not convert this file: Invalid data found when processing input', ['moov atom not found', 'Invalid data found when processing input'])));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Conversion failed.');
    expect(alert.textContent).toContain('Invalid data found when processing input');
    expect(alert.textContent).toContain('moov atom not found');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('shows why the converter could not even start', async () => {
    openConverter.mockRejectedValue(new ConvertError('The converter is not part of this deployment: /ffmpeg/manifest.json is missing (HTTP 404).'));
    render(<ConvertPanel file={clip} onConverted={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: /Convert to MP4/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('manifest.json is missing (HTTP 404)');
  });
});

describe('ConvertPanel offline', () => {
  const convertButton = () => screen.getByRole('button', { name: /Convert to MP4 on this device/ }) as HTMLButtonElement;

  it('does not look for a stored converter while online', () => {
    render(<ConvertPanel file={clip} onConverted={() => undefined} />);
    expect(converterIsCached).not.toHaveBeenCalled();
    expect(convertButton().disabled).toBe(false);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says why, and does not start, when offline with no converter on this device', async () => {
    converterIsCached.mockResolvedValue(false);
    render(<ConvertPanel file={clip} online={false} onConverted={() => undefined} />);
    expect((await screen.findByRole('status')).textContent).toMatch(/offline.*has not been downloaded.*Connect to the internet once/s);
    expect(convertButton().disabled).toBe(true);
    fireEvent.click(convertButton());
    expect(openConverter).not.toHaveBeenCalled();
  });

  it('converts as usual when offline but the converter is already on this device', async () => {
    converterIsCached.mockResolvedValue(true);
    const fake = fakeConverter(info(60));
    openConverter.mockImplementation(fake.open);
    render(<ConvertPanel file={clip} online={false} onConverted={() => undefined} />);
    await waitFor(() => expect(converterIsCached).toHaveBeenCalled());
    expect(screen.queryByRole('status')).toBeNull();
    expect(convertButton().disabled).toBe(false);
    fireEvent.click(convertButton());
    await screen.findByRole('progressbar', { name: 'Conversion progress' });
  });

  it('never blocks the button while the check is still running', () => {
    converterIsCached.mockReturnValue(new Promise(() => undefined));
    render(<ConvertPanel file={clip} online={false} onConverted={() => undefined} />);
    expect(convertButton().disabled).toBe(false);
  });

  it('offers the conversion again as soon as the connection returns', async () => {
    converterIsCached.mockResolvedValue(false);
    const { rerender } = render(<ConvertPanel file={clip} online={false} onConverted={() => undefined} />);
    await screen.findByRole('status');
    rerender(<ConvertPanel file={clip} online onConverted={() => undefined} />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(convertButton().disabled).toBe(false);
  });
});
