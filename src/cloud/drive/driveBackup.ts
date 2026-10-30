import { isPracticeLogData } from '../../practice-log/storage';
import type { PracticeLogData } from '../../practice-log/types';
import { buildReport } from '../../video-analysis/buildReport';
import { restoreReportInput } from '../../video-analysis/reportFile';
import { reportToJson } from '../../video-analysis/storage';
import type { VideoAnalysisReport, VideoReportSummary } from '../../video-analysis/types';
import type { DriveFile, DriveRest } from './driveRest';

/**
 * What goes into the athlete's "ArcherLab Edge" folder in Google Drive:
 *   archerlab-backup.json   profile (without the photo), practice log and goals, settings
 *   report-<id>.json.gz     one file per video report, with its tracked body positions
 *   video-<id>.<ext>        a video, only when the athlete chooses to save it
 * Nothing here goes to ArcherLab's own servers.
 */

export const BACKUP_FILE = 'archerlab-backup.json';
const BACKUP_FORMAT = 'archerlab-edge-drive-backup';
const REPORT_PREFIX = 'report-';
const VIDEO_PREFIX = 'video-';

/** Settings saved with the backup. AI keys and sign-in sessions are never included. */
export const SYNCED_SETTING_KEYS = [
  'archerlab-edge:lite-mode',
  'archerlab-edge:coach-tools',
  'archerlab-edge:voice-notes',
  'archerlab-edge:video-options',
  'archerlab-edge:video-model',
  'archerlab-edge:onboarding-complete',
] as const;

export interface DriveBackupFile {
  format: typeof BACKUP_FORMAT;
  version: 1;
  savedAt: number;
  profile: Record<string, unknown> | null;
  practiceLog: PracticeLogData | null;
  settings: Record<string, string>;
}

/** The device's data, read and written through these so the logic can be tested without a browser. */
export interface LocalData {
  readProfile(): Promise<Record<string, unknown> | null>;
  applyProfile(profile: Record<string, unknown>): Promise<void>;
  readPracticeLog(): Promise<PracticeLogData>;
  mergePracticeLog(log: PracticeLogData): Promise<number>;
  readSettings(): Record<string, string>;
  applySettings(settings: Record<string, string>): void;
  listReports(): Promise<VideoReportSummary[]>;
  loadReport(id: string): Promise<VideoAnalysisReport | null>;
  saveReport(report: VideoAnalysisReport, video: Blob | null): Promise<unknown>;
}

export interface SaveResult { reportsSaved: number; reportsUnchanged: number; savedAt: number }
export interface RestoreResult { profileRestored: boolean; practiceEntries: number; reportsRestored: number; reportsSkipped: number; videosRestored: number }

export type DriveProgress = (done: number, total: number) => void;

/** The profile as saved to Drive: everything except the photo (which can be several megabytes). */
export function driveProfileData(profile: Record<string, unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(profile)) {
    if (key === 'profilePhotoBlob' || key === 'profilePhotoUrl' || value instanceof Blob) continue;
    data[key] = value;
  }
  return data;
}

export const reportFileName = (id: string, compressed: boolean) => `${REPORT_PREFIX}${id}.json${compressed ? '.gz' : ''}`;

export function videoFileName(id: string, mimeType: string): string {
  const extension = mimeType.includes('quicktime') ? 'mov' : mimeType.includes('webm') ? 'webm' : 'mp4';
  return `${VIDEO_PREFIX}${id}.${extension}`;
}

/** The report id in a report or video file name, or null for other files. */
export function idFromFileName(name: string, kind: 'report' | 'video'): string | null {
  const pattern = kind === 'report' ? /^report-(.+?)\.json(\.gz)?$/ : /^video-(.+)\.[a-z0-9]+$/;
  return pattern.exec(name)?.[1] ?? null;
}

const canCompress = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

async function gzip(text: string): Promise<Blob> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).blob();
}

async function readText(blob: Blob, compressed: boolean): Promise<string> {
  if (!compressed) return blob.text();
  if (!canCompress()) throw new Error('This browser cannot open compressed backups. Update it and try again.');
  return new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
}

/** A cheap fingerprint of a report's saved form, so unchanged reports are not uploaded again. */
export function fingerprint(text: string): string {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0;
  return `${text.length.toString(36)}-${hash.toString(36)}`;
}

export function isDriveBackupFile(value: unknown): value is DriveBackupFile {
  if (!value || typeof value !== 'object') return false;
  const file = value as Partial<DriveBackupFile>;
  return file.format === BACKUP_FORMAT && file.version === 1 && typeof file.savedAt === 'number';
}

export function readSettingsFrom(storage: Pick<Storage, 'getItem'>): Record<string, string> {
  const settings: Record<string, string> = {};
  for (const key of SYNCED_SETTING_KEYS) {
    try {
      const value = storage.getItem(key);
      if (value !== null) settings[key] = value;
    } catch { /* storage unavailable */ }
  }
  return settings;
}

export function applySettingsTo(storage: Pick<Storage, 'setItem'>, settings: Record<string, string>): void {
  for (const key of SYNCED_SETTING_KEYS) {
    const value = settings[key];
    if (typeof value !== 'string') continue;
    try { storage.setItem(key, value); } catch { /* storage unavailable */ }
  }
}

async function readBackup(drive: DriveRest, file: DriveFile | undefined): Promise<DriveBackupFile | null> {
  if (!file) return null;
  try {
    const parsed: unknown = JSON.parse(await (await drive.download(file.id)).text());
    return isDriveBackupFile(parsed) ? parsed : null;
  } catch (error) {
    if (error instanceof Error && error.name === 'DriveAuthError') throw error;
    return null;
  }
}

/**
 * The practice log to save: entries already in Drive are kept, so clearing the
 * log on one device (or saving from a new one) never wipes the copy in Drive.
 * Entries from this device replace Drive's copy of the same entry; the newer goals win.
 */
export function unionLogs(saved: PracticeLogData | null, here: PracticeLogData): PracticeLogData {
  if (!saved || !isPracticeLogData(saved)) return here;
  const byId = new Map(saved.entries.map((entry) => [entry.id, entry]));
  for (const entry of here.entries) byId.set(entry.id, entry);
  const goals = (saved.goals?.updatedAt ?? 0) > (here.goals?.updatedAt ?? 0) ? saved.goals : here.goals;
  return { entries: [...byId.values()].sort((a, b) => a.date - b.date), goals };
}

/**
 * Saves the profile, practice log, settings and every video report on this
 * device to Drive. Reports already in Drive in the same form are skipped.
 * Videos are not included; they are saved one at a time with saveVideoToDrive.
 */
export async function saveToDrive(drive: DriveRest, local: LocalData, onProgress?: DriveProgress): Promise<SaveResult> {
  const folder = await drive.ensureFolder();
  const files = await drive.listFiles(folder);
  const byName = new Map(files.map((file) => [file.name, file]));
  const profile = await local.readProfile();
  const previous = await readBackup(drive, byName.get(BACKUP_FILE));
  const backup: DriveBackupFile = {
    format: BACKUP_FORMAT,
    version: 1,
    savedAt: Date.now(),
    profile: profile ? driveProfileData(profile) : previous?.profile ?? null,
    practiceLog: unionLogs(previous?.practiceLog ?? null, await local.readPracticeLog()),
    settings: local.readSettings(),
  };
  const summaries = await local.listReports();
  const total = summaries.length + 1;
  await drive.upload(folder, { name: BACKUP_FILE, mimeType: 'application/json', body: new Blob([JSON.stringify(backup)], { type: 'application/json' }), existingId: byName.get(BACKUP_FILE)?.id });
  onProgress?.(1, total);
  const compressed = canCompress();
  let reportsSaved = 0;
  let reportsUnchanged = 0;
  for (const [index, summary] of summaries.entries()) {
    const report = await local.loadReport(summary.id);
    if (report) {
      const text = reportToJson(report);
      const print = fingerprint(text);
      const existing = byName.get(reportFileName(report.id, true)) ?? byName.get(reportFileName(report.id, false));
      if (existing?.appProperties?.fingerprint === print) {
        reportsUnchanged += 1;
      } else {
        const body = compressed ? await gzip(text) : new Blob([text], { type: 'application/json' });
        await drive.upload(folder, {
          name: reportFileName(report.id, compressed),
          mimeType: compressed ? 'application/gzip' : 'application/json',
          body,
          // A file saved uncompressed earlier is replaced in place but keeps its old name.
          existingId: existing?.id,
          appProperties: { reportId: report.id, fingerprint: print, createdAt: String(report.createdAt) },
        });
        reportsSaved += 1;
      }
    }
    onProgress?.(index + 2, total);
  }
  return { reportsSaved, reportsUnchanged, savedAt: backup.savedAt };
}

/** Saves one report's video next to its report. */
export async function saveVideoToDrive(drive: DriveRest, reportId: string, video: Blob): Promise<DriveFile> {
  const folder = await drive.ensureFolder();
  const files = await drive.listFiles(folder);
  const name = videoFileName(reportId, video.type);
  return drive.upload(folder, { name, mimeType: video.type || 'video/mp4', body: video, existingId: files.find((file) => file.name === name)?.id, appProperties: { reportId } });
}

/**
 * Brings data from Drive onto this device. The practice log is merged; the
 * profile and settings are taken only when the Drive copy is newer than the
 * profile here; reports already on this device are left alone.
 */
export async function restoreFromDrive(drive: DriveRest, local: LocalData, options: { includeVideos?: boolean; onProgress?: DriveProgress } = {}): Promise<RestoreResult> {
  const folder = await drive.ensureFolder();
  const files = await drive.listFiles(folder);
  const result: RestoreResult = { profileRestored: false, practiceEntries: 0, reportsRestored: 0, reportsSkipped: 0, videosRestored: 0 };

  const parsed = await readBackup(drive, files.find((file) => file.name === BACKUP_FILE));
  if (parsed) {
    if (parsed.practiceLog && isPracticeLogData(parsed.practiceLog)) result.practiceEntries = await local.mergePracticeLog(parsed.practiceLog);
    const here = await local.readProfile();
    const hereUpdated = typeof here?.updatedAt === 'number' ? here.updatedAt : 0;
    const thereUpdated = typeof parsed.profile?.updatedAt === 'number' ? parsed.profile.updatedAt : parsed.savedAt;
    if (parsed.profile && (!here || thereUpdated > hereUpdated)) {
      await local.applyProfile(driveProfileData(parsed.profile));
      local.applySettings(parsed.settings ?? {});
      result.profileRestored = true;
    }
  }

  const onDevice = new Set((await local.listReports()).map((summary) => summary.id));
  const videos = new Map<string, DriveFile>();
  for (const file of files) {
    const id = idFromFileName(file.name, 'video');
    if (id) videos.set(id, file);
  }
  const reports = files.filter((file) => {
    const id = idFromFileName(file.name, 'report');
    return id !== null && !onDevice.has(id);
  });
  for (const [index, file] of reports.entries()) {
    try {
      const text = await readText(await drive.download(file.id), file.name.endsWith('.gz'));
      const report = buildReport(restoreReportInput(JSON.parse(text)));
      const videoFile = options.includeVideos ? videos.get(report.id) : undefined;
      let video: Blob | null = null;
      if (videoFile) {
        const blob = await drive.download(videoFile.id);
        video = blob.type ? blob : new Blob([blob], { type: videoFile.mimeType });
        result.videosRestored += 1;
      }
      await local.saveReport(report, video);
      result.reportsRestored += 1;
    } catch (error) {
      if (error instanceof Error && error.name === 'DriveAuthError') throw error;
      result.reportsSkipped += 1;
    }
    options.onProgress?.(index + 1, reports.length);
  }
  return result;
}

/** Deletes everything ArcherLab saved in the athlete's Drive folder. */
export async function deleteDriveData(drive: DriveRest): Promise<number> {
  const folder = await drive.ensureFolder();
  const files = await drive.listFiles(folder);
  for (const file of files) await drive.remove(file.id);
  await drive.remove(folder);
  return files.length;
}
