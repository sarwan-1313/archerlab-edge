import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type CameraDevice = {
  deviceId: string;
  kind: MediaDeviceKind;
  label: string;
};

export type UseLocalCameraOptions = {
  autoStart?: boolean;
  facingMode?: 'user' | 'environment';
};

const defaultOptions: Required<UseLocalCameraOptions> = {
  autoStart: true,
  facingMode: 'user',
};

export function useLocalCamera(options: UseLocalCameraOptions = {}) {
  const config = useMemo(() => ({ ...defaultOptions, ...options }), [options]);
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const selectedDeviceIdRef = useRef<string | null>(null);
  const requestVersion = useRef(0);
  const wantsCamera = useRef(false);
  const pendingRequest = useRef<{ deviceId: string | null; promise: Promise<MediaStream> } | null>(null);

  const clearStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setStream(null);
  }, []);

  const loadDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    const allDevices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    const cams = allDevices
      .filter((device) => device.kind === 'videoinput')
      .map((device) => ({
        deviceId: device.deviceId || 'default-camera',
        kind: device.kind,
        label: device.label || 'Local Camera',
      }));

    setDevices(cams);

    if (cams.length > 0) {
      setSelectedDeviceId((current) => {
        const next = current ?? cams[0].deviceId;
        selectedDeviceIdRef.current = next;
        return next;
      });
    }
  }, []);

  const startCamera = useCallback(
    async (deviceId?: string) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser does not support local camera access.');
        return null;
      }

      clearStream();
      const version = ++requestVersion.current;
      wantsCamera.current = true;
      setIsLoading(true);
      setError(null);

      const nextDeviceId = deviceId ?? selectedDeviceIdRef.current;

      let request = pendingRequest.current;
      if (!request || request.deviceId !== nextDeviceId) {
        request = { deviceId: nextDeviceId, promise: navigator.mediaDevices.getUserMedia({
          video: nextDeviceId ? { deviceId: { exact: nextDeviceId } } : { facingMode: config.facingMode },
          audio: false,
        }) };
        pendingRequest.current = request;
      }
      try {
        const mediaStream = await request.promise;
        if (version !== requestVersion.current || !wantsCamera.current) {
          // StrictMode may reuse the pending request; only discard an unwanted stream.
          if (!wantsCamera.current || pendingRequest.current !== request) mediaStream.getTracks().forEach((track) => track.stop());
          return null;
        }

        streamRef.current = mediaStream;
        setStream(mediaStream);
        const resolvedDeviceId = mediaStream.getVideoTracks?.()[0]?.getSettings?.().deviceId ?? nextDeviceId;
        if (resolvedDeviceId) {
          selectedDeviceIdRef.current = resolvedDeviceId;
          setSelectedDeviceId(resolvedDeviceId);
        }
        void loadDevices();
        return mediaStream;
      } catch (err) {
        if (version !== requestVersion.current || !wantsCamera.current) return null;
        const name = err instanceof DOMException ? err.name : '';
        const message = name === 'NotAllowedError' || name === 'PermissionDeniedError'
          ? 'Camera permission was denied. Allow camera access in your browser settings, then try again.'
          : name === 'NotFoundError' || name === 'DevicesNotFoundError'
            ? 'No camera was found. Connect a camera and try again.'
            : name === 'NotReadableError' || name === 'TrackStartError'
              ? 'The camera is busy or unavailable. Close other camera apps and try again.'
              : name === 'OverconstrainedError'
                ? 'The selected camera is unavailable. Choose another camera or try again.'
                : err instanceof Error ? err.message : 'Unable to access the camera.';
        setError(message);
        return null;
      } finally {
        if (!wantsCamera.current && pendingRequest.current === request) pendingRequest.current = null;
        if (version === requestVersion.current) {
          pendingRequest.current = null;
          setIsLoading(false);
        }
      }
    },
    [clearStream, config.facingMode, loadDevices],
  );

  const stopCamera = useCallback(() => {
    wantsCamera.current = false;
    requestVersion.current += 1;
    clearStream();
    setIsLoading(false);
    setError(null);
  }, [clearStream]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  useEffect(() => {
    if (!config.autoStart) {
      return;
    }

    void startCamera(selectedDeviceIdRef.current ?? undefined);

    return () => {
      stopCamera();
    };
  }, [config.autoStart, startCamera, stopCamera]);

  return {
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    stream,
    error,
    isLoading,
    startCamera,
    stopCamera,
  };
}
