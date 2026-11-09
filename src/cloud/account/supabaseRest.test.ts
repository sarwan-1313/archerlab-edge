import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildReport } from '../../video-analysis/buildReport';
import { makeScenario, scriptShots, syntheticSamples } from '../../video-analysis/testing/syntheticArcher';
import { cloudProfileData, toCloudReportRow, videoPathFor } from './cloudSync';
import { CloudError, createSupabaseRest, parseAuthRedirect, userFromAccessToken } from './supabaseRest';

type Call = { url: string; init: RequestInit };

function fakeFetch(responses: Array<{ status: number; body: unknown }>) {
  const calls: Call[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    const next = responses.shift() ?? { status: 200, body: null };
    return new Response(next.body === null ? '' : JSON.stringify(next.body), { status: next.status });
  }) as typeof fetch;
  return { calls, fetcher };
}

describe('parseAuthRedirect', () => {
  it('reads implicit-flow tokens from the hash', () => {
    const parsed = parseAuthRedirect('#access_token=a1&refresh_token=r1&expires_in=3600&token_type=bearer&type=magiclink', 1000);
    expect(parsed?.tokens).toEqual({ accessToken: 'a1', refreshToken: 'r1', expiresAt: 4600 });
  });

  it('reports errors and ignores unrelated hashes', () => {
    expect(parseAuthRedirect('#error=access_denied&error_description=Email+link+is+invalid')?.error).toBe('Email link is invalid');
    expect(parseAuthRedirect('#landing-story')).toBeNull();
  });
});

describe('createSupabaseRest', () => {
  it('upserts rows with the user token and merge semantics', async () => {
    const { calls, fetcher } = fakeFetch([{ status: 201, body: null }]);
    const client = createSupabaseRest('https://p.supabase.co', 'anon', fetcher);
    await client.upsert('video_reports', [{ id: 'x' }], 'user-token');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(calls[0].url).toBe('https://p.supabase.co/rest/v1/video_reports?on_conflict=id');
    expect(headers.authorization).toBe('Bearer user-token');
    expect(headers.apikey).toBe('anon');
    expect(headers.prefer).toContain('resolution=merge-duplicates');
  });

  it('sends magic links with a redirect and builds OAuth URLs', async () => {
    const { calls, fetcher } = fakeFetch([{ status: 200, body: {} }]);
    const client = createSupabaseRest('https://p.supabase.co', 'anon', fetcher);
    await client.signInWithEmail('a@b.co', 'https://app.example/profile');
    expect(calls[0].url).toBe('https://p.supabase.co/auth/v1/otp?redirect_to=https%3A%2F%2Fapp.example%2Fprofile');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ email: 'a@b.co', create_user: true });
    expect(client.oauthUrl('google', 'https://app.example/profile')).toBe('https://p.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fapp.example%2Fprofile');
  });

  it('turns signed storage paths into absolute URLs', async () => {
    const { calls, fetcher } = fakeFetch([{ status: 200, body: { signedURL: '/object/sign/videos/u/r.mp4?token=t' } }]);
    const client = createSupabaseRest('https://p.supabase.co', 'anon', fetcher);
    const url = await client.signedUrl('videos', 'u/r.mp4', 'tok');
    expect(calls[0].url).toBe('https://p.supabase.co/storage/v1/object/sign/videos/u/r.mp4');
    expect(url).toBe('https://p.supabase.co/storage/v1/object/sign/videos/u/r.mp4?token=t');
  });

  it('raises CloudError with the server message', async () => {
    const { fetcher } = fakeFetch([{ status: 404, body: { message: 'relation "video_reports" does not exist' } }]);
    const client = createSupabaseRest('https://p.supabase.co', 'anon', fetcher);
    let caught: unknown;
    try { await client.select('video_reports', 'select=*', 'tok'); } catch (error) { caught = error; }
    expect(caught instanceof CloudError).toBe(true);
    expect((caught as CloudError).status).toBe(404);
    expect((caught as CloudError).message).toContain('does not exist');
  });
});

describe('cloud sync rows', () => {
  it('strips per-frame landmarks and blobs before upload', () => {
    const scenario = makeScenario({ shots: scriptShots(1) });
    const report = buildReport({
      id: 'r1', createdAt: 0,
      samples: syntheticSamples(scenario, 12),
      source: { fileName: 'c.mp4', fileSize: 1, mimeType: 'video/mp4', durationS: scenario.durationS, width: 1280, height: 720, nativeFps: 30, analysisFps: 12, hasAudio: false },
      settings: { quality: 'fast', requestedHandedness: 'auto', bowType: 'recurve', model: 'lite', delegate: 'CPU' },
      audio: null,
    });
    const row = toCloudReportRow(report, 'user-1', null);
    expect(row.report.samples).toHaveLength(0);
    expect(row.report.frames).toHaveLength(0);
    expect(row.report.shots).toHaveLength(1);
    expect(row.created_at).toBe('1970-01-01T00:00:00.000Z');
    expect(JSON.stringify(row).length).toBeLessThan(JSON.stringify({ ...report, samples: report.samples.map((sample) => Array.from(sample.image ?? [])) }).length);
    expect(cloudProfileData({ displayName: 'A', notes: 'private', profilePhotoBlob: new Blob(['x']), profilePhotoUrl: 'blob:1', formStatus: { estimatedLevel: 'intermediate', history: [1] }, updatedAt: 5 })).toEqual({ displayName: 'A', estimatedLevel: 'intermediate', updatedAt: 5 });
    expect(videoPathFor('u', 'r', 'video/quicktime')).toBe('u/r.mov');
  });
});

describe('validSession', () => {
  const SESSION_KEY = 'archerlab-edge:cloud-session';
  const expired = { accessToken: 'old', refreshToken: 'refresh-1', expiresAt: 1, user: { id: 'u1', email: 'a@b.co' } };
  const stored = new Map<string, string>();

  beforeEach(() => {
    stored.clear();
    stored.set(SESSION_KEY, JSON.stringify(expired));
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => { stored.set(key, value); },
      removeItem: (key: string) => { stored.delete(key); },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('refreshes an expired session and stores the new tokens', async () => {
    const { fetcher } = fakeFetch([{ status: 200, body: { access_token: 'new', refresh_token: 'refresh-2', expires_in: 3600 } }]);
    const client = createSupabaseRest('https://p.supabase.co', 'anon', fetcher);
    const session = await client.validSession();
    expect(session?.accessToken).toBe('new');
    expect(JSON.parse(stored.get(SESSION_KEY) as string).refreshToken).toBe('refresh-2');
  });

  it('keeps the stored session when the device is offline, and says so instead of looking signed out', async () => {
    const offline = (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch;
    const client = createSupabaseRest('https://p.supabase.co', 'anon', offline);
    await expect(client.validSession()).rejects.toThrow('Failed to fetch');
    expect(JSON.parse(stored.get(SESSION_KEY) as string)).toEqual(expired);
  });

  it('keeps the stored session while the service is down', async () => {
    const { fetcher } = fakeFetch([{ status: 503, body: { message: 'unavailable' } }]);
    const client = createSupabaseRest('https://p.supabase.co', 'anon', fetcher);
    await expect(client.validSession()).rejects.toBeInstanceOf(CloudError);
    expect(stored.has(SESSION_KEY)).toBe(true);
  });

  it.each([408, 429])('keeps the stored session when the refresh is only timed out or rate limited (HTTP %i)', async (status) => {
    const { fetcher } = fakeFetch([{ status, body: { message: 'try again later' } }]);
    const client = createSupabaseRest('https://p.supabase.co', 'anon', fetcher);
    await expect(client.validSession()).rejects.toBeInstanceOf(CloudError);
    expect(JSON.parse(stored.get(SESSION_KEY) as string)).toEqual(expired);
  });

  it('shares one refresh between calls made at the same moment, so the rotated token is not refused', async () => {
    const { calls, fetcher } = fakeFetch([
      { status: 200, body: { access_token: 'new', refresh_token: 'refresh-2', expires_in: 3600 } },
      { status: 400, body: { error_description: 'Invalid Refresh Token: Already Used' } },
    ]);
    const client = createSupabaseRest('https://p.supabase.co', 'anon', fetcher);
    const [a, b] = await Promise.all([client.validSession(), client.validSession()]);
    expect(calls).toHaveLength(1);
    expect(a?.accessToken).toBe('new');
    expect(b?.accessToken).toBe('new');
    expect(JSON.parse(stored.get(SESSION_KEY) as string).refreshToken).toBe('refresh-2');
  });

  it('keeps a session another tab refreshed while this refresh was refused as already used', async () => {
    const refreshedElsewhere = { ...expired, accessToken: 'other-tab', refreshToken: 'refresh-9', expiresAt: 9_999_999_999 };
    const fetcher = (async () => {
      stored.set(SESSION_KEY, JSON.stringify(refreshedElsewhere));
      return new Response(JSON.stringify({ error_description: 'Invalid Refresh Token: Already Used' }), { status: 400 });
    }) as typeof fetch;
    const client = createSupabaseRest('https://p.supabase.co', 'anon', fetcher);
    expect((await client.validSession())?.accessToken).toBe('other-tab');
    expect(JSON.parse(stored.get(SESSION_KEY) as string).refreshToken).toBe('refresh-9');
  });

  it.each([400, 401, 403])('ends the session when the server refuses the refresh token (HTTP %i)', async (status) => {
    const { fetcher } = fakeFetch([{ status, body: { error_description: 'Invalid Refresh Token' } }]);
    const client = createSupabaseRest('https://p.supabase.co', 'anon', fetcher);
    expect(await client.validSession()).toBeNull();
    expect(stored.has(SESSION_KEY)).toBe(false);
  });

  it('signs out on this device before the server answers, and a refresh that finishes later does not undo it', async () => {
    let finishRefresh: (response: Response) => void = () => undefined;
    const fetcher = ((input: RequestInfo | URL) => {
      if (String(input).includes('grant_type=refresh_token')) return new Promise<Response>((resolve) => { finishRefresh = resolve; });
      return new Promise<Response>(() => undefined); // The logout request hangs.
    }) as typeof fetch;
    const client = createSupabaseRest('https://p.supabase.co', 'anon', fetcher);
    const pending = client.validSession();
    void client.signOut();
    expect(stored.has(SESSION_KEY)).toBe(false);
    finishRefresh(new Response(JSON.stringify({ access_token: 'new', refresh_token: 'refresh-2', expires_in: 3600 }), { status: 200 }));
    expect(await pending).toBeNull();
    expect(stored.has(SESSION_KEY)).toBe(false);
  });

  it('ends the server session even when the access token has expired, without storing the new tokens', async () => {
    const { calls, fetcher } = fakeFetch([
      { status: 401, body: { message: 'JWT expired' } },
      { status: 200, body: { access_token: 'new', refresh_token: 'refresh-2', expires_in: 3600 } },
      { status: 200, body: null },
    ]);
    const client = createSupabaseRest('https://p.supabase.co', 'anon', fetcher);
    await client.signOut();
    expect(calls.map((call) => call.url.replace('https://p.supabase.co', ''))).toEqual(['/auth/v1/logout', '/auth/v1/token?grant_type=refresh_token', '/auth/v1/logout']);
    expect((calls[2].init.headers as Record<string, string>).authorization).toBe('Bearer new');
    expect(stored.has(SESSION_KEY)).toBe(false);
  });
});

describe('consumeRedirect', () => {
  const SESSION_KEY = 'archerlab-edge:cloud-session';
  const stored = new Map<string, string>();
  const base64url = (value: unknown) => btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const token = `${base64url({ alg: 'HS256' })}.${base64url({ sub: 'u1', email: 'a@b.co' })}.signature`;
  const hash = `#access_token=${token}&refresh_token=r1&expires_in=3600&token_type=bearer`;

  beforeEach(() => {
    stored.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => { stored.set(key, value); },
      removeItem: (key: string) => { stored.delete(key); },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reads the user from the access token', () => {
    expect(userFromAccessToken(token)).toEqual({ id: 'u1', email: 'a@b.co' });
    expect(userFromAccessToken('not-a-token')).toBeNull();
  });

  it('keeps the sign-in when the user lookup cannot be reached', async () => {
    const offline = (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch;
    const client = createSupabaseRest('https://p.supabase.co', 'anon', offline);
    const result = await client.consumeRedirect(hash);
    expect(result?.session?.user).toEqual({ id: 'u1', email: 'a@b.co' });
    expect(JSON.parse(stored.get(SESSION_KEY) as string).refreshToken).toBe('r1');
  });

  it('fails the sign-in when the server refuses the token', async () => {
    const { fetcher } = fakeFetch([{ status: 401, body: { message: 'invalid JWT' } }]);
    const client = createSupabaseRest('https://p.supabase.co', 'anon', fetcher);
    await expect(client.consumeRedirect(hash)).rejects.toBeInstanceOf(CloudError);
    expect(stored.has(SESSION_KEY)).toBe(false);
  });

});
