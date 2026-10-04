// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const runtime = vi.hoisted(() => ({ updates: [] as Array<() => void>, analysisMounts: vi.fn(), analysisProps: [] as Array<Record<string, unknown>>, profile: null as Record<string, unknown> | null }));
vi.mock('./motion/runPresentationTransition', () => ({
  runPresentationTransition: (update: () => void) => { runtime.updates.push(update); },
}));
vi.mock('./components/ProfilePreview', () => ({ ProfilePreview: () => <span>Guest</span> }));
vi.mock('./pages/SessionDashboardPage', () => ({ SessionDashboardPage: ({ shots, onSelectShot }: { shots: Array<{ id: string }>; onSelectShot?: (id: string) => void }) => <><h1>Analytics: {shots.length} shots</h1>{shots.map((shot) => <button key={shot.id} onClick={() => onSelectShot?.(shot.id)}>Review {shot.id}</button>)}</> }));
vi.mock('./pages/ReplayAnalysisPage', () => ({ ReplayAnalysisPage: ({ shot }: { shot?: { id: string } }) => <h1>Replay: {shot?.id ?? 'none'}</h1> }));
vi.mock('./pages/CalibrationPage', () => ({ CalibrationPage: ({ onReferenceChange, onComplete }: { onReferenceChange: (value: object) => void; onComplete: () => void }) => <><h1>Calibration</h1><button onClick={() => onReferenceChange({ marker: 'reference' })}>Capture Reference</button><button onClick={onComplete}>Confirm Calibration</button></> }));
vi.mock('./pages/LiveAnalysisPage', async () => {
  const { useEffect } = await import('react');
  return { LiveAnalysisPage: (props: Record<string, unknown>) => {
    runtime.analysisProps.push(props);
    useEffect(() => { runtime.analysisMounts(); }, []);
    return <h1>Camera Setup</h1>;
  } };
});
vi.mock('./profile/profileStorage', () => ({
  loadProfile: vi.fn(async () => runtime.profile),
}));

async function present() {
  await act(async () => { runtime.updates.splice(0).forEach((update) => update()); });
}

const persistedShot = (id: string) => ({
  id,
  capturedAt: 1,
  releaseTimestampMs: 1,
  releaseSource: 'manual',
  handedness: 'right',
  frames: [],
  preReleaseFrames: [],
  postReleaseFrames: [],
  phases: [],
  releaseMetrics: {
    shoulder: {}, bowArm: {}, torso: {}, headDisplacement: {}, bowHandDisplacement: {},
    followThroughShoulderVariation: {}, followThroughTorsoVariation: {},
    followThroughHeadMotion: {}, followThroughBowHandMotion: {},
  },
  summary: {
    holdShoulderVariationDeg: {}, holdBowArmVariationDeg: {}, holdTorsoVariationDeg: {},
    headMotionBeforeRelease: {}, bowHandMotionBeforeRelease: {}, releaseShoulderDeltaDeg: {},
    releaseBowArmDeltaDeg: {}, releaseHeadDisplacement: {}, releaseBowHandDisplacement: {},
    followThroughShoulderVariationDeg: {},
  },
  dataQuality: { label: 'Good', usableFrameRatio: 1, averagePoseConfidence: 1 },
});

beforeEach(() => {
  sessionStorage.clear();
  localStorage.setItem('archerlab-edge:onboarding-complete', 'true');
  window.history.replaceState(null, '', '/');
  runtime.updates = [];
  runtime.analysisMounts.mockClear();
  runtime.analysisProps = [];
  runtime.profile = null;
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Welcome navigation', () => {
  it('restores available shots when refreshing Analytics without starting a camera', async () => {
    sessionStorage.setItem('archerlab-edge:session-shots', JSON.stringify([persistedShot('saved-shot')]));
    window.history.replaceState(null, '', '/analytics');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Analytics: 1 shots' }, { timeout: 3000 })).toBeTruthy();
    expect(runtime.analysisMounts).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/analytics');
  });
  it('accepts Start Analysis once before the presentation callback runs', async () => {
    render(<App />);
    const push = vi.spyOn(window.history, 'pushState');
    const start = screen.getByRole('button', { name: 'Start Analysis' });
    fireEvent.click(start);
    fireEvent.click(start);
    expect(window.location.pathname).toBe('/analysis');
    expect(push).toHaveBeenCalledTimes(1);
    expect(runtime.updates).toHaveLength(1);
    await present();
    expect(screen.getByRole('heading', { name: 'Camera Setup' })).toBeTruthy();
    expect(runtime.analysisMounts).toHaveBeenCalledTimes(1);
  });

  it('uses valid saved profile defaults for a new analysis', async () => {
    runtime.profile = { handedness: 'left', defaultCameraAngle: 'front' };
    render(<App />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Start Analysis' }));
    await present();
    await waitFor(() => expect(runtime.analysisProps.at(-1)).toMatchObject({ handedness: 'left', cameraView: 'front' }));
  });

  it('falls back to supported defaults when saved profile values are invalid', async () => {
    runtime.profile = { handedness: 'ambidextrous', defaultCameraAngle: 'ceiling' };
    render(<App />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Start Analysis' }));
    await present();
    await waitFor(() => expect(runtime.analysisProps.at(-1)).toMatchObject({ handedness: 'right', cameraView: 'side' }));
  });

  it('persists replay shot selection in the URL and restores it on refresh', async () => {
    sessionStorage.setItem('archerlab-edge:session-shots', JSON.stringify([persistedShot('older'), persistedShot('latest')]));
    window.history.replaceState(null, '', '/analytics');
    render(<App />);
    await screen.findByRole('heading', { name: 'Analytics: 2 shots' });
    fireEvent.click(screen.getByRole('button', { name: 'Review older' }));
    expect(window.location.pathname).toBe('/replay-analysis');
    expect(window.location.search).toBe('?shot=older');
    await present();
    expect(await screen.findByRole('heading', { name: 'Replay: older' })).toBeTruthy();
    window.history.pushState({ archerLabPage: 'replay-analysis', archerLabIndex: 2 }, '', '/replay-analysis?shot=latest');
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
    await present();
    expect(await screen.findByRole('heading', { name: 'Replay: latest' })).toBeTruthy();
  });

  it('keeps a confirmed calibration reference when entering analysis', async () => {
    window.history.replaceState(null, '', '/readiness');
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Capture Reference' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Calibration' }));
    await present();
    await waitFor(() => expect(runtime.analysisProps.at(-1)?.reference).toEqual({ marker: 'reference' }));
  });

  it('honors Home during an unfinished guide transition', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'User Guide' }));
    fireEvent.click(screen.getByRole('button', { name: 'Go to Home' }));
    expect(window.location.pathname).toBe('/');
    await present();
    expect(screen.getByRole('heading', { name: 'ArcherLab Edge', level: 1 })).toBeTruthy();
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
  });

  it('does not let an older transition overwrite the latest Start request', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'User Guide' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start Analysis' }));
    const [older, newer] = runtime.updates.splice(0);
    await act(async () => { newer(); });
    await act(async () => { older(); });
    expect(window.location.pathname).toBe('/analysis');
    expect(screen.getByRole('heading', { name: 'Camera Setup' })).toBeTruthy();
    expect(runtime.analysisMounts).toHaveBeenCalledTimes(1);
  });

  it('honors browser Back to Home before setup has rendered', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Start Analysis' }));
    act(() => {
      window.history.replaceState({ archerLabPage: 'home', archerLabIndex: 0 }, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
    });
    await present();
    expect(screen.getByRole('heading', { name: 'ArcherLab Edge', level: 1 })).toBeTruthy();
    expect(runtime.analysisMounts).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Go back' })).toBeNull();
  });

  it('keeps repeated Home actions out of history', () => {
    render(<App />);
    const push = vi.spyOn(window.history, 'pushState');
    fireEvent.click(screen.getByRole('button', { name: 'Go to Home' }));
    fireEvent.click(screen.getByRole('button', { name: 'Go to Home' }));
    expect(push).not.toHaveBeenCalled();
    expect(runtime.updates).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Go back' })).toBeNull();
  });
});
