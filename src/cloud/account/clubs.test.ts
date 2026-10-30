import { describe, expect, it } from 'vitest';
import type { PracticeEntry } from '../../practice-log/types';
import type { VideoReportSummary } from '../../video-analysis/types';
import { memberLabel, summarizeRoster } from './clubRoster';
import {
  createClub, createInvite, deleteInvite, generateInviteCode, isInviteActive, joinClub, leaveClub, listClubComments, listInvites,
  listMemberPracticeLogs, listMemberReports, listMembers, listMyClubs, listMyMemberships, memberForReport, normalizeInviteCode, setClubSharing,
  type ClubMember, type MemberReport,
} from './clubs';
import { CloudError, createSupabaseRest, type CloudSession } from './supabaseRest';

const BASE = 'https://p.supabase.co';
const athlete: CloudSession = { accessToken: 'athlete-token', refreshToken: 'r', expiresAt: 9e9, user: { id: 'u1', email: 'archer@example.com' } };
const coach: CloudSession = { accessToken: 'coach-token', refreshToken: 'r', expiresAt: 9e9, user: { id: 'c1', email: 'coach@club.org' } };

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

const member = (overrides: Partial<ClubMember> = {}): ClubMember => ({
  club_id: 'k1', athlete_id: 'u1', display_name: 'Asha', athlete_email: 'archer@example.com', is_minor: false,
  share_analyses: true, share_practice_log: true, joined_at: '2026-10-01T00:00:00Z', left_at: null, ...overrides,
});
const clubRow = { id: 'k1', name: 'Riverside Archers', coach_id: 'c1', created_at: '2026-10-01T00:00:00Z' };
const inviteRow = { id: 'i1', club_id: 'k1', code: 'ABCD2345', expires_at: '2026-11-05T00:00:00.000Z', max_uses: 20, uses: 0, created_at: '2026-10-29T00:00:00Z' };

describe('invite codes', () => {
  it('generates 8 unambiguous characters from random bytes', () => {
    const code = generateInviteCode((bytes) => bytes.map((_, index) => index * 37));
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(generateInviteCode()).toHaveLength(8);
  });

  it('normalizes what the athlete types', () => {
    expect(normalizeInviteCode(' abcd-2345 ')).toBe('ABCD2345');
  });

  it('is active until it expires or is used up', () => {
    const now = Date.parse('2026-10-29T00:00:00Z');
    expect(isInviteActive(inviteRow, now)).toBe(true);
    expect(isInviteActive({ ...inviteRow, uses: 20 }, now)).toBe(false);
    expect(isInviteActive(inviteRow, Date.parse('2026-11-06T00:00:00Z'))).toBe(false);
  });
});

describe('coach requests', () => {
  it('creates a club with a trimmed name, and refuses an empty one without a request', async () => {
    const { client, requests } = fakeFetch([{ status: 201, body: [clubRow] }]);
    await expect(createClub(client, coach, '   ')).rejects.toThrow(/name/);
    expect(await createClub(client, coach, '  Riverside Archers ')).toEqual(clubRow);
    expect(requests).toHaveLength(1);
    expect(requests[0].path).toBe('/rest/v1/clubs');
    expect(requests[0].body).toEqual([{ name: 'Riverside Archers' }]);
    expect(requests[0].headers.authorization).toBe('Bearer coach-token');
  });

  it('lists only the clubs the user coaches', async () => {
    const { client, requests } = fakeFetch([{ body: [clubRow] }]);
    await listMyClubs(client, coach);
    expect(requests[0].search.get('coach_id')).toBe('eq.c1');
  });

  it('explains a project without the club tables', async () => {
    const { client } = fakeFetch([{ status: 404, body: { message: 'relation does not exist' } }]);
    await expect(listMyClubs(client, coach)).rejects.toThrow(/latest supabase\/schema.sql/);
  });

  it('creates an invite with an expiry and use limit, lists and deletes them', async () => {
    const { client, requests } = fakeFetch([{ status: 201, body: [inviteRow] }, { body: [inviteRow] }, { body: null }]);
    const now = Date.parse('2026-10-29T00:00:00Z');
    await createInvite(client, coach, { clubId: 'k1', days: 7, maxUses: 20 }, now, 'ABCD2345');
    expect(requests[0].body).toEqual([{ club_id: 'k1', code: 'ABCD2345', expires_at: '2026-11-05T00:00:00.000Z', max_uses: 20 }]);
    expect(await listInvites(client, coach, 'k1')).toEqual([inviteRow]);
    expect(requests[1].search.get('club_id')).toBe('eq.k1');
    await deleteInvite(client, coach, 'i1');
    expect(requests[2].method).toBe('DELETE');
    expect(requests[2].search.get('id')).toBe('eq.i1');
  });

  it('refuses out-of-range invites without a request', async () => {
    const { client, requests } = fakeFetch();
    await expect(createInvite(client, coach, { clubId: 'k1', days: 7, maxUses: 0 })).rejects.toThrow(/1 to 500/);
    await expect(createInvite(client, coach, { clubId: 'k1', days: 365, maxUses: 5 })).rejects.toThrow(/90 days/);
    expect(requests).toHaveLength(0);
  });

  it('lists current members, and the reports and logs of a set of athletes', async () => {
    const { client, requests } = fakeFetch([{ body: [member()] }, { body: [] }, { body: [{ user_id: 'u1', data: { entries: [], goals: {} } }, { user_id: 'u2', data: null }] }]);
    await listMembers(client, coach, 'k1');
    expect(requests[0].search.get('left_at')).toBe('is.null');
    await listMemberReports(client, coach, ['u1', 'u2']);
    expect(requests[1].path).toBe('/rest/v1/video_reports');
    expect(requests[1].search.get('user_id')).toBe('in.(u1,u2)');
    expect(requests[1].search.get('select')).toBe('id,user_id,created_at,summary');
    const logs = await listMemberPracticeLogs(client, coach, ['u1', 'u2']);
    expect([...logs.keys()]).toEqual(['u1']);
  });

  it('makes no request for an empty roster', async () => {
    const { client, requests } = fakeFetch();
    expect(await listMemberReports(client, coach, [])).toEqual([]);
    expect((await listMemberPracticeLogs(client, coach, [])).size).toBe(0);
    expect(requests).toHaveLength(0);
  });

  it('finds the sharing member behind a report, but never the caller', async () => {
    const { client, requests } = fakeFetch([{ body: [member()] }, { body: [member({ athlete_id: 'c1' })] }]);
    expect((await memberForReport(client, coach, 'u1'))?.display_name).toBe('Asha');
    expect(requests[0].search.get('share_analyses')).toBe('is.true');
    expect(await memberForReport(client, coach, 'c1')).toBeNull();
  });

  it('reads club comments through the function that hides minors’ emails', async () => {
    const { client, requests } = fakeFetch([{ body: [] }]);
    await listClubComments(client, coach, 'r1');
    expect(requests[0].path).toBe('/rest/v1/rpc/club_report_comments');
    expect(requests[0].body).toEqual({ p_report_id: 'r1' });
  });
});

describe('athlete requests', () => {
  it('joins with a normalized code and the chosen name', async () => {
    const { client, requests } = fakeFetch([{ body: 'k1' }]);
    expect(await joinClub(client, athlete, { code: 'abcd-2345', displayName: ' Asha ', isMinor: false, guardianConfirmed: false })).toBe('k1');
    expect(requests[0].path).toBe('/rest/v1/rpc/join_club');
    expect(requests[0].body).toEqual({ p_code: 'ABCD2345', p_display_name: 'Asha', p_is_minor: false, p_guardian_confirmed: false });
  });

  it('requires a guardian’s agreement for a minor, a name and a full code, without a request', async () => {
    const { client, requests } = fakeFetch();
    await expect(joinClub(client, athlete, { code: 'ABCD2345', displayName: 'Asha', isMinor: true, guardianConfirmed: false })).rejects.toThrow(/parent or guardian/);
    await expect(joinClub(client, athlete, { code: 'ABCD2345', displayName: '  ', isMinor: false, guardianConfirmed: false })).rejects.toThrow(/name/);
    await expect(joinClub(client, athlete, { code: 'ABC', displayName: 'Asha', isMinor: false, guardianConfirmed: false })).rejects.toThrow(/8 letters/);
    expect(requests).toHaveLength(0);
  });

  it('passes the minor flag and agreement to the database', async () => {
    const { client, requests } = fakeFetch([{ body: 'k1' }]);
    await joinClub(client, athlete, { code: 'ABCD2345', displayName: 'Asha', isMinor: true, guardianConfirmed: true });
    expect(requests[0].body).toMatchObject({ p_is_minor: true, p_guardian_confirmed: true });
  });

  it('shows the database’s reason for a bad code', async () => {
    const { client } = fakeFetch([{ status: 400, body: { message: 'That invite code is not valid. It may have expired or been used up.' } }]);
    const error = await joinClub(client, athlete, { code: 'ABCD2345', displayName: 'Asha', isMinor: false, guardianConfirmed: false }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CloudError);
    expect((error as Error).message).toMatch(/expired/);
  });

  it('lists own current memberships with club names', async () => {
    const { client, requests } = fakeFetch([{ body: [{ ...member(), clubs: { name: 'Riverside Archers' } }] }]);
    const [mine] = await listMyMemberships(client, athlete);
    expect(mine.club_name).toBe('Riverside Archers');
    expect(mine).not.toHaveProperty('clubs');
    expect(requests[0].search.get('athlete_id')).toBe('eq.u1');
    expect(requests[0].search.get('select')).toContain('clubs(name)');
  });

  it('changes sharing and leaves through the database functions', async () => {
    const { client, requests } = fakeFetch([{ body: null }, { body: null }]);
    await setClubSharing(client, athlete, 'k1', { analyses: true, practiceLog: false });
    expect(requests[0].path).toBe('/rest/v1/rpc/set_club_sharing');
    expect(requests[0].body).toEqual({ p_club_id: 'k1', p_share_analyses: true, p_share_practice_log: false });
    await leaveClub(client, athlete, 'k1');
    expect(requests[1].path).toBe('/rest/v1/rpc/leave_club');
    expect(requests[1].body).toEqual({ p_club_id: 'k1' });
  });
});

const summary = (createdAt: number, overall: number | null, focus: string[], level: VideoReportSummary['level'] = 'intermediate'): VideoReportSummary => ({
  id: `r${createdAt}`, createdAt, fileName: 'clip.mp4', durationS: 30, shots: 6, overall, level, confidence: 'medium', view: 'broadside', focus, hasVideo: false,
});
const report = (userId: string, s: VideoReportSummary): MemberReport => ({ id: s.id, user_id: userId, created_at: new Date(s.createdAt).toISOString(), summary: s });
const entry = (date: number, arrows: number): PracticeEntry => ({ id: `m:${date}`, source: 'manual', date, arrows, averageScore: null, totalScore: null, scoredArrows: 0, formScore: null, focusAreas: [] });

describe('roster summary', () => {
  const now = new Date(2026, 9, 29, 12).getTime(); // Thursday
  const day = 86_400_000;

  it('gives each athlete’s latest level, form trend and weekly volume', () => {
    const { rows } = summarizeRoster(
      [member()],
      [report('u1', summary(now - 20 * day, 50, ['Bow arm'], 'beginner')), report('u1', summary(now - 10 * day, 60, ['Bow arm'])), report('u1', summary(now - day, 70, ['Anchor']))],
      new Map([['u1', { entries: [entry(now - day, 60), entry(now - 2 * day, 40), entry(now - 9 * day, 100)], goals: { weeklyArrows: null, weeklySessions: null, focus: null, updatedAt: 0 } }]]),
      now,
    );
    expect(rows[0].latestLevel).toBe('intermediate');
    expect(rows[0].formScores).toEqual([50, 60, 70]);
    expect(rows[0].formTrend).toBe(15);
    expect(rows[0].volume).toMatchObject({ arrowsThisWeek: 100, sessionsThisWeek: 2 });
    expect(rows[0].volume?.arrowsPerWeek.slice(-2)).toEqual([100, 100]);
  });

  it('shows nothing an athlete does not share', () => {
    const { rows, topFocus } = summarizeRoster(
      [member({ share_analyses: false, share_practice_log: false })],
      [report('u1', summary(now, 70, ['Anchor']))],
      new Map([['u1', { entries: [entry(now, 60)], goals: { weeklyArrows: null, weeklySessions: null, focus: null, updatedAt: 0 } }]]),
      now,
    );
    expect(rows[0]).toMatchObject({ reports: [], latestLevel: null, formScores: [], formTrend: null, volume: null });
    expect(topFocus).toBeNull();
  });

  it('finds the most common focus area, counting each athlete’s latest report once', () => {
    const { topFocus } = summarizeRoster(
      [member(), member({ athlete_id: 'u2' }), member({ athlete_id: 'u3' })],
      [
        report('u1', summary(now - 5 * day, 60, ['Bow arm', 'Bow arm'])),
        report('u1', summary(now, 60, ['Anchor', 'Anchor'])),
        report('u2', summary(now, 60, ['Anchor', 'Release'])),
        report('u3', summary(now, 60, ['Release'])),
      ],
      new Map(),
      now,
    );
    expect(topFocus).toEqual({ title: 'Anchor', athletes: 2 });
  });

  it('labels minors by display name only', () => {
    expect(memberLabel(member())).toBe('Asha · archer@example.com');
    expect(memberLabel(member({ is_minor: true, athlete_email: 'leak@example.com' }))).toBe('Asha');
  });
});
