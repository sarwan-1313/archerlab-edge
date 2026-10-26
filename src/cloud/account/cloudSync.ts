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

export async function listCloudReports(client: SupabaseRest, session: CloudSession): Promise<VideoReportSummary[]> {
  const rows = await client.select<{ summary: VideoReportSummary; video_path: string | null }>('video_reports', 'select=summary,video_path&order=created_at.desc&limit=100', session.accessToken);
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
  const rows = await client.select<{ video_path: string | null }>('video_reports', `select=video_path&id=eq.${encodeURIComponent(id)}`, session.accessToken);
  const path = rows[0]?.video_path;
  if (path) await client.removeObject(CLOUD_CONFIG.videoBucket, path, session.accessToken).catch(() => undefined);
  await client.remove('video_reports', `id=eq.${encodeURIComponent(id)}`, session.accessToken);
}

export function describeCloudError(error: unknown): string {
  if (error instanceof CloudError) {
    if (error.status === 401) return 'Your sign-in has expired. Sign in again.';
    if (error.status === 404) return 'The cloud project is missing a table or bucket. Run the setup SQL in docs/cloud-setup.md.';
    if (error.status === 413) return 'The file is larger than the storage upload limit.';
    return error.message;
  }
  return 'Could not reach the cloud service. Check your connection.';
}
