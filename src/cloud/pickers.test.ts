import { afterEach, describe, expect, it, vi } from 'vitest';
import { IMPORT_TOO_LARGE_MESSAGE, MAX_IMPORT_BYTES, downloadAsFile, fileNameFromLink, importFromLink } from './pickers';

function streamOf(chunks: number[]) {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = chunks.shift();
      if (next === undefined) controller.close();
      else controller.enqueue(new Uint8Array(next));
    },
    cancel() { cancelled = true; },
  });
  return { body, wasCancelled: () => cancelled };
}

function serve(response: Response) {
  const fetcher = vi.fn(async () => response);
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

afterEach(() => vi.unstubAllGlobals());

describe('downloadAsFile', () => {
  it('limits imports to 2 GB', () => {
    expect(MAX_IMPORT_BYTES).toBe(2 * 1024 ** 3);
  });

  it('refuses a file whose size header is over the limit before downloading it', async () => {
    const stream = streamOf([10, 10]);
    serve(new Response(stream.body, { headers: { 'content-length': String(MAX_IMPORT_BYTES + 1), 'content-type': 'video/mp4' } }));
    await expect(downloadAsFile('https://x.test/a.mp4', 'a.mp4')).rejects.toThrow(IMPORT_TOO_LARGE_MESSAGE);
    expect(stream.wasCancelled()).toBe(true);
  });

  it('stops a stream that goes past the limit when the size header is missing or wrong', async () => {
    const stream = streamOf([40, 40, 40, 40, 40]);
    serve(new Response(stream.body, { headers: { 'content-length': '50' } }));
    const progress = vi.fn();
    await expect(downloadAsFile('https://x.test/a.mp4', 'a.mp4', {}, progress, 100)).rejects.toThrow(IMPORT_TOO_LARGE_MESSAGE);
    expect(stream.wasCancelled()).toBe(true);
    expect(progress).toHaveBeenLastCalledWith(80, 50);
  });

  it('downloads a stream and falls back to the file name for a generic type', async () => {
    serve(new Response(streamOf([30, 20]).body, { headers: { 'content-type': 'application/octet-stream' } }));
    const file = await downloadAsFile('https://x.test/clip.mov', 'clip.mov');
    expect(file.size).toBe(50);
    expect(file.type).toBe('video/quicktime');
  });

  it('uses the same type fallback and limit without a stream body', async () => {
    const blobResponse = (size: number, type: string) => {
      const response = new Response(null, { headers: { 'content-type': type } });
      Object.defineProperty(response, 'body', { value: null });
      Object.defineProperty(response, 'blob', { value: async () => new Blob([new Uint8Array(size)]) });
      return response;
    };
    serve(blobResponse(20, 'binary/octet-stream'));
    const file = await downloadAsFile('https://x.test/clip.webm', 'clip.webm');
    expect(file.type).toBe('video/webm');
    serve(blobResponse(200, 'video/mp4'));
    await expect(downloadAsFile('https://x.test/clip.mp4', 'clip.mp4', {}, undefined, 100)).rejects.toThrow(IMPORT_TOO_LARGE_MESSAGE);
  });
});

describe('importFromLink', () => {
  it('names the file from the link, falling back to video.mp4', () => {
    expect(fileNameFromLink(new URL('https://x.test/videos/My%20round.mp4'))).toBe('My round.mp4');
    expect(fileNameFromLink(new URL('https://x.test/'))).toBe('video.mp4');
    expect(fileNameFromLink(new URL('https://x.test/bad%E0%A4%A.mp4'))).toBe('video.mp4');
  });

  it('never shows "URI malformed" for a link with broken escapes', async () => {
    serve(new Response(streamOf([5]).body, { headers: { 'content-type': 'video/mp4' } }));
    const file = await importFromLink('https://x.test/bad%E0%A4%A.mp4');
    expect(file.name).toBe('video.mp4');
  });
});
