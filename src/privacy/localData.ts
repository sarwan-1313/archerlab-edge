import { PROFILE_DB_NAME } from '../profile/profileStorage';
import { RECORDINGS_DB_NAME } from '../recording/recordingStorage';
import { VIDEO_DB_NAME, listVideoReports, loadVideoReport, reportToJson } from '../video-analysis/storage';

/**
 * Everything ArcherLab keeps in this browser, and how to export or remove it.
 * Add new IndexedDB databases and storage keys here so "Delete everything"
 * stays complete.
 */

export const APP_DATABASES = [PROFILE_DB_NAME, RECORDINGS_DB_NAME, VIDEO_DB_NAME] as const;
export const STORAGE_KEY_PREFIX = 'archerlab-edge:';

/** A failure with a message for the athlete. */
export class LocalDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalDataError';
  }
}

/** Deletes one IndexedDB database. Fails if another tab keeps it open. */
export function deleteDatabase(name: string, factory: IDBFactory = indexedDB): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(new LocalDataError('The browser could not delete the stored data. Try again, or clear this site’s data in the browser settings.'));
    request.onblocked = () => reject(new LocalDataError('ArcherLab is open in another tab. Close the other tabs, then try again.'));
  });
}

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

/** Profile, recordings, video analyses, settings, saved AI keys and the sign-in on this device. Cloud copies are not touched. */
export async function deleteEverythingOnDevice(factory?: IDBFactory): Promise<void> {
  for (const name of APP_DATABASES) await deleteDatabase(name, factory);
  clearAppKeys(globalThis.localStorage);
  clearAppKeys(globalThis.sessionStorage);
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
