import type { ShotReport } from './types';

/**
 * Shot rhythm: how long each part of the shot took (draw, hold at anchor,
 * follow-through), and how consistent that timing is from shot to shot.
 * Consistent timing is one of the clearest signs of a repeatable shot.
 */

export interface RhythmRow {
  index: number;
  /** Seconds from the start of the draw to reaching anchor. */
  draw: number | null;
  /** Seconds held at anchor before the release. */
  hold: number | null;
  /** Seconds of follow-through after the release. */
  follow: number | null;
  total: number | null;
}

export interface Spread { mean: number; sd: number; cv: number; count: number }
export type Steadiness = 'very steady' | 'steady' | 'varies' | 'varies a lot';

export function rhythmRows(shots: readonly ShotReport[]): RhythmRow[] {
  return shots.filter((shot) => shot.source !== 'audio-only').map((shot) => {
    const draw = shot.drawStart !== null && shot.anchorStart !== null && shot.anchorStart > shot.drawStart ? shot.anchorStart - shot.drawStart : null;
    const hold = shot.anchorStart !== null && shot.release > shot.anchorStart ? shot.release - shot.anchorStart : null;
    const follow = shot.followThroughEnd !== null && shot.followThroughEnd > shot.release ? shot.followThroughEnd - shot.release : null;
    const start = shot.drawStart ?? shot.anchorStart;
    return { index: shot.index, draw, hold, follow, total: start !== null ? shot.release - start + (follow ?? 0) : null };
  });
}

export function spread(values: ReadonlyArray<number | null>): Spread | null {
  const list = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (list.length < 2) return null;
  const mean = list.reduce((sum, value) => sum + value, 0) / list.length;
  const sd = Math.sqrt(list.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (list.length - 1));
  return { mean, sd, cv: mean > 0 ? sd / mean : 0, count: list.length };
}

export function steadiness(value: Spread | null): Steadiness | null {
  if (!value) return null;
  if (value.cv < 0.1) return 'very steady';
  if (value.cv < 0.2) return 'steady';
  if (value.cv < 0.35) return 'varies';
  return 'varies a lot';
}

/** Shots whose hold was far from the usual (more than 1.25 standard deviations, and at least half a second). */
export function outlierShots(rows: readonly RhythmRow[]): number[] {
  const holds = spread(rows.map((row) => row.hold));
  if (!holds || holds.count < 3) return [];
  return rows.filter((row) => row.hold !== null && Math.abs(row.hold - holds.mean) > Math.max(1.25 * holds.sd, 0.5)).map((row) => row.index);
}
