import { summarizeReport } from './buildReport';
import type { VideoAnalysisReport, VideoReportSummary } from './types';

/**
 * Video analysis history, kept on this device in IndexedDB. Summaries live in
 * their own store so the history list loads without reading every report.
 * The video itself is only kept when the athlete asks for it.
 */
const DB = 'archerlab-edge-video';
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of ['reports', 'summaries', 'videos']) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: 'id' });
      }
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

export async function saveVideoReport(report: VideoAnalysisReport, video?: Blob | null): Promise<VideoReportSummary> {
  const summary = summarizeReport(report, Boolean(video));
  await transact(['reports', 'summaries', 'videos'], 'readwrite', (tx) => {
    tx.objectStore('reports').put(report);
    tx.objectStore('summaries').put(summary);
    if (video) tx.objectStore('videos').put({ id: report.id, blob: video, type: video.type });
  });
  return summary;
}

/** Saves a report over the stored one with the same id, keeping any stored video. */
export async function updateVideoReport(report: VideoAnalysisReport): Promise<VideoReportSummary> {
  const existing = await transact<VideoReportSummary>(['summaries'], 'readonly', (tx) => tx.objectStore('summaries').get(report.id));
  const summary = summarizeReport(report, existing?.hasVideo ?? false);
  await transact(['reports', 'summaries'], 'readwrite', (tx) => {
    tx.objectStore('reports').put(report);
    tx.objectStore('summaries').put(summary);
  });
  return summary;
}

export async function listVideoReports(): Promise<VideoReportSummary[]> {
  const all = await transact<VideoReportSummary[]>(['summaries'], 'readonly', (tx) => tx.objectStore('summaries').getAll());
  return (all ?? []).sort((a, b) => b.createdAt - a.createdAt);
}

export async function loadVideoReport(id: string): Promise<VideoAnalysisReport | null> {
  return (await transact<VideoAnalysisReport>(['reports'], 'readonly', (tx) => tx.objectStore('reports').get(id))) ?? null;
}

export async function loadVideoBlob(id: string): Promise<Blob | null> {
  const record = await transact<{ id: string; blob: Blob }>(['videos'], 'readonly', (tx) => tx.objectStore('videos').get(id));
  return record?.blob ?? null;
}

export async function deleteVideoReport(id: string): Promise<void> {
  await transact(['reports', 'summaries', 'videos'], 'readwrite', (tx) => {
    tx.objectStore('reports').delete(id);
    tx.objectStore('summaries').delete(id);
    tx.objectStore('videos').delete(id);
  });
}

/** A JSON-safe copy of a report (typed arrays become plain arrays). */
export function reportToJson(report: VideoAnalysisReport): string {
  return JSON.stringify(report, (_key, value) => (value instanceof Float32Array ? Array.from(value, (n) => Number(n.toFixed(5))) : value), 2);
}
