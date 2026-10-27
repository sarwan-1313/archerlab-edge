import type { ArcherHandedness } from '../types/biomechanics';

/**
 * Types for the video analysis engine. This engine is separate from the live
 * camera engine: it works offline on a recorded clip, so it can look both
 * forwards and backwards in time (zero-phase smoothing, whole-shot segmentation,
 * audio alignment and cross-shot consistency).
 */

export type AnalysisQuality = 'fast' | 'standard' | 'max';
export type PoseModelVariant = 'lite' | 'full' | 'heavy';
export type BowType = 'recurve' | 'compound' | 'barebow' | 'traditional' | 'unknown';
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'elite';
export type ConfidenceLabel = 'low' | 'medium' | 'high';
export type CameraViewKind = 'broadside' | 'oblique' | 'down-the-line' | 'unknown';
export type FramePhase = 'idle' | 'draw' | 'anchor' | 'release' | 'follow-through';
export type BodySideName = 'left' | 'right';

export interface Vec2 { x: number; y: number }
/** A stretch of the video in seconds of media time. */
export interface TimeRange { start: number; end: number }
export interface Vec3 { x: number; y: number; z: number }

/** One analysed frame. Landmarks are stored compactly for replay and recomputation. */
export interface PoseSample {
  /** Media time in seconds. */
  t: number;
  /** 33 landmarks × (x, y, z, visibility) in normalized image coordinates, or null when nobody was found. */
  image: Float32Array | null;
  /** 33 landmarks × (x, y, z) in metres, hip-centred (MediaPipe world landmarks). */
  world: Float32Array | null;
}

/** Per-frame measurements derived from one PoseSample. Distances in 3D are in shoulder widths (SW). */
export interface FrameFeatures {
  t: number;
  tracked: boolean;
  /** Mean visibility of the upper-body landmarks the engine relies on (0–1). */
  quality: number;
  has3d: boolean;
  /** Aspect-corrected 2D image positions (units: image heights). */
  head2?: Vec2;
  bowWrist2?: Vec2;
  drawWrist2?: Vec2;
  shoulderMid2?: Vec2;
  hipMid2?: Vec2;
  /** 2D torso length (shoulder midpoint to hip midpoint), used to normalise 2D motion. */
  torso2: number | null;
  /** 2D shoulder width divided by 2D torso length; small when the camera looks down the shooting line. */
  viewRatio: number | null;
  /** 3D positions in metres (hip-centred). */
  head3?: Vec3;
  bowWrist3?: Vec3;
  drawWrist3?: Vec3;
  bowShoulder3?: Vec3;
  /** 3D shoulder width in metres. */
  sw3: number | null;
  /** Wrist-to-wrist distance in SW (draw length proxy). */
  span: number | null;
  /** Draw wrist to head distance in SW (small at anchor). */
  faceProx: number | null;
  /** Bow wrist height above the bow shoulder in SW (≈0 when the bow arm is raised level). */
  bowArmElevation: number | null;
  bowElbowAngle: number | null;
  drawForearmAlignment: number | null;
  shoulderAlignment: number | null;
  /** Positive when the bow shoulder sits higher than the draw shoulder, in SW. */
  bowShoulderRise: number | null;
  torsoLean: number | null;
  /** +1 leaning toward the target, −1 leaning away, 0 unknown. */
  torsoLeanDirection: number;
  /** Draw wrist relative to the head in SW (3D) — the anchor fingerprint. */
  anchorVector?: Vec3;
}

export type MetricKey =
  | 'bowElbowAngle'
  | 'drawForearmAlignment'
  | 'shoulderAlignment'
  | 'bowShoulderRise'
  | 'torsoLean'
  | 'bowHandSway'
  | 'headSway'
  | 'anchorSway'
  | 'drawCreep'
  | 'releaseBackFraction'
  | 'releaseTravel'
  | 'headMoveAtRelease'
  | 'bowArmDrop'
  | 'followThroughHold'
  | 'drawDuration'
  | 'holdDuration'
  | 'clickerReaction'
  | 'anchorSpread'
  | 'anchorContactPoint'
  | 'anchorFaceSpread'
  | 'holdTimeCv'
  | 'drawTimeCv'
  | 'elbowAngleSd';

export interface MetricValue {
  value: number;
  /** 0–1: landmark quality × camera-view suitability × sample sufficiency. */
  confidence: number;
}

export type MetricMap = Partial<Record<MetricKey, MetricValue>>;

export type ShotSource = 'video' | 'video+audio' | 'audio-only';

export interface ShotTiming {
  drawStart: number | null;
  anchorStart: number | null;
  release: number;
  followThroughEnd: number | null;
  releaseSource: 'visual' | 'audio';
}

export interface ShotReport extends ShotTiming {
  index: number;
  source: ShotSource;
  metrics: MetricMap;
  scores: Partial<Record<MetricKey, number>>;
  formScore: number | null;
  quality: { trackedRatio: number; meanVisibility: number; label: 'good' | 'limited' | 'poor' };
  audio?: { releaseOnset?: number; clickerOnset?: number; impactOnset?: number; flightTime?: number };
  anchorVector?: Vec3;
  /** Anchor point on the face (experimental; from Face and Hand Landmarker). */
  anchorFace?: AnchorFaceSummary;
  /** The athlete's own note for this shot (a voice note transcribed on the device, or typed). */
  notes?: string;
  /** Direction notes used to word posture findings. */
  posture?: { bowShoulderHigher: boolean | null; leanTowardTarget: boolean | null };
}

/** Where the draw hand's index fingertip sat on the face in one anchor frame (see anchor.ts). Face heights, from the chin. */
export interface AnchorObservation {
  t: number;
  /** Across the face, positive toward the draw-hand side. */
  x: number;
  /** Up the face, toward the forehead. */
  y: number;
  toChin: number;
  toMouthCorner: number;
  toNose: number;
  /** 0–1: how well the draw side of the face is seen (side-on footage often hides it). */
  visibility: number;
}

/** A shot's anchor point on the face, from the frames of its anchor window. */
export interface AnchorFaceSummary {
  x: number;
  y: number;
  toChin: number;
  toMouthCorner: number;
  toNose: number;
  /** Median movement of the fingertip within the anchor, face heights. */
  wobble: number;
  frames: number;
  confidence: number;
}

export interface LetDown { start: number; end: number }

export interface AudioOnset {
  t: number;
  /** Normalised 0–1 relative to the strongest transient in the clip. */
  strength: number;
  /** Peak level in dBFS around the onset. */
  peakDb: number;
  /** Spectral centroid at the onset, Hz. */
  centroidHz: number;
  /** Time for the envelope to fall by 20 dB, seconds. */
  decayS: number;
}

export interface AudioSummary {
  available: boolean;
  reason?: string;
  durationS: number;
  sampleRate: number;
  noiseFloorDb: number;
  onsets: AudioOnset[];
  /** Median audio-minus-visual release offset across matched shots, seconds. */
  syncOffsetS: number | null;
  matchedReleases: number;
  /** Strong transients not explained by a visible shot (other archers, audio-only shots). */
  unmatchedStrong: number;
}

export type CategoryId = 'posture' | 'alignment' | 'stability' | 'release' | 'followThrough' | 'rhythm';

export interface CategoryScore {
  id: CategoryId;
  label: string;
  score: number | null;
  confidence: number;
  metrics: MetricKey[];
}

export interface ScoreSummary {
  overall: number | null;
  level: SkillLevel | null;
  confidence: ConfidenceLabel;
  confidenceReasons: string[];
  categories: CategoryScore[];
  /** What it takes to reach the next level, when there is one. */
  nextLevel?: { level: SkillLevel; threshold: number; gap: number; focus: CategoryId[] };
  /** Set when a fundamental fault held the level below what the score alone would give. */
  levelCap?: { level: SkillLevel; metric: MetricKey; reason: string };
}

export type JointName =
  | 'bowElbow' | 'bowShoulder' | 'bowWrist' | 'drawElbow' | 'drawWrist' | 'drawShoulder' | 'head' | 'torso' | 'shoulders';

export interface FindingLocation {
  shotIndex: number | null;
  time: number | null;
  joints: JointName[];
}

export interface Finding {
  id: string;
  metric: MetricKey;
  category: CategoryId;
  severity: 'high' | 'medium' | 'low';
  score: number;
  confidence: number;
  title: string;
  observed: string;
  why: string;
  fix: string;
  drill: string;
  where: FindingLocation;
  resourceIds: string[];
  experimental?: boolean;
}

export interface Strength {
  metric: MetricKey;
  title: string;
  detail: string;
  score: number;
}

export interface PlanStep {
  title: string;
  detail: string;
}

export interface ResourceLink {
  id: string;
  title: string;
  publisher: string;
  url: string;
  kind: 'video' | 'playlist' | 'article' | 'manual' | 'search';
  reason: string;
}

export interface FrameReadout {
  t: number;
  phase: FramePhase;
  shotIndex: number | null;
  tracked: boolean;
  quality: number;
  bowElbowAngle: number | null;
  drawForearmAlignment: number | null;
  shoulderAlignment: number | null;
  bowShoulderRise: number | null;
  torsoLean: number | null;
  span: number | null;
  faceProx: number | null;
}

export interface ViewDetection {
  kind: CameraViewKind;
  confidence: number;
  ratio: number | null;
  note: string;
}

export interface HandednessDetection {
  drawSide: BodySideName | null;
  confidence: number;
  votes: number;
}

export interface VideoSourceInfo {
  fileName: string;
  fileSize: number;
  mimeType: string;
  /** Length of the whole file. */
  durationS: number;
  /** The analysed part of the file; absent on reports made before trimming (whole clip). */
  range?: TimeRange;
  width: number;
  height: number;
  nativeFps: number | null;
  analysisFps: number;
  hasAudio: boolean;
}

export interface AnalysisSettings {
  quality: AnalysisQuality;
  requestedHandedness: 'auto' | ArcherHandedness;
  handedness: ArcherHandedness;
  handednessSource: 'auto' | 'profile' | 'manual' | 'default';
  bowType: BowType;
  model: PoseModelVariant;
  delegate: 'GPU' | 'CPU' | 'unknown';
}

export interface TrackingSummary {
  framesAnalyzed: number;
  trackedRatio: number;
  meanQuality: number;
  refinedFrames: number;
  processingMs: number;
}

export interface VideoAnalysisReport {
  id: string;
  createdAt: number;
  engineVersion: string;
  source: VideoSourceInfo;
  settings: AnalysisSettings;
  view: ViewDetection;
  handednessDetection: HandednessDetection;
  tracking: TrackingSummary;
  samples: PoseSample[];
  frames: FrameReadout[];
  audio: AudioSummary | null;
  shots: ShotReport[];
  letDowns: LetDown[];
  session: MetricMap;
  scores: ScoreSummary;
  findings: Finding[];
  focusAreas: Finding[];
  strengths: Strength[];
  plan: PlanStep[];
  resources: ResourceLink[];
  limitations: string[];
  /** Face and hand measurements from each shot's anchor window, kept so the report can be scored again. */
  anchorFrames?: AnchorObservation[];
}

/** The small, list-friendly part of a report (for history, profile status and cloud sync). */
export interface VideoReportSummary {
  id: string;
  createdAt: number;
  fileName: string;
  durationS: number;
  shots: number;
  overall: number | null;
  level: SkillLevel | null;
  confidence: ConfidenceLabel;
  view: CameraViewKind;
  focus: string[];
  hasVideo: boolean;
}
