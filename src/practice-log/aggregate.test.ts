import { describe, expect, it } from 'vitest';
import { addDays, dayKey, entriesInWeek, goalProgress, heatmap, startOfWeek, streaks, totals, weeklySeries } from './aggregate';
import { manualEntry } from './sources';
import { EMPTY_GOALS, type PracticeEntry } from './types';

// Local times, so the tests hold in any time zone. 2026-10-29 is a Thursday.
const at = (month: number, day: number, hour = 10) => new Date(2026, month - 1, day, hour).getTime();
const NOW = at(10, 29, 18);

function entry(date: number, arrows: number, extra: Partial<PracticeEntry> = {}): PracticeEntry {
  return { id: `e-${date}-${arrows}`, source: 'manual', date, arrows, averageScore: null, totalScore: null, scoredArrows: 0, formScore: null, focusAreas: [], ...extra };
}

describe('weeks', () => {
  it('starts weeks on Monday at local midnight', () => {
    expect(dayKey(startOfWeek(NOW))).toBe('2026-10-26');
    expect(dayKey(startOfWeek(at(10, 26, 0)))).toBe('2026-10-26');
    // Sunday belongs to the week that started six days earlier.
    expect(dayKey(startOfWeek(at(11, 1, 23)))).toBe('2026-10-26');
  });

  it('adds calendar days across a daylight-saving change', () => {
    expect(dayKey(addDays(new Date(2026, 2, 28), 2))).toBe('2026-03-30');
    expect(dayKey(addDays(new Date(2026, 9, 24), 7))).toBe('2026-10-31');
  });

  it('buckets entries into weeks, oldest first, including empty weeks', () => {
    const series = weeklySeries([entry(at(10, 27), 60), entry(at(10, 29), 30), entry(at(10, 13), 72)], 3, NOW);
    expect(series.map((week) => [week.key, week.arrows, week.sessions])).toEqual([
      ['2026-10-12', 72, 1],
      ['2026-10-19', 0, 0],
      ['2026-10-26', 90, 2],
    ]);
  });

  it('finds this week’s entries only', () => {
    const entries = [entry(at(10, 25, 23), 10), entry(at(10, 26, 0), 20), entry(at(11, 1, 23), 30), entry(at(11, 2, 0), 40)];
    expect(entriesInWeek(entries, NOW).map((item) => item.arrows)).toEqual([20, 30]);
  });
});

describe('averages', () => {
  it('weights the average score by scored arrows and ignores unscored entries', () => {
    const result = totals([
      manualEntry({ date: at(10, 27), arrows: 60, totalScore: 480 }, 'a'), // 8.0 over 60
      manualEntry({ date: at(10, 28), arrows: 30, totalScore: 270 }, 'b'), // 9.0 over 30
      manualEntry({ date: at(10, 29), arrows: 40, totalScore: null }, 'c'),
    ]);
    expect(result.arrows).toBe(130);
    expect(result.sessions).toBe(3);
    expect(result.averageScore).toBeCloseTo((480 + 270) / 90);
  });

  it('averages form scores per entry and returns null when there are none', () => {
    expect(totals([entry(NOW, 10, { formScore: 60 }), entry(NOW, 10, { formScore: 70 }), entry(NOW, 10)]).formScore).toBe(65);
    expect(totals([entry(NOW, 10)])).toEqual({ sessions: 1, arrows: 10, averageScore: null, formScore: null });
    expect(totals([])).toEqual({ sessions: 0, arrows: 0, averageScore: null, formScore: null });
  });
});

describe('streaks', () => {
  it('counts consecutive days ending today', () => {
    const entries = [at(10, 27), at(10, 28), at(10, 29), at(10, 29, 20)].map((date) => entry(date, 30));
    expect(streaks(entries, NOW)).toEqual({ current: 3, longest: 3 });
  });

  it('keeps the streak alive until today is over, and breaks it after a missed day', () => {
    const entries = [at(10, 27), at(10, 28)].map((date) => entry(date, 30));
    expect(streaks(entries, NOW).current).toBe(2);
    expect(streaks(entries, at(10, 30, 9)).current).toBe(0);
  });

  it('finds the longest run across gaps', () => {
    const entries = [at(10, 1), at(10, 2), at(10, 3), at(10, 4), at(10, 10), at(10, 28)].map((date) => entry(date, 30));
    expect(streaks(entries, NOW)).toEqual({ current: 1, longest: 4 });
    expect(streaks([], NOW)).toEqual({ current: 0, longest: 0 });
  });
});

describe('heatmap', () => {
  it('lays out Monday–Sunday columns ending with this week and marks future days', () => {
    const grid = heatmap([entry(at(10, 27), 60), entry(at(10, 27, 18), 12), entry(at(10, 20), 0)], 2, NOW);
    expect(grid).toHaveLength(2);
    expect(grid[0][0].key).toBe('2026-10-19');
    expect(grid[0][1]).toMatchObject({ key: '2026-10-20', arrows: 0, trained: true });
    expect(grid[1][1]).toMatchObject({ key: '2026-10-27', arrows: 72, trained: true });
    expect(grid[1][3].future).toBe(false);
    expect(grid[1][4].future).toBe(true);
  });
});

describe('goalProgress', () => {
  it('measures this week against the targets, capped at 1', () => {
    const entries = [entry(at(10, 26), 200), entry(at(10, 28), 150), entry(at(10, 20), 500)];
    expect(goalProgress(entries, { ...EMPTY_GOALS, weeklyArrows: 300, weeklySessions: 3 }, NOW)).toEqual({ arrows: 350, sessions: 2, arrowsFraction: 1, sessionsFraction: 2 / 3 });
    expect(goalProgress(entries, EMPTY_GOALS, NOW).arrowsFraction).toBeNull();
  });
});
