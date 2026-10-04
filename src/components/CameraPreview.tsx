import { useCallback, useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { AppIcon } from './AppIcon';

type CameraPreviewProps = {
  stream: MediaStream | null;
  isLoading?: boolean;
  error?: string | null;
  deviceLabel?: string;
  children?: ReactNode;
  className?: string;
  videoRef?: RefObject<HTMLVideoElement | null>;
  mirrored?: boolean;
};

export function CameraPreview({
  stream,
  isLoading = false,
  error = null,
  deviceLabel,
  children,
  className = '',
  videoRef,
  mirrored = false,
}: CameraPreviewProps) {
  const internalVideoRef = useRef<HTMLVideoElement | null>(null);
  const setVideoRef = useCallback((node: HTMLVideoElement | null) => {
    internalVideoRef.current = node;
    if (videoRef) videoRef.current = node;
  }, [videoRef]);

  useEffect(() => {
    if (!internalVideoRef.current || !stream) return;
    internalVideoRef.current.srcObject = stream;
    void internalVideoRef.current.play().catch(() => undefined);
  }, [stream]);

  const previewState = error ? 'error' : isLoading ? 'loading' : stream ? 'active' : 'idle';

  return (
    <div className={['camera-preview', `camera-preview--${previewState}`, className].join(' ')} aria-busy={isLoading}>
      {stream ? (
        <video
          ref={setVideoRef}
          autoPlay
          muted
          playsInline
          className={`camera-preview__video ${mirrored ? 'camera-preview__video--mirrored' : ''}`}
        />
      ) : (
        <div className="camera-preview__fallback">
          <div className="camera-preview__silhouette">
            <AppIcon name="accessibility" size={180} />
            <div className="camera-preview__axis camera-preview__axis--vertical" />
            <div className="camera-preview__axis camera-preview__axis--horizontal" />
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="camera-preview__state camera-preview__state--loading" role="status">
          <span className="camera-preview__spinner" />
          <strong>Preparing camera</strong>
          <p>Connecting to the local video feed.</p>
        </div>
      ) : null}

      {error ? (
        <div className="camera-preview__state camera-preview__state--error" role="alert">
          <span className="camera-preview__state-icon"><AppIcon name="camera" size={22} /></span>
          <strong>Camera unavailable</strong>
          <p>{error || 'Check camera permission and make sure another application is not using the camera.'}</p>
          <small>Update browser permissions, close other camera apps, then restart the camera below.</small>
        </div>
      ) : null}

      {!stream && !isLoading && !error ? (
        <div className="camera-preview__idle-copy">
          <strong>Camera paused</strong>
          <span>Use the controls below to reconnect the local feed.</span>
        </div>
      ) : null}

      {deviceLabel && !error && !isLoading ? (
        <div className="camera-preview__device"><span /><strong>{deviceLabel}</strong></div>
      ) : null}

      {children}
    </div>
  );
}
