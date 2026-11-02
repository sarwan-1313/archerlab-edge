import type { ShotAnalysis } from '../types/shotAnalysis';
import type { VideoAnalysisReport } from '../video-analysis/types';
import type { Feeling, PracticeEntry } from './types';

/** Builds log entries from what the app already records. */

export function entryFromLiveSession(sessionId: string, shots: readonly ShotAnalysis[], startedAt: number): PracticeEntry {
  const scores = shots.flatMap((shot) => (shot.actualResult ? [shot.actualResult.score] : []));
  const total = scores.reduce((sum, score) => sum + score, 0);
  return {
    id: `live:${sessionId}`,
    source: 'live',
    date: startedAt,
    arrows: shots.length,
    averageScore: scores.length ? total / scores.length : null,
    totalScore: scores.length ? total : null,
    scoredArrows: scores.length,
    formScore: null,
    focusAreas: [],
  };
}

export function entryFromVideoReport(report: VideoAnalysisReport): PracticeEntry {
  return {
    id: `video:${report.id}`,
    source: 'video',
    date: report.createdAt,
    // Shots the engine only heard are still arrows shot.
    arrows: report.shots.length,
    averageScore: null,
    totalScore: null,
    scoredArrows: 0,
    formScore: report.scores.overall === null ? null : Math.round(report.scores.overall),
    focusAreas: report.focusAreas.map((finding) => finding.title),
    videoReportId: report.id,
  };
}

export interface ManualEntryInput {
  date: number;
  arrows: number;
  totalScore: number | null;
  distanceM?: number;
  targetFace?: string;
  notes?: string;
  feeling?: Feeling;
}

export function manualEntry(input: ManualEntryInput, id: string = `manual:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`): PracticeEntry {
  const arrows = Math.max(0, Math.round(input.arrows));
  const hasScore = input.totalScore !== null && arrows > 0;
  return {
    id,
    source: 'manual',
    date: input.date,
    arrows,
    averageScore: hasScore ? input.totalScore! / arrows : null,
    totalScore: input.totalScore,
    scoredArrows: hasScore ? arrows : 0,
    formScore: null,
    focusAreas: [],
    ...(input.distanceM ? { distanceM: input.distanceM } : {}),
    ...(input.targetFace?.trim() ? { targetFace: input.targetFace.trim() } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    ...(input.feeling ? { feeling: input.feeling } : {}),
  };
}
