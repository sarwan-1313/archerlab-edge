import { useEffect, useRef, useState, type RefObject } from 'react';
import { POSE_CONFIG } from '../config/pose';
import {
  getPoseErrorMessage,
  getPoseLandmarker,
  isPoseLandmarkerReady,
  toPoseResult,
} from '../services/poseLandmarkerService';
import type { PoseDebugStats, PoseEngineStatus, PoseResult } from '../types/pose';

const EMPTY_DEBUG_STATS: PoseDebugStats = {
  fps: 0,
  landmarkCount: 0,
  averageVisibility: 0,
  videoWidth: 0,
  videoHeight: 0,
};

type UsePoseLandmarkerOptions = {
  videoRef: RefObject<HTMLVideoElement | null>;
  active: boolean;
};

export function usePoseLandmarker({ videoRef, active }: UsePoseLandmarkerOptions) {
  const [status, setStatus] = useState<PoseEngineStatus>(isPoseLandmarkerReady() ? 'ready' : 'idle');
  const [result, setResult] = useState<PoseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugStats, setDebugStats] = useState<PoseDebugStats>(EMPTY_DEBUG_STATS);
  const latestResultRef = useRef<PoseResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    let animationFrame = 0;
    let lastVideoTime = -1;
    let lastInferenceTime = 0;
    let lastUiUpdateTime = 0;
    let fpsWindowStarted = performance.now();
    let fpsFrameCount = 0;
    const inferenceInterval = 1000 / POSE_CONFIG.targetInferenceFps;

    latestResultRef.current = null;
    setResult(null);
    setError(null);

    if (!active) {
      setStatus(isPoseLandmarkerReady() ? 'ready' : 'idle');
      setDebugStats(EMPTY_DEBUG_STATS);
      return;
    }

    setStatus('loading');

    const start = async () => {
      try {
        const poseLandmarker = await getPoseLandmarker();
        if (cancelled) return;
        setStatus('ready');

        const processFrame = (now: number) => {
          if (cancelled) return;
          const video = videoRef.current;

          if (
            video &&
            video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
            video.videoWidth > 0 &&
            video.videoHeight > 0 &&
            video.currentTime !== lastVideoTime &&
            now - lastInferenceTime >= inferenceInterval
          ) {
            try {
              lastVideoTime = video.currentTime;
              lastInferenceTime = now;
              const mediaPipeResult = poseLandmarker.detectForVideo(video, now);
              const nextResult = toPoseResult(mediaPipeResult, now);
              mediaPipeResult.close();
              latestResultRef.current = nextResult;
              fpsFrameCount += 1;
              setStatus((current) => current === 'running' ? current : 'running');

              if (now - lastUiUpdateTime >= POSE_CONFIG.uiUpdateIntervalMs) {
                lastUiUpdateTime = now;
                setResult(nextResult);
              }

              const fpsElapsed = now - fpsWindowStarted;
              if (fpsElapsed >= 1000) {
                setDebugStats({
                  fps: (fpsFrameCount * 1000) / fpsElapsed,
                  landmarkCount: nextResult.landmarks.length,
                  averageVisibility: nextResult.averageVisibility,
                  videoWidth: video.videoWidth,
                  videoHeight: video.videoHeight,
                });
                fpsWindowStarted = now;
                fpsFrameCount = 0;
              }
            } catch (runtimeError) {
              console.error('Pose inference stopped:', runtimeError);
              latestResultRef.current = null;
              setResult(null);
              setStatus('error');
              setError(getPoseErrorMessage(runtimeError));
              return;
            }
          }

          animationFrame = window.requestAnimationFrame(processFrame);
        };

        animationFrame = window.requestAnimationFrame(processFrame);
      } catch (initializationError) {
        if (cancelled) return;
        console.error('Pose engine initialization failed:', initializationError);
        setStatus('error');
        setError(getPoseErrorMessage(initializationError));
      }
    };

    void start();

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      latestResultRef.current = null;
    };
  }, [active, videoRef]);

  return { status, result, latestResultRef, error, debugStats };
}

