import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { containRect, drawSkeleton } from '../../video-analysis/drawing';
import { PHASE_LABEL, formatClock } from '../../video-analysis/format';
import { indexAtTime } from '../../video-analysis/signal';
import type { FrameReadout, JointName, VideoAnalysisReport } from '../../video-analysis/types';
import { AppIcon } from '../AppIcon';
import { StatusBadge } from '../StatusBadge';

export interface SeekRequest {
  t: number;
  joints: JointName[];
  nonce: number;
}

type AnalysisPlayerProps = {
  report: VideoAnalysisReport;
  videoUrl: string | null;
  seek: SeekRequest | null;
};

const SPEEDS = [0.25, 0.5, 1] as const;

function readoutValue(value: number | null, digits: number, unit: string) {
  return value === null ? <dd>–</dd> : <dd>{value.toFixed(digits)}<small>{unit}</small></dd>;
}

function Readout({ frame, hasPose }: { frame: FrameReadout | null; hasPose: boolean }) {
  if (!hasPose) {
    return (
      <div className="va-panel va-readout">
        <h2>Frame by frame</h2>
        <p className="va-muted">This copy of the report was restored from the cloud without the per-frame landmarks, so the frame readout is only available on the device that analysed the clip.</p>
      </div>
    );
  }
  return (
    <div className="va-panel va-readout" aria-live="off">
      <span className="va-eyebrow">This frame</span>
      <div className="va-readout__phase">
        <strong>{frame ? PHASE_LABEL[frame.phase] : '–'}</strong>
        {frame?.shotIndex ? <StatusBadge label={`Shot ${frame.shotIndex}`} tone="primary" compact /> : null}
        {frame && !frame.tracked ? <StatusBadge label="Not tracked" tone="warning" compact /> : null}
      </div>
      <dl>
        <div><dt>Bow-arm angle</dt>{readoutValue(frame?.bowElbowAngle ?? null, 0, '°')}</div>
        <div><dt>Draw elbow off arrow line</dt>{readoutValue(frame?.drawForearmAlignment ?? null, 0, '°')}</div>
        <div><dt>Shoulders vs arrow</dt>{readoutValue(frame?.shoulderAlignment ?? null, 0, '°')}</div>
        <div><dt>Shoulder height difference</dt>{readoutValue(frame?.bowShoulderRise === null || frame?.bowShoulderRise === undefined ? null : Math.abs(frame.bowShoulderRise) * 100, 0, '% SW')}</div>
        <div><dt>Torso lean</dt>{readoutValue(frame?.torsoLean ?? null, 0, '°')}</div>
        <div><dt>Draw length (hand to hand)</dt>{readoutValue(frame?.span ?? null, 2, ' SW')}</div>
        <div><dt>Draw hand to face</dt>{readoutValue(frame?.faceProx ?? null, 2, ' SW')}</div>
        <div><dt>Tracking quality</dt>{readoutValue(frame ? frame.quality * 100 : null, 0, '%')}</div>
      </dl>
      <p className="va-faint">SW = shoulder widths, so numbers compare across body sizes and camera distances.</p>
    </div>
  );
}

export function AnalysisPlayer({ report, videoUrl, seek }: AnalysisPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timelineRef = useRef<SVGSVGElement>(null);
  const [time, setTime] = useState(report.shots[0]?.anchorStart ?? 0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(0.5);
  const [highlight, setHighlight] = useState<{ joints: JointName[]; until: number } | null>(null);
  const timeRef = useRef(time);
  const duration = report.source.durationS;
  const sampleTimes = useMemo(() => report.samples.map((sample) => sample.t), [report.samples]);
  const frameTimes = useMemo(() => report.frames.map((frame) => frame.t), [report.frames]);
  const step = 1 / (report.source.nativeFps ?? report.source.analysisFps ?? 30);

  const draw = useCallback((t: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * ratio));
    const height = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.clearRect(0, 0, width, height);
    if (!sampleTimes.length) return;
    const sample = report.samples[indexAtTime(sampleTimes, t)];
    if (!sample?.image || Math.abs(sample.t - t) > 0.25) return;
    const box = containRect(width, height, report.source.width, report.source.height);
    const joints = highlight && t <= highlight.until ? highlight.joints : [];
    drawSkeleton(context, sample.image, { ...box, handedness: report.settings.handedness, highlight: joints });
  }, [highlight, report, sampleTimes]);

  const drawRef = useRef(draw);
  useEffect(() => { drawRef.current = draw; }, [draw]);

  const goTo = useCallback((t: number) => {
    const clamped = Math.min(duration, Math.max(0, t));
    timeRef.current = clamped;
    setTime(clamped);
    const video = videoRef.current;
    if (video && videoUrl) video.currentTime = clamped;
    draw(clamped);
  }, [draw, duration, videoUrl]);

  const goToRef = useRef(goTo);
  useEffect(() => { goToRef.current = goTo; }, [goTo]);

  // External "show me" requests from findings and the shot table (only when a new request arrives).
  useEffect(() => {
    if (!seek) return;
    setPlaying(false);
    videoRef.current?.pause();
    setHighlight(seek.joints.length ? { joints: seek.joints, until: seek.t + 2.5 } : null);
    goToRef.current(seek.t);
  }, [seek]);

  // Playback loop: the video drives time when present; otherwise a skeleton-only clock.
  useEffect(() => {
    const video = videoRef.current;
    if (video) video.playbackRate = speed;
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      let t: number;
      if (video && videoUrl) {
        t = video.currentTime;
        if (video.ended) setPlaying(false);
      } else {
        t = timeRef.current + ((now - last) / 1000) * speed;
        if (t >= duration) { t = duration; setPlaying(false); }
      }
      last = now;
      timeRef.current = t;
      setTime(t);
      drawRef.current(t);
      frame = requestAnimationFrame(tick);
    };
    if (video && videoUrl) void video.play().catch(() => setPlaying(false));
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      video?.pause();
    };
  }, [duration, playing, speed, videoUrl]);

  useEffect(() => {
    const redraw = () => draw(timeRef.current);
    redraw();
    window.addEventListener('resize', redraw);
    return () => window.removeEventListener('resize', redraw);
  }, [draw]);

  const shotIndex = report.frames.length ? report.frames[indexAtTime(frameTimes, time)]?.shotIndex ?? null : null;
  const releaseTimes = report.shots.map((shot) => shot.release);
  const jumpShot = (direction: 1 | -1) => {
    const anchors = report.shots.map((shot) => shot.anchorStart ?? shot.release - 1);
    const target = direction > 0 ? anchors.find((t) => t > time + 0.05) : [...anchors].reverse().find((t) => t < time - 0.05);
    if (target !== undefined) goTo(target);
  };

  const seekFromPointer = (event: PointerEvent<SVGSVGElement>) => {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    setPlaying(false);
    goTo(((event.clientX - rect.left) / rect.width) * duration);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === ' ' || event.key === 'k') { event.preventDefault(); setPlaying((value) => !value); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); setPlaying(false); goTo(time + step); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); setPlaying(false); goTo(time - step); }
  };

  const x = (t: number) => (duration > 0 ? (t / duration) * 1000 : 0);
  const frame = report.frames.length ? report.frames[indexAtTime(frameTimes, time)] ?? null : null;

  return (
    <section className="va-review" aria-label="Frame-by-frame review">
      <div className="va-player">
        <div className="va-stage" tabIndex={0} onKeyDown={onKeyDown} onClick={() => setPlaying((value) => !value)} aria-label="Replay. Space plays or pauses; arrow keys step one frame.">
          {videoUrl ? <video ref={videoRef} src={videoUrl} muted playsInline preload="auto" onLoadedData={() => goTo(timeRef.current)} /> : null}
          <canvas ref={canvasRef} aria-hidden="true" />
          <span className="va-stage__chip">{videoUrl ? (shotIndex ? `Shot ${shotIndex}` : 'Replay') : 'Skeleton replay · video not stored'}</span>
        </div>
        <div className="va-transport">
          <button type="button" className="icon-button" onClick={() => jumpShot(-1)} aria-label="Previous shot"><AppIcon name="skip-prev" size={18} /></button>
          <button type="button" className="icon-button" onClick={() => { setPlaying(false); goTo(time - step); }} aria-label="Previous frame"><AppIcon name="arrow-left" size={18} /></button>
          <button type="button" className="icon-button icon-button--primary" onClick={() => setPlaying((value) => !value)} aria-label={playing ? 'Pause' : 'Play'}><AppIcon name={playing ? 'pause' : 'play'} size={18} /></button>
          <button type="button" className="icon-button" onClick={() => { setPlaying(false); goTo(time + step); }} aria-label="Next frame"><AppIcon name="arrow-right" size={18} /></button>
          <button type="button" className="icon-button" onClick={() => jumpShot(1)} aria-label="Next shot"><AppIcon name="skip-next" size={18} /></button>
          <span className="va-time">{formatClock(time, 2)} / {formatClock(duration, 1)}</span>
          <div className="va-speed" role="group" aria-label="Playback speed">
            {SPEEDS.map((value) => (
              <button key={value} type="button" className={speed === value ? 'is-selected' : ''} onClick={() => setSpeed(value)} aria-pressed={speed === value}>{value}×</button>
            ))}
          </div>
        </div>
        <svg ref={timelineRef} className="va-timeline" viewBox="0 0 1000 56" preserveAspectRatio="none" role="slider" aria-label="Timeline" aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(time)} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); seekFromPointer(event); }} onPointerMove={(event) => { if (event.buttons) seekFromPointer(event); }}>
          <rect className="va-timeline__track" x="0" y="10" width="1000" height="24" />
          {report.letDowns.map((letDown) => <rect key={`l${letDown.start}`} className="va-timeline__letdown" x={x(letDown.start)} y="12" width={Math.max(2, x(letDown.end) - x(letDown.start))} height="20" />)}
          {report.shots.map((shot) => (
            <g key={shot.index}>
              {shot.drawStart !== null && shot.anchorStart !== null ? <rect className="va-timeline__draw" x={x(shot.drawStart)} y="10" width={Math.max(1, x(shot.anchorStart) - x(shot.drawStart))} height="24" /> : null}
              {shot.anchorStart !== null ? <rect className="va-timeline__anchor" x={x(shot.anchorStart)} y="10" width={Math.max(1, x(shot.release) - x(shot.anchorStart))} height="24" /> : null}
              {shot.followThroughEnd !== null ? <rect className="va-timeline__follow" x={x(shot.release)} y="10" width={Math.max(1, x(shot.followThroughEnd) - x(shot.release))} height="24" /> : null}
              <line className="va-timeline__release" x1={x(shot.release)} x2={x(shot.release)} y1="4" y2="40" vectorEffect="non-scaling-stroke" />
              <text className="va-timeline__label" x={x(shot.release) + 4} y="8">{shot.index}</text>
            </g>
          ))}
          {(report.audio?.onsets ?? []).filter((onset) => onset.strength >= 0.12).map((onset) => (
            <line key={`o${onset.t}`} className="va-timeline__onset" x1={x(onset.t)} x2={x(onset.t)} y1={52 - onset.strength * 12} y2="54" vectorEffect="non-scaling-stroke" />
          ))}
          <line className="va-timeline__head" x1={x(time)} x2={x(time)} y1="0" y2="56" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="va-legend" aria-hidden="true">
          <span><i style={{ background: 'rgba(122,167,255,.6)' }} />Draw</span>
          <span><i style={{ background: 'rgba(46,230,255,.75)' }} />Anchor &amp; aim</span>
          <span><i style={{ background: 'var(--ath-gold)' }} />Release</span>
          <span><i style={{ background: 'rgba(255,107,26,.7)' }} />Follow-through</span>
          {report.audio?.available ? <span><i style={{ background: 'rgba(243,246,250,.5)' }} />Sounds</span> : null}
          {releaseTimes.length ? null : <span>No shots found</span>}
        </div>
      </div>
      <Readout frame={frame} hasPose={report.frames.length > 0} />
    </section>
  );
}
