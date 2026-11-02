import { describe, expect, it } from 'vitest';
import { DriveAuthError, MULTIPART_LIMIT_BYTES, createDriveRest } from './driveRest';

interface Call { method: string; url: URL; headers: Headers; body: BodyInit | null | undefined }

function drive(respond: (call: Call) => Response, token: string | null = 'tok') {
  const calls: Call[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { method: init?.method ?? 'GET', url: new URL(String(input)), headers: new Headers(init?.headers), body: init?.body };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  return { client: createDriveRest(() => token, fetcher), calls };
}

const json = (value: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(value), { status: 200, ...init });

describe('Google Drive client', () => {
  it('reuses the ArcherLab Edge folder when it exists and sends the token', async () => {
    const { client, calls } = drive(() => json({ files: [{ id: 'f1' }] }));
    expect(await client.ensureFolder()).toBe('f1');
    expect(calls).toHaveLength(1);
    expect(calls[0].headers.get('authorization')).toBe('Bearer tok');
    expect(calls[0].url.searchParams.get('q')).toBe("name = 'ArcherLab Edge' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
  });

  it('creates the folder when there is none', async () => {
    const { client, calls } = drive((call) => (call.method === 'POST' ? json({ id: 'new' }) : json({ files: [] })));
    expect(await client.ensureFolder()).toBe('new');
    expect(calls[1].method).toBe('POST');
    expect(JSON.parse(String(calls[1].body))).toEqual({ name: 'ArcherLab Edge', mimeType: 'application/vnd.google-apps.folder' });
  });

  it('lists every page of the folder', async () => {
    const { client, calls } = drive((call) => (call.url.searchParams.get('pageToken')
      ? json({ files: [{ id: 'b', name: 'b' }] })
      : json({ files: [{ id: 'a', name: 'a' }], nextPageToken: 'p2' })));
    expect((await client.listFiles('f1')).map((file) => file.id)).toEqual(['a', 'b']);
    expect(calls).toHaveLength(2);
    expect(calls[0].url.searchParams.get('q')).toBe("'f1' in parents and trashed = false");
  });

  it('uploads small files in one multipart request, into the folder', async () => {
    const { client, calls } = drive(() => json({ id: 'x', name: 'archerlab-backup.json', mimeType: 'application/json' }));
    await client.upload('f1', { name: 'archerlab-backup.json', mimeType: 'application/json', body: new Blob(['{"a":1}']) });
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url.pathname).toBe('/upload/drive/v3/files');
    expect(calls[0].url.searchParams.get('uploadType')).toBe('multipart');
    const body = await (calls[0].body as Blob).text();
    expect(body).toContain('"parents":["f1"]');
    expect(body).toContain('{"a":1}');
    expect(calls[0].headers.get('content-type')).toMatch(/^multipart\/related; boundary=/);
  });

  it('overwrites an existing file without moving it', async () => {
    const { client, calls } = drive(() => json({ id: 'x' }));
    await client.upload('f1', { name: 'n', mimeType: 'application/json', body: new Blob(['1']), existingId: 'x' });
    expect(calls[0].method).toBe('PATCH');
    expect(calls[0].url.pathname).toBe('/upload/drive/v3/files/x');
    expect(await (calls[0].body as Blob).text()).not.toContain('parents');
  });

  it('uses a resumable upload for large files', async () => {
    const big = new Blob([new Uint8Array(MULTIPART_LIMIT_BYTES + 1)], { type: 'video/mp4' });
    const { client, calls } = drive((call) => (call.method === 'PUT'
      ? json({ id: 'v' })
      : new Response(null, { status: 200, headers: { location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=abc' } })));
    expect((await client.upload('f1', { name: 'video-r.mp4', mimeType: 'video/mp4', body: big })).id).toBe('v');
    expect(calls[0].url.searchParams.get('uploadType')).toBe('resumable');
    expect(calls[0].headers.get('x-upload-content-length')).toBe(String(big.size));
    expect(calls[1].method).toBe('PUT');
    expect(calls[1].url.searchParams.get('upload_id')).toBe('abc');
    expect(calls[1].body).toBe(big);
  });

  it('asks the athlete to reconnect when there is no token or it was refused', async () => {
    await expect(drive(() => json({}), null).client.ensureFolder()).rejects.toBeInstanceOf(DriveAuthError);
    await expect(drive(() => json({}, { status: 401 })).client.ensureFolder()).rejects.toBeInstanceOf(DriveAuthError);
  });

  it('explains a full Drive', async () => {
    const { client } = drive(() => json({ error: { message: 'The user’s Drive storage quota has been exceeded.' } }, { status: 403 }));
    await expect(client.download('x')).rejects.toThrow('Your Google Drive is full');
  });
});
