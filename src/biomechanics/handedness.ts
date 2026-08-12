import type { ArcherHandedness, BodySide } from '../types/biomechanics';

/** Archery handedness describes the drawing/string hand, so the bow arm is opposite. */
export function getBowSide(handedness: ArcherHandedness): BodySide {
  return handedness === 'right' ? 'left' : 'right';
}

export function getDrawSide(handedness: ArcherHandedness): BodySide {
  return handedness;
}

