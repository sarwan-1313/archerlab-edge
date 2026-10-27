import { modelWasDownloaded, removeLocalModel } from '../local-coach/engine';
import { PROFILE_DB_NAME } from '../profile/profileStorage';
import { RECORDINGS_DB_NAME } from '../recording/recordingStorage';
import { VIDEO_DB_NAME, listVideoReports, loadVideoReport, reportToJson } from '../video-analysis/storage';

/**
 * Everything ArcherLab keeps in this browser, and how to export or remove it.
 * Add new IndexedDB databases and storage keys here so "Delete everything"
 * stays complete.
 */

export const APP_DATABASES = [PROFILE_DB_NAME, RECORDINGS_DB_NAME, VIDEO_DB_NAME] as const;

const DATABASE_LABELS: Record<string, string> = {
  [PROFILE_DB_NAME]: 'your profile',
  [RECORDINGS_DB_NAME]: 'live session recordings',
  [VIDEO_DB_NAME]: 'video analyses',
};
const LOCAL_MODEL_LABEL = 'the private coach’s downloaded model';
export const STORAGE_KEY_PREFIX = 'archerlab-edge:';

/** A failure with a message for the athlete. `blocked`: another tab holds the data open; the browser finishes the deletion once it closes. */
export class LocalDataError extends Error {
  readonly reason: 'blocked' | 'failed';
  constructor(message: string, reason: 'blocked' | 'failed' = 'failed') {
    super(message);
    this.name = 'LocalDataError';
    this.reason = reason;
  }
}

/** Deletes one IndexedDB database. Fails if another tab keeps it open. */
export function deleteDatabase(name: string, factory: IDBFactory = indexedDB): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new LocalDataError('The browser could not delete the stored data. Try again, or clear this site’s data in the browser settings.'));
    request.onblocked = () => reject(new LocalDataError('ArcherLab is open in another tab. Close the other tabs, then try again.', 'blocked'));
  });
}

const list = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items.at(-1)}` : items[0]);

/** Removes every key the app owns from a Storage area; returns how many were removed. */
export function clearAppKeys(storage: Storage | undefined): number {
  if (!storage) return 0;
  try {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(STORAGE_KEY_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => storage.removeItem(key));
    return keys.length;
  } catch {
    return 0;
  }
}

export function deleteAllVideoAnalyses(factory?: IDBFactory): Promise<void> {
  return deleteDatabase(VIDEO_DB_NAME, factory);
}

/**
 * Profile, recordings, video analyses, settings, saved AI keys, the sign-in and
 * the private coach's downloaded model on this device. Cloud copies are not touched. Every store is attempted even
 * if one fails, so a failure never leaves the rest half-deleted; the error
 * names what is left.
 */
export async function deleteEverythingOnDevice(factory?: IDBFactory): Promise<void> {
  const blocked: string[] = [];
  const failed: string[] = [];
  for (const name of APP_DATABASES) {
    try {
      await deleteDatabase(name, factory);
    } catch (error) {
      (error instanceof LocalDataError && error.reason === 'blocked' ? blocked : failed).push(DATABASE_LABELS[name] ?? name);
    }
  }
  // Checked before the storage keys go, because the flag that says it was downloaded is one of them.
  if (modelWasDownloaded()) {
    try { await removeLocalModel(); } catch { failed.push(LOCAL_MODEL_LABEL); }
  }
  clearAppKeys(globalThis.localStorage);
  clearAppKeys(globalThis.sessionStorage);
  if (failed.length) {
    throw new LocalDataError(`Everything else was deleted, but ${list([...failed, ...blocked])} could not be. Try again, or clear this site’s data in the browser settings.`);
  }
  if (blocked.length) {
    throw new LocalDataError(`Everything else was deleted. ${list(blocked).replace(/^./, (first) => first.toUpperCase())} will be deleted as soon as you close ArcherLab in your other tabs.`, 'blocked');
  }
}

/** All video reports on this device, with landmarks, as one JSON file. Returns null when there are none. */
export async function exportAllVideoReports(now = Date.now()): Promise<{ blob: Blob; count: number } | null> {
  const summaries = await listVideoReports();
  const reports = [];
  for (const summary of summaries) {
    const report = await loadVideoReport(summary.id);
    if (report) reports.push(report);
  }
  if (!reports.length) return null;
  // Built from parts, so a large history never has to fit in one string.
  const parts: string[] = [`{"app":"ArcherLab Edge","exportedAt":"${new Date(now).toISOString()}","reports":[\n`];
  reports.forEach((report, index) => parts.push(index ? ',\n' : '', reportToJson(report)));
  parts.push('\n]}\n');
  return { blob: new Blob(parts, { type: 'application/json' }), count: reports.length };
}
