import type { MediaPart } from '../../cloud/ai/providers';
import { drawSkeleton } from '../drawing';
import { indexAtTime } from '../signal';
import type { JointName, VideoAnalysisReport } from '../types';
import { seekTo } from './frameCapture';

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
  const moments = shots.flatMap((shot) => [
    { t: shot.release - 0.3, caption: `shot ${shot.index}, at anchor 0.3 s before release` },
    { t: shot.release + 0.08, caption: `shot ${shot.index}, just after release` },
    { t: shot.release + 0.6, caption: `shot ${shot.index}, follow-through 0.6 s after release` },
  ]).filter((moment) => moment.t >= 0 && moment.t <= report.source.durationS);

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
