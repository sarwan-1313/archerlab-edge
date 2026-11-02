import { describe, expect, it } from 'vitest';
import { deleteAllCloudData, deleteCloudAccount, describeCloudError, listOwnVideoPaths } from './cloudSync';
import { createSupabaseRest, type CloudSession } from './supabaseRest';

const BASE = 'https://p.supabase.co';
const session: CloudSession = { accessToken: 'user-token', refreshToken: 'r', expiresAt: 9e9, user: { id: 'u1', email: 'a@b.c' } };

type Request = { method: string; path: string; body: unknown; authorization: string };

/** A fake Supabase project: a storage folder, report rows, and an optional account-deletion function. */
function fakeProject(options: { files: string[]; folders?: string[]; rows: Array<{ video_path: string | null }>; rpc?: boolean; listStatus?: number; noComments?: boolean }) {
  const requests: Request[] = [];
  let files = [...options.files];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as unknown : null;
    requests.push({ method, path: `${url.pathname}${url.search}`, body, authorization: ((init?.headers ?? {}) as Record<string, string>).authorization });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

    if (method === 'POST' && url.pathname === '/storage/v1/object/list/videos') {
      if (options.listStatus) return json({ message: 'nope' }, options.listStatus);
      const { prefix, limit, offset } = body as { prefix: string; limit: number; offset: number };
      const entries = [
        ...(options.folders ?? []).map((name) => ({ name, id: null })),
        ...files.filter((path) => path.startsWith(prefix)).map((path) => ({ name: path.slice(prefix.length), id: `id-${path}` })),
      ];
      return json(entries.slice(offset, offset + limit));
    }
    if (method === 'DELETE' && url.pathname === '/storage/v1/object/videos') {
      const { prefixes } = body as { prefixes: string[] };
      files = files.filter((path) => !prefixes.includes(path));
      return json(prefixes.map((name) => ({ name })));
    }
    if (method === 'GET' && url.pathname === '/rest/v1/video_reports') return json(options.rows);
    if (method === 'DELETE' && url.pathname === '/rest/v1/report_comments' && options.noComments) return json({ message: 'Could not find the table public.report_comments' }, 404);
    if (method === 'DELETE' && url.pathname.startsWith('/rest/v1/')) return new Response(null, { status: 204 });
    if (method === 'POST' && url.pathname === '/rest/v1/rpc/delete_my_account') {
      return options.rpc === false ? json({ message: 'Could not find the function public.delete_my_account' }, 404) : new Response(null, { status: 204 });
    }
    return json({ message: `unexpected ${method} ${url.pathname}` }, 500);
  }) as typeof fetch;
  return { client: createSupabaseRest(BASE, 'anon', fetcher), requests, remainingFiles: () => files };
}

const userFiles = (count: number) => Array.from({ length: count }, (_, index) => `u1/video_${String(index).padStart(3, '0')}.mp4`);

describe('cloud data deletion', () => {
  it('lists the athlete’s own video files page by page, skipping sub-folders', async () => {
    const project = fakeProject({ files: [...userFiles(150), 'u2/other.mp4'], folders: ['nested'], rows: [] });
    const paths = await listOwnVideoPaths(project.client, session);
    expect(paths).toHaveLength(150);
    expect(paths.every((path) => path.startsWith('u1/'))).toBe(true);
    const lists = project.requests.filter((request) => request.path === '/storage/v1/object/list/videos');
    expect(lists.map((request) => (request.body as { offset: number }).offset)).toEqual([0, 100]);
    expect(lists.every((request) => (request.body as { prefix: string }).prefix === 'u1/')).toBe(true);
  });

  it('deletes every file, then the report rows, profile, log and club rows, with the user’s token', async () => {
    const project = fakeProject({ files: userFiles(120), rows: [{ video_path: 'u1/video_000.mp4' }, { video_path: null }, { video_path: 'u1/orphan.mov' }] });
    const result = await deleteAllCloudData(project.client, session);
    expect(result).toEqual({ files: 121, reports: 3 });
    expect(project.remainingFiles()).toEqual([]);

    const removals = project.requests.filter((request) => request.method === 'DELETE' && request.path === '/storage/v1/object/videos');
    expect(removals.map((request) => (request.body as { prefixes: string[] }).prefixes.length)).toEqual([100, 21]);
    expect((removals.flatMap((request) => (request.body as { prefixes: string[] }).prefixes))).toContain('u1/orphan.mov');

    const rowDeletes = project.requests.filter((request) => request.method === 'DELETE' && request.path.startsWith('/rest/v1/'));
    expect(rowDeletes.map((request) => request.path)).toEqual(['/rest/v1/report_comments?author_id=eq.u1', '/rest/v1/video_reports?user_id=eq.u1', '/rest/v1/athlete_profiles?user_id=eq.u1', '/rest/v1/practice_logs?user_id=eq.u1', '/rest/v1/club_members?athlete_id=eq.u1', '/rest/v1/clubs?coach_id=eq.u1']);
    // Rows go only after the files.
    const lastFileDelete = project.requests.lastIndexOf(removals.at(-1) as Request);
    expect(project.requests.indexOf(rowDeletes[0])).toBeGreaterThan(lastFileDelete);
    expect(project.requests.every((request) => request.authorization === 'Bearer user-token')).toBe(true);
  });

  it('copes with nothing stored', async () => {
    const project = fakeProject({ files: [], rows: [] });
    expect(await deleteAllCloudData(project.client, session)).toEqual({ files: 0, reports: 0 });
    expect(project.requests.some((request) => request.path === '/storage/v1/object/videos')).toBe(false);
  });

  it('still deletes reports on a project set up before coach review', async () => {
    const project = fakeProject({ files: [], rows: [{ video_path: null }], noComments: true });
    expect(await deleteAllCloudData(project.client, session)).toEqual({ files: 0, reports: 1 });
    expect(project.requests.some((request) => request.method === 'DELETE' && request.path === '/rest/v1/video_reports?user_id=eq.u1')).toBe(true);
  });

  it('stops before deleting rows when the files cannot be listed', async () => {
    const project = fakeProject({ files: userFiles(3), rows: [], listStatus: 400 });
    await expect(deleteAllCloudData(project.client, session)).rejects.toThrow('nope');
    expect(project.requests.some((request) => request.method === 'DELETE')).toBe(false);
  });

  it('deletes the account after the storage files', async () => {
    const project = fakeProject({ files: userFiles(2), rows: [] });
    await deleteCloudAccount(project.client, session);
    expect(project.remainingFiles()).toEqual([]);
    const fileDelete = project.requests.findIndex((request) => request.method === 'DELETE' && request.path === '/storage/v1/object/videos');
    const rpc = project.requests.findIndex((request) => request.path === '/rest/v1/rpc/delete_my_account');
    expect(fileDelete).toBeGreaterThanOrEqual(0);
    expect(rpc).toBeGreaterThan(fileDelete);
    expect(project.requests[rpc]).toMatchObject({ method: 'POST', body: {}, authorization: 'Bearer user-token' });
  });

  it('explains a project without the account-deletion function', async () => {
    const project = fakeProject({ files: [], rows: [], rpc: false });
    const error = await deleteCloudAccount(project.client, session).catch((caught: unknown) => caught);
    expect(describeCloudError(error)).toMatch(/missing the delete_my_account function/);
  });
});
