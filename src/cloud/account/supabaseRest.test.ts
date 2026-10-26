import { describe, expect, it } from 'vitest';
import { buildReport } from '../../video-analysis/buildReport';
import { makeScenario, scriptShots, syntheticSamples } from '../../video-analysis/testing/syntheticArcher';
import { cloudProfileData, toCloudReportRow, videoPathFor } from './cloudSync';
import { CloudError, createSupabaseRest, parseAuthRedirect } from './supabaseRest';

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
    expect(cloudProfileData({ name: 'A', profilePhotoBlob: new Blob(['x']), profilePhotoUrl: 'blob:1' })).toEqual({ name: 'A' });
    expect(videoPathFor('u', 'r', 'video/quicktime')).toBe('u/r.mov');
  });
});
