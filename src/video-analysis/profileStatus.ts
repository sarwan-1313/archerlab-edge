import type { CategoryId, ConfidenceLabel, SkillLevel, VideoAnalysisReport } from './types';

/**
 * The athlete's form status, kept on the profile and updated after each video
 * analysis. The self-reported experience level is never overwritten: the
 * estimated level sits beside it, and the athlete can adopt it with one tap.
 */
export interface FormStatusEntry {
  at: number;
  reportId: string;
  score: number | null;
  level: SkillLevel | null;
  confidence: ConfidenceLabel;
  shots: number;
}

export interface FormStatus {
  estimatedLevel: SkillLevel | null;
  score: number | null;
  confidence: ConfidenceLabel;
  updatedAt: number;
  lastReportId: string;
  focus: string[];
  strengths: string[];
  categories: Partial<Record<CategoryId, number>>;
  nextLevel?: { level: SkillLevel; threshold: number; gap: number; focus: CategoryId[] };
  history: FormStatusEntry[];
}

const HISTORY_LIMIT = 60;

/** Maps an estimated level onto the profile's experience-level options. */
export const LEVEL_TO_EXPERIENCE: Record<SkillLevel, string> = {
  beginner: 'beginner',
  intermediate: 'intermediate',
  advanced: 'advanced',
  elite: 'competitive',
};

export function isFormStatus(value: unknown): value is FormStatus {
  return typeof value === 'object' && value !== null && Array.isArray((value as FormStatus).history);
}

export function applyReportToProfile<T extends Record<string, unknown>>(profile: T | null, report: VideoAnalysisReport): T & { formStatus: FormStatus } {
  const previous = isFormStatus(profile?.formStatus) ? profile.formStatus : null;
  const entry: FormStatusEntry = {
    at: report.createdAt,
    reportId: report.id,
    score: report.scores.overall === null ? null : Math.round(report.scores.overall),
    level: report.scores.level,
    confidence: report.scores.confidence,
    shots: report.shots.length,
  };
  const history = [...(previous?.history ?? []).filter((item) => item.reportId !== report.id), entry]
    .sort((a, b) => a.at - b.at)
    .slice(-HISTORY_LIMIT);
  const measured = report.scores.overall !== null;
  const categories: Partial<Record<CategoryId, number>> = {};
  for (const category of report.scores.categories) if (category.score !== null) categories[category.id] = Math.round(category.score);
  const formStatus: FormStatus = {
    // A clip that could not be scored keeps the last known level instead of erasing it.
    estimatedLevel: measured ? report.scores.level : previous?.estimatedLevel ?? null,
    score: measured ? Math.round(report.scores.overall as number) : previous?.score ?? null,
    confidence: measured ? report.scores.confidence : previous?.confidence ?? 'low',
    updatedAt: report.createdAt,
    lastReportId: report.id,
    focus: measured ? report.focusAreas.map((finding) => finding.title) : previous?.focus ?? [],
    strengths: measured ? report.strengths.map((strength) => strength.title) : previous?.strengths ?? [],
    categories: measured ? categories : previous?.categories ?? {},
    nextLevel: measured ? report.scores.nextLevel : previous?.nextLevel,
    history,
  };
  return { ...(profile ?? {}), formStatus } as T & { formStatus: FormStatus };
}
