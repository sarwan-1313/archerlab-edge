import { useEffect, useState } from 'react';
import { mergePracticeLog, readPracticeLog, subscribePracticeLog } from '../../practice-log/storage';
import { loadProfile, saveProfile } from '../../profile/profileStorage';
import { VIDEO_REPORTS_CHANGED, listVideoReports, loadVideoReport, saveVideoReport } from '../../video-analysis/storage';
import { driveBackupEnabled } from '../config';
import { connectDrive, disconnectDrive, driveChosen, driveToken } from './driveAuth';
import { applySettingsTo, deleteDriveData, readSettingsFrom, restoreFromDrive, saveToDrive, saveVideoToDrive, type LocalData, type RestoreResult } from './driveBackup';
import { DriveAuthError, createDriveRest } from './driveRest';

/**
 * Saving to the athlete's own Google Drive. While connected, changes are saved
 * a few seconds after they happen (auto-save); the athlete can also save or
 * restore by hand. State is shared by every component that uses the hook.
 */

export const LAST_SAVED_KEY = 'archerlab-edge:drive-last-saved';
const AUTO_SAVE_DELAY_MS = 8000;

export type DriveStatus = 'off' | 'needs-connect' | 'idle' | 'saving' | 'restoring' | 'error';

export interface DriveSyncState {
  status: DriveStatus;
  /** The athlete chose Drive on this device (the token may still need renewing). */
  chosen: boolean;
  lastSavedAt: number | null;
  message: string | null;
  progress: { done: number; total: number } | null;
  pending: boolean;
}

const drive = createDriveRest(() => driveToken());

const localData: LocalData = {
  readProfile: () => loadProfile('default'),
  applyProfile: async (profile) => {
    const current = await loadProfile('default');
    // The photo stays on each device: keep the one here.
    await saveProfile({ ...profile, id: 'default', profilePhotoBlob: current?.profilePhotoBlob });
    window.dispatchEvent(new Event('archerlab:profile-restored'));
  },
  readPracticeLog,
  mergePracticeLog,
  readSettings: () => readSettingsFrom(localStorage),
  applySettings: (settings) => applySettingsTo(localStorage, settings),
  listReports: listVideoReports,
  loadReport: loadVideoReport,
  saveReport: saveVideoReport,
};

function storedLastSaved(): number | null {
  try { return Number(localStorage.getItem(LAST_SAVED_KEY)) || null; } catch { return null; }
}

function initial(): DriveSyncState {
  if (!driveBackupEnabled) return { status: 'off', chosen: false, lastSavedAt: null, message: null, progress: null, pending: false };
  const chosen = driveChosen();
  return { status: chosen ? 'needs-connect' : 'off', chosen, lastSavedAt: storedLastSaved(), message: null, progress: null, pending: false };
}

let state: DriveSyncState = initial();
const listeners = new Set<(next: DriveSyncState) => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let running: Promise<unknown> | null = null;
let started = false;

function set(changes: Partial<DriveSyncState>) {
  state = { ...state, ...changes };
  listeners.forEach((listener) => listener(state));
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong with Google Drive. Try again.';
}

function idleStatus(): DriveStatus {
  if (!state.chosen) return 'off';
  return driveToken() ? 'idle' : 'needs-connect';
}

async function exclusive<T>(status: 'saving' | 'restoring', work: () => Promise<T>): Promise<T | null> {
  if (running) await running.catch(() => undefined);
  if (!driveToken()) { set({ status: state.chosen ? 'needs-connect' : 'off', pending: state.chosen }); return null; }
  set({ status, message: null, progress: null });
  const task = work();
  running = task;
  try {
    return await task;
  } catch (error) {
    if (error instanceof DriveAuthError) set({ status: 'needs-connect', message: error.message, progress: null });
    else set({ status: 'error', message: describe(error), progress: null });
    return null;
  } finally {
    running = null;
  }
}

export async function saveNow(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null; }
  const result = await exclusive('saving', () => saveToDrive(drive, localData, (done, total) => set({ progress: { done, total } })));
  if (!result) return;
  try { localStorage.setItem(LAST_SAVED_KEY, String(result.savedAt)); } catch { /* ignore */ }
  set({ status: 'idle', lastSavedAt: result.savedAt, progress: null, pending: false, message: result.reportsSaved ? `Saved to Google Drive, including ${result.reportsSaved} video report${result.reportsSaved === 1 ? '' : 's'}.` : null });
}

export async function restoreNow(includeVideos: boolean): Promise<RestoreResult | null> {
  const result = await exclusive('restoring', () => restoreFromDrive(drive, localData, { includeVideos, onProgress: (done, total) => set({ progress: { done, total } }) }));
  if (!result) return null;
  const parts = [
    result.profileRestored ? 'profile and settings restored' : null,
    `${result.practiceEntries} practice log entr${result.practiceEntries === 1 ? 'y' : 'ies'} merged`,
    `${result.reportsRestored} video report${result.reportsRestored === 1 ? '' : 's'} added${result.videosRestored ? ` (${result.videosRestored} with video)` : ''}`,
    result.reportsSkipped ? `${result.reportsSkipped} could not be opened` : null,
  ].filter(Boolean).join('; ');
  set({ status: 'idle', progress: null, message: `From Google Drive: ${parts}.` });
  return result;
}

export async function saveVideoNow(reportId: string, video: Blob): Promise<boolean> {
  const done = await exclusive('saving', async () => { await saveVideoToDrive(drive, reportId, video); return true; });
  if (done) set({ status: 'idle', progress: null, message: 'Video saved to your Google Drive.' });
  return Boolean(done);
}

export async function connect(loginHint?: string): Promise<boolean> {
  try {
    await connectDrive(loginHint);
  } catch (error) {
    set({ status: state.chosen ? 'needs-connect' : 'off', message: describe(error) });
    return false;
  }
  const firstTime = !state.lastSavedAt;
  set({ chosen: true, status: 'idle', message: null });
  // On a new device, bring the athlete's data here before saving anything over it.
  const restored = firstTime ? await restoreNow(false) : null;
  const summary = state.message;
  await saveNow();
  if (restored && state.status === 'idle') set({ message: summary });
  return true;
}

export function disconnect(): void {
  disconnectDrive();
  if (timer) { clearTimeout(timer); timer = null; }
  try { localStorage.removeItem(LAST_SAVED_KEY); } catch { /* ignore */ }
  set({ chosen: false, status: 'off', lastSavedAt: null, pending: false, message: 'This device no longer saves to Google Drive. Files already in your Drive stay there.' });
}

export async function deleteFromDrive(): Promise<number | null> {
  const removed = await exclusive('saving', () => deleteDriveData(drive));
  if (removed === null) return null;
  try { localStorage.removeItem(LAST_SAVED_KEY); } catch { /* ignore */ }
  set({ status: idleStatus(), lastSavedAt: null, progress: null, message: `Deleted ${removed} file${removed === 1 ? '' : 's'} and the ArcherLab Edge folder from your Google Drive.` });
  return removed;
}

/** Called on any change to the athlete's data: saves a few seconds later, or marks a save as due if the token has expired. */
function scheduleSave() {
  if (!state.chosen) return;
  if (!driveToken()) { set({ pending: true, status: 'needs-connect' }); return; }
  set({ pending: true });
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void saveNow(); }, AUTO_SAVE_DELAY_MS);
}

/** Starts auto-save for the life of the page. Safe to call more than once. */
export function startDriveAutoSave(): () => void {
  if (!driveBackupEnabled || started) return () => undefined;
  started = true;
  const unsubscribe = subscribePracticeLog(scheduleSave);
  window.addEventListener('archerlab:profile-updated', scheduleSave);
  window.addEventListener(VIDEO_REPORTS_CHANGED, scheduleSave);
  return () => {
    started = false;
    unsubscribe();
    window.removeEventListener('archerlab:profile-updated', scheduleSave);
    window.removeEventListener(VIDEO_REPORTS_CHANGED, scheduleSave);
  };
}

export function useDriveSync() {
  const [current, setCurrent] = useState(state);
  useEffect(() => {
    listeners.add(setCurrent);
    setCurrent(state);
    return () => { listeners.delete(setCurrent); };
  }, []);
  return { ...current, enabled: driveBackupEnabled, connect, disconnect, saveNow, restoreNow, saveVideoNow, deleteFromDrive };
}
