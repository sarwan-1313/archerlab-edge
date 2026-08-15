import { useEffect, useRef, useState } from 'react';
import { addChunk, addTelemetry, finalizeRecording } from '../recording/recordingStorage';

function chooseMimeType(): string | null {
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  for (const c of candidates) if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) return c;
  return null;
}

export type RecordingState = 'idle' | 'recording' | 'paused' | 'finalizing' | 'error';

export function useSessionRecorder(stream: MediaStream | null, options?: { sessionId?: string; athleteId?: string; quality?: '480p' | '720p'; telemetryHz?: number }) {
  const { sessionId, athleteId } = options ?? {};
  const recorderRef = useRef<MediaRecorder | null>(null);
  const startRef = useRef<number | null>(null);
  const chunkIndexRef = useRef(0);
  const [state, setState] = useState<RecordingState>('idle');
  const [durationMs, setDurationMs] = useState(0);
  const intervalRef = useRef<number | null>(null);
  const telemetryIntervalRef = useRef<number | null>(null);
  const metadataRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      if (telemetryIntervalRef.current) window.clearInterval(telemetryIntervalRef.current);
    };
  }, []);

  const start = async (metaOverrides: any = {}) => {
    if (!stream) return { ok: false, error: 'No stream' };
    try {
      const mime = chooseMimeType() ?? 'video/webm';
      const manifestId = `rec:${Date.now().toString(36)}`;
      const startedAt = Date.now();
      metadataRef.current = { id: manifestId, sessionId: sessionId ?? null, athleteId: athleteId ?? null, startedAt, endedAt: null, durationMs: 0, mimeType: mime, width: stream.getVideoTracks()?.[0]?.getSettings()?.width ?? null, height: stream.getVideoTracks()?.[0]?.getSettings()?.height ?? null, chunkCount: 0, approximateBytes: 0, ...metaOverrides };
      const optionsRec: any = { mimeType: mime };
      const mr = new MediaRecorder(stream, optionsRec);
      recorderRef.current = mr;
      chunkIndexRef.current = 0;
      mr.ondataavailable = async (ev) => {
        if (!ev.data || ev.data.size === 0) return;
        const idx = chunkIndexRef.current++;
        try {
          await addChunk(manifestId, idx, ev.data, Date.now() - startedAt);
          metadataRef.current.chunkCount = idx + 1;
          metadataRef.current.approximateBytes = (metadataRef.current.approximateBytes ?? 0) + ev.data.size;
        } catch (e) {
          // ignore storage errors but mark state
          setState('error');
        }
      };
      mr.onstop = async () => {
        setState('finalizing');
        metadataRef.current.endedAt = Date.now();
        metadataRef.current.durationMs = metadataRef.current.endedAt - metadataRef.current.startedAt;
        try {
          await finalizeRecording(metadataRef.current);
          setState('idle');
        } catch (e) {
          setState('error');
        }
      };
      mr.onerror = () => setState('error');
      // start with 1s chunks
      mr.start(1000);
      startRef.current = startedAt;
      setState('recording');
      // duration timer
      intervalRef.current = window.setInterval(() => {
        setDurationMs((Date.now() - (startRef.current ?? Date.now())));
      }, 250) as unknown as number;
      return { ok: true, id: manifestId };
    } catch (err) {
      setState('error');
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  };

  const pause = () => {
    const mr = recorderRef.current;
    if (mr && mr.state === 'recording') {
      mr.pause();
      setState('paused');
    }
  };

  const resume = () => {
    const mr = recorderRef.current;
    if (mr && mr.state === 'paused') {
      mr.resume();
      setState('recording');
    }
  };

  const stop = () => {
    const mr = recorderRef.current;
    if (mr && mr.state !== 'inactive') {
      mr.stop();
      if (intervalRef.current) { window.clearInterval(intervalRef.current); intervalRef.current = null; }
    }
  };

  const recordTelemetryFrame = async (frame: any) => {
    if (!metadataRef.current) return;
    try {
      await addTelemetry(metadataRef.current.id, frame);
    } catch (e) {
      // ignore
    }
  };

  const recordEvent = async (event: { type: string; tMs?: number; [k: string]: any }) => {
    if (!metadataRef.current) return;
    const frame = { ...event, tMs: typeof event.tMs === 'number' ? event.tMs : Date.now() - metadataRef.current.startedAt };
    try { await addTelemetry(metadataRef.current.id, frame); } catch (e) { }
  };

  return { state, durationMs, start, pause, resume, stop, recordTelemetryFrame, recordEvent };
}
