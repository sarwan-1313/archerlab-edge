import type { VideoAnalysisReport } from './types';

/** How far apart two releases may be and still be the same shot, seconds. */
const SAME_SHOT_S = 0.15;

/**
 * Scoring a report again builds its shots afresh. This keeps what the athlete or a coach added: each shot's
 * note goes to the new shot released closest to it (within 0.15 s), and the coach's labels are kept as they are.
 */
export function carryOverAnnotations(previous: VideoAnalysisReport, next: VideoAnalysisReport): VideoAnalysisReport {
  const shots = next.shots.map((shot) => {
    if (shot.notes) return shot;
    let best: { notes: string; gap: number } | null = null;
    for (const old of previous.shots) {
      if (!old.notes) continue;
      const gap = Math.abs(old.release - shot.release);
      if (gap <= SAME_SHOT_S && (!best || gap < best.gap)) best = { notes: old.notes, gap };
    }
    return best ? { ...shot, notes: best.notes } : shot;
  });
  return { ...next, shots, ...(previous.labels ? { labels: previous.labels } : {}) };
}
