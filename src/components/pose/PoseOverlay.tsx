import { useEffect, useRef, type RefObject } from 'react';
import { POSE_CONNECTIONS } from '../../services/poseLandmarkerService';
import type { PoseResult } from '../../types/pose';
import { drawPoseSkeleton, getObjectCoverTransform } from '../../utils/poseDrawing';

type PoseOverlayProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  resultRef: RefObject<PoseResult | null>;
  active: boolean;
  mirrored?: boolean;
};

export function PoseOverlay({ videoRef, resultRef, active, mirrored = false }: PoseOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const container = canvas.parentElement;
    if (!container) return;

    let animationFrame = 0;
    let lastTimestamp = -1;
    let cssWidth = 0;
    let cssHeight = 0;

    const resizeCanvas = () => {
      const bounds = container.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      cssWidth = bounds.width;
      cssHeight = bounds.height;
      const nextWidth = Math.max(1, Math.round(cssWidth * pixelRatio));
      const nextHeight = Math.max(1, Math.round(cssHeight * pixelRatio));
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
        lastTimestamp = -1;
      }
    };

    resizeCanvas();
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resizeCanvas);
    resizeObserver?.observe(container);
    window.addEventListener('resize', resizeCanvas);

    const draw = () => {
      const context = canvas.getContext('2d');
      const video = videoRef.current;
      const result = resultRef.current;
      if (!context) return;

      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      if (!active || !video || !result?.athleteDetected) {
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
        lastTimestamp = -1;
      } else if (result.timestamp !== lastTimestamp) {
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        const transform = getObjectCoverTransform(
          video.videoWidth,
          video.videoHeight,
          cssWidth,
          cssHeight,
          mirrored,
        );
        drawPoseSkeleton(context, result.landmarks, POSE_CONNECTIONS, transform);
        lastTimestamp = result.timestamp;
      }

      animationFrame = window.requestAnimationFrame(draw);
    };

    animationFrame = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', resizeCanvas);
      const context = canvas.getContext('2d');
      context?.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [active, mirrored, resultRef, videoRef]);

  return <canvas ref={canvasRef} className="pose-overlay" aria-hidden="true" />;
}

