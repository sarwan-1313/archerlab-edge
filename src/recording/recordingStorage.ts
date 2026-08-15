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

export async function getTelemetryForRecording(recordingId: string): Promise<any[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TELEMETRY, 'readonly');
    const idx = tx.objectStore(STORE_TELEMETRY).index('recordingId');
    const req = idx.getAll(IDBKeyRange.only(recordingId));
    req.onsuccess = () => resolve(req.result.map((r: any) => r.frame));
    req.onerror = () => reject(req.error);
  });
}

export async function deleteRecording(recordingId: string) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_RECORDINGS, STORE_CHUNKS, STORE_TELEMETRY], 'readwrite');
    tx.objectStore(STORE_RECORDINGS).delete(recordingId);
    // delete chunks by scanning index
    const idx = tx.objectStore(STORE_CHUNKS).index('recordingId');
    const req = idx.openCursor(IDBKeyRange.only(recordingId));
    req.onsuccess = () => {
      const cur = req.result as IDBCursorWithValue | null;
      if (!cur) return; cur.delete(); cur.continue();
    };
    req.onerror = () => { /* ignore */ };
    // telemetry
    const tIdx = tx.objectStore(STORE_TELEMETRY).index('recordingId');
    const tReq = tIdx.openCursor(IDBKeyRange.only(recordingId));
    tReq.onsuccess = () => {
      const cur = tReq.result as IDBCursorWithValue | null;
      if (!cur) return; cur.delete(); cur.continue();
    };
    tReq.onerror = () => { /* ignore */ };
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  });
}

export async function exportRecordingData(recordingId: string): Promise<{manifest:any, telemetry:any[], sizeEstimate:number}> {
  const db = await openDb();
  const manifest = await new Promise<any>((resolve, reject) => {
    const tx = db.transaction(STORE_RECORDINGS, 'readonly');
    const req = tx.objectStore(STORE_RECORDINGS).get(recordingId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const telemetry = await getTelemetryForRecording(recordingId);
  const chunks = await getChunksForRecording(recordingId);
  const sizeEstimate = chunks.reduce((s, c) => s + (c.blob?.size ?? 0), 0);
  return { manifest, telemetry, sizeEstimate };
}
