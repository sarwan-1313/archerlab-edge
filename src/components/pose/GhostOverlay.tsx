import { useEffect, useRef, useState, type RefObject } from 'react';
import type { PoseResult } from '../../types/pose';
import { getObjectCoverTransform, mapPoseLandmarkToDisplay } from '../../utils/poseDrawing';
import { SKELETON, fitOnto, mirrorPoints, poseDifference, type Point2 } from '../../video-analysis/ghost';
import { loadGhost, type GhostReference } from '../../video-analysis/ghostStore';

type GhostOverlayProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  resultRef: RefObject<PoseResult | null>;
  active: boolean;
  mirrored?: boolean;
};

type Moment = 'fullDraw' | 'followThrough';

/**
 * Draws the athlete's reference shot (chosen in a video report) as a faint
 * skeleton over the live camera, fitted to their body, so they can match it.
 * The match figure is a rough guide to how close the upper body is, not a score.
 */
export function GhostOverlay({ videoRef, resultRef, active, mirrored = false }: GhostOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ghost] = useState<GhostReference | null>(() => loadGhost());
  const [on, setOn] = useState(true);
  const [moment, setMoment] = useState<Moment>('fullDraw');
  const [flip, setFlip] = useState(false);
  const [match, setMatch] = useState<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !ghost || !on || !active) return;
    const container = canvas.parentElement;
    if (!container) return;
    let frame = 0;
    let lastTimestamp = -1;
    let lastMatchAt = 0;
    const reference = moment === 'followThrough' && ghost.followThrough ? ghost.followThrough : ghost.fullDraw;
    const source = flip ? mirrorPoints(reference) : reference;

    const draw = () => {
      frame = window.requestAnimationFrame(draw);
      const context = canvas.getContext('2d');
      const video = videoRef.current;
      const result = resultRef.current;
      if (!context || !video) return;
      const bounds = container.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(bounds.width * ratio));
      const height = Math.max(1, Math.round(bounds.height * ratio));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; lastTimestamp = -1; }
      if (!result?.athleteDetected || !video.videoWidth) {
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      if (result.timestamp === lastTimestamp) return;
      lastTimestamp = result.timestamp;
      const live: Point2[] = result.landmarks.map((landmark) => ({ x: landmark.x, y: landmark.y, v: landmark.visibility ?? 1 }));
      const liveAspect = video.videoWidth / video.videoHeight;
      const fitted = fitOnto(source, ghost.aspect, live, liveAspect);
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (!fitted) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const transform = getObjectCoverTransform(video.videoWidth, video.videoHeight, bounds.width, bounds.height, mirrored);
      context.save();
      context.lineCap = 'round';
      context.lineWidth = 5;
      context.strokeStyle = 'rgba(255, 197, 61, 0.55)';
      context.setLineDash([10, 7]);
      for (const [start, end] of SKELETON) {
        const a = fitted[start];
        const b = fitted[end];
        if (!a || !b || a.v < 0.3 || b.v < 0.3) continue;
        const from = mapPoseLandmarkToDisplay({ x: a.x, y: a.y, z: 0 }, transform);
        const to = mapPoseLandmarkToDisplay({ x: b.x, y: b.y, z: 0 }, transform);
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
        context.stroke();
      }
      context.restore();
      const now = performance.now();
      if (now - lastMatchAt > 400) {
        lastMatchAt = now;
        const difference = poseDifference(live, fitted, liveAspect);
        setMatch(difference === null ? null : Math.max(0, Math.round(100 - difference * 160)));
      }
    };
    frame = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(frame);
      canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [active, flip, ghost, mirrored, moment, on, resultRef, videoRef]);

  if (!ghost) return null;
  return (
    <>
      <canvas ref={canvasRef} className="pose-overlay ghost-overlay" aria-hidden="true" />
      <div className="ghost-controls" role="group" aria-label="Ghost overlay">
        <button type="button" aria-pressed={on} onClick={() => setOn(!on)}>{on ? 'Ghost on' : 'Ghost off'}</button>
        {on ? (
          <>
            <button type="button" onClick={() => setMoment(moment === 'fullDraw' ? 'followThrough' : 'fullDraw')} disabled={!ghost.followThrough}>{moment === 'fullDraw' ? 'Full draw' : 'Follow-through'}</button>
            <button type="button" aria-pressed={flip} onClick={() => setFlip(!flip)}>Mirror</button>
            {match !== null ? <span title="How closely your upper body lines up with the ghost right now: a rough guide, not a score">Match {match}%</span> : null}
          </>
        ) : null}
      </div>
    </>
  );
}
