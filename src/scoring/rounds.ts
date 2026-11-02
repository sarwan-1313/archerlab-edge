/**
 * Round presets for scoring. Arrow counts, distances and end times follow
 * World Archery's standard rounds; clubs can use "Practice" for anything else.
 */

/** `full`: every ring from 10 to 1. `spot`: the inner rings only (10 to 6; anything outside is a miss), as on indoor triple spots and compound faces. */
export type FaceKind = 'full' | 'spot';

export interface TargetFace {
  id: string;
  label: string;
  kind: FaceKind;
  sizeCm: number;
}

export const FACES: readonly TargetFace[] = [
  { id: '122-full', label: '122 cm, 10 rings', kind: 'full', sizeCm: 122 },
  { id: '80-full', label: '80 cm, 10 rings', kind: 'full', sizeCm: 80 },
  { id: '80-spot', label: '80 cm, 6-ring (compound)', kind: 'spot', sizeCm: 80 },
  { id: '60-full', label: '60 cm, 10 rings', kind: 'full', sizeCm: 60 },
  { id: '40-full', label: '40 cm, 10 rings', kind: 'full', sizeCm: 40 },
  { id: '40-spot', label: '40 cm triple spot', kind: 'spot', sizeCm: 40 },
];

export interface RoundPreset {
  id: string;
  name: string;
  distanceM: number;
  ends: number;
  arrowsPerEnd: number;
  faceId: string;
  /** Shooting time per end, as at a World Archery event. */
  secondsPerEnd: number;
  description: string;
}

export const ROUNDS: readonly RoundPreset[] = [
  { id: 'wa-720-70', name: 'WA 720 (70 m)', distanceM: 70, ends: 12, arrowsPerEnd: 6, faceId: '122-full', secondsPerEnd: 240, description: 'Outdoor recurve qualification: 72 arrows at 70 m.' },
  { id: 'wa-720-60', name: 'WA 720 (60 m)', distanceM: 60, ends: 12, arrowsPerEnd: 6, faceId: '122-full', secondsPerEnd: 240, description: 'Under-18 and masters recurve: 72 arrows at 60 m.' },
  { id: 'wa-720-50c', name: 'WA 720 compound (50 m)', distanceM: 50, ends: 12, arrowsPerEnd: 6, faceId: '80-spot', secondsPerEnd: 240, description: 'Outdoor compound qualification: 72 arrows at 50 m on the 6-ring face.' },
  { id: 'wa-720-50b', name: 'WA 720 barebow (50 m)', distanceM: 50, ends: 12, arrowsPerEnd: 6, faceId: '122-full', secondsPerEnd: 240, description: 'Outdoor barebow: 72 arrows at 50 m.' },
  { id: 'wa-18', name: 'WA 18 m indoor', distanceM: 18, ends: 20, arrowsPerEnd: 3, faceId: '40-spot', secondsPerEnd: 120, description: 'Indoor: 60 arrows at 18 m, three per end.' },
  { id: 'wa-18-full', name: 'WA 18 m indoor (single face)', distanceM: 18, ends: 20, arrowsPerEnd: 3, faceId: '40-full', secondsPerEnd: 120, description: 'Indoor on a full 40 cm face, as used for barebow and beginners.' },
  { id: 'wa-900', name: 'WA 900', distanceM: 60, ends: 15, arrowsPerEnd: 6, faceId: '122-full', secondsPerEnd: 240, description: '90 arrows: 30 each at 60, 50 and 40 m (enter the distance you are shooting).' },
  { id: 'practice', name: 'Practice', distanceM: 18, ends: 10, arrowsPerEnd: 6, faceId: '122-full', secondsPerEnd: 240, description: 'Set your own distance, ends and arrows.' },
];

export function faceById(id: string): TargetFace {
  return FACES.find((face) => face.id === id) ?? FACES[0];
}

export function roundById(id: string): RoundPreset {
  return ROUNDS.find((round) => round.id === id) ?? ROUNDS[ROUNDS.length - 1];
}

/** The most a round can score. */
export function maxRoundScore(round: Pick<RoundPreset, 'ends' | 'arrowsPerEnd'>): number {
  return round.ends * round.arrowsPerEnd * 10;
}
