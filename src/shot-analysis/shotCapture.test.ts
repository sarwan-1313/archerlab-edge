import { describe, expect, it } from 'vitest';
import type { ShotFrame } from '../types/shotAnalysis';
import { ShotCaptureEngine } from './shotCapture';

function frame(timestampMs: number, quality = 0.9): ShotFrame {
  return {
    timestampMs, athleteDetected: true, poseConfidence: quality,
    shoulderLineAngleDeg: 2, bowArmElbowAngleDeg: 171, torsoLeanDeg: 1,
    headMotion: 0, bowHandMotion: 0, shoulderVariationDeg: 0,
    headPosition: { x: 0.5, y: 0.2 }, bowWristPosition: { x: 0.25, y: 0.5 },
    drawWristPosition: { x: 0.7, y: 0.3 }, drawElbowPosition: { x: 0.6, y: 0.4 },
    shoulderMidpoint: { x: 0.5, y: 0.4 }, shoulderWidth: 0.2, landmarkQuality: quality,
  };
}

function preparedEngine(releaseTimestampMs = 2200): ShotCaptureEngine {
  const engine = new ShotCaptureEngine('right'); engine.arm();
  for (let time = releaseTimestampMs - 1200; time <= releaseTimestampMs; time += 100) engine.ingest(frame(time));
  return engine;
}

describe('shot capture engine', () => {
  it('stores the authoritative manual timestamp, retains pre-frames, and completes after post capture', () => {
    const engine = preparedEngine();
    expect(engine.markRelease(2200, 'manual')).toEqual({ ok: true });
    expect(engine.state).toBe('capturing-post-release');
    let shot = null;
    for (let time = 2300; time <= 3000; time += 100) shot = engine.ingest(frame(time)) ?? shot;
    expect(engine.state).toBe('complete');
    expect(shot).toMatchObject({ releaseTimestampMs: 2200, releaseSource: 'manual', handedness: 'right' });
    expect(shot!.preReleaseFrames[0].timestampMs).toBe(1000);
    expect(shot!.postReleaseFrames.at(-1)!.timestampMs).toBe(3000);
  });

  it('prevents double marking and auto candidates during a manual capture', () => {
    const engine = preparedEngine();
    expect(engine.markRelease(2200).ok).toBe(true);
    expect(engine.state).not.toBe('armed');
    expect(engine.markRelease(2200, 'automatic-candidate-confirmed')).toMatchObject({ ok: false });
  });

  it('enforces post-capture cooldown before rearming', () => {
    const engine = preparedEngine(); engine.markRelease(2200); engine.ingest(frame(3000));
    engine.ingest(frame(3999)); expect(engine.state).toBe('complete');
    engine.ingest(frame(4000)); expect(engine.state).toBe('armed');
  });

  it('aborts safely when the camera stops during post-release capture', () => {
    const engine = preparedEngine(); engine.markRelease(2200); engine.ingest(frame(2400));
    engine.abort();
    expect(engine.state).toBe('idle'); expect(engine.bufferFrames).toBe(0); expect(engine.releaseTimestampMs).toBeNull();
    expect(engine.advance(3000)).toBeNull();
  });

  it('rejects release before usable history exists', () => {
    const engine = new ShotCaptureEngine('right'); engine.arm(); engine.ingest(frame(2000));
    expect(engine.markRelease(2000)).toMatchObject({ ok: false });
  });

  it('preserves enough bounded history to confirm an older automatic candidate', () => {
    const engine = preparedEngine();
    for (let time = 2300; time <= 3400; time += 100) engine.ingest(frame(time));
    expect(engine.markRelease(2200, 'automatic-candidate-confirmed').ok).toBe(true);
    const shot = engine.advance(3400);
    expect(shot).toMatchObject({ releaseTimestampMs: 2200, releaseSource: 'automatic-candidate-confirmed' });
    expect(shot!.preReleaseFrames[0].timestampMs).toBe(1000);
  });

  it('cancels an active capture when handedness changes', () => {
    const engine = preparedEngine(); engine.markRelease(2200); engine.setHandedness('left');
    expect(engine.state).toBe('armed'); expect(engine.releaseTimestampMs).toBeNull(); expect(engine.bufferFrames).toBe(0);
  });
});
