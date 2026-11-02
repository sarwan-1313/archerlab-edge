import { useEffect, useMemo, useRef, useState } from 'react';
import { SKELETON, alignedTime, bestShot, compareShotMetrics, comparisonWindow, fitOnto, pointsFromSample, sampleNear, type Point2 } from '../../video-analysis/ghost';
import { ghostFromShot, loadGhost, saveGhost } from '../../video-analysis/ghostStore';
import { METRIC_RUBRIC, formatMetricShort } from '../../video-analysis/rubric';
import { listVideoReports, loadVideoReport } from '../../video-analysis/storage';
import type { ShotReport, VideoAnalysisReport, VideoReportSummary } from '../../video-analysis/types';
import { ActionButton } from '../ActionButton';
import { AppIcon } from '../AppIcon';

const COLOUR_A = 'rgba(46, 230, 255, 0.95)';
const COLOUR_B = 'rgba(255, 197, 61, 0.9)';

const aspectOf = (report: VideoAnalysisReport) => (report.source.width && report.source.height ? report.source.width / report.source.height : 16 / 9);
const shotLabel = (shot: ShotReport) => `Shot ${shot.index + 1}${shot.formScore === null ? '' : ` · ${Math.round(shot.formScore)}`}`;

/** Draws skeletons framed around the first one. */
function drawSkeletons(canvas: HTMLCanvasElement | null, layers: Array<{ points: Point2[] | null; colour: string; dashed?: boolean }>, aspect: number) {
  if (!canvas) return;
  const context = canvas.getContext('2d');
  if (!context) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, width, height);
  const frame = layers.find((layer) => layer.points)?.points;
  if (!frame) {
    context.fillStyle = '#7d899c';
    context.font = `${14 * ratio}px system-ui`;
    context.textAlign = 'center';
    context.fillText('Not tracked at this moment', width / 2, height / 2);
    return;
  }
  const seen = frame.filter((point) => point.v >= 0.3);
  const xs = seen.map((point) => point.x * aspect);
  const ys = seen.map((point) => point.y);
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, 0.1) * 1.35;
  const scale = Math.min(width, height) / span;
  const centreX = (minX + maxX) / 2; const centreY = (minY + maxY) / 2;
  const toCanvas = (point: Point2) => ({ x: width / 2 + (point.x * aspect - centreX) * scale, y: height / 2 + (point.y - centreY) * scale });
  context.lineCap = 'round';
  for (const layer of layers) {
    if (!layer.points) continue;
    context.strokeStyle = layer.colour;
    context.lineWidth = 4 * ratio;
    context.setLineDash(layer.dashed ? [9 * ratio, 6 * ratio] : []);
    for (const [start, end] of SKELETON) {
      const a = layer.points[start]; const b = layer.points[end];
      if (!a || !b || a.v < 0.3 || b.v < 0.3) continue;
      const from = toCanvas(a); const to = toCanvas(b);
      context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y); context.stroke();
    }
  }
}

/**
 * Compares a shot with another shot (from this clip or another saved report),
 * lined up at the release: the two skeletons drawn over each other or side by
 * side, and the measurements that differ most.
 */
export function CompareShotsPanel({ report }: { report: VideoAnalysisReport }) {
  const comparable = report.samples.length > 0 && report.shots.some((shot) => shot.source !== 'audio-only');
  const shots = useMemo(() => report.shots.filter((shot) => shot.source !== 'audio-only'), [report]);
  const best = useMemo(() => bestShot(report), [report]);
  const [shotA, setShotA] = useState<number>(() => shots[shots.length - 1]?.index ?? 0);
  const [otherId, setOtherId] = useState<string>(report.id);
  const [other, setOther] = useState<VideoAnalysisReport | null>(report);
  const [shotB, setShotB] = useState<number>(() => best?.index ?? shots[0]?.index ?? 0);
  const [summaries, setSummaries] = useState<VideoReportSummary[]>([]);
  const [offset, setOffset] = useState(-0.15);
  const [playing, setPlaying] = useState(false);
  const [side, setSide] = useState(false);
  const [open, setOpen] = useState(false);
  const [ghostNote, setGhostNote] = useState<string | null>(() => (loadGhost()?.reportId === report.id ? 'A shot from this clip is your ghost in Live Analysis.' : null));
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const leftRef = useRef<HTMLCanvasElement | null>(null);
  const rightRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    listVideoReports().then((list) => { if (alive) setSummaries(list); }, () => undefined);
    return () => { alive = false; };
  }, [open]);

  const pickOther = async (id: string) => {
    setOtherId(id);
    if (id === report.id) { setOther(report); setShotB(best?.index ?? 0); return; }
    setOther(null);
    const loaded = await loadVideoReport(id).catch(() => null);
    setOther(loaded);
    const chosen = loaded ? bestShot(loaded) ?? loaded.shots.find((shot) => shot.source !== 'audio-only') ?? null : null;
    setShotB(chosen?.index ?? 0);
  };

  const a = report.shots.find((shot) => shot.index === shotA) ?? null;
  const b = other?.shots.find((shot) => shot.index === shotB) ?? null;
  const window_ = a && b ? comparisonWindow(a, b) : { before: 3, after: 1.5 };

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setOffset((current) => (current + dt > window_.after ? -window_.before : current + dt));
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing, window_.after, window_.before]);

  useEffect(() => {
    if (!open || !a || !b || !other) return;
    const tA = a.release + offset;
    const tB = alignedTime(a, b, tA);
    const pointsA = pointsFromSample(sampleNear(report.samples, tA));
    const pointsB = pointsFromSample(sampleNear(other.samples, tB));
    const aspectA = aspectOf(report);
    if (side) {
      drawSkeletons(leftRef.current, [{ points: pointsA, colour: COLOUR_A }], aspectA);
      drawSkeletons(rightRef.current, [{ points: pointsB, colour: COLOUR_B }], aspectOf(other));
    } else {
      const fitted = pointsA && pointsB ? fitOnto(pointsB, aspectOf(other), pointsA, aspectA) : null;
      drawSkeletons(overlayRef.current, [{ points: pointsA, colour: COLOUR_A }, { points: fitted, colour: COLOUR_B, dashed: true }], aspectA);
    }
  }, [a, b, offset, open, other, report, side]);

  if (!comparable) return null;
  const differences = a && b ? compareShotMetrics(a, b).slice(0, 8) : [];

  const useAsGhost = () => {
    const ghost = ghostFromShot(report, a);
    if (!ghost) { setGhostNote('That shot was not tracked clearly at full draw. Pick another shot.'); return; }
    saveGhost(ghost);
    setGhostNote(`Shot ${ghost.shotIndex + 1} is now your ghost: open Live Analysis to shoot along with it.`);
  };

  return (
    <section className="va-panel compare-panel" aria-labelledby="compare-title">
      <h2 id="compare-title"><AppIcon name="grid" size={18} /> Compare shots</h2>
      {!open ? (
        <>
          <p className="va-muted">Line a shot up with your best shot, or a shot from another day, at the moment of release, and see where your body differs.</p>
          <div className="va-actions">
            <ActionButton variant="secondary" type="button" onClick={() => setOpen(true)}>Compare shots</ActionButton>
            <ActionButton variant="ghost" type="button" onClick={useAsGhost} title="Shows this shot's position as a ghost over the live camera">Use {a ? `shot ${a.index + 1}` : 'this shot'} as my ghost</ActionButton>
          </div>
        </>
      ) : (
        <>
          <div className="compare-pickers">
            <label>This clip<select value={shotA} onChange={(event) => setShotA(Number(event.target.value))}>{shots.map((shot) => <option key={shot.index} value={shot.index}>{shotLabel(shot)}{best?.index === shot.index ? ' (best)' : ''}</option>)}</select></label>
            <label>Compare with<select value={otherId} onChange={(event) => void pickOther(event.target.value)}>
              <option value={report.id}>This clip</option>
              {summaries.filter((summary) => summary.id !== report.id).map((summary) => <option key={summary.id} value={summary.id}>{summary.fileName} · {new Date(summary.createdAt).toLocaleDateString()}</option>)}
            </select></label>
            <label>Shot<select value={shotB} onChange={(event) => setShotB(Number(event.target.value))} disabled={!other}>{(other?.shots ?? []).filter((shot) => shot.source !== 'audio-only').map((shot) => <option key={shot.index} value={shot.index}>{shotLabel(shot)}</option>)}</select></label>
          </div>
          {other && !other.samples.length ? <p className="va-import-status">That report has no body positions (copies kept in an account leave them out), so it cannot be drawn.</p> : null}
          <div className="compare-legend"><span><i style={{ background: COLOUR_A }} />{a ? shotLabel(a) : 'This shot'}</span><span><i style={{ background: COLOUR_B }} />{b ? `${otherId === report.id ? '' : 'Other clip, '}${shotLabel(b)}` : 'Comparison'}</span></div>
          <div className={`compare-stage${side ? ' compare-stage--side' : ''}`}>
            {side ? (
              <>
                <canvas ref={leftRef} role="img" aria-label="This shot's skeleton" />
                <canvas ref={rightRef} role="img" aria-label="The comparison shot's skeleton" />
              </>
            ) : <canvas ref={overlayRef} role="img" aria-label="Both skeletons drawn over each other, the comparison dashed" />}
          </div>
          <div className="compare-scrub">
            <button type="button" className="button button--secondary" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Play'}><AppIcon name={playing ? 'pause' : 'play'} size={16} /></button>
            <input type="range" min={-window_.before} max={window_.after} step={1 / 30} value={offset} onChange={(event) => { setPlaying(false); setOffset(Number(event.target.value)); }} aria-label="Time from the release" />
            <span>{offset >= 0 ? '+' : ''}{offset.toFixed(2)} s</span>
          </div>
          <div className="va-actions">
            <ActionButton variant="ghost" type="button" onClick={() => setSide(!side)}>{side ? 'Draw over each other' : 'Side by side'}</ActionButton>
            <ActionButton variant="ghost" type="button" onClick={() => { setPlaying(false); setOffset(-0.15); }}>Jump to full draw</ActionButton>
            <ActionButton variant="secondary" type="button" onClick={useAsGhost}>Use {a ? `shot ${a.index + 1}` : 'this shot'} as my ghost</ActionButton>
          </div>
          {differences.length ? (
            <table className="compare-table">
              <caption className="sr-only">Measurements of both shots</caption>
              <thead><tr><th scope="col">Measurement</th><th scope="col">{a ? shotLabel(a) : 'This'}</th><th scope="col">{b ? shotLabel(b) : 'Other'}</th></tr></thead>
              <tbody>{differences.map((row) => (
                <tr key={row.key}><th scope="row">{METRIC_RUBRIC[row.key].label}</th><td>{formatMetricShort(row.key, row.a)}</td><td>{formatMetricShort(row.key, row.b)}</td></tr>
              ))}</tbody>
            </table>
          ) : null}
          <p className="va-faint">Times are lined up at the release. Shots filmed from different angles or distances will not line up exactly; measurements are unvalidated estimates.</p>
        </>
      )}
      {ghostNote ? <p className="va-import-status" role="status">{ghostNote}</p> : null}
    </section>
  );
}
