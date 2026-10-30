/** Object classes labelled for bow detection (docs/bow-detection.md). Order sets the COCO category ids (1-based). */
export const DATASET_CLASSES = ['bow', 'arrow', 'target-face'] as const;
export type DatasetClass = (typeof DATASET_CLASSES)[number];

/** An axis-aligned box in image pixels, top-left origin. */
export interface PixelBox { x: number; y: number; width: number; height: number }

export interface DatasetBox extends PixelBox {
  id: string;
  label: DatasetClass;
  /** True while it is a pose-based suggestion the labeller has not touched yet. */
  suggested?: boolean;
}

export interface DatasetFrame {
  /** Media time in seconds. */
  t: number;
  /** Why this frame was sampled. */
  reason: 'interval' | 'release';
  boxes: DatasetBox[];
  /** Set once the labeller has checked the frame; only reviewed frames are exported (an unchecked frame is not a true negative). */
  reviewed: boolean;
}
