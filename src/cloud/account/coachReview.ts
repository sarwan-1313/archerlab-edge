import { routeForPage } from '../../navigation/routes';
import { formatClock } from '../../video-analysis/format';
import type { ShotReport, VideoAnalysisReport, VideoReportSummary } from '../../video-analysis/types';
import { CLOUD_CONFIG } from '../config';
import { memberForReport, type ClubMember } from './clubs';
import { CloudError, type CloudSession, type SupabaseRest } from './supabaseRest';

/**
 * Remote coach review. An athlete shares a backed-up report with a coach's
 * email; row-level security (supabase/schema.sql) then lets that coach read the
 * report, and the video only when it was included, and lets both comment. The
 * app never sends email: the athlete passes the link on themselves.
 */

export interface ReportShare {
  id: string;
  report_id: string;
  owner_email: string | null;
  coach_email: string;
  include_video: boolean;
  created_at: string;
  revoked_at: string | null;
}

/** A share addressed to the signed-in coach, with the report's summary. */
export interface SharedReport extends ReportShare {
  summary: VideoReportSummary | null;
}

export interface ReportComment {
  id: string;
  report_id: string;
  author_id: string;
  author_email: string | null;
  shot_index: number | null;
  time_s: number | null;
  body: string;
  created_at: string;
}

export const COMMENT_MAX_LENGTH = 2000;

const SHARE_COLUMNS = 'id,report_id,owner_email,coach_email,include_video,created_at,revoked_at';
const COMMENT_COLUMNS = 'id,report_id,author_id,author_email,shot_index,time_s,body,created_at';

const eq = (value: string) => `eq.${encodeURIComponent(value)}`;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** The link an athlete sends their coach; it opens the report from the cloud. */
export function sharedReportLink(origin: string, reportId: string): string {
  return `${origin}${routeForPage('video-analysis', { reportId })}`;
}

/** The shot a moment of the clip belongs to: the one whose draw-to-follow-through span holds it, else the nearest release within 3 s. */
export function shotAtTime(shots: ShotReport[], t: number): number | null {
  const within = shots.find((shot) => {
    const from = shot.drawStart ?? shot.anchorStart ?? shot.release - 3;
    const to = shot.followThroughEnd ?? shot.release + 1.5;
    return t >= from && t <= to;
  });
  if (within) return within.index;
  let nearest: ShotReport | null = null;
  for (const shot of shots) {
    if (Math.abs(shot.release - t) <= 3 && (!nearest || Math.abs(shot.release - t) < Math.abs(nearest.release - t))) nearest = shot;
  }
  return nearest?.index ?? null;
}

/** How a comment's author is shown: "You", or their role and email (or, for the athlete when `owner` is given, the name the coach knows them by). */
export function commentAuthor(comment: ReportComment, currentUserId: string, viewerIsOwner: boolean, ownerEmail: string | null, owner?: { id: string; label: string }): string {
  if (comment.author_id === currentUserId) return 'You';
  if (owner && comment.author_id === owner.id) return `Athlete · ${owner.label}`;
  const email = comment.author_email ?? 'someone';
  if (viewerIsOwner) return `Coach · ${email}`;
  return ownerEmail && comment.author_email === ownerEmail ? `Athlete · ${email}` : `Coach · ${email}`;
}

/** "Shot 2 · 0:04.50" for a comment pinned to a moment, or null for the whole report. */
export function commentMoment(comment: ReportComment): string | null {
  const parts = [comment.shot_index ? `Shot ${comment.shot_index}` : null, comment.time_s !== null ? formatClock(comment.time_s, 2) : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

export async function shareReport(client: SupabaseRest, session: CloudSession, share: { reportId: string; coachEmail: string; includeVideo: boolean }): Promise<ReportShare> {
  const coachEmail = normalizeEmail(share.coachEmail);
  if (!isValidEmail(coachEmail)) throw new CloudError('Enter your coach’s email address.', 400);
  if (session.user.email && coachEmail === normalizeEmail(session.user.email)) throw new CloudError('That is your own email. Enter your coach’s address.', 400);
  // Sharing again with the same coach updates the share, and restores it if it was revoked.
  const rows = await client.insert<ReportShare>(
    'report_shares',
    [{ report_id: share.reportId, coach_email: coachEmail, include_video: share.includeVideo, revoked_at: null }],
    session.accessToken,
    'report_id,coach_email',
  );
  if (!rows[0]) throw new CloudError('The share could not be saved.', 500);
  return rows[0];
}

/** The athlete's active shares of one report. */
export async function listShares(client: SupabaseRest, session: CloudSession, reportId: string): Promise<ReportShare[]> {
  return client.select<ReportShare>(
    'report_shares',
    `select=${SHARE_COLUMNS}&report_id=${eq(reportId)}&owner_id=${eq(session.user.id)}&revoked_at=is.null&order=created_at.asc`,
    session.accessToken,
  );
}

export async function revokeShare(client: SupabaseRest, session: CloudSession, shareId: string): Promise<void> {
  await client.update('report_shares', `id=${eq(shareId)}&owner_id=${eq(session.user.id)}`, { revoked_at: new Date().toISOString() }, session.accessToken);
}

/** Active shares addressed to the signed-in coach's email, newest first. */
export async function listSharedWithMe(client: SupabaseRest, session: CloudSession): Promise<SharedReport[]> {
  if (!session.user.email) return [];
  const rows = await client.select<ReportShare & { video_reports: { summary: VideoReportSummary; video_path: string | null } | null }>(
    'report_shares',
    `select=${SHARE_COLUMNS},video_reports(summary,video_path)&coach_email=${eq(normalizeEmail(session.user.email))}&revoked_at=is.null&order=created_at.desc&limit=100`,
    session.accessToken,
  );
  return rows.map(({ video_reports: report, ...share }) => ({
    ...share,
    summary: report ? { ...report.summary, hasVideo: share.include_video && Boolean(report.video_path) } : null,
  }));
}

/** Whether the athlete's report is already in their account, and with its video. */
export async function cloudReportState(client: SupabaseRest, session: CloudSession, reportId: string): Promise<{ backedUp: boolean; hasVideo: boolean }> {
  const rows = await client.select<{ video_path: string | null }>('video_reports', `select=video_path&id=${eq(reportId)}&user_id=${eq(session.user.id)}`, session.accessToken);
  return { backedUp: rows.length > 0, hasVideo: Boolean(rows[0]?.video_path) };
}

/**
 * Opens a report from the cloud for review: the athlete's own, or one shared
 * with the signed-in coach. A coach gets the video only when it was included.
 */
export async function loadReviewReport(client: SupabaseRest, session: CloudSession, reportId: string): Promise<{ report: VideoAnalysisReport; videoUrl: string | null; share: ReportShare | null; club?: ClubMember | null } | null> {
  const token = session.accessToken;
  const rows = await client.select<{ report: VideoAnalysisReport; video_path: string | null; user_id: string }>('video_reports', `select=report,video_path,user_id&id=${eq(reportId)}`, token);
  const row = rows[0];
  if (!row) return null;
  const report = { ...row.report, samples: [], frames: [] };
  if (row.user_id === session.user.id) {
    const videoUrl = row.video_path ? await client.signedUrl(CLOUD_CONFIG.videoBucket, row.video_path, token) : null;
    return { report, videoUrl, share: null };
  }
  const shares = session.user.email
    ? await client.select<ReportShare>('report_shares', `select=${SHARE_COLUMNS}&report_id=${eq(reportId)}&coach_email=${eq(normalizeEmail(session.user.email))}&revoked_at=is.null&limit=1`, token)
    : [];
  const share = shares[0] ?? null;
  // Not shared directly: readable because the athlete shares their analyses with a club this coach runs. Club access never includes the video.
  if (!share) return { report, videoUrl: null, share: null, club: await memberForReport(client, session, row.user_id) };
  const videoUrl = share?.include_video && row.video_path
    ? await client.signedUrl(CLOUD_CONFIG.videoBucket, row.video_path, token).catch(() => null)
    : null;
  return { report, videoUrl, share };
}

export async function listComments(client: SupabaseRest, session: CloudSession, reportId: string): Promise<ReportComment[]> {
  return client.select<ReportComment>('report_comments', `select=${COMMENT_COLUMNS}&report_id=${eq(reportId)}&order=created_at.asc,id.asc&limit=500`, session.accessToken);
}

export async function addComment(client: SupabaseRest, session: CloudSession, comment: { reportId: string; body: string; shotIndex: number | null; timeS: number | null }): Promise<ReportComment> {
  const body = comment.body.trim();
  if (!body) throw new CloudError('Write a comment first.', 400);
  if (body.length > COMMENT_MAX_LENGTH) throw new CloudError(`Comments can be up to ${COMMENT_MAX_LENGTH} characters.`, 400);
  const rows = await client.insert<ReportComment>('report_comments', [{
    report_id: comment.reportId,
    body,
    shot_index: comment.shotIndex,
    time_s: comment.timeS === null ? null : Math.max(0, Math.round(comment.timeS * 1000) / 1000),
  }], session.accessToken);
  if (!rows[0]) throw new CloudError('The comment could not be saved.', 500);
  return rows[0];
}

export async function deleteComment(client: SupabaseRest, session: CloudSession, commentId: string): Promise<void> {
  await client.remove('report_comments', `id=${eq(commentId)}&author_id=${eq(session.user.id)}`, session.accessToken);
}
