import { useEffect, useRef, useState } from 'react';
import { ActionButton } from '../components/ActionButton';
import { AppIcon } from '../components/AppIcon';
import { PageHeader } from '../components/PageHeader';
import { StatusBadge } from '../components/StatusBadge';
import { deleteRecording, exportRecordingData, getChunksForRecording, getTelemetryForRecording, listRecordings } from '../recording/recordingStorage';

type RecordingManifest = {
  id: string;
  sessionId?: string;
  startedAt: number;
  durationMs?: number;
  approximateBytes?: number;
  chunkCount?: number;
  mimeType?: string;
};

type TelemetryFrame = {
  tMs: number;
  type?: string;
  shotId?: string;
  score?: number;
  shoulderLineAngleDeg?: number;
  bowArmAngleDeg?: number;
  torsoLeanDeg?: number;
  headMotion?: number;
  bowHandMotion?: number;
  poseConfidence?: number;
};

const formatDuration = (durationMs = 0) => {
  const totalSeconds = Math.round(durationMs / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
};

function recordingActionMessage(error: unknown, operation: 'open' | 'delete' | 'export'): string {
  const text = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (text.includes('missing') || text.includes('empty') || text.includes('chunk')) return 'Some recording data is missing and the replay could not be reconstructed.';
  if (text.includes('mime') || text.includes('format') || text.includes('not supported')) return 'This recording format is not supported by the current browser.';
  if (text.includes('quota') || text.includes('storage') || text.includes('indexeddb')) return 'Browser storage could not complete this operation.';
  if (operation === 'open') return 'The saved recording appears to be incomplete or corrupted.';
  return 'The recording operation could not be completed.';
}

export function SavedRecordingsPage({ onStart }: { onStart?: () => void }) {
  const [list, setList] = useState<RecordingManifest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playingTelemetry, setPlayingTelemetry] = useState<TelemetryFrame[] | null>(null);
  const [shotEvents, setShotEvents] = useState<TelemetryFrame[]>([]);
  const [currentTelemetry, setCurrentTelemetry] = useState<TelemetryFrame | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const openRequest = useRef(0);
  const [storageInfo, setStorageInfo] = useState<{ estimate?: StorageEstimate; persisted?: boolean }>({});
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => () => { openRequest.current++; }, []);
  useEffect(() => () => { if (playingUrl) URL.revokeObjectURL(playingUrl); }, [playingUrl]);

  const loadRecordings = () => {
    setIsLoading(true);
    setLoadError(false);
    setActionError(null);
    void listRecordings()
      .then((recordings) => setList((recordings as RecordingManifest[]).sort((a, b) => b.startedAt - a.startedAt)))
      .catch(() => { setList([]); setLoadError(true); })
      .finally(() => setIsLoading(false));
  };

  useEffect(loadRecordings, []);
  useEffect(() => {
    if (!navigator.storage) return;
    void navigator.storage.estimate().then((estimate) => setStorageInfo((current) => ({ ...current, estimate }))).catch(() => undefined);
    void navigator.storage.persisted().then((persisted) => setStorageInfo((current) => ({ ...current, persisted }))).catch(() => undefined);
  }, []);

  const requestPersistence = async () => {
    if (!navigator.storage) return;
    try {
      const persisted = await navigator.storage.persist();
      setStorageInfo((current) => ({ ...current, persisted }));
      if (!persisted) setActionError('The browser did not allow persistent storage. Your recordings remain browser-managed.');
    } catch {
      setActionError('Persistent storage could not be enabled. Your recordings remain browser-managed.');
    }
  };

  const stopPlaying = () => {
    openRequest.current++;
    setOpeningId(null);
    setPlayingUrl(null);
    setPlayingId(null);
    setPlayingTelemetry(null);
    setShotEvents([]);
    setCurrentTelemetry(null);
    setCurrentTime(0);
  };

  const play = async (id: string) => {
    const request = ++openRequest.current;
    setOpeningId(id);
    try {
      setActionError(null);
      const chunks = await getChunksForRecording(id);
      const manifest = list.find((recording) => recording.id === id);
      if (manifest?.chunkCount !== undefined && chunks.length < manifest.chunkCount) throw new Error('Missing recording chunks');
      const mimeType = manifest?.mimeType || 'video/webm';
      const blob = new Blob(chunks.sort((a, b) => a.index - b.index).map((chunk) => chunk.blob), { type: mimeType });
      if (!blob.size) throw new Error('Empty recording');
      const telemetry = (await getTelemetryForRecording(id) as TelemetryFrame[]).sort((a, b) => a.tMs - b.tMs);
      if (request !== openRequest.current) return;
      const url = URL.createObjectURL(blob);
      const events = telemetry.filter((frame) => frame.type === 'shot' || frame.type === 'release' || frame.type === 'score');
      setPlayingUrl(url);
      setPlayingId(id);
      setPlayingTelemetry(telemetry);
      setShotEvents(events);
      setCurrentTime(0);
      setCurrentTelemetry(null);
    } catch (error) {
      console.error('Unable to open saved recording', error);
      if (request === openRequest.current) setActionError(`${recordingActionMessage(error, 'open')} Use Open session to retry.`);
    } finally {
      if (request === openRequest.current) setOpeningId(null);
    }
  };

  const doDelete = async (id: string) => {
    if (!window.confirm('Delete this recording from this device?')) return;
    try {
      setActionError(null);
      await deleteRecording(id);
      setList((current) => current.filter((recording) => recording.id !== id));
      if (playingId === id) stopPlaying();
    } catch (error) {
      console.error('Unable to delete saved recording', error);
      setActionError(`${recordingActionMessage(error, 'delete')} No saved data was changed.`);
    }
  };

  const doExport = async (id: string) => {
    try {
      setActionError(null);
      const data = await exportRecordingData(id);
      const blob = new Blob([JSON.stringify({ manifest: data.manifest, telemetry: data.telemetry }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${id}-session.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Unable to export saved recording', error);
      setActionError(`${recordingActionMessage(error, 'export')} The saved recording remains unchanged.`);
    }
  };

  const onTimeUpdate = () => {
    if (!videoRef.current || !playingTelemetry) return;
    const tMs = Math.round(videoRef.current.currentTime * 1000);
    setCurrentTime(tMs);
    let low = 0;
    let high = playingTelemetry.length - 1;
    while (low <= high) {
      const midpoint = Math.floor((low + high) / 2);
      if (playingTelemetry[midpoint].tMs <= tMs) low = midpoint + 1;
      else high = midpoint - 1;
    }
    setCurrentTelemetry(playingTelemetry[high] ?? null);
  };

  const seekTo = (tMs: number) => { if (videoRef.current) videoRef.current.currentTime = Math.max(0, tMs / 1000 - 0.8); };
  const previousShot = () => {
    const now = (videoRef.current?.currentTime ?? 0) * 1000 + 800;
    const previous = [...shotEvents].reverse().find((event) => event.tMs < now - 200);
    if (previous) seekTo(previous.tMs);
  };
  const nextShot = () => {
    const now = (videoRef.current?.currentTime ?? 0) * 1000 + 800;
    const next = shotEvents.find((event) => event.tMs > now + 200);
    if (next) seekTo(next.tMs);
  };
  const selectedRecording = list.find((recording) => recording.id === playingId);
  const usageMb = Math.round((storageInfo.estimate?.usage ?? 0) / 1024 / 1024);

  return (
    <div className="sessions-page">
      <PageHeader title="Training Sessions" subtitle="Review recordings, shot markers, and pose telemetry stored on this device." actions={<div className="header-action-cluster"><StatusBadge label="Local library" tone="success" compact /><ActionButton onClick={onStart}><AppIcon name="plus" size={17} />New Session</ActionButton></div>} />
      {actionError ? <div className="session-summary-warning" role="alert"><AppIcon name="sensors" size={18} /><div><strong>Session action needs attention</strong><span>{actionError}</span></div></div> : null}
      <section className="sessions-summary" aria-label="Session storage summary">
        <div><span className="eyebrow">Saved sessions</span><strong>{isLoading || loadError ? '?' : list.length}</strong><small>Stored on this device</small></div>
        <div><span className="eyebrow">Storage used</span><strong>{storageInfo.estimate ? `${usageMb} MB` : '—'}</strong><small>{storageInfo.persisted ? 'Persistent storage enabled' : 'Browser-managed storage'}</small></div>
        <div className="sessions-summary__privacy"><AppIcon name="shield" size={22} /><span><strong>Private by design</strong><small>Recordings never leave this device unless you export them.</small></span>{navigator.storage && !storageInfo.persisted ? <button type="button" className="text-button" onClick={() => void requestPersistence()}>Protect storage</button> : null}</div>
      </section>

      {isLoading ? (
        <section className="sessions-loading" aria-label="Loading sessions"><div className="section-heading"><div><span className="eyebrow">Session library</span><h2>Loading local recordings</h2></div><StatusBadge label="Loading" tone="info" compact /></div><div className="session-skeletons">{[0, 1, 2].map((item) => <span key={item} />)}</div></section>
      ) : loadError ? (
        <section className="empty-state empty-state--error motion-section-enter"><span className="empty-state__icon"><AppIcon name="history" size={28} /></span><span className="eyebrow">Storage unavailable</span><h2>Sessions could not be loaded</h2><p>Check browser storage access, then try again. No recordings were changed.</p><ActionButton variant="secondary" onClick={loadRecordings}><AppIcon name="refresh" size={16} />Retry</ActionButton></section>
      ) : list.length === 0 ? (
        <section className="empty-state motion-section-enter"><span className="empty-state__icon"><AppIcon name="history" size={28} /></span><span className="eyebrow">Local session library</span><h2>No training sessions yet</h2><p>Record a Live Analysis session to create a private, on-device training history with synchronized pose telemetry.</p><ActionButton onClick={onStart}>Start First Analysis<AppIcon name="arrow-right" size={16} /></ActionButton></section>
      ) : (
        <div className="sessions-layout motion-section-enter">
          <section className="session-list" aria-label="Saved sessions">
            <div className="session-list__header section-heading"><div><span className="eyebrow">Session library</span><h2>Recent recordings</h2></div><span>{list.length} saved</span></div>
            {list.map((recording, index) => (
              <article key={recording.id} className={playingId === recording.id ? 'is-selected' : ''}>
                <div className="session-list__date"><span>{new Date(recording.startedAt).toLocaleDateString(undefined, { day: '2-digit' })}</span><small>{new Date(recording.startedAt).toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}</small></div>
                <div className="session-list__copy"><h2>{recording.sessionId || `Training Session ${list.length - index}`}</h2><p>{new Date(recording.startedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p><div><span>{formatDuration(recording.durationMs)} duration</span><span>{Math.round((recording.approximateBytes ?? 0) / 1024)} KB</span></div></div>
                <StatusBadge label="Saved" tone="success" compact />
                <div className="session-list__actions">
                  <button type="button" className="button button--primary" onClick={() => void play(recording.id)} disabled={openingId !== null}><AppIcon name="play" size={16} />{openingId === recording.id ? 'Opening session?' : 'Open session'}</button>
                  <button type="button" className="icon-button" onClick={() => void doExport(recording.id)} aria-label={`Export ${recording.sessionId ?? 'session'}`}><AppIcon name="arrow-right" size={16} /></button>
                  <button type="button" className="icon-button icon-button--danger" onClick={() => void doDelete(recording.id)} aria-label={`Delete ${recording.sessionId ?? 'session'}`}><AppIcon name="trash" size={16} /></button>
                </div>
              </article>
            ))}
          </section>

          <section key={playingId ?? 'session-placeholder'} className="session-player motion-tab-panel">
            {playingUrl ? (
              <>
                <header><div><span className="eyebrow">Session replay</span><h2>{selectedRecording?.sessionId ?? 'Training session'}</h2></div><button type="button" className="icon-button" onClick={stopPlaying} aria-label="Close replay"><AppIcon name="close" size={17} /></button></header>
                <video ref={videoRef} src={playingUrl} controls onTimeUpdate={onTimeUpdate} onLoadedMetadata={(event) => {
                  event.currentTarget.currentTime = Math.max(0, (shotEvents[0]?.tMs ?? 0) / 1000 - 0.8);
                }} onError={() => setActionError('This video cannot be played. Try opening the session again or download the video to use another player.')} />
                <div className="session-player__metrics">
                  {[['Shoulder', currentTelemetry?.shoulderLineAngleDeg, '°'], ['Bow arm', currentTelemetry?.bowArmAngleDeg, '°'], ['Torso', currentTelemetry?.torsoLeanDeg, '°'], ['Pose confidence', currentTelemetry?.poseConfidence == null ? undefined : Math.round(currentTelemetry.poseConfidence * 100), '%']].map(([label, value, unit]) => <div key={label as string}><span>{label}</span><strong>{value ?? '—'}{value == null ? '' : unit}</strong></div>)}
                </div>
                <div className="session-player__timeline">
                  <span style={{ width: `${Math.min(100, (currentTime / Math.max(1, selectedRecording?.durationMs ?? 1)) * 100)}%` }} />
                  {shotEvents.map((event, index) => <button key={`${event.tMs}-${index}`} type="button" aria-label={`${event.type} at ${Math.round(event.tMs / 1000)} seconds`} title={`${event.type} at ${Math.round(event.tMs / 1000)} seconds`} onClick={() => seekTo(event.tMs)} style={{ left: `${(event.tMs / Math.max(1, selectedRecording?.durationMs ?? 1)) * 100}%` }} />)}
                </div>
                <footer><button type="button" className="button button--secondary" onClick={previousShot} disabled={!shotEvents.some((event) => event.tMs < currentTime + 600)}><AppIcon name="skip-prev" size={16} />Previous shot</button><button type="button" className="button button--secondary" onClick={nextShot} disabled={!shotEvents.some((event) => event.tMs > currentTime + 1000)}>Next shot<AppIcon name="skip-next" size={16} /></button><a className="button button--ghost" href={playingUrl} download="archerlab-recording.webm">Download video</a></footer>
              </>
            ) : <div className="session-player__placeholder"><span className="session-player__placeholder-icon"><AppIcon name="play-circle" size={30} /></span><span className="eyebrow">Replay workspace</span><h2>Select a session to review</h2><p>Open a recording to replay video alongside synchronized biomechanics and shot markers.</p><div><span>Local video</span><span>Pose telemetry</span><span>Shot events</span></div></div>}
          </section>
        </div>
      )}
    </div>
  );
}
