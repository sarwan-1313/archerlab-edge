import type { AnalysisQuality } from './types';

export const VIDEO_ENGINE_VERSION = 'video-engine/1.0.0';

/** Frames per second the first tracking pass samples at, per quality preset. */
export const QUALITY_FPS: Record<AnalysisQuality, number> = {
  fast: 12,
  standard: 24,
  max: 60,
};

export const VIDEO_CONFIG = {
  /** Longest range that can be analysed at once (the file itself may be longer). */
  maxDurationS: 15 * 60,
  /** Shortest range worth analysing. */
  minRangeS: 2,
  warnDurationS: 4 * 60,
  maxAudioDecodeBytes: 450 * 1024 * 1024,
  /** Files longer than this skip audio decoding: the whole track is decoded into memory. */
  maxAudioDecodeDurationS: 30 * 60,
  /** Long edge of the frame handed to the pose model. MediaPipe downsamples internally anyway. */
  inferenceLongEdgePx: 720,
  /** Landmark visibility below this is treated as missing. */
  minLandmarkVisibility: 0.4,
  /** A frame counts as tracked when the key upper-body landmarks average at least this visibility. */
  minTrackedQuality: 0.35,
  /** Precision pass: re-track this much time either side of each release at the native frame rate. */
  refineWindowS: 0.6,

  smoothing: {
    medianHalfWindowS: 0.045,
    meanHalfWindowS: 0.07,
    maxInterpolationGapS: 0.25,
  },

  segmentation: {
    /** Full draw: draw hand near the face… (SW) */
    anchorFaceProxMax: 0.85,
    /** …hands far apart (SW)… */
    fullDrawSpanMin: 1.25,
    /** …and the bow hand roughly at shoulder height (SW). */
    bowArmElevationMin: -0.7,
    /** 2D fallbacks (torso lengths) for clips without usable 3D landmarks. */
    anchorFaceProx2dMax: 0.42,
    fullDrawSpan2dMin: 0.85,
    mergeGapS: 0.22,
    minHoldS: 0.35,
    maxHoldS: 25,
    releaseSearchBeforeS: 0.3,
    releaseSearchAfterS: 0.35,
    /** Draw hand speed relative to the head that marks a release (SW per second). */
    releaseMinSpeed: 1.4,
    releaseOnsetFraction: 0.4,
    /** A "dead" release barely moves the hand; accept smaller bursts when the arms come down afterwards. */
    weakReleaseMinSpeed: 0.55,
    letDownSpanDrop: 0.15,
    letDownSpanDrop2d: 0.08,
    anchorSpanTolerance: 0.025,
    anchorStillSpeed: 0.35,
    anchorPatienceS: 0.12,
    drawStartFraction: 0.08,
    drawLookbackS: 6,
    maxFollowThroughS: 3,
    minShotSpacingS: 1.5,
  },

  audio: {
    sampleRate: 16000,
    fftSize: 512,
    hop: 128,
    bandLowHz: 1200,
    peakHalfWindowS: 0.06,
    thresholdHalfWindowS: 0.6,
    thresholdK: 4,
    minStrength: 0.08,
    minSpacingS: 0.09,
    releaseMatchBeforeS: 0.3,
    releaseMatchAfterS: 0.25,
    clickerWindowS: [0.04, 0.6] as const,
    impactWindowS: [0.1, 1.8] as const,
    audioOnlyMinStrength: 0.45,
  },

  windows: {
    /** Alignment/posture are measured in the steady part of the hold just before release. */
    anchorBeforeReleaseS: [0.5, 0.08] as const,
    stabilityMaxS: 1.5,
    stabilityTrimS: 0.1,
    releasePreS: [0.16, 0.03] as const,
    releasePostS: [0.04, 0.2] as const,
    releaseTravelS: 0.18,
    bowArmDropS: 0.32,
    followThroughDropSW: 0.45,
  },

  scoring: {
    levelThresholds: { intermediate: 50, advanced: 68, elite: 82 },
    /** Overall = (1 − w) × weighted average + w × weakest area: skill is limited by the weakest phase. */
    weakestAreaWeight: 0.3,
    findingScoreMax: 70,
    findingMinConfidence: 0.3,
    strengthScoreMin: 85,
    strengthMinConfidence: 0.5,
  },
} as const;
