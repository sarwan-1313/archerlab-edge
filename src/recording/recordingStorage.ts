// Minimal IndexedDB storage for recordings and telemetry

const DB_NAME = 'archerlab-edge-recordings';
const DB_VERSION = 1;
const STORE_RECORDINGS = 'recordings';
const STORE_CHUNKS = 'chunks';
const STORE_TELEMETRY = 'telemetry';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_RECORDINGS)) db.createObjectStore(STORE_RECORDINGS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
        const s = db.createObjectStore(STORE_CHUNKS, { keyPath: 'id' });
        s.createIndex('recordingId', 'recordingId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_TELEMETRY)) {
        const t = db.createObjectStore(STORE_TELEMETRY, { keyPath: 'id' });
        t.createIndex('recordingId', 'recordingId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveRecordingManifest(manifest: any) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_RECORDINGS, 'readwrite');
    tx.objectStore(STORE_RECORDINGS).put(manifest);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function addChunk(recordingId: string, index: number, blob: Blob, timestampMs: number) {
  const db = await openDb();
  const rec = { id: `${recordingId}:chunk:${index}`, recordingId, index, blob, timestampMs, size: blob.size };
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_CHUNKS, 'readwrite');
    tx.objectStore(STORE_CHUNKS).put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function addTelemetry(recordingId: string, frame: any) {
  const db = await openDb();
  const id = `${recordingId}:telemetry:${frame.tMs}:${Math.random().toString(36).slice(2,8)}`;
  const rec = { id, recordingId, frame };
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_TELEMETRY, 'readwrite');
    tx.objectStore(STORE_TELEMETRY).put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function finalizeRecording(manifest: any) {
  // update manifest
  await saveRecordingManifest(manifest);
}

export async function listRecordings(): Promise<any[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_RECORDINGS, 'readonly');
    const store = tx.objectStore(STORE_RECORDINGS);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getChunksForRecording(recordingId: string): Promise<{index:number,blob:Blob}[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CHUNKS, 'readonly');
    const idx = tx.objectStore(STORE_CHUNKS).index('recordingId');
    const req = idx.getAll(IDBKeyRange.only(recordingId));
    req.onsuccess = () => resolve(req.result.map((r:any) => ({ index: r.index, blob: r.blob })));
    req.onerror = () => reject(req.error);
  });
}
