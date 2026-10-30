import { entriesInWeek, weeklySeries } from '../../practice-log/aggregate';
import type { PracticeLogData } from '../../practice-log/types';
import type { SkillLevel } from '../../video-analysis/types';
import type { ClubMember, MemberReport } from './clubs';

/** What My club shows for one athlete. */
export interface RosterRow {
  member: ClubMember;
  reports: MemberReport[];
  latestLevel: SkillLevel | null;
  /** Form scores of the shared reports with one, oldest first (at most the last 8). */
  formScores: number[];
  /** Latest form score minus the mean of the ones before it; null with fewer than two. */
  formTrend: number | null;
  /** Null when the athlete does not share their practice log. */
  volume: { arrowsThisWeek: number; sessionsThisWeek: number; arrowsPerWeek: number[] } | null;
}

export interface RosterSummary {
  rows: RosterRow[];
  /** The focus area named most often across the club, counting each athlete's latest report once. */
  topFocus: { title: string; athletes: number } | null;
}

const TREND_POINTS = 8;
const VOLUME_WEEKS = 8;

export function summarizeRoster(
  members: readonly ClubMember[],
  reports: readonly MemberReport[],
  logs: ReadonlyMap<string, PracticeLogData>,
  now: number = Date.now(),
): RosterSummary {
  const focusCounts = new Map<string, number>();
  const rows = members.map((member): RosterRow => {
    const own = member.share_analyses
      ? reports.filter((report) => report.user_id === member.athlete_id).sort((a, b) => b.summary.createdAt - a.summary.createdAt)
      : [];
    const latest = own[0];
    for (const title of new Set(latest?.summary.focus ?? [])) focusCounts.set(title, (focusCounts.get(title) ?? 0) + 1);
    const formScores = own.map((report) => report.summary.overall).filter((score): score is number => score !== null).slice(0, TREND_POINTS).reverse();
    const previous = formScores.slice(0, -1);
    const formTrend = previous.length ? formScores[formScores.length - 1] - previous.reduce((sum, score) => sum + score, 0) / previous.length : null;
    const log = member.share_practice_log ? logs.get(member.athlete_id) : undefined;
    const week = log ? entriesInWeek(log.entries, now) : [];
    return {
      member,
      reports: own,
      latestLevel: own.find((report) => report.summary.level)?.summary.level ?? null,
      formScores,
      formTrend,
      volume: log ? {
        arrowsThisWeek: week.reduce((sum, entry) => sum + entry.arrows, 0),
        sessionsThisWeek: week.length,
        arrowsPerWeek: weeklySeries(log.entries, VOLUME_WEEKS, now).map((bucket) => bucket.arrows),
      } : null,
    };
  });
  let topFocus: RosterSummary['topFocus'] = null;
  for (const [title, athletes] of [...focusCounts].sort(([a], [b]) => a.localeCompare(b))) {
    if (!topFocus || athletes > topFocus.athletes) topFocus = { title, athletes };
  }
  return { rows, topFocus };
}

/** How a member is named to the coach: their display name, plus the email for adults only. */
export function memberLabel(member: Pick<ClubMember, 'display_name' | 'athlete_email' | 'is_minor'>): string {
  return member.is_minor || !member.athlete_email ? member.display_name : `${member.display_name} · ${member.athlete_email}`;
}
