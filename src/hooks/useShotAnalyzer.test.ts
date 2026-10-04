// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useShotAnalyzer } from './useShotAnalyzer';
import { SHOT_CONFIG } from '../shot-analysis/config';
import type { BiomechanicsSnapshot } from '../types/biomechanics';

// Supply measured frames at the hook boundary; run the actual shot engine.
vi.mock('../shot-analysis/shotFrame', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shot-analysis/shotFrame')>();
  return { ...actual, createShotFrame: (snapshot: BiomechanicsSnapshot) => ({
    timestampMs: snapshot.timestampMs, athleteDetected: true, poseConfidence: .9,
    shoulderLineAngleDeg: 2, bowArmElbowAngleDeg: 171, torsoLeanDeg: 1,
    headMotion: 0, bowHandMotion: 0, shoulderVariationDeg: 0, landmarkQuality: .9,
    headPosition: { x: .5, y: .2 }, bowWristPosition: { x: .25, y: .5 }, shoulderWidth: .2,
  }) };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('uses the current event callback and records one release and one completed shot', () => {
  vi.useFakeTimers();
  const older = vi.fn(); const newer = vi.fn(); const onShotCaptured = vi.fn();
  const options = (timestampMs: number, onRecordEvent = older) => ({
    snapshot: { timestampMs, athleteDetected: true } as BiomechanicsSnapshot,
    active: true, handedness: 'right' as const, onShotCaptured, onRecordEvent,
  });
  const { result, rerender, unmount } = renderHook(useShotAnalyzer, { initialProps: options(1000) });
  for (let timestamp = 1100; timestamp <= 2200; timestamp += 100) rerender(options(timestamp));
  rerender(options(2200, newer));
  act(() => {
    expect(result.current.markRelease()).toBe(true);
    expect(result.current.markRelease()).toBe(false);
  });
  expect(older).not.toHaveBeenCalled();
  expect(newer).toHaveBeenCalledExactlyOnceWith({ type: 'release', source: 'manual', tMs: 2200 });
  act(() => { vi.advanceTimersByTime(SHOT_CONFIG.postReleaseMs); });
  expect(onShotCaptured).toHaveBeenCalledTimes(1);
  expect(newer).toHaveBeenCalledTimes(2);
  expect(newer).toHaveBeenLastCalledWith({ type: 'shot', shotId: onShotCaptured.mock.calls[0][0].id, tMs: 2200 });
  unmount(); expect(vi.getTimerCount()).toBe(0);
});
