// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReportComment } from '../../cloud/account/coachReview';
import { buildReport } from '../../video-analysis/buildReport';
import { makeScenario, scriptShots, syntheticSamples } from '../../video-analysis/testing/syntheticArcher';
import { ReportView } from './ReportView';

// jsdom has no 2D canvas; the replay simply draws nothing.
beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function makeReport() {
  const scenario = makeScenario({ shots: scriptShots(2) });
  return buildReport({
    id: 'r1', createdAt: 0,
    samples: syntheticSamples(scenario, 12),
    source: { fileName: 'c.mp4', fileSize: 1, mimeType: 'video/mp4', durationS: scenario.durationS, width: 1280, height: 720, nativeFps: 30, analysisFps: 12, hasAudio: false },
    settings: { quality: 'fast', requestedHandedness: 'auto', bowType: 'recurve', model: 'lite', delegate: 'CPU' },
    audio: null,
  });
}

const comment = (id: string, patch: Partial<ReportComment>): ReportComment => ({
  id, report_id: 'r1', author_id: 'c1', author_email: 'coach@club.org', shot_index: null, time_s: null, body: 'Note', created_at: '2026-10-27T10:00:00Z', ...patch,
});

function renderWithComments(items: ReportComment[], onAdd = vi.fn(async () => true), onDelete = vi.fn()) {
  const report = makeReport();
  render(
    <ReportView
      report={report}
      videoUrl={null}
      actions={null}
      comments={{ comments: items, currentUserId: 'u1', viewerIsOwner: true, ownerEmail: 'archer@example.com', busy: false, status: null, onAdd, onDelete, onRefresh: vi.fn() }}
    />,
  );
  return { report, onAdd, onDelete };
}

it('shows each comment with its author, shot and time, and marks timed ones on the timeline', () => {
  renderWithComments([
    comment('k1', { shot_index: 2, time_s: 4.5, body: 'Bow arm collapsed here' }),
    comment('k2', { author_id: 'u1', author_email: 'archer@example.com', body: 'Thanks!' }),
  ]);
  expect(screen.getByText('Coach · coach@club.org')).toBeTruthy();
  expect(screen.getByText('You')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Show Shot 2 · 0:04.50 in the replay' })).toBeTruthy();
  expect(document.querySelectorAll('.va-timeline__comment')).toHaveLength(1);
  expect(document.querySelector('.va-timeline__comment title')?.textContent).toBe('Coach · coach@club.org: Bow arm collapsed here');
  // Only the viewer's own comment can be deleted.
  expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1);
});

it('jumps the replay to a comment’s moment', async () => {
  const { report } = renderWithComments([comment('k1', { time_s: 6.25 })]);
  const timeline = screen.getByRole('slider', { name: 'Timeline' });
  fireEvent.click(screen.getByRole('button', { name: /Show 0:06.25 in the replay/ }));
  await waitFor(() => expect(timeline.getAttribute('aria-valuenow')).toBe(String(Math.round(Math.min(6.25, report.source.durationS)))));
});

it('comments at the replay’s current moment and shot, or on the whole report', async () => {
  const { report, onAdd } = renderWithComments([]);
  const shot = report.shots[1];
  // Put the replay inside the second shot with the shot table, as an athlete or coach would.
  fireEvent.click(screen.getAllByRole('row')[2]);
  const textbox = screen.getByRole('textbox', { name: /Your comment/ });
  fireEvent.change(textbox, { target: { value: 'Watch the release' } });
  fireEvent.click(screen.getByRole('button', { name: /Comment at this moment/ }));
  await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
  const [body, at] = onAdd.mock.calls[0] as unknown as [string, { timeS: number; shotIndex: number | null }];
  expect(body).toBe('Watch the release');
  expect(at.timeS).toBeCloseTo(shot.anchorStart ?? shot.release - 1, 5);
  expect(at.shotIndex).toBe(shot.index);
  await waitFor(() => expect((textbox as HTMLTextAreaElement).value).toBe(''));

  fireEvent.change(textbox, { target: { value: 'Overall: good session' } });
  fireEvent.click(screen.getByRole('button', { name: /Comment on the whole report/ }));
  await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(2));
  expect(onAdd.mock.calls[1]).toEqual(['Overall: good session', null]);
});

it('asks before deleting the viewer’s own comment', () => {
  const onDelete = vi.fn();
  renderWithComments([comment('k2', { author_id: 'u1' })], undefined, onDelete);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(onDelete).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(onDelete).toHaveBeenCalledWith('k2');
});

it('has no comments panel without the comments prop', () => {
  render(<ReportView report={makeReport()} videoUrl={null} actions={null} />);
  expect(screen.queryByRole('heading', { name: /Comments/ })).toBeNull();
});
