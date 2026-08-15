import { useEffect, useState, useRef } from 'react';
import { PageHeader } from '../components/PageHeader';
import { listRecordings, getChunksForRecording, getTelemetryForRecording, deleteRecording, exportRecordingData } from '../recording/recordingStorage';

export function SavedRecordingsPage() {
  const [list, setList] = useState<any[]>([]);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [playingTelemetry, setPlayingTelemetry] = useState<any[] | null>(null);
  const [shotEvents, setShotEvents] = useState<any[]>([]);
  const [currentTelemetry, setCurrentTelemetry] = useState<any | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [storageInfo, setStorageInfo] = useState<any>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => { void listRecordings().then((r) => setList(r)).catch(() => setList([])); }, []);

  useEffect(() => {
    if (!('storage' in navigator) || !(navigator as any).storage) return;
    (navigator as any).storage.estimate?.().then((est:any) => setStorageInfo((s:any) => ({ ...s, estimate: est }))).catch(() => {});
    (navigator as any).storage.persisted?.().then((p:any) => setStorageInfo((s:any) => ({ ...s, persisted: p }))).catch(() => {});
  }, []);

  const requestPersistence = async () => {
    if (!('storage' in navigator) || !(navigator as any).storage) return; const ok = await (navigator as any).storage.persist(); setStorageInfo((s:any) => ({ ...s, persisted: ok }));
  };

  const play = async (id: string) => {
    const chunks = await getChunksForRecording(id);
    const sorted = chunks.sort((a,b) => a.index - b.index).map((c:any) => c.blob);
    const blob = new Blob(sorted, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    setPlayingUrl(url);
    const telemetry = await getTelemetryForRecording(id);
    const sortedTelemetry = telemetry.sort((a:any,b:any) => a.tMs - b.tMs);
    setPlayingTelemetry(sortedTelemetry);
    // derive shot events
    const events = sortedTelemetry.filter((f:any) => f.type === 'shot' || f.type === 'release' || f.type === 'score').map((f:any) => ({ tMs: f.tMs, type: f.type, shotId: f.shotId, score: f.score }));
    setShotEvents(events.sort((a,b) => a.tMs - b.tMs));
    setTimeout(() => { if (videoRef.current) { videoRef.current.currentTime = Math.max(0, (events[0]?.tMs ?? 0) / 1000 - 1); videoRef.current.play(); } }, 100);
  };

  const stopPlaying = () => { if (playingUrl) { URL.revokeObjectURL(playingUrl); setPlayingUrl(null); setPlayingTelemetry(null); setShotEvents([]); setCurrentTelemetry(null); setCurrentTime(0); } };

  const doDelete = async (id: string) => { if (!confirm('Delete recording?')) return; await deleteRecording(id); setList((s) => s.filter((r) => r.id !== id)); if (playingUrl) stopPlaying(); };

  const doExport = async (id: string) => {
    const data = await exportRecordingData(id);
    const json = JSON.stringify({ manifest: data.manifest, telemetry: data.telemetry }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${id}-session.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const onTimeUpdate = () => {
    if (!videoRef.current || !playingTelemetry) return;
    const tMs = Math.round(videoRef.current.currentTime * 1000);
    setCurrentTime(tMs);
    // find nearest telemetry frame
    let idx = -1; let low = 0; let high = playingTelemetry.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (playingTelemetry[mid].tMs === tMs) { idx = mid; break; }
      if (playingTelemetry[mid].tMs < tMs) low = mid + 1; else high = mid - 1;
    }
    if (idx === -1) idx = Math.max(0, high);
    const frame = playingTelemetry[idx] ?? null; setCurrentTelemetry(frame);
  };

  const seekTo = (tMs: number) => { if (!videoRef.current) return; videoRef.current.currentTime = Math.max(0, tMs / 1000 - 0.8); };

  const prevShot = () => { if (!shotEvents.length || !videoRef.current) return; const now = videoRef.current.currentTime * 1000; const prev = [...shotEvents].reverse().find((e:any) => e.tMs < now - 200); if (prev) seekTo(prev.tMs); };
  const nextShot = () => { if (!shotEvents.length || !videoRef.current) return; const now = videoRef.current.currentTime * 1000; const next = shotEvents.find((e:any) => e.tMs > now + 200); if (next) seekTo(next.tMs); };

  return <div className="page-container page-container--wide"><PageHeader title="Saved Recordings" subtitle="Locally saved session videos" />
    <div style={{ display: 'flex', gap: 16 }}>
      <aside style={{ width: 320 }}>
        <div style={{ marginBottom: 12 }}>
          <h3>Device storage</h3>
          {storageInfo?.estimate ? <div>Used: {Math.round((storageInfo.estimate.usage ?? 0)/1024/1024)} MB · Quota: {Math.round((storageInfo.estimate.quota ?? 0)/1024/1024)} MB</div> : <div>Storage estimate unavailable</div>}
          {'storage' in navigator && (navigator as any).storage ? <div>Persistent: {storageInfo?.persisted ? 'Yes' : 'No'} <button onClick={() => void requestPersistence()}>Request persistent storage</button></div> : <div>Storage API unsupported</div>}
        </div>

        <div>
          <h3>Recordings</h3>
          {list.length ? list.map((r) => (
            <div key={r.id} style={{ borderBottom: '1px solid #eee', padding: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>{r.sessionId ?? r.id}</strong>
                <div style={{ fontSize: 12 }}>{new Date(r.startedAt).toLocaleString()}</div>
                <div style={{ fontSize: 12 }}>{(r.durationMs/1000).toFixed(1)}s · {Math.round(r.approximateBytes/1024)} KB</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => play(r.id)}>Replay</button>
                <button onClick={() => doExport(r.id)}>Export</button>
                <button onClick={() => doDelete(r.id)}>Delete</button>
              </div>
            </div>
          )) : <p>No recordings saved yet.</p>}
        </div>
      </aside>

      <main style={{ flex: 1 }}>
        {playingUrl ? (
          <div>
            <div style={{ display: 'flex', gap: 12 }}>
              <video ref={videoRef} src={playingUrl} controls style={{ width: '70%' }} onTimeUpdate={onTimeUpdate} />
              <div style={{ width: '30%' }}>
                <h4>Telemetry</h4>
                <div>Playback: {(currentTime/1000).toFixed(2)}s</div>
                <div>Shoulder: {currentTelemetry?.shoulderLineAngleDeg ?? '--'}°</div>
                <div>Bow arm: {currentTelemetry?.bowArmAngleDeg ?? '--'}°</div>
                <div>Torso: {currentTelemetry?.torsoLeanDeg ?? '--'}°</div>
                <div>Head motion: {currentTelemetry?.headMotion ?? '--'}</div>
                <div>Bow-hand motion: {currentTelemetry?.bowHandMotion ?? '--'}</div>
                <div>Pose confidence: {currentTelemetry?.poseConfidence ? Math.round(currentTelemetry.poseConfidence*100)+'%' : '--'}</div>
                <div style={{ marginTop: 8 }}>
                  <button onClick={prevShot}>Previous Shot</button>
                  <button onClick={nextShot}>Next Shot</button>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <h4>Timeline</h4>
              <div style={{ position: 'relative', height: 40, background: '#f5f5f5' }}>
                {shotEvents.map((e, i) => {
                  const manifest = list.find((r) => (r.startedAt != null && playingUrl && true));
                  // place markers proportional to time within manifest duration
                  const duration = manifest?.durationMs ?? (shotEvents[shotEvents.length-1]?.tMs ?? 1);
                  const left = ((e.tMs) / (duration || 1)) * 100;
                  return <div key={i} title={`${e.type} ${Math.round(e.tMs)}ms`} onClick={() => seekTo(e.tMs)} style={{ position: 'absolute', left: `${left}%`, top: 0, bottom: 0, width: 2, background: e.type === 'score' ? 'gold' : e.type === 'shot' ? 'red' : 'blue', cursor: 'pointer' }} />;
                })}
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <button onClick={stopPlaying}>Close</button>
              <a href={playingUrl} download={`recording.webm`}><button>Download Video</button></a>
            </div>
          </div>
        ) : <p>Select a recording to play.</p>}
      </main>
    </div>
  </div>;
}
