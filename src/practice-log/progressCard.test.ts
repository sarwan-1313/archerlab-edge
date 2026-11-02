import { describe, expect, it } from 'vitest';
import { cardStats } from './progressCard';
import type { PracticeEntry } from './types';

const base = { averageScore: null, totalScore: null, scoredArrows: 0, formScore: null, focusAreas: [] };
const now = new Date(2026, 10, 4, 12).getTime();
const day = 86_400_000;

describe('progress card', () => {
  it('sums this week, the latest form score and the best round', () => {
    const entries: PracticeEntry[] = [
      { ...base, id: 'a', source: 'manual', date: now - day, arrows: 60 },
      { ...base, id: 'b', source: 'video', date: now, arrows: 12, formScore: 74 },
      { ...base, id: 'c', source: 'video', date: now - 20 * day, arrows: 10, formScore: 70 },
      { ...base, id: 'd', source: 'round', date: now - 30 * day, arrows: 72, totalScore: 600, averageScore: 600 / 72, round: { name: 'WA 720 (70 m)', faceId: '122-full', arrowsPerEnd: 6, ends: [] }, distanceM: 70 },
      { ...base, id: 'e', source: 'round', date: now - 40 * day, arrows: 60, totalScore: 480, averageScore: 8, round: { name: 'WA 18 m indoor', faceId: '40-spot', arrowsPerEnd: 3, ends: [] }, distanceM: 18 },
    ];
    const stats = cardStats(entries, now);
    expect(stats.weekArrows).toBe(72);
    expect(stats.weekSessions).toBe(2);
    expect(stats.streak).toBe(2);
    expect(stats.formScore).toBe(74);
    expect(stats.formChange).toBe(4);
    expect(stats.bestRound).toEqual({ name: 'WA 720 (70 m)', total: 600, arrows: 72, distanceM: 70 });
    expect(stats.totalArrows).toBe(214);
  });
  it('copes with an empty log', () => {
    expect(cardStats([], now)).toMatchObject({ weekArrows: 0, formScore: null, bestRound: null, streak: 0 });
  });
});
