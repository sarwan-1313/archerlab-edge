import type { PracticeEntry } from '../practice-log/types';
import { faceById } from './rounds';
import { roundTotals, type ScoredRound } from './scoring';

/** The practice log entry for a scored round. Re-saving the same round replaces its entry. */
export function entryFromRound(round: ScoredRound, notes?: string): PracticeEntry {
  const ends = round.ends.filter((end) => end.length > 0);
  const totals = roundTotals(ends);
  return {
    id: round.id,
    source: 'round',
    date: round.startedAt,
    arrows: totals.arrows,
    averageScore: totals.average,
    totalScore: totals.arrows ? totals.total : null,
    scoredArrows: totals.arrows,
    formScore: null,
    focusAreas: [],
    distanceM: round.distanceM,
    targetFace: faceById(round.faceId).label,
    ...(notes?.trim() ? { notes: notes.trim() } : {}),
    ...(round.bow ? { equipment: round.bow } : {}),
    round: { name: round.name, faceId: round.faceId, arrowsPerEnd: round.arrowsPerEnd, ends },
  };
}
