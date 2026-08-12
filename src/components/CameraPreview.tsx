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

  return (
    <div className={['camera-preview', className].join(' ')}>
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

      {isLoading ? <div className="camera-preview__loading"><span>Starting camera…</span></div> : null}

      {error ? (
        <div className="camera-preview__error">
          <span>Camera access error</span>
          <p>{error}</p>
        </div>
      ) : null}

      {deviceLabel && !error && !isLoading ? (
        <div className="camera-preview__device"><span /><strong>{deviceLabel}</strong></div>
      ) : null}

      {children}
    </div>
  );
}
