import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ActionButton } from '../components/ActionButton';
import { PageHeader } from '../components/PageHeader';
import { clampBox, nearestSample, suggestBowBox } from '../dataset/bowBox';
import { buildCocoZip, frameFileName } from '../dataset/coco';
import { DATASET_CONFIG } from '../dataset/config';
import { sampleTimes } from '../dataset/sampling';
import { DATASET_CLASSES, type DatasetBox, type DatasetClass, type DatasetFrame, type PixelBox } from '../dataset/types';
import { useCoachTools } from '../settings/coachTools';
import { resolveDuration, seekTo } from '../video-analysis/browser/frameCapture';
import { listVideoReports, loadVideoBlob, loadVideoReport } from '../video-analysis/storage';
import type { VideoReportSummary } from '../video-analysis/types';
import '../styles/video.css';

/**
 * Dataset tools (Coach tools only): sample frames from a clip, draw boxes for
 * bow, arrow and target face, and export a COCO ZIP for training a detector
 * later (docs/bow-detection.md). Nothing is uploaded; the ZIP is saved locally.
 */

const CLASS_COLOURS: Record<DatasetClass, string> = { bow: '#ff8a00', arrow: '#00c2ff', 'target-face': '#e8ff00' };

interface Clip {
  name: string;
  url: string;
  width: number;
  height: number;
}

let boxCounter = 0;
const newBoxId = () => `box-${Date.now().toString(36)}-${(boxCounter += 1)}`;

function download(bytes: Uint8Array, fileName: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function canvasJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('This browser could not encode the frame as JPEG.')); return; }
      void blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
    }, 'image/jpeg', DATASET_CONFIG.jpegQuality);
  });
}

export function DatasetToolsPage({ onProfile }: { onProfile?: () => void } = {}) {
  const coachTools = useCoachTools();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [reports, setReports] = useState<VideoReportSummary[]>([]);
  const [clip, setClip] = useState<Clip | null>(null);
  const [frames, setFrames] = useState<DatasetFrame[]>([]);
  const [index, setIndex] = useState(0);
  const [label, setLabel] = useState<DatasetClass>('bow');
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<PixelBox | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!coachTools) return;
    listVideoReports().then((list) => setReports(list.filter((report) => report.hasVideo)), () => setReports([]));
  }, [coachTools]);

  useEffect(() => () => { if (clip) URL.revokeObjectURL(clip.url); }, [clip]);

  const frame = frames[index] as DatasetFrame | undefined;

  const redraw = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!video || !canvas || !context || !clip) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const line = Math.max(2, canvas.width / 400);
    const boxes = frame ? [...frame.boxes] : [];
    for (const box of boxes) {
      context.strokeStyle = CLASS_COLOURS[box.label];
      context.lineWidth = box.id === selected ? line * 2 : line;
      context.setLineDash(box.suggested ? [line * 4, line * 3] : []);
      context.strokeRect(box.x, box.y, box.width, box.height);
      context.setLineDash([]);
      context.fillStyle = CLASS_COLOURS[box.label];
      context.font = `${Math.round(line * 8)}px sans-serif`;
      context.fillText(box.suggested ? `${box.label} (suggested)` : box.label, box.x + line, Math.max(line * 8, box.y - line * 2));
    }
    if (draft) {
      context.strokeStyle = CLASS_COLOURS[label];
      context.lineWidth = line;
      context.strokeRect(draft.x, draft.y, draft.width, draft.height);
    }
  }, [clip, draft, frame, label, selected]);

  const frameT = frame?.t;

  // Size the canvas to the clip once it is on screen.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && clip) { canvas.width = clip.width; canvas.height = clip.height; }
  }, [clip]);

  // Seek to the frame (a no-op when already there), then draw it with its boxes.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !clip || frameT === undefined) return;
    let cancelled = false;
    seekTo(video, frameT).then(() => { if (!cancelled) redraw(); }, (error: Error) => setStatus(error.message));
    return () => { cancelled = true; };
  }, [clip, frameT, redraw]);

  const openClip = async (name: string, blob: Blob, poseFrom?: string) => {
    setBusy(true);
    setStatus('Opening the clip…');
    try {
      const video = videoRef.current;
      if (!video) return;
      const url = URL.createObjectURL(blob);
      video.src = url;
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('This browser cannot play this video. Convert it to MP4 on the Video Analysis page first.'));
      });
      const durationS = await resolveDuration(video);
      const report = poseFrom ? await loadVideoReport(poseFrom) : null;
      const releases = report ? report.shots.map((shot) => shot.release) : [];
      const width = video.videoWidth;
      const height = video.videoHeight;
      const sampled = sampleTimes(durationS, releases, { nativeFps: report?.source.nativeFps ?? null }).map(({ t, reason }): DatasetFrame => {
        const sample = report ? nearestSample(report.samples, t) : null;
        const suggestion = sample?.image ? suggestBowBox(sample.image, report!.settings.handedness, width, height) : null;
        return { t, reason, reviewed: false, boxes: suggestion ? [{ id: newBoxId(), label: 'bow', suggested: true, ...suggestion }] : [] };
      });
      setClip({ name, url, width, height });
      setFrames(sampled);
      setIndex(0);
      setSelected(null);
      setStatus(report
        ? `${sampled.length} frames: one a second plus ±${DATASET_CONFIG.releaseWindowS} s around ${releases.length} detected release${releases.length === 1 ? '' : 's'}. Dashed boxes are suggestions from the pose; check them before accepting.`
        : `${sampled.length} frames, one a second. Open a saved analysis instead to add frames around releases and suggested bow boxes.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The clip could not be opened.');
    } finally {
      setBusy(false);
    }
  };

  const openReport = async (id: string) => {
    const summary = reports.find((report) => report.id === id);
    const blob = await loadVideoBlob(id);
    if (!summary || !blob) { setStatus('The video for this analysis is no longer on this device.'); return; }
    await openClip(summary.fileName, blob, id);
  };

  const updateFrame = (change: (frame: DatasetFrame) => DatasetFrame) => {
    setFrames((current) => current.map((item, itemIndex) => itemIndex === index ? change(item) : item));
  };

  const toImage = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return { x: ((event.clientX - rect.left) / rect.width) * canvas.width, y: ((event.clientY - rect.top) / rect.height) * canvas.height };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!frame) return;
    const point = toImage(event);
    const hit = [...frame.boxes].reverse().find((box) => point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height);
    if (hit) { setSelected(hit.id); return; }
    setSelected(null);
    dragStart.current = point;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const start = dragStart.current;
    if (!start) return;
    const point = toImage(event);
    setDraft({ x: start.x, y: start.y, width: point.x - start.x, height: point.y - start.y });
  };

  const onPointerUp = () => {
    const box = draft && clip ? clampBox(draft, clip.width, clip.height) : null;
    dragStart.current = null;
    setDraft(null);
    if (!box || box.width < 4 || box.height < 4) return;
    const id = newBoxId();
    updateFrame((item) => ({ ...item, boxes: [...item.boxes, { id, label, ...box }] }));
    setSelected(id);
  };

  const removeSelected = () => {
    if (!selected) return;
    updateFrame((item) => ({ ...item, boxes: item.boxes.filter((box) => box.id !== selected) }));
    setSelected(null);
  };

  const acceptSuggestions = () => updateFrame((item) => ({ ...item, boxes: item.boxes.map((box): DatasetBox => ({ ...box, suggested: false })) }));

  const go = (next: number, markReviewed: boolean) => {
    if (markReviewed) updateFrame((item) => ({ ...item, reviewed: true }));
    setSelected(null);
    setIndex(Math.max(0, Math.min(frames.length - 1, next)));
  };

  const exportZip = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!video || !canvas || !context || !clip) return;
    const reviewed = frames.filter((item) => item.reviewed);
    if (reviewed.length === 0) { setStatus('Review at least one frame first (Save and next).'); return; }
    setBusy(true);
    try {
      const out = [];
      for (const [position, item] of reviewed.entries()) {
        setStatus(`Encoding frame ${position + 1} of ${reviewed.length}…`);
        await seekTo(video, item.t);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        out.push({
          fileName: frameFileName(clip.name, item.t),
          width: clip.width,
          height: clip.height,
          // Suggestions nobody accepted are not labels.
          boxes: item.boxes.filter((box) => !box.suggested),
          jpeg: await canvasJpeg(canvas),
        });
      }
      const zip = buildCocoZip(out, { description: `ArcherLab Edge bow detection dataset: ${clip.name}` });
      download(zip, `${frameFileName(clip.name, 0).replace(/_0+ms\.jpg$/, '')}-coco.zip`);
      setStatus(`Exported ${out.length} frames with ${out.reduce((sum, item) => sum + item.boxes.length, 0)} boxes. Keep this ZIP private.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The export failed.');
    } finally {
      setBusy(false);
      if (frame) await seekTo(video, frame.t).then(redraw, () => undefined);
    }
  };

  if (!coachTools) {
    return (
      <div className="dataset-tools">
        <PageHeader title="Dataset tools" subtitle="Turn on Coach tools on the Profile page to use the dataset tools." />
        {onProfile ? <ActionButton variant="secondary" type="button" onClick={onProfile}>Open Profile</ActionButton> : null}
      </div>
    );
  }

  const reviewedCount = frames.filter((item) => item.reviewed).length;
  const hasSuggestion = frame?.boxes.some((box) => box.suggested) ?? false;

  return (
    <div className="dataset-tools">
      <PageHeader title="Dataset tools" subtitle="Label bows, arrows and target faces in your own footage and export them as a COCO dataset for training a detector. Everything stays on this device." />
      <section className="va-panel" aria-labelledby="dataset-source">
        <h2 id="dataset-source">Clip</h2>
        <div className="va-actions">
          <label className="dataset-tools__field">
            <span>Saved analysis</span>
            <select disabled={busy || reports.length === 0} value="" onChange={(event) => { if (event.target.value) void openReport(event.target.value); }}>
              <option value="">{reports.length ? 'Choose a saved analysis…' : 'No saved analyses with video'}</option>
              {reports.map((report) => <option key={report.id} value={report.id}>{report.fileName} · {report.shots} shots</option>)}
            </select>
          </label>
          <label className="dataset-tools__field">
            <span>Or a video file</span>
            <input type="file" accept="video/*" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void openClip(file.name, file); event.target.value = ''; }} />
          </label>
        </div>
        <p className="va-faint">Only label footage you are allowed to use. Do not include other people’s faces without their consent, and keep the exported dataset private (docs/bow-detection.md).</p>
        {status ? <p role="status" className="dataset-tools__status">{status}</p> : null}
      </section>

      <video ref={videoRef} className="dataset-tools__video" muted playsInline preload="auto" />

      {clip && frame ? (
        <section className="va-panel" aria-labelledby="dataset-frame">
          <h2 id="dataset-frame">Frame {index + 1} of {frames.length} <small>{frame.t.toFixed(3)} s · {frame.reason === 'release' ? 'near a release' : 'regular sample'} · {reviewedCount} reviewed</small></h2>
          <div className="va-actions" role="radiogroup" aria-label="Class to draw">
            {DATASET_CLASSES.map((name) => (
              <label key={name} className="dataset-tools__class" style={{ borderColor: CLASS_COLOURS[name] }}>
                <input type="radio" name="dataset-class" checked={label === name} onChange={() => setLabel(name)} /> {name}
              </label>
            ))}
          </div>
          <canvas
            ref={canvasRef}
            className="dataset-tools__canvas"
            aria-label="Frame. Drag to draw a box; click a box to select it."
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => { dragStart.current = null; setDraft(null); }}
          />
          <div className="va-actions">
            <ActionButton variant="ghost" type="button" disabled={index === 0} onClick={() => go(index - 1, false)}>Previous</ActionButton>
            {hasSuggestion ? <ActionButton variant="secondary" type="button" onClick={acceptSuggestions}>Accept suggestion</ActionButton> : null}
            <ActionButton variant="secondary" type="button" disabled={!selected} onClick={removeSelected}>Delete box</ActionButton>
            <ActionButton variant="primary" type="button" onClick={() => go(index + 1, true)}>{frame.reviewed ? 'Next' : 'Save and next'}</ActionButton>
          </div>
          <p className="va-faint">Draw tight boxes around everything visible, including a partly hidden bow. A frame with no boxes is exported as an example with nothing in it, so only save it once you have checked it. Dashed suggestions are left out unless you accept them.</p>
          <ActionButton variant="primary" type="button" disabled={busy || reviewedCount === 0} onClick={() => void exportZip()}>Export COCO ZIP ({reviewedCount} frames)</ActionButton>
        </section>
      ) : null}
    </div>
  );
}
