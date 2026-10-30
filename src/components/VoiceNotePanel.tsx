import { useCallback, useEffect, useRef, useState } from 'react';
import { VOICE_CONFIG, VOICE_LANGUAGES, readVoiceSettings, writeVoiceSettings, type VoiceLanguage, type VoiceSettings } from '../voice-notes/config';
import { formatParsedScore, parseScore, type ParsedScore } from '../voice-notes/scoreParser';
import { formatBytes } from '../video-analysis/format';
import { ActionButton } from './ActionButton';
import { AppIcon } from './AppIcon';

type Phase =
  | { kind: 'idle' }
  | { kind: 'consent'; then: 'record' | 'auto' }
  | { kind: 'recording'; startedAt: number; limitS: number }
  | { kind: 'working'; loadedBytes: number | null; totalBytes: number }
  | { kind: 'review'; text: string }
  | { kind: 'failed'; message: string };

type VoiceNotePanelProps = {
  /** Called with the confirmed note and, when the athlete accepted it, the score read from it. */
  onSave: (text: string, score: ParsedScore | null) => void;
  /** Changes when a new shot is captured; with "listen after each shot" on, recording starts by itself. */
  autoListenKey?: string;
  /** Shows the "listen after each shot" option (Live Analysis only). */
  showAutoListen?: boolean;
  /** Existing note, shown so the athlete knows a new one replaces it. */
  existing?: string;
  /** Offer the score read from the note (off where a shot has no score, as in a video report). */
  suggestScore?: boolean;
};

const TOTAL_DOWNLOAD = VOICE_CONFIG.modelBytes + VOICE_CONFIG.runtimeBytes;

/**
 * Records a short voice note and turns it into text with Whisper running in this browser. The audio is never
 * uploaded or stored; only the text the athlete confirms is saved. The model is downloaded once, after asking.
 */
export function VoiceNotePanel({ onSave, autoListenKey, showAutoListen = false, existing, suggestScore = true }: VoiceNotePanelProps) {
  const [settings, setSettings] = useState<VoiceSettings>(readVoiceSettings);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [draft, setDraft] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const cancelledRef = useRef(false);

  const updateSettings = (changes: Partial<VoiceSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...changes };
      writeVoiceSettings(next);
      return next;
    });
  };

  const stopTracks = (recorder: MediaRecorder | null) => recorder?.stream.getTracks().forEach((track) => track.stop());

  const finish = useCallback(async (recording: Blob, language: VoiceLanguage) => {
    setPhase({ kind: 'working', loadedBytes: null, totalBytes: TOTAL_DOWNLOAD });
    try {
      const { transcribe, voiceModelDeployed } = await import('../voice-notes/browser/transcriber');
      if (!(await voiceModelDeployed())) throw new Error('The speech model is not part of this deployment (npm run models:whisper adds it).');
      const text = await transcribe(recording, language, ({ loadedBytes, totalBytes }) => {
        if (!cancelledRef.current) setPhase({ kind: 'working', loadedBytes, totalBytes });
      });
      if (cancelledRef.current) return;
      setDraft(text);
      setPhase({ kind: 'review', text });
    } catch (error) {
      if (cancelledRef.current) return;
      const message = error instanceof Error ? error.message : String(error);
      setPhase({ kind: 'failed', message: /fetch|network|load failed/i.test(message) ? `The speech model could not be loaded (${message}). It needs a connection the first time.` : message });
    }
  }, []);

  const record = useCallback(async (limitS: number) => {
    cancelledRef.current = false;
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setPhase({ kind: 'failed', message: 'This browser cannot record audio.' });
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setPhase({ kind: 'failed', message: 'The microphone could not be opened. Allow microphone access for this site and try again.' });
      return;
    }
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    const language = settings.language;
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
      window.clearTimeout(timerRef.current);
      stopTracks(recorder);
      recorderRef.current = null;
      if (cancelledRef.current) return;
      void finish(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }), language);
    };
    recorderRef.current = recorder;
    recorder.start();
    setPhase({ kind: 'recording', startedAt: Date.now(), limitS });
    timerRef.current = window.setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, limitS * 1000);
  }, [finish, settings.language]);

  const request = useCallback((mode: 'record' | 'auto') => {
    if (!settings.downloadAccepted) { setPhase({ kind: 'consent', then: mode }); return; }
    void record(mode === 'auto' ? VOICE_CONFIG.autoListenS : VOICE_CONFIG.maxNoteS);
  }, [record, settings.downloadAccepted]);

  // Listen after each captured shot, when the athlete turned it on (and already agreed to the download).
  useEffect(() => {
    if (!autoListenKey || !settings.autoListen || !settings.downloadAccepted) return;
    const start = window.setTimeout(() => void record(VOICE_CONFIG.autoListenS), 0);
    return () => window.clearTimeout(start);
  }, [autoListenKey, record, settings.autoListen, settings.downloadAccepted]);

  // Leaving stops the microphone; the recording is dropped.
  useEffect(() => () => {
    cancelledRef.current = true;
    window.clearTimeout(timerRef.current);
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    stopTracks(recorder);
  }, []);

  const cancel = () => {
    cancelledRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    setPhase({ kind: 'idle' });
  };

  const save = (withScore: boolean) => {
    if (phase.kind !== 'review') return;
    const text = draft.trim();
    onSave(text, withScore ? parseScore(text) : null);
    setPhase({ kind: 'idle' });
  };

  const language = VOICE_LANGUAGES[settings.language];

  return (
    <div className="voice-note" role="group" aria-label="Voice note">
      <div className="voice-note__head">
        <span className="eyebrow">Voice note</span>
        <label className="voice-note__language">
          <span className="sr-only">Language</span>
          <select value={settings.language} onChange={(event) => updateSettings({ language: event.target.value as VoiceLanguage })} aria-label="Voice note language">
            {(Object.keys(VOICE_LANGUAGES) as VoiceLanguage[]).map((key) => <option key={key} value={key}>{VOICE_LANGUAGES[key].label}{VOICE_LANGUAGES[key].experimental ? ' · experimental' : ''}</option>)}
          </select>
        </label>
      </div>

      {phase.kind === 'consent' ? (
        <div className="va-callout" role="alertdialog" aria-label="Download the speech model">
          <p><strong>Download the speech model once?</strong> Voice notes turn speech into text on this device with Whisper. That needs a one-time download of about {formatBytes(TOTAL_DOWNLOAD)}, which is then kept in this browser. Your audio is never uploaded or saved.</p>
          <div className="va-actions">
            <ActionButton type="button" onClick={() => {
              setPhase({ kind: 'idle' });
              // From the "listen after each shot" option: turn it on, and it records after the next shot.
              if (phase.then === 'auto') { updateSettings({ downloadAccepted: true, autoListen: true }); return; }
              updateSettings({ downloadAccepted: true });
              void record(VOICE_CONFIG.maxNoteS);
            }}>{phase.then === 'auto' ? 'Download and turn on' : 'Download and record'}</ActionButton>
            <ActionButton type="button" variant="ghost" onClick={() => setPhase({ kind: 'idle' })}>Not now</ActionButton>
          </div>
        </div>
      ) : null}

      {phase.kind === 'idle' || phase.kind === 'failed' ? (
        <>
          {phase.kind === 'failed' ? <p className="va-callout" role="alert">{phase.message}</p> : null}
          <div className="va-actions">
            <ActionButton type="button" variant="secondary" onClick={() => request('record')}><AppIcon name="mic" size={16} /> {existing ? 'Replace voice note' : 'Voice note'}</ActionButton>
          </div>
          {existing ? <p className="voice-note__text">“{existing}”</p> : null}
        </>
      ) : null}

      {phase.kind === 'recording' ? (
        <div className="va-actions" aria-live="polite">
          <span className="voice-note__live">Listening… say the score and anything you noticed (up to {phase.limitS} s).</span>
          <ActionButton type="button" onClick={() => recorderRef.current?.stop()}>Done</ActionButton>
          <ActionButton type="button" variant="ghost" onClick={cancel}>Cancel</ActionButton>
        </div>
      ) : null}

      {phase.kind === 'working' ? (
        <p className="va-muted" aria-live="polite">
          {phase.loadedBytes !== null && phase.loadedBytes < phase.totalBytes
            ? `Downloading the speech model… ${formatBytes(phase.loadedBytes)} of ${formatBytes(phase.totalBytes)}`
            : 'Turning your note into text on this device…'}
        </p>
      ) : null}

      {phase.kind === 'review' ? (
        <div className="voice-note__review">
          <label>
            <span>Note (edit if needed)</span>
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={2} />
          </label>
          {!phase.text ? <p className="va-muted">Nothing was heard. Type a note, or try again closer to the microphone.</p> : null}
          {(() => {
            const suggested = suggestScore ? parseScore(draft) : null;
            return (
              <div className="va-actions">
                {suggested ? <ActionButton type="button" onClick={() => save(true)}>Save note and score {formatParsedScore(suggested)}</ActionButton> : null}
                <ActionButton type="button" variant={suggested ? 'secondary' : 'primary'} disabled={!draft.trim()} onClick={() => save(false)}>Save note{suggested ? ' only' : ''}</ActionButton>
                <ActionButton type="button" variant="ghost" onClick={() => setPhase({ kind: 'idle' })}>Discard</ActionButton>
              </div>
            );
          })()}
          {language.experimental ? <p className="va-faint">{language.label} recognition is experimental with this small model; check the text.</p> : null}
        </div>
      ) : null}

      {showAutoListen ? (
        <label className="voice-note__auto">
          <input type="checkbox" checked={settings.autoListen} onChange={(event) => {
            const on = event.target.checked;
            if (on && !settings.downloadAccepted) { setPhase({ kind: 'consent', then: 'auto' }); return; }
            updateSettings({ autoListen: on });
          }} />
          Listen for {VOICE_CONFIG.autoListenS} s after each shot
        </label>
      ) : null}
    </div>
  );
}
