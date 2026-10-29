import { EMPTY_GOALS, type PracticeEntry, type PracticeGoals, type PracticeLogData } from './types';

/**
 * The practice log, kept on this device in IndexedDB. Entries are keyed by id,
 * so adding the same session or report again replaces its entry. Listeners are
 * told about every change, in this tab and (via BroadcastChannel) in others.
 */
export const PRACTICE_DB_NAME = 'archerlab-edge-practice-log';
const VERSION = 1;
const GOALS_KEY = 'goals';

const listeners = new Set<() => void>();
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(PRACTICE_DB_NAME) : null;
channel?.addEventListener('message', () => listeners.forEach((listener) => listener()));

export function subscribePracticeLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function changed() {
  listeners.forEach((listener) => listener());
  channel?.postMessage('changed');
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PRACTICE_DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transact<T>(stores: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then((db) => new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result: T | undefined;
    const request = work(tx);
    if (request) request.onsuccess = () => { result = request.result; };
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Storage transaction was aborted.')); };
  }));
}

/** Every entry, newest first. */
export async function listPracticeEntries(): Promise<PracticeEntry[]> {
  const all = await transact<PracticeEntry[]>(['entries'], 'readonly', (tx) => tx.objectStore('entries').getAll());
  return (all ?? []).sort((a, b) => b.date - a.date);
}

export async function savePracticeEntry(entry: PracticeEntry): Promise<void> {
  await transact(['entries'], 'readwrite', (tx) => { tx.objectStore('entries').put(entry); });
  changed();
}

export async function deletePracticeEntry(id: string): Promise<void> {
  await transact(['entries'], 'readwrite', (tx) => { tx.objectStore('entries').delete(id); });
  changed();
}

export async function readPracticeGoals(): Promise<PracticeGoals> {
  const goals = await transact<PracticeGoals>(['meta'], 'readonly', (tx) => tx.objectStore('meta').get(GOALS_KEY));
  return { ...EMPTY_GOALS, ...goals };
}

export async function savePracticeGoals(goals: PracticeGoals): Promise<void> {
  await transact(['meta'], 'readwrite', (tx) => { tx.objectStore('meta').put(goals, GOALS_KEY); });
  changed();
}

export async function readPracticeLog(): Promise<PracticeLogData> {
  return { entries: await listPracticeEntries(), goals: await readPracticeGoals() };
}

/**
 * Adds entries from a backup or export: an entry already on this device is
 * kept unless the incoming copy has the same id; goals are taken when newer.
 * Returns how many entries were added or replaced.
 */
export async function mergePracticeLog(data: PracticeLogData): Promise<number> {
  const current = await readPracticeGoals();
  await transact(['entries', 'meta'], 'readwrite', (tx) => {
    for (const entry of data.entries) tx.objectStore('entries').put(entry);
    if ((data.goals?.updatedAt ?? 0) > current.updatedAt) tx.objectStore('meta').put({ ...EMPTY_GOALS, ...data.goals }, GOALS_KEY);
  });
  changed();
  return data.entries.length;
}

/** Records an entry without ever failing the caller: the log is a convenience, not part of the session. */
export function recordPracticeEntry(entry: PracticeEntry): void {
  savePracticeEntry(entry).catch((error: unknown) => console.warn('The practice log could not be updated', error));
}

/** Checks a parsed backup or export before merging it. */
export function isPracticeLogData(value: unknown): value is PracticeLogData {
  if (!value || typeof value !== 'object') return false;
  const { entries } = value as { entries?: unknown };
  return Array.isArray(entries) && entries.every((entry) => entry && typeof entry === 'object'
    && typeof (entry as PracticeEntry).id === 'string'
    && typeof (entry as PracticeEntry).date === 'number'
    && typeof (entry as PracticeEntry).arrows === 'number');
}
