// @vitest-environment jsdom

import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BiomechanicsMetric, BiomechanicsSnapshot } from '../types/biomechanics';
import type { ReportedShotResult } from '../types/gestureScore';
import type { ShotAnalysis } from '../types/shotAnalysis';
import { LiveAnalysisPage } from './LiveAnalysisPage';

const runtime = vi.hoisted(() => ({
  cameraMounts: 0,
  poseMounts: 0,
  analyzerMounts: 0,
  recorderStarts: 0,
  recorderStops: 0,
  finishRecording: (): void => { throw new Error('Recorder has not mounted'); },
  poseDetected: true,
  viewSession: vi.fn(),
  viewAnalytics: vi.fn(),
  startNew: vi.fn(),
  goHome: vi.fn(),
}));

const metric = (value: number, unit = '°'): BiomechanicsMetric => ({
  value,
  rawValue: value,
  smoothedValue: value,
  unit,
  confidence: 0.94,
  available: true,
  coordinateSpace: 'normalized-image',
});

const snapshot: BiomechanicsSnapshot = {
  timestampMs: 1000,
  athleteDetected: true,
  poseConfidence: 0.94,
  shoulderLineAngle: metric(1.8),
  bowArmElbowAngle: metric(171),
  torsoLean: metric(2.2),
  headMotion: metric(0.8, '% SW'),
  bowHandMotion: metric(1.1, '% SW'),
  shoulderVariation: { ...metric(1.4), mean: 1.8, range: 2.1 },
  debug: {
    handedness: 'right', bowSide: 'left', timestampMs: 1000, historySamples: 24,
    historyDurationMs: 1600, shoulderWidth: 0.22, metricConfidence: 0.94,
    headRmsPercent: 0.8, bowHandRmsPercent: 1.1,
  },
};

function createShot(): ShotAnalysis {
  const hold = metric(1.2);
  const alignment = metric(0.9);
  const followThrough = metric(1.5);
  return {
    id: 'workflow-shot-1', capturedAt: Date.now(), releaseTimestampMs: 900,
    releaseSource: 'manual', handedness: 'right', frames: [], preReleaseFrames: [], postReleaseFrames: [],
    phases: [
      { phase: 'setup', startRelativeMs: -1800, endRelativeMs: -1300, estimated: true },
      { phase: 'draw', startRelativeMs: -1300, endRelativeMs: -700, estimated: true },
      { phase: 'anchor', startRelativeMs: -700, endRelativeMs: -100, estimated: true },
      { phase: 'release', startRelativeMs: -100, endRelativeMs: 120, estimated: true },
      { phase: 'follow-through', startRelativeMs: 120, endRelativeMs: 900, estimated: true },
    ],
    releaseMetrics: {} as ShotAnalysis['releaseMetrics'],
    summary: {
      holdShoulderVariationDeg: hold,
      holdBowArmVariationDeg: metric(1.1),
      holdTorsoVariationDeg: metric(0.8),
      headMotionBeforeRelease: metric(0.7, '% SW'),
      bowHandMotionBeforeRelease: metric(0.9, '% SW'),
      releaseShoulderDeltaDeg: alignment,
      releaseBowArmDeltaDeg: metric(1.3),
      releaseHeadDisplacement: metric(0.7, '% SW'),
      releaseBowHandDisplacement: metric(0.9, '% SW'),
      followThroughShoulderVariationDeg: followThrough,
    },
    dataQuality: { usableFrameRatio: 0.92, averagePoseConfidence: 0.94, trackingLossMs: 0, releaseWindowComplete: true, label: 'Good' },
  };
}

vi.mock('../hooks/useLocalCamera', async () => {
  const React = await import('react');
  const stream = {} as MediaStream;
  return {
    useLocalCamera: () => {
      React.useEffect(() => { runtime.cameraMounts += 1; }, []);
      return {
        devices: [{ deviceId: 'camera-1', kind: 'videoinput', label: 'Test Camera' }],
        selectedDeviceId: 'camera-1', setSelectedDeviceId: vi.fn(), stream, error: null,
        isLoading: false, startCamera: vi.fn(async () => stream), stopCamera: vi.fn(),
      };
    },
  };
});

vi.mock('../hooks/usePoseLandmarker', async () => {
  const React = await import('react');
  return {
    usePoseLandmarker: () => {
      const result = { timestamp: 1000, landmarks: [], worldLandmarks: [], athleteDetected: runtime.poseDetected, averageVisibility: runtime.poseDetected ? 0.94 : 0 };
      React.useEffect(() => { runtime.poseMounts += 1; }, []);
      return {
        status: 'running', result, latestResultRef: { current: result }, error: null,
        debugStats: { fps: 30, landmarkCount: 33, averageVisibility: 0.94, videoWidth: 1280, videoHeight: 720 },
      };
    },
  };
});

vi.mock('../hooks/useBiomechanics', () => ({ useBiomechanics: () => ({ snapshot }) }));

vi.mock('../utils/poseAnalysis', () => ({
  getPoseDetectionState: () => runtime.poseDetected ? 'athlete-detected' : 'no-athlete',
  getCalibrationReadiness: () => ({ ready: runtime.poseDetected, athlete: runtime.poseDetected, arms: runtime.poseDetected }),
}));

vi.mock('../components/pose/PoseOverlay', () => ({ PoseOverlay: () => <div data-testid="pose-overlay" /> }));

vi.mock('../hooks/useSessionRecorder', async () => {
  const React = await import('react');
  return {
    useSessionRecorder: () => {
      const [state, setState] = React.useState<'idle' | 'recording' | 'paused' | 'finalizing' | 'error'>('idle');
      const [durationMs, setDurationMs] = React.useState(0);
      runtime.finishRecording = () => setState('idle');
      const start = React.useCallback(async () => {
        runtime.recorderStarts += 1;
        setDurationMs(8200);
        setState('recording');
        return { ok: true, id: 'test-recording' };
      }, []);
      const stop = React.useCallback(() => {
        runtime.recorderStops += 1;
        setState('finalizing');
      }, []);
      return {
        state, durationMs, start, stop,
        pause: () => setState('paused'), resume: () => setState('recording'),
        recordTelemetryFrame: vi.fn(async () => undefined), recordEvent: vi.fn(async () => undefined),
      };
    },
  };
});

vi.mock('../hooks/useShotAnalyzer', async () => {
  const React = await import('react');
  return {
    useShotAnalyzer: (options: { onShotCaptured: (shot: ShotAnalysis) => void }) => {
      const optionsRef = React.useRef(options);
      optionsRef.current = options;
      const [autoReleaseEnabled, setAutoReleaseEnabled] = React.useState(false);
      React.useEffect(() => { runtime.analyzerMounts += 1; }, []);
      const markRelease = React.useCallback(() => optionsRef.current.onShotCaptured(createShot()), []);
      return {
        captureState: 'armed', captureError: null, autoReleaseEnabled, setAutoReleaseEnabled,
        pendingCandidate: null, latestShot: undefined, markRelease, clearLatestShot: vi.fn(),
        confirmCandidate: vi.fn(), ignoreCandidate: vi.fn(),
        debug: {
          captureState: 'armed', bufferDurationMs: 1800, bufferFrames: 48, latestTimestampMs: 1000,
          releaseTimestampMs: null, relativeTimestampMs: null, candidateEnabled: false,
          candidateStrength: 0, candidateThreshold: 1.8, drawWristVelocity: 0,
          drawElbowVelocity: 0, bowWristVelocity: 0, currentPhase: 'anchor',
          preReleaseUsableSamples: 24, postReleaseUsableSamples: 18,
        },
      };
    },
  };
});

vi.mock('../hooks/useGestureScoreEntry', () => ({
  useGestureScoreEntry: () => ({
    state: 'idle', candidate: null, error: null, skip: vi.fn(),
    debug: { state: 'idle', handsDetected: 0, leftHandConfidence: 0, rightHandConfidence: 0, leftFingerCount: null, rightFingerCount: null, wristsCrossed: false, candidateScore: '--', stableDurationMs: 0, requiredHoldMs: 800, candidateConfidence: 0 },
  }),
}));

function WorkflowHarness() {
  const [shots, setShots] = useState<ShotAnalysis[]>([]);
  const addShot = (shot: ShotAnalysis) => setShots((current) => [...current, shot]);
  const addResult = (shotId: string, result: ReportedShotResult) => setShots((current) => current.map((shot) => shot.id === shotId ? { ...shot, actualResult: result } : shot));
  return <LiveAnalysisPage
    handedness="right" cameraView="side" scoreEntryMethod="manual-only" autoReleaseDefault={false}
    shots={shots} onShotCaptured={addShot} onAttachResult={addResult} onUndoLastShot={() => setShots((current) => current.slice(0, -1))}
    onGestureGuide={vi.fn()} onViewSessions={runtime.viewSession} onViewAnalytics={runtime.viewAnalytics}
    onStartNewSession={runtime.startNew} onHome={runtime.goHome}
  />;
}

describe('Live Analysis guided workflow', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });
  beforeEach(() => {
    sessionStorage.clear();
    runtime.cameraMounts = 0;
    runtime.poseMounts = 0;
    runtime.analyzerMounts = 0;
    runtime.recorderStarts = 0;
    runtime.recorderStops = 0;
    runtime.poseDetected = true;
    runtime.viewSession.mockReset();
    runtime.viewAnalytics.mockReset();
    runtime.startNew.mockReset();
    runtime.goHome.mockReset();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });

  it('completes setup, records and scores a shot, continues, then finalizes a summary without remounting the camera stack', async () => {
    const view = render(<WorkflowHarness />);

    expect(screen.getByRole('heading', { name: 'Camera Setup' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Continue to Readiness/ }));
    expect(screen.getByRole('heading', { name: 'Readiness Check' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Continue/ }));
    expect(screen.getByRole('heading', { name: 'Ready to Begin', level: 1 })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Start Session/ }));
    await screen.findByRole('heading', { name: 'Live Analysis' });
    expect(runtime.recorderStarts).toBe(1);
    expect(screen.getByText('Session Active')).toBeTruthy();

    runtime.poseDetected = false;
    view.rerender(<WorkflowHarness />);
    expect(screen.getByText('Pose Not Detected')).toBeTruthy();
    runtime.poseDetected = true;
    view.rerender(<WorkflowHarness />);
    expect(screen.queryByText('Pose Not Detected')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Mark release/ }));
    expect(screen.getByRole('heading', { name: 'Shot Recorded' })).toBeTruthy();
    // The review is portaled beside the page; query its controls within that panel.
    const review = within(screen.getByRole('heading', { name: 'Shot Recorded' }).closest('section')!);
    fireEvent.click(review.getByRole('button', { name: '10' }));
    fireEvent.click(review.getByRole('button', { name: 'Confirm Score' }));
    expect(review.getByText('Recorded as').parentElement?.textContent).toContain('10');

    fireEvent.click(review.getByRole('button', { name: /Continue Session/ }));
    expect(screen.getByRole('button', { name: /Mark release/ })).toBeTruthy();
    expect(screen.getByText('1', { selector: '.live-session-strip strong' })).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: /End Session/ })[0]);
    const dialog = screen.getByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'End Session' }));
    expect(screen.getByText('Saving session')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Session Complete' })).toBeNull();
    // Resolve the external recorder state explicitly; no wall-clock timer or polling.
    act(() => runtime.finishRecording());
    expect(screen.getByRole('heading', { name: 'Session Complete' })).toBeTruthy();

    expect(runtime.recorderStops).toBe(1);
    expect(screen.getByText('10.0')).toBeTruthy();
    expect(screen.getByText('0:08')).toBeTruthy();
    expect(runtime.cameraMounts).toBe(1);
    expect(runtime.poseMounts).toBe(1);
    expect(runtime.analyzerMounts).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'View Full Session' }));
    fireEvent.click(screen.getByRole('button', { name: 'View Analytics' }));
    fireEvent.click(screen.getByRole('button', { name: 'Return Home' }));
    fireEvent.click(screen.getByRole('button', { name: /Start New Session/ }));
    expect(runtime.viewSession).toHaveBeenCalledOnce();
    expect(runtime.viewAnalytics).toHaveBeenCalledOnce();
    expect(runtime.goHome).toHaveBeenCalledOnce();
    expect(runtime.startNew).toHaveBeenCalledOnce();
    view.unmount();
  }, 15000);
});
