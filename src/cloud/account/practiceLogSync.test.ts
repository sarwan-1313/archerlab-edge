import { describe, expect, it } from 'vitest';
import { EMPTY_GOALS, type PracticeLogData } from '../../practice-log/types';
import { PRACTICE_LOG_TABLE_MISSING, pullPracticeLog, pushPracticeLog } from './cloudSync';
import { createSupabaseRest, type CloudSession } from './supabaseRest';

const session: CloudSession = { accessToken: 't', refreshToken: 'r', expiresAt: 9e9, user: { id: 'u1' } };
const log: PracticeLogData = { entries: [{ id: 'manual:a', source: 'manual', date: 1, arrows: 36, averageScore: 9, totalScore: 324, scoredArrows: 36, formScore: null, focusAreas: [] }], goals: { ...EMPTY_GOALS, weeklyArrows: 300, updatedAt: 2 } };

function project(respond: (method: string, path: string) => Response) {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    calls.push({ method, path: `${url.pathname}${url.search}`, body: typeof init?.body === 'string' ? JSON.parse(init.body) : null });
    return respond(method, url.pathname);
  }) as typeof fetch;
  return { client: createSupabaseRest('https://p.supabase.co', 'anon', fetcher), calls };
}

describe('practice log backup', () => {
  it('upserts the whole log as the user’s row', async () => {
    const { client, calls } = project(() => new Response(null, { status: 201 }));
    await pushPracticeLog(client, session, log);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].path).toBe('/rest/v1/practice_logs?on_conflict=user_id');
    expect((calls[0].body as Array<{ user_id: string; data: PracticeLogData }>)[0]).toMatchObject({ user_id: 'u1', data: log });
  });

  it('reads the user’s backup and rejects malformed data', async () => {
    const good = project(() => new Response(JSON.stringify([{ data: log }]), { status: 200 }));
    expect(await pullPracticeLog(good.client, session)).toEqual(log);
    expect(good.calls[0].path).toBe('/rest/v1/practice_logs?select=data&user_id=eq.u1');
    const bad = project(() => new Response(JSON.stringify([{ data: { entries: 'nope' } }]), { status: 200 }));
    expect(await pullPracticeLog(bad.client, session)).toBeNull();
  });

  it('explains a project without the practice log table', async () => {
    const missing = () => new Response(JSON.stringify({ message: 'Could not find the table public.practice_logs' }), { status: 404 });
    await expect(pushPracticeLog(project(missing).client, session, log)).rejects.toThrow(PRACTICE_LOG_TABLE_MISSING);
    expect(await pullPracticeLog(project(missing).client, session)).toBeNull();
  });
});
