// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildReport } from '../../video-analysis/buildReport';
import { makeScenario, scriptShots, syntheticSamples } from '../../video-analysis/testing/syntheticArcher';
import { AnalysisPlayer } from './AnalysisPlayer';

const mounted = vi.fn();
const unmounted = vi.fn();
let lastTime = -1;

// jsdom has no WebGL, so the viewer chunk is replaced by a stand-in that records its lifecycle.
vi.mock('./PoseViewer3D', async () => {
  const { useEffect } = await import('react');
  function FakeViewer({ time }: { time: number }) {
    lastTime = time;
    useEffect(() => { mounted(); return () => unmounted(); }, []);
    return <div data-testid="viewer3d" />;
  }
  return { default: FakeViewer };
});

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  mounted.mockClear();
  unmounted.mockClear();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function makeReport(withLandmarks = true) {
  const scenario = makeScenario({ shots: scriptShots(2) });
  const report = buildReport({
    id: 'r1', createdAt: 0,
    samples: syntheticSamples(scenario, 12),
    source: { fileName: 'c.mp4', fileSize: 1, mimeType: 'video/mp4', durationS: scenario.durationS, width: 1280, height: 720, nativeFps: 30, analysisFps: 12, hasAudio: false },
    settings: { quality: 'fast', requestedHandedness: 'auto', bowType: 'recurve', model: 'lite', delegate: 'CPU' },
    audio: null,
  });
  // Cloud copies come back with no samples and no frames.
  return withLandmarks ? report : { ...report, samples: [], frames: [] };
}

it('loads the 3D viewer only when its tab opens, follows the frame buttons, and unmounts it when the tab closes', async () => {
  render(<AnalysisPlayer report={makeReport()} videoUrl={null} seek={null} />);
  expect(screen.queryByTestId('viewer3d')).toBeNull();
  expect(screen.getByRole('tab', { name: 'Replay' }).getAttribute('aria-selected')).toBe('true');

  fireEvent.click(screen.getByRole('tab', { name: '3D view' }));
  expect(await screen.findByTestId('viewer3d')).toBeTruthy();
  expect(mounted).toHaveBeenCalledTimes(1);

  const before = lastTime;
  fireEvent.click(screen.getByRole('button', { name: 'Next frame' }));
  expect(lastTime).toBeGreaterThan(before);
  fireEvent.click(screen.getByRole('button', { name: 'Previous frame' }));
  expect(lastTime).toBeCloseTo(before, 5);

  fireEvent.click(screen.getByRole('tab', { name: 'Replay' }));
  expect(screen.queryByTestId('viewer3d')).toBeNull();
  expect(unmounted).toHaveBeenCalledTimes(1);
});

it('moves between the tabs with the arrow keys', async () => {
  render(<AnalysisPlayer report={makeReport()} videoUrl={null} seek={null} />);
  fireEvent.keyDown(screen.getByRole('tab', { name: 'Replay' }), { key: 'ArrowRight' });
  expect(screen.getByRole('tab', { name: '3D view' }).getAttribute('aria-selected')).toBe('true');
  expect(await screen.findByTestId('viewer3d')).toBeTruthy();
});

it('explains that cloud copies have no landmarks and never loads the viewer', () => {
  render(<AnalysisPlayer report={makeReport(false)} videoUrl={null} seek={null} />);
  fireEvent.click(screen.getByRole('tab', { name: '3D view' }));
  expect(screen.getByText(/No 3D landmarks in this report/)).toBeTruthy();
  expect(screen.queryByTestId('viewer3d')).toBeNull();
  expect(mounted).not.toHaveBeenCalled();
});
