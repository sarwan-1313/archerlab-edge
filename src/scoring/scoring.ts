import type { FaceKind, RoundPreset, TargetFace } from './rounds';

/**
 * Scoring and grouping on a target face. Positions are normalised so the
 * face drawn on screen is the unit circle: x to the right, y downwards, (0, 0)
 * the centre. On a full face that circle is the edge of the 1 ring; on a spot
 * face it is the edge of the 6 ring.
 */

export interface Arrow {
  /** Null when the score was entered with a button rather than placed on the face. */
  x: number | null;
  y: number | null;
  score: number;
  isX: boolean;
  /** Heart rate when the arrow was scored, from a connected monitor. */
  hr?: number;
}

export type End = Arrow[];

export interface ScoredPoint { score: number; isX: boolean }

/** Ring width in face units, and the radius of the X ring. */
function geometry(kind: FaceKind) {
  return kind === 'full' ? { rings: 10, width: 0.1, x: 0.05 } : { rings: 5, width: 0.2, x: 0.1 };
}

/** The score of an arrow at (x, y). An arrow on a line scores the higher ring. */
export function scorePoint(x: number, y: number, kind: FaceKind): ScoredPoint {
  const radius = Math.hypot(x, y);
  const { rings, width, x: xRadius } = geometry(kind);
  if (!Number.isFinite(radius) || radius > rings * width + 1e-9) return { score: 0, isX: false };
  const ring = Math.max(0, Math.ceil(radius / width - 1e-9) - 1);
  const score = 10 - ring;
  return { score, isX: score === 10 && radius <= xRadius + 1e-9 };
}

export function arrowAt(x: number, y: number, kind: FaceKind): Arrow {
  return { x, y, ...scorePoint(x, y, kind) };
}

/** An arrow entered by value: "X", "10" … "1", or "M". */
export function arrowFromLabel(label: string): Arrow {
  if (label === 'X') return { x: null, y: null, score: 10, isX: true };
  if (label === 'M') return { x: null, y: null, score: 0, isX: false };
  const score = Number(label);
  return { x: null, y: null, score: Number.isInteger(score) && score >= 1 && score <= 10 ? score : 0, isX: false };
}

export const arrowLabel = (arrow: Arrow) => (arrow.isX ? 'X' : arrow.score === 0 ? 'M' : String(arrow.score));

/** The buttons for entering a score on this face, best first. */
export function scoreButtons(kind: FaceKind): string[] {
  return kind === 'full' ? ['X', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1', 'M'] : ['X', '10', '9', '8', '7', '6', 'M'];
}

/** Arrows in an end are written best first on a score sheet. */
export function sortEnd(end: End): End {
  return [...end].sort((a, b) => (b.score - a.score) || (Number(b.isX) - Number(a.isX)));
}

export const endTotal = (end: End) => end.reduce((sum, arrow) => sum + arrow.score, 0);

export interface RoundTotals {
  arrows: number;
  total: number;
  average: number | null;
  tens: number;
  xs: number;
  misses: number;
  /** Running total after each end. */
  running: number[];
}

export function roundTotals(ends: readonly End[]): RoundTotals {
  const all = ends.flat();
  const running: number[] = [];
  let sum = 0;
  for (const end of ends) { sum += endTotal(end); running.push(sum); }
  return {
    arrows: all.length,
    total: sum,
    average: all.length ? sum / all.length : null,
    tens: all.filter((arrow) => arrow.score === 10).length,
    xs: all.filter((arrow) => arrow.isX).length,
    misses: all.filter((arrow) => arrow.score === 0).length,
    running,
  };
}

export interface Grouping {
  /** How many placed arrows it is based on. */
  count: number;
  centre: { x: number; y: number };
  /** Mean distance of the arrows from their own centre, in face units. */
  meanSpread: number;
  /** The widest distance between any two arrows, in face units. */
  extremeSpread: number;
  /** Where the group sits on the face, e.g. "high left", or "centred". */
  direction: string;
  /** How far the group's centre is from the middle of the face, in face units. */
  offset: number;
}

/** Group size and position, from arrows placed on the face. Null below three arrows. */
export function grouping(arrows: readonly Arrow[]): Grouping | null {
  const placed = arrows.filter((arrow): arrow is Arrow & { x: number; y: number } => arrow.x !== null && arrow.y !== null && arrow.score > 0);
  if (placed.length < 3) return null;
  const centre = {
    x: placed.reduce((sum, arrow) => sum + arrow.x, 0) / placed.length,
    y: placed.reduce((sum, arrow) => sum + arrow.y, 0) / placed.length,
  };
  const meanSpread = placed.reduce((sum, arrow) => sum + Math.hypot(arrow.x - centre.x, arrow.y - centre.y), 0) / placed.length;
  let extremeSpread = 0;
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) extremeSpread = Math.max(extremeSpread, Math.hypot(placed[i].x - placed[j].x, placed[i].y - placed[j].y));
  }
  return { count: placed.length, centre, meanSpread, extremeSpread, direction: directionOf(centre), offset: Math.hypot(centre.x, centre.y) };
}

/** A plain-words position: "centred" near the middle, otherwise "high", "low left" and so on. */
export function directionOf(point: { x: number; y: number }, centredWithin = 0.08): string {
  const distance = Math.hypot(point.x, point.y);
  if (distance <= centredWithin) return 'centred';
  const parts: string[] = [];
  // A component counts when it is at least 40% of the offset, so a mostly-left group reads "left", not "low left".
  if (Math.abs(point.y) >= distance * 0.4) parts.push(point.y < 0 ? 'high' : 'low');
  if (Math.abs(point.x) >= distance * 0.4) parts.push(point.x < 0 ? 'left' : 'right');
  return parts.join(' ');
}

/** Converts face units to centimetres on the real face. */
export function toCm(units: number, face: Pick<TargetFace, 'sizeCm' | 'kind'>): number {
  // The drawn circle is the whole face on a full face, and the 6 ring (half the width) on a spot.
  const radiusCm = face.kind === 'full' ? face.sizeCm / 2 : face.sizeCm / 4;
  return units * radiusCm;
}

/** Common causes to check for a group that sits off centre, for a right-handed archer (mirrored for left-handed). Not a diagnosis. */
export function groupingHints(direction: string, handedness: 'left' | 'right' = 'right'): string[] {
  if (direction === 'centred') return [];
  const mirrored = handedness === 'left' ? direction.replace(/left|right/g, (side) => (side === 'left' ? 'right' : 'left')) : direction;
  const hints: string[] = [];
  if (mirrored.includes('left')) hints.push('Plucking the string away from the face, or a dropping/collapsing bow arm at release.');
  if (mirrored.includes('right')) hints.push('Gripping or torquing the bow, or the string hand creeping forward.');
  if (mirrored.includes('high')) hints.push('Peeking (lifting the head) at release, or a heel-heavy bow hand.');
  if (mirrored.includes('low')) hints.push('Dropping the bow arm, creeping before release, or under-drawing on tired arrows.');
  hints.push('If every group sits in the same place with good form, move the sight towards the group instead.');
  return hints;
}

/** The round as an archer would write it in a log. */
export interface ScoredRound {
  id: string;
  roundId: string;
  name: string;
  faceId: string;
  distanceM: number;
  arrowsPerEnd: number;
  plannedEnds: number;
  startedAt: number;
  ends: End[];
  /** The bow used, from Equipment. */
  bow?: string;
}

export function newRound(preset: RoundPreset, overrides: Partial<Pick<RoundPreset, 'distanceM' | 'ends' | 'arrowsPerEnd' | 'faceId'>> & { bow?: string } = {}, now = Date.now()): ScoredRound {
  return {
    id: `round:${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    roundId: preset.id,
    name: preset.name,
    faceId: overrides.faceId ?? preset.faceId,
    distanceM: overrides.distanceM ?? preset.distanceM,
    arrowsPerEnd: overrides.arrowsPerEnd ?? preset.arrowsPerEnd,
    plannedEnds: overrides.ends ?? preset.ends,
    startedAt: now,
    ends: [[]],
    ...(overrides.bow ? { bow: overrides.bow } : {}),
  };
}

/** Adds an arrow to the current end, starting a new end when the current one is full. Returns a new round. */
export function addArrow(round: ScoredRound, arrow: Arrow): ScoredRound {
  const ends = round.ends.map((end) => [...end]);
  if (ends[ends.length - 1].length >= round.arrowsPerEnd) ends.push([]);
  ends[ends.length - 1].push(arrow);
  return { ...round, ends };
}

/** Removes the last arrow (going back into the previous end when the current one is empty). */
export function undoArrow(round: ScoredRound): ScoredRound {
  const ends = round.ends.map((end) => [...end]);
  if (!ends[ends.length - 1].length && ends.length > 1) ends.pop();
  ends[ends.length - 1].pop();
  return { ...round, ends };
}

export function completedEnds(round: ScoredRound): number {
  return round.ends.filter((end) => end.length >= round.arrowsPerEnd).length;
}

export function isComplete(round: ScoredRound): boolean {
  return completedEnds(round) >= round.plannedEnds;
}

export function isScoredRound(value: unknown): value is ScoredRound {
  if (!value || typeof value !== 'object') return false;
  const round = value as Partial<ScoredRound>;
  return typeof round.id === 'string' && typeof round.name === 'string' && typeof round.faceId === 'string'
    && typeof round.arrowsPerEnd === 'number' && round.arrowsPerEnd > 0 && typeof round.plannedEnds === 'number'
    && Array.isArray(round.ends) && round.ends.every((end) => Array.isArray(end) && end.every((arrow) => arrow && typeof (arrow as Arrow).score === 'number'));
}
