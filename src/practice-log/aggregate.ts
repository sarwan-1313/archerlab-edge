import type { PracticeEntry, PracticeGoals } from './types';

/**
 * Pure aggregation over the practice log. Days and weeks are in the device's
 * local time; weeks start on Monday (ISO 8601).
 */

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(time: number | Date): string {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Local midnight at the start of the Monday of the week containing `time`. */
export function startOfWeek(time: number | Date): Date {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date;
}

/** Adds whole calendar days (safe across daylight-saving changes). */
export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export interface Totals {
  sessions: number;
  arrows: number;
  /** Mean arrow score, weighted by the arrows each entry's scores cover. */
  averageScore: number | null;
  /** Mean of the entries' form scores. */
  formScore: number | null;
}

export function totals(entries: readonly PracticeEntry[]): Totals {
  let arrows = 0;
  let scoreSum = 0;
  let scored = 0;
  let formSum = 0;
  let forms = 0;
  for (const entry of entries) {
    arrows += entry.arrows;
    if (entry.averageScore !== null && entry.scoredArrows > 0) {
      scoreSum += entry.averageScore * entry.scoredArrows;
      scored += entry.scoredArrows;
    }
    if (entry.formScore !== null) { formSum += entry.formScore; forms += 1; }
  }
  return {
    sessions: entries.length,
    arrows,
    averageScore: scored ? scoreSum / scored : null,
    formScore: forms ? formSum / forms : null,
  };
}

export interface WeekBucket extends Totals {
  /** Monday of the week, local midnight. */
  start: Date;
  key: string;
}

/** The last `count` weeks up to and including the week of `now`, oldest first; empty weeks included. */
export function weeklySeries(entries: readonly PracticeEntry[], count: number, now: number = Date.now()): WeekBucket[] {
  const thisWeek = startOfWeek(now);
  const byWeek = new Map<string, PracticeEntry[]>();
  for (const entry of entries) {
    const key = dayKey(startOfWeek(entry.date));
    byWeek.set(key, [...(byWeek.get(key) ?? []), entry]);
  }
  const weeks: WeekBucket[] = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const start = addDays(thisWeek, -7 * index);
    const key = dayKey(start);
    weeks.push({ start, key, ...totals(byWeek.get(key) ?? []) });
  }
  return weeks;
}

export function entriesInWeek(entries: readonly PracticeEntry[], now: number = Date.now()): PracticeEntry[] {
  const start = startOfWeek(now).getTime();
  const end = addDays(new Date(start), 7).getTime();
  return entries.filter((entry) => entry.date >= start && entry.date < end);
}

/** Arrows shot on each local day that has an entry (an entry with 0 arrows still marks the day). */
export function arrowsByDay(entries: readonly PracticeEntry[]): Map<string, number> {
  const days = new Map<string, number>();
  for (const entry of entries) days.set(dayKey(entry.date), (days.get(dayKey(entry.date)) ?? 0) + entry.arrows);
  return days;
}

export interface Streaks {
  /** Consecutive training days ending today, or ending yesterday when today has no training yet. */
  current: number;
  longest: number;
}

export function streaks(entries: readonly PracticeEntry[], now: number = Date.now()): Streaks {
  const days = new Set(entries.map((entry) => dayKey(entry.date)));
  if (!days.size) return { current: 0, longest: 0 };
  // Walk calendar days rather than adding 24 h, so daylight-saving days count once.
  const sorted = [...days].sort();
  let longest = 1;
  let run = 1;
  for (let index = 1; index < sorted.length; index += 1) {
    const expected = dayKey(addDays(parseDay(sorted[index - 1]), 1));
    run = sorted[index] === expected ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  let cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  if (!days.has(dayKey(cursor))) cursor = addDays(cursor, -1);
  let current = 0;
  while (days.has(dayKey(cursor))) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  return { current, longest };
}

function parseDay(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export interface HeatmapDay { key: string; date: Date; arrows: number; trained: boolean; future: boolean }

/** `weeks` columns of Monday–Sunday days ending with the week of `now`, oldest first. */
export function heatmap(entries: readonly PracticeEntry[], weeks: number, now: number = Date.now()): HeatmapDay[][] {
  const counts = arrowsByDay(entries);
  const today = dayKey(now);
  const first = addDays(startOfWeek(now), -7 * (weeks - 1));
  return Array.from({ length: weeks }, (_, week) => Array.from({ length: 7 }, (_, day) => {
    const date = addDays(first, week * 7 + day);
    const key = dayKey(date);
    return { key, date, arrows: counts.get(key) ?? 0, trained: counts.has(key), future: key > today };
  }));
}

export interface GoalProgress {
  arrows: number;
  sessions: number;
  /** 0–1 (capped), or null without a target. */
  arrowsFraction: number | null;
  sessionsFraction: number | null;
}

export function goalProgress(entries: readonly PracticeEntry[], goals: PracticeGoals, now: number = Date.now()): GoalProgress {
  const week = totals(entriesInWeek(entries, now));
  const fraction = (value: number, target: number | null) => (target && target > 0 ? Math.min(1, value / target) : null);
  return {
    arrows: week.arrows,
    sessions: week.sessions,
    arrowsFraction: fraction(week.arrows, goals.weeklyArrows),
    sessionsFraction: fraction(week.sessions, goals.weeklySessions),
  };
}
