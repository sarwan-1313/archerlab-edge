import type { ArcherHandedness, BiomechanicsMetric, Point2D } from './biomechanics';

export type ShotCaptureState = 'idle' | 'armed' | 'capturing-post-release' | 'finalizing' | 'complete' | 'error';
export type ShotPhase = 'setup' | 'draw' | 'anchor' | 'release' | 'follow-through';
export type ReleaseSource = 'manual' | 'automatic-candidate-confirmed';

export interface ShotFrame {
  timestampMs: number;
  athleteDetected: boolean;
  poseConfidence: number;
  shoulderLineAngleDeg: number | null;
  bowArmElbowAngleDeg: number | null;
  torsoLeanDeg: number | null;
  headMotion: number | null;
  bowHandMotion: number | null;
  shoulderVariationDeg: number | null;
  headPosition?: Point2D;
  bowWristPosition?: Point2D;
  drawWristPosition?: Point2D;
  drawElbowPosition?: Point2D;
  shoulderMidpoint?: Point2D;
  shoulderWidth?: number;
  landmarkQuality: number;
  shoulderLineQuality?: number;
  bowArmQuality?: number;
  torsoQuality?: number;
  headQuality?: number;
  bowHandQuality?: number;
}

export interface ShotPhaseInterval {
  phase: ShotPhase;
  startRelativeMs: number;
  endRelativeMs: number;
  estimated: true;
}

export interface BeforeAfterMetric {
  before: BiomechanicsMetric;
  after: BiomechanicsMetric;
  delta: BiomechanicsMetric;
}

export interface ReleaseMetrics {
  shoulder: BeforeAfterMetric;
  bowArm: BeforeAfterMetric;
  torso: BeforeAfterMetric;
  headDisplacement: BiomechanicsMetric;
  bowHandDisplacement: BiomechanicsMetric;
  followThroughShoulderVariation: BiomechanicsMetric;
  followThroughTorsoVariation: BiomechanicsMetric;
  followThroughHeadMotion: BiomechanicsMetric;
  followThroughBowHandMotion: BiomechanicsMetric;
}

export interface ShotSummary {
  holdShoulderVariationDeg: BiomechanicsMetric;
  holdBowArmVariationDeg: BiomechanicsMetric;
  holdTorsoVariationDeg: BiomechanicsMetric;
  headMotionBeforeRelease: BiomechanicsMetric;
  bowHandMotionBeforeRelease: BiomechanicsMetric;
  releaseShoulderDeltaDeg: BiomechanicsMetric;
  releaseBowArmDeltaDeg: BiomechanicsMetric;
  releaseHeadDisplacement: BiomechanicsMetric;
  releaseBowHandDisplacement: BiomechanicsMetric;
  followThroughShoulderVariationDeg: BiomechanicsMetric;
}

export interface ShotDataQuality {
  usableFrameRatio: number;
  averagePoseConfidence: number;
  trackingLossMs: number;
  releaseWindowComplete: boolean;
  label: 'Good' | 'Limited' | 'Poor';
}

export interface ShotAnalysis {
  id: string;
  capturedAt: number;
  releaseTimestampMs: number;
  releaseSource: ReleaseSource;
  handedness: ArcherHandedness;
  frames: ShotFrame[];
  preReleaseFrames: ShotFrame[];
  postReleaseFrames: ShotFrame[];
  phases: ShotPhaseInterval[];
  releaseMetrics: ReleaseMetrics;
  summary: ShotSummary;
  dataQuality: ShotDataQuality;
  actualResult?: import('./gestureScore').ReportedShotResult;
}

export interface ReleaseCandidate {
  timestampMs: number;
  releaseCandidateStrength: number;
  drawWristVelocity: number;
  drawElbowVelocity: number;
  bowWristVelocity: number;
}

export interface ShotCaptureDebug {
  captureState: ShotCaptureState;
  bufferDurationMs: number;
  bufferFrames: number;
  latestTimestampMs: number;
  releaseTimestampMs: number | null;
  relativeTimestampMs: number | null;
  candidateEnabled: boolean;
  candidateStrength: number;
  candidateThreshold: number;
  drawWristVelocity: number;
  drawElbowVelocity: number;
  bowWristVelocity: number;
  currentPhase: ShotPhase | null;
  preReleaseUsableSamples: number;
  postReleaseUsableSamples: number;
}
