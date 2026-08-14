import { useEffect } from 'react';
import type { RecordingState } from '../../hooks/useSessionRecorder';

export function RecordingControls({ state, durationMs, onStart, onPause, onResume, onStop }: { state: RecordingState; durationMs: number; onStart: () => Promise<void> | void; onPause: () => void; onResume: () => void; onStop: () => void; }) {
  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  useEffect(() => {
    // noop
  }, [state]);

  return (
    <div className="recording-controls">
      {state === 'recording' ? (
        <div className="recording-controls__row"><span className="recording-indicator">● REC</span><strong className="recording-time">{fmt(durationMs)}</strong><div className="recording-actions"><button type="button" onClick={onPause}>Pause</button><button type="button" onClick={onStop}>Stop & Save</button></div></div>
      ) : state === 'paused' ? (
        <div className="recording-controls__row"><span className="recording-indicator recording-paused">● PAUSED</span><strong className="recording-time">{fmt(durationMs)}</strong><div className="recording-actions"><button type="button" onClick={onResume}>Resume</button><button type="button" onClick={onStop}>Stop & Save</button></div></div>
      ) : (
        <div className="recording-controls__row"><button type="button" onClick={() => void onStart()}>Start Recording</button></div>
      )}
    </div>
  );
}
