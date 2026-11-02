import { describe, expect, it } from 'vitest';
import { castVote, communityError, createBracket, createPoll, createThread, listChat, myVotes, pollTally, reportItem, sendChat, shareResult } from './community';
import { CloudError, createSupabaseRest, type CloudSession } from './supabaseRest';

const session: CloudSession = { accessToken: 'tok', refreshToken: 'r', expiresAt: 9e9, user: { id: 'me', email: 'a@b.c' } };

type Seen = { method: string; path: string; body: unknown; prefer?: string };

function fake(respond: (seen: Seen) => { status?: number; body?: unknown }) {
  const seen: Seen[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const entry: Seen = { method: init?.method ?? 'GET', path: `${url.pathname}${url.search}`, body: typeof init?.body === 'string' ? JSON.parse(init.body) as unknown : null, prefer: (init?.headers as Record<string, string> | undefined)?.prefer };
    seen.push(entry);
    const { status = 200, body = [] } = respond(entry);
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { client: createSupabaseRest('https://p.supabase.co', 'anon', fetcher), seen };
}

describe('club community calls', () => {
  it('lists the latest chat oldest first', async () => {
    const { client, seen } = fake(() => ({ body: [{ id: '2', body: 'newer' }, { id: '1', body: 'older' }] }));
    const messages = await listChat(client, session, 'club 1', 50);
    expect(messages.map((message) => message.id)).toEqual(['1', '2']);
    expect(seen[0].path).toContain('club_id=eq.club%201');
    expect(seen[0].path).toContain('order=created_at.desc&limit=50');
  });

  it('checks text before sending and sends only what the database needs', async () => {
    const { client, seen } = fake(() => ({ body: [{ id: 'x' }] }));
    await expect(sendChat(client, session, 'c', 'see https://x.org')).rejects.toThrow('Links');
    await expect(sendChat(client, session, 'c', '   ')).rejects.toThrow('empty');
    expect(seen).toHaveLength(0);
    await sendChat(client, session, 'c', '  Good shooting!  ');
    expect(seen[0].body).toEqual([{ club_id: 'c', body: 'Good shooting!' }]);
    await createThread(client, session, 'c', 'Saturday shoot', 'Bring water');
    expect(seen[1].body).toEqual([{ club_id: 'c', title: 'Saturday shoot', body: 'Bring water' }]);
  });

  it('creates polls with clean options and a future closing time', async () => {
    const { client, seen } = fake(() => ({ body: [{ id: 'p' }] }));
    const later = new Date(Date.now() + 3600_000);
    await expect(createPoll(client, session, { clubId: 'c', kind: 'poll', question: 'Q?', options: ['Only', 'only'], closesAt: later })).rejects.toThrow('two different');
    await expect(createPoll(client, session, { clubId: 'c', kind: 'poll', question: 'Q?', options: ['A', 'B'], closesAt: new Date(Date.now() - 1000) })).rejects.toThrow('future');
    await createPoll(client, session, { clubId: 'c', kind: 'prediction', question: ' Who wins? ', options: [' Asha ', 'Ben', ''], closesAt: later });
    expect(seen).toHaveLength(1);
    expect(seen[0].body).toEqual([{ club_id: 'c', kind: 'prediction', question: 'Who wins?', options: ['Asha', 'Ben'], closes_at: later.toISOString() }]);
  });

  it('casts a vote as an upsert and reads only my own picks', async () => {
    const { client, seen } = fake((request) => ({ body: request.method === 'GET' ? [{ poll_id: 'p1', option_index: 2 }] : [] }));
    await castVote(client, session, 'p1', 1);
    expect(seen[0].path).toBe('/rest/v1/club_poll_votes?on_conflict=poll_id%2Cvoter_id');
    expect(seen[0].body).toEqual([{ poll_id: 'p1', option_index: 1 }]);
    expect(seen[0].prefer).toContain('merge-duplicates');
    const votes = await myVotes(client, session, 'c');
    expect(votes.get('p1')).toBe(2);
    expect(seen[1].path).toContain('voter_id=eq.me');
  });

  it('turns tally counts into numbers', async () => {
    const { client } = fake(() => ({ body: [{ poll_id: 'p', option_index: 0, votes: '4' }] }));
    expect(await pollTally(client, session, 'c')).toEqual([{ poll_id: 'p', option_index: 0, votes: 4 }]);
  });

  it('validates shared results and brackets', async () => {
    const { client, seen } = fake(() => ({ body: [{ id: 'r' }] }));
    await expect(shareResult(client, session, { clubId: 'c', roundLabel: 'WA 18m', score: 700, maxScore: 600, arrows: 60, shotOn: '2026-11-02' })).rejects.toThrow('between 0');
    await expect(shareResult(client, session, { clubId: 'c', roundLabel: 'WA 18m', score: 500.5, maxScore: 600, arrows: 60, shotOn: '2026-11-02' })).rejects.toThrow('whole');
    await shareResult(client, session, { clubId: 'c', roundLabel: 'WA 18m', score: 540, maxScore: 600, arrows: 60, shotOn: '2026-11-02' });
    expect(seen[0].body).toEqual([{ club_id: 'c', round_label: 'WA 18m', score: 540, max_score: 600, arrows: 60, shot_on: '2026-11-02' }]);
    await expect(createBracket(client, session, 'c', 'Shoot-off', ['Only one'])).rejects.toThrow('2 to 16');
  });

  it('files a report with a short reason', async () => {
    const { client, seen } = fake(() => ({ body: [] }));
    await reportItem(client, session, 'c', 'club_chat', 'm1', ` ${'x'.repeat(400)}`);
    expect((seen[0].body as Array<{ reason: string; item_table: string }>)[0].item_table).toBe('club_chat');
    expect((seen[0].body as Array<{ reason: string }>)[0].reason).toHaveLength(300);
  });

  it('explains the refusals the database gives', () => {
    expect((communityError(new CloudError('x', 404)) as Error).message).toContain('schema.sql');
    expect((communityError(new CloudError('You are posting too quickly. Wait a moment and try again.', 400)) as Error).message).toContain('too quickly');
    expect((communityError(new CloudError('new row violates row-level security policy', 403)) as Error).message).toContain('muted');
    expect((communityError(new CloudError('duplicate key', 409)) as Error).message).toContain('already');
    const other = new Error('offline');
    expect(communityError(other)).toBe(other);
  });
});
