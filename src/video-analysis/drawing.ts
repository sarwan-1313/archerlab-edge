import type { ArcherHandedness } from '../types/biomechanics';
import { LM } from './frameFeatures';
import type { JointName } from './types';

/** MediaPipe Pose skeleton connections (kept here so drawing needs no model import). */
export const SKELETON: ReadonlyArray<readonly [number, number]> = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [24, 26], [25, 27], [26, 28], [27, 29], [28, 30], [29, 31], [30, 32], [27, 31], [28, 32],
  [15, 17], [15, 19], [15, 21], [17, 19], [16, 18], [16, 20], [16, 22], [18, 20],
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10],
];

export function jointIndices(joint: JointName, handedness: ArcherHandedness): number[] {
  const drawLeft = handedness === 'left';
  const bow = drawLeft
    ? { shoulder: LM.rightShoulder, elbow: LM.rightElbow, wrist: LM.rightWrist }
    : { shoulder: LM.leftShoulder, elbow: LM.leftElbow, wrist: LM.leftWrist };
  const draw = drawLeft
    ? { shoulder: LM.leftShoulder, elbow: LM.leftElbow, wrist: LM.leftWrist }
    : { shoulder: LM.rightShoulder, elbow: LM.rightElbow, wrist: LM.rightWrist };
  switch (joint) {
    case 'bowElbow': return [bow.elbow];
    case 'bowShoulder': return [bow.shoulder];
    case 'bowWrist': return [bow.wrist];
    case 'drawElbow': return [draw.elbow];
    case 'drawWrist': return [draw.wrist];
    case 'drawShoulder': return [draw.shoulder];
    case 'head': return [LM.nose];
    case 'torso': return [LM.leftHip, LM.rightHip, LM.leftShoulder, LM.rightShoulder];
    case 'shoulders': return [LM.leftShoulder, LM.rightShoulder];
  }
}

export interface DrawOptions {
  /** Destination rectangle for the video frame inside the canvas. */
  x: number;
  y: number;
  width: number;
  height: number;
  handedness: ArcherHandedness;
  highlight?: JointName[];
  dim?: boolean;
}

/** Draws the tracked skeleton: bow arm in volt cyan, draw arm in blaze orange. */
export function drawSkeleton(context: CanvasRenderingContext2D, image: Float32Array, options: DrawOptions): void {
  const point = (index: number) => ({ x: options.x + image[index * 4] * options.width, y: options.y + image[index * 4 + 1] * options.height, v: image[index * 4 + 3] });
  const bowSide = new Set(options.handedness === 'left' ? [12, 14, 16, 18, 20, 22] : [11, 13, 15, 17, 19, 21]);
  const drawSide = new Set(options.handedness === 'left' ? [11, 13, 15, 17, 19, 21] : [12, 14, 16, 18, 20, 22]);
  const scale = Math.max(1, Math.min(options.width, options.height) / 360);
  context.save();
  context.globalAlpha = options.dim ? 0.45 : 1;
  context.lineCap = 'round';
  for (const [a, b] of SKELETON) {
    const p = point(a);
    const q = point(b);
    if (p.v < 0.35 || q.v < 0.35) continue;
    const color = bowSide.has(a) && bowSide.has(b) ? '#2ee6ff' : drawSide.has(a) && drawSide.has(b) ? '#ff6b1a' : 'rgba(243,246,250,0.75)';
    context.strokeStyle = color;
    context.lineWidth = 3 * scale;
    context.beginPath();
    context.moveTo(p.x, p.y);
    context.lineTo(q.x, q.y);
    context.stroke();
  }
  for (let index = 0; index < 33; index += 1) {
    if (index > 0 && index < 11) continue;
    const p = point(index);
    if (p.v < 0.35) continue;
    context.fillStyle = '#f3f6fa';
    context.beginPath();
    context.arc(p.x, p.y, 2.6 * scale, 0, Math.PI * 2);
    context.fill();
  }
  for (const joint of options.highlight ?? []) {
    for (const index of jointIndices(joint, options.handedness)) {
      const p = point(index);
      if (p.v < 0.2) continue;
      context.strokeStyle = '#ffc53d';
      context.lineWidth = 3 * scale;
      context.beginPath();
      context.arc(p.x, p.y, 13 * scale, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = 'rgba(255,197,61,0.22)';
      context.fill();
    }
  }
  context.restore();
}

/** Where a video of the given size sits inside a box with object-fit: contain. */
export function containRect(boxWidth: number, boxHeight: number, videoWidth: number, videoHeight: number) {
  if (!videoWidth || !videoHeight) return { x: 0, y: 0, width: boxWidth, height: boxHeight };
  const scale = Math.min(boxWidth / videoWidth, boxHeight / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  return { x: (boxWidth - width) / 2, y: (boxHeight - height) / 2, width, height };
}
