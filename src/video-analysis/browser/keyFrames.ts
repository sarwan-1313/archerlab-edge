import type { MediaPart } from '../../cloud/ai/providers';
import { drawSkeleton } from '../drawing';
import { sourceRange } from '../range';
import { indexAtTime } from '../signal';
import type { JointName, VideoAnalysisReport } from '../types';
import { releaseCanvas, releaseVideo, seekTo } from './frameCapture';

/**
 * Renders a handful of annotated stills (anchor, release, follow-through) for
 * the cloud coaches. Only these stills — not the video — are sent, unless the
 * athlete turns on full-video mode for Gemini.
 */
export async function renderKeyFrames(report: VideoAnalysisReport, video: HTMLVideoElement, maxShots = 2): Promise<MediaPart[]> {
  const shots = report.shots
    .filter((shot) => shot.source !== 'audio-only')
    .sort((a, b) => (b.quality.trackedRatio - a.quality.trackedRatio))
    .slice(0, maxShots)
    .sort((a, b) => a.index - b.index);
  const highlight = new Set<JointName>(report.focusAreas.flatMap((finding) => finding.where.joints));
  const range = sourceRange(report.source);
  const moments = shots.flatMap((shot) => [
    { t: shot.release - 0.3, caption: `shot ${shot.index}, at anchor 0.3 s before release` },
    { t: shot.release + 0.08, caption: `shot ${shot.index}, just after release` },
    { t: shot.release + 0.6, caption: `shot ${shot.index}, follow-through 0.6 s after release` },
  ]).filter((moment) => moment.t >= range.start && moment.t <= range.end);

  const canvas = document.createElement('canvas');
  const longEdge = Math.max(video.videoWidth, video.videoHeight) || 1;
  const scale = Math.min(1, 768 / longEdge);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const context = canvas.getContext('2d');
  if (!context) return [];
  const times = report.samples.map((sample) => sample.t);
  const parts: MediaPart[] = [];
  for (const moment of moments) {
    await seekTo(video, moment.t);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const sample = report.samples[indexAtTime(times, moment.t)];
    if (sample?.image) drawSkeleton(context, sample.image, { x: 0, y: 0, width: canvas.width, height: canvas.height, handedness: report.settings.handedness, highlight: [...highlight] });
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    parts.push({ kind: 'image', mimeType: 'image/jpeg', base64: dataUrl.slice(dataUrl.indexOf(',') + 1), caption: moment.caption });
  }
  releaseCanvas(canvas);
  return parts;
}

/** Reads a file as base64 (for sending a short clip inline). */
export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'));
    reader.readAsDataURL(file);
  });
}

export interface FocusFrame {
  findingId: string;
  /** A JPEG data URL. */
  src: string;
  caption: string;
}

function loadDetachedVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.addEventListener('loadeddata', () => resolve(video), { once: true });
    video.addEventListener('error', () => reject(new Error('The video could not be read.')), { once: true });
    video.src = url;
  });
}

/**
 * One still per focus area, at the moment the finding points to, with the skeleton drawn and the joints
 * in question highlighted: for the printable report. Uses its own video element, so the on-screen replay
 * stays where it is, and frees it (and the canvas) afterwards. Without the video, the skeleton is drawn
 * on white. Small stills (long edge 640 px) keep the memory and the printed page light.
 */
export async function renderFocusFrames(report: VideoAnalysisReport, videoUrl: string | null): Promise<FocusFrame[]> {
  const findings = report.focusAreas.filter((finding) => finding.where.time !== null);
  if (!findings.length || !report.samples.some((sample) => sample.image)) return [];
  let video: HTMLVideoElement | null = null;
  if (videoUrl) {
    try { video = await loadDetachedVideo(videoUrl); } catch { video = null; }
  }
  const width = video?.videoWidth || report.source.width || 640;
  const height = video?.videoHeight || report.source.height || 360;
  const scale = Math.min(1, 640 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d');
  const times = report.samples.map((sample) => sample.t);
  const frames: FocusFrame[] = [];
  try {
    if (!context) return [];
    for (const finding of findings) {
      const t = finding.where.time as number;
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      if (video) {
        await seekTo(video, t);
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      const sample = report.samples[indexAtTime(times, t)];
      if (sample?.image) drawSkeleton(context, sample.image, { x: 0, y: 0, width: canvas.width, height: canvas.height, handedness: report.settings.handedness, highlight: finding.where.joints });
      frames.push({
        findingId: finding.id,
        src: canvas.toDataURL('image/jpeg', 0.85),
        caption: `${finding.where.shotIndex ? `Shot ${finding.where.shotIndex}, ` : ''}${t.toFixed(2)} s${video ? '' : ' · skeleton only, video not stored'}`,
      });
    }
  } finally {
    releaseCanvas(canvas);
    if (video) releaseVideo(video);
  }
  return frames;
}
