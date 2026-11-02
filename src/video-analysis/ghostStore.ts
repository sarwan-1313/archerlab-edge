import { bestShot, pointsFromSample, sampleNear, type Point2 } from './ghost';
import type { ShotReport, VideoAnalysisReport } from './types';

/**
 * The athlete's reference shot for the ghost overlay in Live Analysis: the
 * pose at full draw (just before the release) and at the end of the follow
 * through, from a video report. Kept on this device only.
 */

export const GHOST_KEY = 'archerlab-edge:ghost-reference';

export interface GhostReference {
  reportId: string;
  shotIndex: number;
  fileName: string;
  createdAt: number;
  formScore: number | null;
  handedness: 'left' | 'right';
  /** Width / height of the source clip, so the skeleton keeps its shape. */
  aspect: number;
  fullDraw: Point2[];
  followThrough: Point2[] | null;
}

const round = (points: Point2[]) => points.map((point) => ({ x: Number(point.x.toFixed(4)), y: Number(point.y.toFixed(4)), v: Number(point.v.toFixed(2)) }));

/** Builds a reference from a shot, or null when the shot's key moments were not tracked. */
export function ghostFromShot(report: VideoAnalysisReport, shot: ShotReport | null = bestShot(report)): GhostReference | null {
  if (!shot) return null;
  const fullDraw = pointsFromSample(sampleNear(report.samples, shot.release - 0.15, 0.3));
  if (!fullDraw) return null;
  const after = shot.followThroughEnd ?? shot.release + 1;
  const followThrough = pointsFromSample(sampleNear(report.samples, Math.min(after, shot.release + 1.2), 0.4));
  const aspect = report.source.width && report.source.height ? report.source.width / report.source.height : 16 / 9;
  return {
    reportId: report.id,
    shotIndex: shot.index,
    fileName: report.source.fileName,
    createdAt: Date.now(),
    formScore: shot.formScore,
    handedness: report.settings.handedness,
    aspect,
    fullDraw: round(fullDraw),
    followThrough: followThrough ? round(followThrough) : null,
  };
}

function isPoints(value: unknown): value is Point2[] {
  return Array.isArray(value) && value.length === 33 && value.every((point) => point && typeof point.x === 'number' && typeof point.y === 'number' && typeof point.v === 'number');
}

export function isGhostReference(value: unknown): value is GhostReference {
  if (!value || typeof value !== 'object') return false;
  const ghost = value as Partial<GhostReference>;
  return typeof ghost.reportId === 'string' && typeof ghost.aspect === 'number' && ghost.aspect > 0 && isPoints(ghost.fullDraw)
    && (ghost.followThrough === null || isPoints(ghost.followThrough));
}

export function loadGhost(): GhostReference | null {
  try {
    const raw = localStorage.getItem(GHOST_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isGhostReference(parsed) ? parsed : null;
  } catch { return null; }
}

export function saveGhost(ghost: GhostReference | null): void {
  try {
    if (ghost) localStorage.setItem(GHOST_KEY, JSON.stringify(ghost));
    else localStorage.removeItem(GHOST_KEY);
  } catch { /* lasts for this page only */ }
}
