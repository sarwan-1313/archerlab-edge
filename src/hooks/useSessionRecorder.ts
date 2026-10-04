import { useEffect, useRef, useState } from 'react';
import { addChunk, addTelemetry, finalizeRecording } from '../recording/recordingStorage';

function chooseMimeType(): string | null {
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  for (const c of candidates) if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) return c;
  return null;
}

function createRecordingId(): string {
  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return `rec:${Date.now().toString(36)}:${suffix}`;
}

export type RecordingState = 'idle' | 'recording' | 'paused' | 'finalizing' | 'error';

type RecorderResources = {
  recorder: MediaRecorder | null;
  durationInterval: number | null;
};

type RecordingLifecycle = {
  id: string;
  metadata: any;
  startedAt: number;
  nextChunkIndex: number;
  pendingChunks: Set<Promise<void>>;
  pendingTelemetry: Set<Promise<void>>;
  chunkError: unknown;
  failed: boolean;
  closed: boolean;
};

export function useSessionRecorder(stream: MediaStream | null, options?: { sessionId?: string; athleteId?: string; quality?: '480p' | '720p'; telemetryHz?: number }) {
  const { sessionId, athleteId } = options ?? {};
  const resourcesRef = useRef<RecorderResources>({ recorder: null, durationInterval: null });
  const startRef = useRef<number | null>(null);
  const chunkIndexRef = useRef(0);
  const [state, setState] = useState<RecordingState>('idle');
  const [durationMs, setDurationMs] = useState(0);
  const metadataRef = useRef<any>(null);
  const lifecycleRef = useRef<RecordingLifecycle | null>(null);

  useEffect(() => {
    const resources: RecorderResources = { recorder: null, durationInterval: null };
    resourcesRef.current = resources;
    return () => {
      const recorder = resources.recorder;
      resources.recorder = null;
      if (resources.durationInterval !== null) {
        window.clearInterval(resources.durationInterval);
        resources.durationInterval = null;
      }
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      const lifecycle = lifecycleRef.current;
      if (lifecycle) lifecycle.closed = true;
      lifecycleRef.current = null;
      metadataRef.current = null;
    };
  }, []);

  const start = async (metaOverrides: any = {}) => {
    if (!stream) return { ok: false, error: 'No stream' };
    if (lifecycleRef.current && !lifecycleRef.current.closed) return { ok: false, error: 'Recording already active' };
    try {
      const mime = chooseMimeType() ?? 'video/webm';
      const manifestId = createRecordingId();
      const startedAt = Date.now();
      const lifecycle: RecordingLifecycle = {
        id: manifestId,
        startedAt,
        nextChunkIndex: 0,
        pendingChunks: new Set(),
        pendingTelemetry: new Set(),
        chunkError: null,
        failed: false,
        closed: false,
        metadata: { id: manifestId, sessionId: sessionId ?? null, athleteId: athleteId ?? null, startedAt, endedAt: null, durationMs: 0, mimeType: mime, width: stream.getVideoTracks()?.[0]?.getSettings()?.width ?? null, height: stream.getVideoTracks()?.[0]?.getSettings()?.height ?? null, chunkCount: 0, approximateBytes: 0, ...metaOverrides },
      };
      lifecycleRef.current = lifecycle;
      metadataRef.current = lifecycle.metadata;
      const optionsRec: any = { mimeType: mime };
      const mr = new MediaRecorder(stream, optionsRec);
      resourcesRef.current.recorder = mr;
      chunkIndexRef.current = 0;
      mr.ondataavailable = async (ev) => {
        if (!ev.data || ev.data.size === 0) return;
        const idx = lifecycle.nextChunkIndex++;
        const write = addChunk(manifestId, idx, ev.data, Date.now() - startedAt).then(() => {
          lifecycle.metadata.chunkCount = idx + 1;
          lifecycle.metadata.approximateBytes = (lifecycle.metadata.approximateBytes ?? 0) + ev.data.size;
        }).catch((error) => {
          lifecycle.chunkError = error;
          console.error('Unable to save recording chunk', error);
          if (lifecycleRef.current === lifecycle) setState('error');
          throw error;
        });
        lifecycle.pendingChunks.add(write);
        void write.then(
          () => lifecycle.pendingChunks.delete(write),
          () => lifecycle.pendingChunks.delete(write),
        );
      };
      mr.onstop = async () => {
        lifecycle.closed = true;
        if (lifecycleRef.current === lifecycle) setState('finalizing');
        lifecycle.metadata.endedAt = Date.now();
        lifecycle.metadata.durationMs = lifecycle.metadata.endedAt - lifecycle.metadata.startedAt;
        try {
          if (lifecycle.failed) throw new Error('Recording failed before finalization');
          const writes = [...lifecycle.pendingChunks];
          const results = await Promise.allSettled(writes);
          if (lifecycle.chunkError || results.some((result) => result.status === 'rejected')) {
            throw lifecycle.chunkError ?? new Error('A recording chunk could not be persisted');
          }
          await Promise.allSettled([...lifecycle.pendingTelemetry]);
          await finalizeRecording(lifecycle.metadata);
          if (lifecycleRef.current === lifecycle) {
            metadataRef.current = null;
            lifecycleRef.current = null;
            setState('idle');
          }
        } catch (error) {
          console.error('Unable to finalize recording', error);
          if (lifecycleRef.current === lifecycle) setState('error');
        }
      };
      mr.onerror = () => {
        lifecycle.failed = true;
        lifecycle.closed = true;
        if (lifecycleRef.current === lifecycle) {
          lifecycleRef.current = null;
          metadataRef.current = null;
          resourcesRef.current.recorder = null;
          setState('error');
        }
      };
      // start with 1s chunks
      mr.start(1000);
      startRef.current = startedAt;
      setState('recording');
      // duration timer
      resourcesRef.current.durationInterval = window.setInterval(() => {
        setDurationMs((Date.now() - (startRef.current ?? Date.now())));
      }, 250) as unknown as number;
      return { ok: true, id: manifestId };
    } catch (err) {
      lifecycleRef.current = null;
      metadataRef.current = null;
      resourcesRef.current.recorder = null;
      setState('error');
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  };

  const pause = () => {
    const mr = resourcesRef.current.recorder;
    if (mr && mr.state === 'recording') {
      mr.pause();
      setState('paused');
    }
  };

  const resume = () => {
    const mr = resourcesRef.current.recorder;
    if (mr && mr.state === 'paused') {
      mr.resume();
      setState('recording');
    }
  };

  const stop = () => {
    const resources = resourcesRef.current;
    const mr = resources.recorder;
    if (mr && mr.state !== 'inactive') {
      mr.stop();
      if (resources.durationInterval !== null) {
        window.clearInterval(resources.durationInterval);
        resources.durationInterval = null;
      }
    }
  };

  const recordTelemetryFrame = async (frame: any) => {
    const lifecycle = lifecycleRef.current;
    if (!lifecycle || lifecycle.closed || metadataRef.current !== lifecycle.metadata) return;
    const write = addTelemetry(lifecycle.id, frame).catch((error) => {
      console.error('Unable to save recording telemetry frame', error);
    });
    lifecycle.pendingTelemetry.add(write);
    await write;
    lifecycle.pendingTelemetry.delete(write);
  };

  const recordEvent = async (event: { type: string; tMs?: number; [k: string]: any }) => {
    const lifecycle = lifecycleRef.current;
    if (!lifecycle || lifecycle.closed || metadataRef.current !== lifecycle.metadata) return;
    const frame = { ...event, tMs: typeof event.tMs === 'number' ? event.tMs : Date.now() - lifecycle.startedAt };
    const write = addTelemetry(lifecycle.id, frame).catch((error) => { console.error('Unable to save recording event', error); });
    lifecycle.pendingTelemetry.add(write);
    await write;
    lifecycle.pendingTelemetry.delete(write);
  };

  return { state, durationMs, start, pause, resume, stop, recordTelemetryFrame, recordEvent };
}
