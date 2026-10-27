import { describe, expect, it } from 'vitest';
import type { ShotReport } from '../../video-analysis/types';
import { listCloudReports } from './cloudSync';
import {
  addComment, cloudReportState, deleteComment, listComments, listShares, listSharedWithMe, loadReviewReport,
  revokeShare, shareReport, sharedReportLink, shotAtTime,
} from './coachReview';
import { CloudError, createSupabaseRest, type CloudSession } from './supabaseRest';

const BASE = 'https://p.supabase.co';
const athlete: CloudSession = { accessToken: 'athlete-token', refreshToken: 'r', expiresAt: 9e9, user: { id: 'u1', email: 'Archer@Example.com' } };
const coach: CloudSession = { accessToken: 'coach-token', refreshToken: 'r', expiresAt: 9e9, user: { id: 'c1', email: 'Coach@Club.org' } };

type Request = { method: string; path: string; search: URLSearchParams; body: unknown; headers: Record<string, string> };

/** Records every request and answers from a queue of responses. */
function fakeFetch(responses: Array<{ status?: number; body: unknown }> = []) {
  const requests: Request[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    requests.push({
      method: init?.method ?? 'GET',
      path: url.pathname,
      search: url.searchParams,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) as unknown : null,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const next = responses.shift() ?? { body: null };
    return new Response(next.body === null ? null : JSON.stringify(next.body), { status: next.status ?? 200 });
  }) as typeof fetch;
  return { client: createSupabaseRest(BASE, 'anon', fetcher), requests };
}

const shareRow = { id: 's1', report_id: 'r1', owner_email: 'archer@example.com', coach_email: 'coach@club.org', include_video: false, created_at: '2026-10-27T10:00:00Z', revoked_at: null };
const commentRow = { id: 'k1', report_id: 'r1', author_id: 'c1', author_email: 'coach@club.org', shot_index: 2, time_s: 4.5, body: 'Hold longer', created_at: '2026-10-27T10:05:00Z' };

describe('sharing a report', () => {
  it('upserts one share per coach, lower-cased, and restores a revoked one', async () => {
    const { client, requests } = fakeFetch([{ status: 201, body: [shareRow] }]);
    const share = await shareReport(client, athlete, { reportId: 'r1', coachEmail: '  Coach@Club.org ', includeVideo: true });
    expect(share.id).toBe('s1');
    const [request] = requests;
    expect(request.method).toBe('POST');
    expect(request.path).toBe('/rest/v1/report_shares');
    expect(request.search.get('on_conflict')).toBe('report_id,coach_email');
    expect(request.headers.prefer).toBe('resolution=merge-duplicates,return=representation');
    expect(request.headers.authorization).toBe('Bearer athlete-token');
    expect(request.body).toEqual([{ report_id: 'r1', coach_email: 'coach@club.org', include_video: true, revoked_at: null }]);
  });

  it('refuses a malformed address or the athlete’s own, without a request', async () => {
    const { client, requests } = fakeFetch();
    await expect(shareReport(client, athlete, { reportId: 'r1', coachEmail: 'coach', includeVideo: false })).rejects.toThrow(/coach’s email/);
    await expect(shareReport(client, athlete, { reportId: 'r1', coachEmail: 'archer@example.COM', includeVideo: false })).rejects.toThrow(/your own email/);
    expect(requests).toHaveLength(0);
  });

  it('lists the athlete’s active shares of a report and revokes by id', async () => {
    const { client, requests } = fakeFetch([{ body: [shareRow] }, { body: [{ ...shareRow, revoked_at: '2026-10-27T11:00:00Z' }] }]);
    expect(await listShares(client, athlete, 'r1')).toEqual([shareRow]);
    expect(requests[0].search.get('report_id')).toBe('eq.r1');
    expect(requests[0].search.get('owner_id')).toBe('eq.u1');
    expect(requests[0].search.get('revoked_at')).toBe('is.null');

    await revokeShare(client, athlete, 's1');
    expect(requests[1].method).toBe('PATCH');
    expect(requests[1].search.get('id')).toBe('eq.s1');
    expect(requests[1].search.get('owner_id')).toBe('eq.u1');
    expect(Number.isNaN(Date.parse((requests[1].body as { revoked_at: string }).revoked_at))).toBe(false);
  });

  it('builds the link the athlete sends', () => {
    expect(sharedReportLink('https://archerlab.app', 'video-1 a')).toBe('https://archerlab.app/video?report=video-1%20a');
  });
});

describe('coach side', () => {
  it('lists reports shared with the coach’s email, with the video only when included', async () => {
    const summary = { id: 'r1', createdAt: 0, fileName: 'clip.mp4', durationS: 20, shots: 3, overall: 61, level: 'intermediate', confidence: 'medium', view: 'side', focus: [], hasVideo: false };
    const { client, requests } = fakeFetch([{ body: [
      { ...shareRow, video_reports: { summary, video_path: 'u1/r1.mp4' } },
      { ...shareRow, id: 's2', report_id: 'r2', include_video: true, video_reports: { summary: { ...summary, id: 'r2' }, video_path: 'u1/r2.mp4' } },
      { ...shareRow, id: 's3', report_id: 'r3', video_reports: null },
    ] }]);
    const shared = await listSharedWithMe(client, coach);
    expect(requests[0].search.get('coach_email')).toBe('eq.coach@club.org');
    expect(requests[0].search.get('select')).toContain('video_reports(summary,video_path)');
    expect(requests[0].headers.authorization).toBe('Bearer coach-token');
    expect(shared.map((item) => item.summary?.hasVideo ?? null)).toEqual([false, true, null]);
    expect(shared[0]).not.toHaveProperty('video_reports');
  });

  it('returns nothing for an account without an email', async () => {
    const { client, requests } = fakeFetch();
    expect(await listSharedWithMe(client, { ...coach, user: { id: 'c1' } })).toEqual([]);
    expect(requests).toHaveLength(0);
  });

  it('opens a shared report with a signed video URL only when the share includes it', async () => {
    const reportRow = { report: { id: 'r1', shots: [] }, video_path: 'u1/r1.mp4', user_id: 'u1' };
    const withVideo = fakeFetch([{ body: [reportRow] }, { body: [{ ...shareRow, include_video: true }] }, { body: { signedURL: '/object/sign/videos/u1/r1.mp4?token=t' } }]);
    const opened = await loadReviewReport(withVideo.client, coach, 'r1');
    expect(opened?.videoUrl).toBe(`${BASE}/storage/v1/object/sign/videos/u1/r1.mp4?token=t`);
    expect(opened?.share?.id).toBe('s1');
    expect(opened?.report.samples).toEqual([]);
    expect(withVideo.requests[1].search.get('coach_email')).toBe('eq.coach@club.org');

    const withoutVideo = fakeFetch([{ body: [reportRow] }, { body: [shareRow] }]);
    expect((await loadReviewReport(withoutVideo.client, coach, 'r1'))?.videoUrl).toBeNull();
    expect(withoutVideo.requests.some((request) => request.path.includes('/object/sign/'))).toBe(false);
  });

  it('opens the athlete’s own report with its video, and reports a missing one as null', async () => {
    const own = fakeFetch([{ body: [{ report: { id: 'r1' }, video_path: 'u1/r1.mp4', user_id: 'u1' }] }, { body: { signedURL: '/object/sign/videos/u1/r1.mp4?token=t' } }]);
    const opened = await loadReviewReport(own.client, athlete, 'r1');
    expect(opened?.share).toBeNull();
    expect(opened?.videoUrl).toContain('/object/sign/videos/u1/r1.mp4');
    expect(own.requests.some((request) => request.path === '/rest/v1/report_shares')).toBe(false);

    const missing = fakeFetch([{ body: [] }]);
    expect(await loadReviewReport(missing.client, coach, 'gone')).toBeNull();
  });
});

describe('comments', () => {
  it('lists a report’s comments oldest first', async () => {
    const { client, requests } = fakeFetch([{ body: [commentRow] }]);
    expect(await listComments(client, coach, 'r1')).toEqual([commentRow]);
    expect(requests[0].path).toBe('/rest/v1/report_comments');
    expect(requests[0].search.get('report_id')).toBe('eq.r1');
    expect(requests[0].search.get('order')).toBe('created_at.asc,id.asc');
  });

  it('adds a trimmed comment at a moment and shot, returning the stored row', async () => {
    const { client, requests } = fakeFetch([{ status: 201, body: [commentRow] }]);
    expect(await addComment(client, coach, { reportId: 'r1', body: '  Hold longer \n', shotIndex: 2, timeS: 4.50049 })).toEqual(commentRow);
    expect(requests[0].method).toBe('POST');
    expect(requests[0].headers.prefer).toBe('return=representation');
    expect(requests[0].body).toEqual([{ report_id: 'r1', body: 'Hold longer', shot_index: 2, time_s: 4.5 }]);
  });

  it('checks the length before sending', async () => {
    const { client, requests } = fakeFetch();
    await expect(addComment(client, coach, { reportId: 'r1', body: '   ', shotIndex: null, timeS: null })).rejects.toThrow(/Write a comment/);
    await expect(addComment(client, coach, { reportId: 'r1', body: 'x'.repeat(2001), shotIndex: null, timeS: null })).rejects.toThrow(/2000 characters/);
    expect(requests).toHaveLength(0);
  });

  it('deletes only the author’s own comment', async () => {
    const { client, requests } = fakeFetch([{ status: 204, body: null }]);
    await deleteComment(client, coach, 'k1');
    expect(requests[0].method).toBe('DELETE');
    expect(requests[0].search.get('id')).toBe('eq.k1');
    expect(requests[0].search.get('author_id')).toBe('eq.c1');
  });

  it('surfaces a refused write as a CloudError', async () => {
    const { client } = fakeFetch([{ status: 403, body: { message: 'new row violates row-level security policy for table "report_comments"' } }]);
    const error = await addComment(client, coach, { reportId: 'r1', body: 'Hi', shotIndex: null, timeS: 1 }).catch((caught: unknown) => caught);
    expect(error instanceof CloudError && error.status).toBe(403);
  });
});

describe('own reports stay separate from shared ones', () => {
  it('lists only the athlete’s own backups and checks backup state by owner', async () => {
    const { client, requests } = fakeFetch([{ body: [] }, { body: [{ video_path: 'u1/r1.mp4' }] }]);
    await listCloudReports(client, athlete);
    expect(requests[0].search.get('user_id')).toBe('eq.u1');
    expect(await cloudReportState(client, athlete, 'r1')).toEqual({ backedUp: true, hasVideo: true });
    expect(requests[1].search.get('user_id')).toBe('eq.u1');
  });
});

describe('shotAtTime', () => {
  const shot = (index: number, release: number, extra: Partial<ShotReport> = {}) => ({ index, release, drawStart: release - 4, anchorStart: release - 2, followThroughEnd: release + 1, ...extra }) as ShotReport;
  const shots = [shot(1, 10), shot(2, 30, { drawStart: null, anchorStart: null, followThroughEnd: null })];

  it('finds the shot whose span holds the moment, else the nearest release within 3 s', () => {
    expect(shotAtTime(shots, 7)).toBe(1);
    expect(shotAtTime(shots, 11)).toBe(1);
    expect(shotAtTime(shots, 12.5)).toBe(1);
    expect(shotAtTime(shots, 28)).toBe(2);
    expect(shotAtTime(shots, 20)).toBeNull();
    expect(shotAtTime([], 5)).toBeNull();
  });
});
