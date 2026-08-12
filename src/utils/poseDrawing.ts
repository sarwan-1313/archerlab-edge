import type { PoseConnection, PoseLandmark } from '../types/pose';

export type VideoDisplayTransform = {
  renderedWidth: number;
  renderedHeight: number;
  offsetX: number;
  offsetY: number;
  mirrored: boolean;
};

export function getObjectCoverTransform(
  videoWidth: number,
  videoHeight: number,
  containerWidth: number,
  containerHeight: number,
  mirrored = false,
): VideoDisplayTransform {
  if (videoWidth <= 0 || videoHeight <= 0 || containerWidth <= 0 || containerHeight <= 0) {
    return { renderedWidth: 0, renderedHeight: 0, offsetX: 0, offsetY: 0, mirrored };
  }

  const scale = Math.max(containerWidth / videoWidth, containerHeight / videoHeight);
  const renderedWidth = videoWidth * scale;
  const renderedHeight = videoHeight * scale;
  return {
    renderedWidth,
    renderedHeight,
    offsetX: (containerWidth - renderedWidth) / 2,
    offsetY: (containerHeight - renderedHeight) / 2,
    mirrored,
  };
}

export function mapPoseLandmarkToDisplay(landmark: PoseLandmark, transform: VideoDisplayTransform) {
  const normalizedX = transform.mirrored ? 1 - landmark.x : landmark.x;
  return {
    x: transform.offsetX + normalizedX * transform.renderedWidth,
    y: transform.offsetY + landmark.y * transform.renderedHeight,
  };
}

export function drawPoseSkeleton(
  context: CanvasRenderingContext2D,
  landmarks: PoseLandmark[],
  connections: PoseConnection[],
  transform: VideoDisplayTransform,
) {
  if (landmarks.length === 0 || transform.renderedWidth === 0) return;

  const scale = Math.max(0.8, Math.min(1.35, context.canvas.clientWidth / 900));
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.shadowColor = 'rgba(0, 229, 255, 0.72)';
  context.shadowBlur = 7 * scale;

  for (const connection of connections) {
    const startLandmark = landmarks[connection.start];
    const endLandmark = landmarks[connection.end];
    if (!startLandmark || !endLandmark) continue;
    const confidence = Math.min(startLandmark.visibility ?? 1, endLandmark.visibility ?? 1);
    if (confidence < 0.3) continue;
    const start = mapPoseLandmarkToDisplay(startLandmark, transform);
    const end = mapPoseLandmarkToDisplay(endLandmark, transform);

    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.strokeStyle = `rgba(62, 205, 255, ${0.3 + confidence * 0.5})`;
    context.lineWidth = 2.1 * scale;
    context.stroke();
  }

  for (const landmark of landmarks) {
    const confidence = landmark.visibility ?? 1;
    if (confidence < 0.3) continue;
    const point = mapPoseLandmarkToDisplay(landmark, transform);
    context.beginPath();
    context.arc(point.x, point.y, 3.2 * scale, 0, Math.PI * 2);
    context.fillStyle = `rgba(108, 241, 255, ${0.55 + confidence * 0.45})`;
    context.fill();
  }

  context.restore();
}

