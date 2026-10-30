import type { CategoryId } from '../video-analysis/types';

/** Where an entry came from: added automatically by a live session or a video analysis, or typed by the athlete. */
export type PracticeSource = 'live' | 'video' | 'manual';

export type Feeling = 1 | 2 | 3 | 4 | 5;

export interface PracticeEntry {
  /** `live:<session id>`, `video:<report id>` or `manual:<random>`, so re-adding the same session replaces it. */
  id: string;
  source: PracticeSource;
  /** When the training happened, epoch ms. */
  date: number;
  arrows: number;
  /** Mean arrow score, when scores were entered. */
  averageScore: number | null;
  /** Total of the entered scores (manual entries, or the sum of a live session's scored arrows). */
  totalScore: number | null;
  /** How many arrows the scores cover; the weight for averaging across entries. */
  scoredArrows: number;
  /** Overall form score from a video analysis (0–100, an unvalidated estimate). */
  formScore: number | null;
  /** Focus areas from a video analysis, as short titles. */
  focusAreas: string[];
  distanceM?: number;
  targetFace?: string;
  notes?: string;
  feeling?: Feeling;
  /** The video report this entry came from. */
  videoReportId?: string;
}

export interface FocusGoal {
  category: CategoryId;
  title: string;
  /** The report it was taken from. */
  reportId: string;
}

export interface PracticeGoals {
  weeklyArrows: number | null;
  weeklySessions: number | null;
  focus: FocusGoal | null;
  updatedAt: number;
}

export const EMPTY_GOALS: PracticeGoals = { weeklyArrows: null, weeklySessions: null, focus: null, updatedAt: 0 };

/** What the export and the cloud backup hold. */
export interface PracticeLogData {
  entries: PracticeEntry[];
  goals: PracticeGoals;
}
