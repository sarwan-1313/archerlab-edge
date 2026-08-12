import { describe, expect, it } from 'vitest';
import type { PoseLandmark, PoseResult } from '../types/pose';
import { aggregatePoseVisibility, getCalibrationReadiness, getPoseDetectionState } from './poseAnalysis';

function createLandmarks(visibility = 0.9): PoseLandmark[] {
  return Array.from({ length: 33 }, (_, index) => ({
    x: index / 33,
    y: index / 33,
    z: 0,
    visibility,
    presence: 0.95,
  }));
}

function createPoseResult(averageVisibility: number, athleteDetected = true): PoseResult {
  return {
    landmarks: athleteDetected ? createLandmarks(averageVisibility) : [],
    worldLandmarks: [],
    timestamp: 100,
    athleteDetected,
    averageVisibility,
  };
}

describe('pose visibility logic', () => {
  it('aggregates available landmark visibility values', () => {
    const landmarks: PoseLandmark[] = [
      { x: 0, y: 0, z: 0, visibility: 0.25 },
      { x: 0, y: 0, z: 0, visibility: 0.75 },
      { x: 0, y: 0, z: 0 },
    ];
    expect(aggregatePoseVisibility(landmarks)).toBe(0.5);
    expect(aggregatePoseVisibility([])).toBe(0);
  });

  it('requires visible shoulders, arms, and lower body before calibration is ready', () => {
    const landmarks = createLandmarks();
    expect(getCalibrationReadiness(landmarks, true)).toMatchObject({
      camera: true,
      athlete: true,
      shoulders: true,
      arms: true,
      lowerBody: true,
      upperBody: true,
      fullBody: true,
      ready: true,
    });

    landmarks[15] = { ...landmarks[15], visibility: 0.2 };
    const blocked = getCalibrationReadiness(landmarks, true);
    expect(blocked.arms).toBe(false);
    expect(blocked.ready).toBe(false);
  });

  it('maps missing, low-visibility, and valid poses to user-facing detection states', () => {
    expect(getPoseDetectionState(null)).toBe('no-athlete');
    expect(getPoseDetectionState(createPoseResult(0, false))).toBe('no-athlete');
    expect(getPoseDetectionState(createPoseResult(0.4))).toBe('low-visibility');
    expect(getPoseDetectionState(createPoseResult(0.9))).toBe('athlete-detected');
  });
});

