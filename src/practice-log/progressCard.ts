import { entriesInWeek, streaks, totals } from './aggregate';
import type { PracticeEntry } from './types';

/** What goes on a shareable progress card. */
export interface CardStats {
  weekArrows: number;
  weekSessions: number;
  streak: number;
  /** The most recent form score from a video analysis, with the one before it for the change. */
  formScore: number | null;
  formChange: number | null;
  bestRound: { name: string; total: number; arrows: number; distanceM: number | null } | null;
  totalArrows: number;
}

export function cardStats(entries: readonly PracticeEntry[], now = Date.now()): CardStats {
  const week = totals(entriesInWeek(entries, now));
  const withForm = entries.filter((entry) => entry.formScore !== null).sort((a, b) => b.date - a.date);
  const rounds = entries.filter((entry) => entry.source === 'round' && entry.totalScore !== null && entry.round);
  const best = rounds.sort((a, b) => (b.averageScore ?? 0) - (a.averageScore ?? 0))[0];
  return {
    weekArrows: week.arrows,
    weekSessions: week.sessions,
    streak: streaks(entries, now).current,
    formScore: withForm[0]?.formScore ?? null,
    formChange: withForm.length > 1 && withForm[0].formScore !== null && withForm[1].formScore !== null ? withForm[0].formScore - withForm[1].formScore : null,
    bestRound: best ? { name: best.round!.name, total: best.totalScore!, arrows: best.arrows, distanceM: best.distanceM ?? null } : null,
    totalArrows: entries.reduce((sum, entry) => sum + entry.arrows, 0),
  };
}
