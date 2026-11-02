/** Tunables for the dataset tools (docs/bow-detection.md). */
export const DATASET_CONFIG = {
  /** Seconds between regular samples. */
  intervalS: 1,
  /** Every frame within this many seconds of a release is sampled too. */
  releaseWindowS: 0.3,
  /** Frame rate assumed when the clip's own is unknown. */
  fallbackFps: 30,
  /** JPEG quality of exported frames. */
  jpegQuality: 0.92,
  /** Suggested bow box, in torso lengths (shoulder midpoint to hip midpoint). */
  bowBox: { height: 2.4, width: 0.7, minVisibility: 0.5 },
  /** Pose samples further than this from a frame are not used for a suggestion, seconds. */
  maxPoseGapS: 0.1,
} as const;
