// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createSupabaseRest, type CloudSession } from '../../cloud/account/supabaseRest';
import { buildReport } from '../../video-analysis/buildReport';
import { makeScenario, scriptShots, syntheticSamples } from '../../video-analysis/testing/syntheticArcher';
import { ShareWithCoachPanel } from './ShareWithCoachPanel';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const session: CloudSession = { accessToken: 't', refreshToken: 'r', expiresAt: 9e9, user: { id: 'u1', email: 'archer@example.com' } };

function makeReport() {
  const scenario = makeScenario({ shots: scriptShots(1) });
  return buildReport({
    id: 'r1', createdAt: 0,
    samples: syntheticSamples(scenario, 12),
    source: { fileName: 'c.mp4', fileSize: 1, mimeType: 'video/mp4', durationS: scenario.durationS, width: 1280, height: 720, nativeFps: 30, analysisFps: 12, hasAudio: false },
    settings: { quality: 'fast', requestedHandedness: 'auto', bowType: 'recurve', model: 'lite', delegate: 'CPU' },
    audio: null,
  });
}

/** A fake project where the report is not backed up yet and then gains one share. */
function fakeProject() {
  const requests: Array<{ method: string; path: string; body: unknown }> = [];
  let backedUp = false;
  let shares: unknown[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    requests.push({ method, path: url.pathname, body: typeof init?.body === 'string' ? JSON.parse(init.body) as unknown : null });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
    if (url.pathname === '/rest/v1/video_reports' && method === 'GET') return json(backedUp ? [{ video_path: null }] : []);
    if (url.pathname === '/rest/v1/video_reports' && method === 'POST') { backedUp = true; return new Response(null, { status: 201 }); }
    if (url.pathname === '/rest/v1/report_shares' && method === 'GET') return json(shares);
    if (url.pathname === '/rest/v1/report_shares' && method === 'POST') {
      const [row] = init?.body ? JSON.parse(String(init.body)) as Array<Record<string, unknown>> : [];
      shares = [{ id: 's1', owner_email: 'archer@example.com', created_at: '2026-10-27T10:00:00Z', ...row }];
      return json(shares, 201);
    }
    if (url.pathname === '/rest/v1/report_shares' && method === 'PATCH') { shares = []; return json([{ id: 's1' }]); }
    return json({ message: `unexpected ${method} ${url.pathname}` }, 500);
  }) as typeof fetch;
  return { client: createSupabaseRest('https://p.supabase.co', 'anon', fetcher), requests };
}

it('backs the report up, then shares it after the trust confirmation, and revokes', async () => {
  const project = fakeProject();
  render(<ShareWithCoachPanel report={makeReport()} videoBlob={null} client={project.client} freshSession={async () => session} />);

  const share = screen.getByRole('button', { name: /Share report/ });
  const includeVideo = screen.getByRole('checkbox', { name: /Include the video/ }) as HTMLInputElement;
  expect(includeVideo.checked).toBe(false);
  expect(includeVideo.disabled).toBe(true);
  expect(screen.getByText(/ask a parent or guardian first/)).toBeTruthy();

  fireEvent.change(screen.getByRole('textbox', { name: /Coach’s email/ }), { target: { value: 'Coach@Club.org' } });
  expect((share as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox', { name: /Only share with a coach you trust/ }));
  fireEvent.click(share);

  await screen.findByText(/Shared with coach@club.org/);
  const writes = project.requests.filter((request) => request.method === 'POST').map((request) => request.path);
  expect(writes).toEqual(['/rest/v1/video_reports', '/rest/v1/report_shares']);
  const shareWrite = project.requests.find((request) => request.path === '/rest/v1/report_shares' && request.method === 'POST');
  expect((shareWrite?.body as unknown[] | undefined)?.[0]).toMatchObject({ coach_email: 'coach@club.org', include_video: false });
  expect((screen.getByRole('textbox', { name: /Link for your coach/ }) as HTMLInputElement).value).toBe(`${window.location.origin}/video?report=r1`);
  expect(screen.getByText(/report only/)).toBeTruthy();

  vi.spyOn(window, 'confirm').mockReturnValue(true);
  fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
  await screen.findByText(/can no longer open this report/);
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull());
});

it('offers the video only when it is available', () => {
  const project = fakeProject();
  render(<ShareWithCoachPanel report={makeReport()} videoBlob={new Blob(['v'], { type: 'video/mp4' })} client={project.client} freshSession={async () => session} />);
  const includeVideo = screen.getByRole('checkbox', { name: /Include the video/ }) as HTMLInputElement;
  expect(includeVideo.disabled).toBe(false);
  expect(includeVideo.checked).toBe(false);
});
