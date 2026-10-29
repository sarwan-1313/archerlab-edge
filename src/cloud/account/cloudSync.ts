import { isPracticeLogData } from '../../practice-log/storage';
import type { PracticeLogData } from '../../practice-log/types';
import { summarizeReport } from '../../video-analysis/buildReport';
import type { VideoAnalysisReport, VideoReportSummary } from '../../video-analysis/types';
import { CLOUD_CONFIG } from '../config';
import { CloudError, type CloudSession, type SupabaseRest } from './supabaseRest';

/**
 * Backup and sync. Reports are stored without the per-frame landmark arrays
 * (they are large and only needed for replay on the device that analysed the
 * clip). Videos are uploaded only when the athlete chooses to back them up.
 */

export interface CloudReportRow {
  id: string;
  user_id: string;
  created_at: string;
  summary: VideoReportSummary;
  report: Omit<VideoAnalysisReport, 'samples' | 'frames'> & { samples: []; frames: [] };
  video_path: string | null;
}

export function toCloudReportRow(report: VideoAnalysisReport, userId: string, videoPath: string | null): CloudReportRow {
  const { samples: _samples, frames: _frames, ...rest } = report;
  void _samples;
  void _frames;
  return {
    id: report.id,
    user_id: userId,
    created_at: new Date(report.createdAt).toISOString(),
    summary: summarizeReport(report, Boolean(videoPath)),
    report: { ...rest, samples: [], frames: [] },
    video_path: videoPath,
  };
}

export function videoPathFor(userId: string, reportId: string, mimeType: string): string {
  const extension = mimeType.includes('quicktime') ? 'mov' : mimeType.includes('webm') ? 'webm' : 'mp4';
  return `${userId}/${reportId}.${extension}`;
}

/** Profile data that is safe and small enough to sync (the photo stays on the device). */
export function cloudProfileData(profile: Record<string, unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(profile)) {
    if (key === 'profilePhotoBlob' || key === 'profilePhotoUrl' || value instanceof Blob) continue;
    data[key] = value;
  }
  return data;
}

export async function backupReport(client: SupabaseRest, session: CloudSession, report: VideoAnalysisReport, video: Blob | null): Promise<{ videoUploaded: boolean; videoSkippedReason?: string }> {
  let videoPath: string | null = null;
  let videoSkippedReason: string | undefined;
  if (video) {
    if (video.size > CLOUD_CONFIG.maxVideoUploadBytes) {
      videoSkippedReason = `The video is larger than the ${Math.round(CLOUD_CONFIG.maxVideoUploadBytes / 1024 / 1024)} MB upload limit, so only the report was backed up.`;
    } else {
      const path = videoPathFor(session.user.id, report.id, video.type);
      await client.upload(CLOUD_CONFIG.videoBucket, path, video, session.accessToken);
      videoPath = path;
    }
  }
  await client.upsert('video_reports', [toCloudReportRow(report, session.user.id, videoPath)], session.accessToken);
  return { videoUploaded: Boolean(videoPath), videoSkippedReason };
}

export async function pushProfile(client: SupabaseRest, session: CloudSession, profile: Record<string, unknown>): Promise<void> {
  await client.upsert('athlete_profiles', [{ user_id: session.user.id, data: cloudProfileData(profile), updated_at: new Date().toISOString() }], session.accessToken, 'user_id');
}

export async function pullProfile(client: SupabaseRest, session: CloudSession): Promise<Record<string, unknown> | null> {
  const rows = await client.select<{ data: Record<string, unknown> }>('athlete_profiles', `select=data&user_id=eq.${session.user.id}`, session.accessToken);
  return rows[0]?.data ?? null;
}

export const PRACTICE_LOG_TABLE_MISSING = 'This account’s cloud project has no practice log table yet. Ask whoever runs this app to run the latest supabase/schema.sql.';

/** A 404 from a table that a project set up before the feature does not have. */
function missingTable(error: unknown): boolean {
  return error instanceof CloudError && error.status === 404;
}

/** Stores the whole practice log (entries and goals) as one row, replacing the previous backup. */
export async function pushPracticeLog(client: SupabaseRest, session: CloudSession, data: PracticeLogData): Promise<void> {
  try {
    await client.upsert('practice_logs', [{ user_id: session.user.id, data, updated_at: new Date().toISOString() }], session.accessToken, 'user_id');
  } catch (error) {
    if (missingTable(error)) throw new CloudError(PRACTICE_LOG_TABLE_MISSING, 404);
    throw error;
  }
}

/** The backed-up practice log, or null when there is none (or the project has no practice log table). */
export async function pullPracticeLog(client: SupabaseRest, session: CloudSession): Promise<PracticeLogData | null> {
  try {
    const rows = await client.select<{ data: unknown }>('practice_logs', `select=data&user_id=eq.${encodeURIComponent(session.user.id)}`, session.accessToken);
    const data = rows[0]?.data;
    return isPracticeLogData(data) ? data : null;
  } catch (error) {
    if (missingTable(error)) return null;
    throw error;
  }
}

export async function listCloudReports(client: SupabaseRest, session: CloudSession): Promise<VideoReportSummary[]> {
  // Reports shared with this account by others are readable too, so ask for the athlete's own.
  const rows = await client.select<{ summary: VideoReportSummary; video_path: string | null }>('video_reports', `select=summary,video_path&user_id=eq.${encodeURIComponent(session.user.id)}&order=created_at.desc&limit=100`, session.accessToken);
  return rows.map((row) => ({ ...row.summary, hasVideo: Boolean(row.video_path) }));
}

export async function loadCloudReport(client: SupabaseRest, session: CloudSession, id: string): Promise<{ report: VideoAnalysisReport; videoUrl: string | null } | null> {
  const rows = await client.select<{ report: VideoAnalysisReport; video_path: string | null }>('video_reports', `select=report,video_path&id=eq.${encodeURIComponent(id)}`, session.accessToken);
  const row = rows[0];
  if (!row) return null;
  const videoUrl = row.video_path ? await client.signedUrl(CLOUD_CONFIG.videoBucket, row.video_path, session.accessToken) : null;
  return { report: { ...row.report, samples: [], frames: [] }, videoUrl };
}

export async function deleteCloudReport(client: SupabaseRest, session: CloudSession, id: string): Promise<void> {
  const filter = `id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(session.user.id)}`;
  const rows = await client.select<{ video_path: string | null }>('video_reports', `select=video_path&${filter}`, session.accessToken);
  const path = rows[0]?.video_path;
  if (path) await client.removeObject(CLOUD_CONFIG.videoBucket, path, session.accessToken).catch(() => undefined);
  await client.remove('video_reports', filter, session.accessToken);
}

const STORAGE_PAGE = 100;

/** Every file in the athlete's own folder of the video bucket, listed page by page. */
export async function listOwnVideoPaths(client: SupabaseRest, session: CloudSession): Promise<string[]> {
  const prefix = `${session.user.id}/`;
  const paths: string[] = [];
  for (let offset = 0; ; offset += STORAGE_PAGE) {
    const page = await client.listObjects(CLOUD_CONFIG.videoBucket, prefix, session.accessToken, { limit: STORAGE_PAGE, offset });
    for (const entry of page) if (entry.id !== null && entry.name) paths.push(`${prefix}${entry.name}`);
    if (page.length < STORAGE_PAGE) return paths;
  }
}

/**
 * Deletes everything the athlete has in the cloud: their video files, every
 * video report row (with its shares and comments), comments they wrote on
 * reports shared with them, the backed-up profile, the practice log, their club
 * memberships and any club they coach. Files go first, so no
 * report is left pointing at nothing and nothing blocks deleting the account
 * afterwards.
 */
export async function deleteAllCloudData(client: SupabaseRest, session: CloudSession): Promise<{ files: number; reports: number }> {
  const token = session.accessToken;
  const userFilter = `user_id=eq.${encodeURIComponent(session.user.id)}`;
  const rows = await client.select<{ video_path: string | null }>('video_reports', `select=video_path&${userFilter}`, token);
  const paths = new Set(await listOwnVideoPaths(client, session));
  for (const row of rows) if (row.video_path) paths.add(row.video_path);
  const all = [...paths];
  for (let start = 0; start < all.length; start += STORAGE_PAGE) {
    await client.removeObjects(CLOUD_CONFIG.videoBucket, all.slice(start, start + STORAGE_PAGE), token);
  }
  // Projects set up before coach review have no comments table (404).
  await client.remove('report_comments', `author_id=eq.${encodeURIComponent(session.user.id)}`, token).catch((error: unknown) => {
    if (!(error instanceof CloudError && error.status === 404)) throw error;
  });
  await client.remove('video_reports', userFilter, token);
  await client.remove('athlete_profiles', userFilter, token);
  await client.remove('practice_logs', userFilter, token).catch((error: unknown) => {
    if (!missingTable(error)) throw error;
  });
  // Club memberships, and clubs they coach (with those clubs' memberships and invites). Older projects have no club tables.
  const id = encodeURIComponent(session.user.id);
  await client.remove('club_members', `athlete_id=eq.${id}`, token).catch((error: unknown) => {
    if (!missingTable(error)) throw error;
  });
  await client.remove('clubs', `coach_id=eq.${id}`, token).catch((error: unknown) => {
    if (!missingTable(error)) throw error;
  });
  return { files: all.length, reports: rows.length };
}

/** Deletes the athlete's cloud data, then their account (supabase/schema.sql: delete_my_account). The caller signs out afterwards. */
export async function deleteCloudAccount(client: SupabaseRest, session: CloudSession): Promise<void> {
  await deleteAllCloudData(client, session);
  try {
    await client.rpc('delete_my_account', {}, session.accessToken);
  } catch (error) {
    if (error instanceof CloudError && error.status === 404) {
      throw new CloudError('Your cloud data was deleted, but the account itself could not be removed: this project is missing the delete_my_account function. Ask whoever runs this app to run the latest supabase/schema.sql.', 501);
    }
    throw error;
  }
}

export function describeCloudError(error: unknown): string {
  if (error instanceof CloudError) {
    if (error.status === 401) return 'Your sign-in has expired. Sign in again.';
    // Row-level security refused it, e.g. a coach whose share was revoked.
    if (error.status === 403) return 'You do not have access to this any more. If the report was shared with you, the athlete may have stopped sharing it.';
    if (error.status === 404) return 'The cloud project is missing a table or bucket. Run the setup SQL in docs/cloud-setup.md.';
    if (error.status === 413) return 'The file is larger than the storage upload limit.';
    return error.message;
  }
  return 'Could not reach the cloud service. Check your connection.';
}
