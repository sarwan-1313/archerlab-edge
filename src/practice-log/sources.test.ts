import { describe, expect, it } from 'vitest';
import type { ShotAnalysis } from '../types/shotAnalysis';
import type { VideoAnalysisReport } from '../video-analysis/types';
import { entryFromLiveSession, entryFromVideoReport, manualEntry } from './sources';
import { isPracticeLogData } from './storage';

describe('log entries from the app', () => {
  it('summarises a live session with the average of the scored arrows', () => {
    const shots = [{ actualResult: { score: 10 } }, { actualResult: { score: 7 } }, {}] as ShotAnalysis[];
    expect(entryFromLiveSession('s1', shots, 1000)).toMatchObject({ id: 'live:s1', source: 'live', date: 1000, arrows: 3, averageScore: 8.5, totalScore: 17, scoredArrows: 2 });
    expect(entryFromLiveSession('s2', [{}] as ShotAnalysis[], 0).averageScore).toBeNull();
  });

  it('takes arrows, the form score and focus areas from a video report', () => {
    const report = { id: 'r1', createdAt: 5, shots: [{}, {}], scores: { overall: 71.6 }, focusAreas: [{ title: 'Bow arm drops at release' }] } as unknown as VideoAnalysisReport;
    expect(entryFromVideoReport(report)).toMatchObject({ id: 'video:r1', arrows: 2, formScore: 72, focusAreas: ['Bow arm drops at release'], averageScore: null, videoReportId: 'r1' });
  });

  it('derives a manual entry’s average from its total and drops empty fields', () => {
    const entry = manualEntry({ date: 1, arrows: 36, totalScore: 324, distanceM: 70, targetFace: ' 122 cm ', notes: '  ', feeling: 4 }, 'manual:x');
    expect(entry).toMatchObject({ id: 'manual:x', averageScore: 9, scoredArrows: 36, distanceM: 70, targetFace: '122 cm', feeling: 4 });
    expect(entry).not.toHaveProperty('notes');
    expect(manualEntry({ date: 1, arrows: 0, totalScore: 5 }).averageScore).toBeNull();
  });

  it('accepts only well-formed log data', () => {
    expect(isPracticeLogData({ entries: [{ id: 'a', date: 1, arrows: 2 }] })).toBe(true);
    expect(isPracticeLogData({ entries: [{ id: 'a' }] })).toBe(false);
    expect(isPracticeLogData(null)).toBe(false);
  });
});
