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

    const allDevices = await navigator.mediaDevices.enumerateDevices();
    const cams = allDevices
      .filter((device) => device.kind === 'videoinput')
      .map((device) => ({
        deviceId: device.deviceId || 'default-camera',
        kind: device.kind,
        label: device.label || 'Local Camera',
      }));

    setDevices(cams);

    if (!selectedDeviceId && cams.length > 0) {
      setSelectedDeviceId(cams[0].deviceId);
    }
  }, [selectedDeviceId]);

  const startCamera = useCallback(
    async (deviceId?: string) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser does not support local camera access.');
        return null;
      }

      clearStream();
      setIsLoading(true);
      setError(null);

      const nextDeviceId = deviceId ?? selectedDeviceId;

      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: nextDeviceId ? { deviceId: { exact: nextDeviceId } } : { facingMode: config.facingMode },
          audio: false,
        });

        streamRef.current = mediaStream;
        setStream(mediaStream);
        const resolvedDeviceId = nextDeviceId ?? selectedDeviceId ?? mediaStream.id;
        if (resolvedDeviceId) {
          setSelectedDeviceId(resolvedDeviceId);
        }
        return mediaStream;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to access the camera.';
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [clearStream, config.facingMode, selectedDeviceId],
  );

  const stopCamera = useCallback(() => {
    clearStream();
    setError(null);
  }, [clearStream]);

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  useEffect(() => {
    if (!config.autoStart) {
      return;
    }

    void startCamera(selectedDeviceId ?? undefined);

    return () => {
      stopCamera();
    };
  }, [config.autoStart, selectedDeviceId, startCamera, stopCamera]);

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
