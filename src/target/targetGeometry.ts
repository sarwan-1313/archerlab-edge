import type { TargetResult } from '../types/gestureScore';

export interface TargetFaceConfig {
  id: string;
  name: string;
  maxScore: number;
  supportsX: boolean;
  ringBoundaries: number[];
  xBoundary: number;
}

export const DEFAULT_TARGET_FACE: TargetFaceConfig = {
  id: 'prototype-10-ring',
  name: '10-ring prototype face',
  maxScore: 10,
  supportsX: true,
  ringBoundaries: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
  xBoundary: 0.05,
};

export interface TargetCoordinate { x: number; y: number }
export interface TargetScore { score: number; isX: boolean; label: string }
export interface TargetBounds { left: number; top: number; width: number; height: number }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function screenPointToTargetCoordinates(clientX: number, clientY: number, bounds: TargetBounds): TargetCoordinate {
  if (bounds.width <= 0 || bounds.height <= 0) return { x: 0, y: 0 };
  return {
    x: clamp(((clientX - bounds.left) / bounds.width) * 2 - 1, -1, 1),
    y: clamp(((clientY - bounds.top) / bounds.height) * 2 - 1, -1, 1),
  };
}

export function targetRadius(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

export function scoreTargetCoordinate(x: number, y: number, config = DEFAULT_TARGET_FACE): TargetScore {
  const radius = targetRadius(x, y);
  if (!Number.isFinite(radius) || radius > config.ringBoundaries.at(-1)!) return { score: 0, isX: false, label: 'MISS' };
  const ringIndex = config.ringBoundaries.findIndex((boundary) => radius <= boundary);
  const score = config.maxScore - ringIndex;
  const isX = config.supportsX && score === config.maxScore && radius <= config.xBoundary;
  return { score, isX, label: isX ? 'X' : String(score) };
}

export function createTargetResult(x: number, y: number, enteredAt = Date.now()): TargetResult {
  const scored = scoreTargetCoordinate(x, y);
  return { score: scored.score, isX: scored.isX, targetX: x, targetY: y, normalizedRadius: targetRadius(x, y), source: 'manual-target', enteredAt };
}
