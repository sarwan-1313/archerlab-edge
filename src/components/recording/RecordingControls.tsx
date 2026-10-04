import { AppIcon } from '../AppIcon';
import type { RecordingState } from '../../hooks/useSessionRecorder';

export function RecordingControls({ state, durationMs, onStart, onPause, onResume, onStop }: { state: RecordingState; durationMs: number; onStart: () => Promise<void> | void; onPause: () => void; onResume: () => void; onStop: () => void; }) {
  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  return (
    <div className="recording-controls">
      {state === 'recording' ? (
        <div className="recording-controls__row"><span className="recording-indicator"><i />Recording</span><strong className="recording-time">{fmt(durationMs)}</strong><div className="recording-actions"><button type="button" onClick={onPause}><AppIcon name="pause" size={14} />Pause</button><button type="button" onClick={onStop}><AppIcon name="stop" size={13} />Save</button></div></div>
      ) : state === 'paused' ? (
        <div className="recording-controls__row"><span className="recording-indicator recording-paused"><i />Paused</span><strong className="recording-time">{fmt(durationMs)}</strong><div className="recording-actions"><button type="button" onClick={onResume}><AppIcon name="play" size={14} />Resume</button><button type="button" onClick={onStop}><AppIcon name="stop" size={13} />Save</button></div></div>
      ) : state === 'finalizing' ? (
        <div className="recording-controls__row"><span className="recording-indicator recording-finalizing"><i />Saving session</span><strong className="recording-time">{fmt(durationMs)}</strong></div>
      ) : state === 'error' ? (
        <div className="recording-controls__row"><span className="recording-indicator recording-error"><i />Recording error</span><strong className="recording-time">{fmt(durationMs)}</strong></div>
      ) : (
        <div className="recording-controls__row"><button type="button" className="recording-start" onClick={() => void onStart()}><AppIcon name="camera" size={15} /><span className="recording-label-long">Record session</span><span className="recording-label-short">Record</span></button></div>
      )}
    </div>
  );
}
