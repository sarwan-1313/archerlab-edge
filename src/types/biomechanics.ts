import type { PoseLandmark } from './pose';

export type ArcherHandedness = 'right' | 'left';
export type BodySide = 'left' | 'right';
export type CameraView = 'side' | 'front' | 'rear' | 'custom';
export type CoordinateSpace = 'normalized-image' | 'world' | 'normalized-image-fallback' | 'temporal-normalized';

export type Point2D = { x: number; y: number };
export type Point3D = Point2D & { z: number };

export interface BiomechanicsMetric {
  value: number | null;
  rawValue: number | null;
  smoothedValue: number | null;
  unit: string;
  confidence: number;
  available: boolean;
  reason?: string;
  coordinateSpace?: CoordinateSpace;
  sampleCount?: number;
  windowDurationMs?: number;
  pathLengthShoulderWidths?: number;
  velocityShoulderWidthsPerSecond?: number;
  mean?: number;
  range?: number;
}

export interface BiomechanicsFrame {
  timestampMs: number;
  shoulderLineAngleDeg: number | null;
  bowArmElbowAngleDeg: number | null;
  torsoLeanDeg: number | null;
  headPosition?: Point2D;
  headReference?: 'ears' | 'nose';
  bowHandPosition?: Point2D;
  drawHandPosition?: Point2D;
  drawElbowPosition?: Point2D;
  shoulderMidpoint?: Point2D;
  shoulderWidth?: number;
  confidence: number;
  shoulderLineConfidence: number;
  headConfidence: number;
  bowHandConfidence: number;
  shoulderWidthConfidence: number;
}

export interface BiomechanicsReference {
  capturedAt: number;
  shoulderLineAngleDeg: number;
  bowArmElbowAngleDeg: number;
  torsoLeanDeg: number;
  sampleCount: number;
}

export interface BiomechanicsReferenceDeltas {
  shoulderDeltaDeg?: number;
  bowArmDeltaDeg?: number;
  torsoDeltaDeg?: number;
}

export interface BiomechanicsDebugData {
  handedness: ArcherHandedness;
  bowSide: BodySide;
  timestampMs: number;
  historySamples: number;
  historyDurationMs: number;
  shoulderWidth: number | null;
  metricConfidence: number;
  headRmsPercent: number | null;
  bowHandRmsPercent: number | null;
}

export interface BiomechanicsSnapshot {
  timestampMs: number;
  athleteDetected: boolean;
  poseConfidence: number;
  shoulderLineAngle: BiomechanicsMetric;
  bowArmElbowAngle: BiomechanicsMetric;
  torsoLean: BiomechanicsMetric;
  headMotion: BiomechanicsMetric;
  bowHandMotion: BiomechanicsMetric;
  shoulderVariation: BiomechanicsMetric;
  currentFrame?: BiomechanicsFrame;
  reference?: BiomechanicsReferenceDeltas;
  debug: BiomechanicsDebugData;
}

export interface InstantaneousBiomechanics {
  frame: BiomechanicsFrame;
  shoulderLine: BiomechanicsMetric;
  bowArmElbow: BiomechanicsMetric;
  torsoLean: BiomechanicsMetric;
  normalizedLandmarks: PoseLandmark[];
}
