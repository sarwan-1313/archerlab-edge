import type { Arrow } from './scoring';

/** An arrow drawn on the target face. */
export interface FaceMarker { x: number; y: number; tone?: 'current' | 'earlier'; label?: string }

/** Markers for arrows placed on the face. Arrows entered with a button have no position and are left out. */
export function markersFor(arrows: readonly Arrow[], tone: FaceMarker['tone'], numbered = false): FaceMarker[] {
  const markers: FaceMarker[] = [];
  arrows.forEach((arrow, index) => {
    if (arrow.x !== null && arrow.y !== null) markers.push({ x: arrow.x, y: arrow.y, tone, label: numbered ? String(index + 1) : undefined });
  });
  return markers;
}
