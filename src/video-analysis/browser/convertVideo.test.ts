import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConvertCancelledError } from '../convert';

const ffmpegs = vi.hoisted(() => [] as Array<{ terminate: () => void }>);

vi.mock('@ffmpeg/ffmpeg', () => ({
  FFmpeg: class {
    terminate = vi.fn();
    on = vi.fn();
    load = vi.fn(async () => true);
    createDir = vi.fn(async () => undefined);
    mount = vi.fn(async () => true);
    ffprobe = vi.fn(async () => 0);
    readFile = vi.fn(async () => JSON.stringify({
      format: { duration: '12.5' },
      streams: [{ codec_type: 'video', codec_name: 'hevc', width: 1920, height: 1080, avg_frame_rate: '30/1' }],
    }));
    constructor() { ffmpegs.push(this); }
  },
}));

const { openConverter } = await import('./convertVideo');

const MANIFEST = { version: '0.12.10', cores: { single: { js: 'single/ffmpeg-core.js', wasm: 'single/ffmpeg-core.wasm', bytes: { js: 4, wasm: 4 } } } };
const clip = new File(['x'], 'IMG_0042.MOV', { type: 'video/quicktime' });
const options = (signal = new AbortController().signal) => ({ signal, onDownload: () => undefined });

let created: string[];
let revoked: string[];
let onCreate: () => void;
let fetcher: ReturnType<typeof vi.fn>;

beforeEach(() => {
  created = [];
  revoked = [];
  onCreate = () => undefined;
  ffmpegs.length = 0;
  fetcher = vi.fn(async (url: string) => (url.endsWith('manifest.json') ? new Response(JSON.stringify(MANIFEST)) : new Response(new Uint8Array(4))));
  vi.stubGlobal('fetch', fetcher);
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
    const url = `blob:core/${created.length}`;
    created.push(url);
    onCreate();
    return url;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => { revoked.push(url); });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const sorted = (urls: string[]) => [...urls].sort();

describe('openConverter', () => {
  it('frees the downloaded core when the athlete cancels as its last file arrives', async () => {
    const controller = new AbortController();
    // The download is over, but openConverter has not taken hold of the blob URLs yet.
    onCreate = () => { if (created.length === 2) controller.abort(); };
    await expect(openConverter(clip, options(controller.signal))).rejects.toBeInstanceOf(ConvertCancelledError);
    expect(created).toHaveLength(2);
    expect(sorted(revoked)).toEqual(sorted(created));
    expect(ffmpegs).toHaveLength(0);
  });

  it('frees the core and stops the worker when a ready converter is closed, however often that is called', async () => {
    const converter = await openConverter(clip, options());
    expect(converter.info).toMatchObject({ videoCodec: 'hevc', durationS: 12.5 });
    expect(revoked).toEqual([]);
    converter.close();
    converter.close();
    expect(created).toHaveLength(2);
    expect(sorted(revoked)).toEqual(sorted(created));
    expect(ffmpegs[0].terminate).toHaveBeenCalledTimes(1);
  });

  it('does not download the core when the converter library cannot be loaded', async () => {
    vi.resetModules();
    vi.doMock('@ffmpeg/ffmpeg', () => { throw new Error('Failed to fetch dynamically imported module'); });
    const { openConverter: open } = await import('./convertVideo');
    // Compared by name: resetModules gave the re-imported module its own ConvertError class.
    await expect(open(clip, options())).rejects.toMatchObject({ name: 'ConvertError' });
    // Only the manifest was read; the 31 MB core was never requested, so there is nothing to leak.
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(created).toEqual([]);
    vi.doUnmock('@ffmpeg/ffmpeg');
  });
});
