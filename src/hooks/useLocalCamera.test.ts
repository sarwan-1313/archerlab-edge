// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { StrictMode, createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocalCamera } from './useLocalCamera';

describe('useLocalCamera', () => {
  const stop = vi.fn();
  const getUserMedia = vi.fn();
  const enumerateDevices = vi.fn();

  beforeEach(() => {
    stop.mockReset();
    getUserMedia.mockReset();
    enumerateDevices.mockReset();

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia,
        enumerateDevices,
      },
    });

    enumerateDevices.mockResolvedValue([
      { deviceId: 'cam-1', kind: 'videoinput', label: 'Built-in Camera' },
      { deviceId: 'cam-2', kind: 'videoinput', label: 'External Camera' },
    ]);
  });

  it('starts the camera using the selected local device and exposes the stream', async () => {
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    getUserMedia.mockResolvedValue(stream);

    const { result } = renderHook(() => useLocalCamera({ autoStart: false }));

    await act(async () => {
      await result.current.startCamera('cam-2');
    });

    expect(getUserMedia).toHaveBeenCalledWith({
      video: { deviceId: { exact: 'cam-2' } },
      audio: false,
    });
    expect(result.current.stream).toBe(stream);
    expect(result.current.devices.map((device) => device.deviceId)).toEqual(['cam-1', 'cam-2']);
  });

  it('stops active device tracks and clears the stream', async () => {
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    getUserMedia.mockResolvedValue(stream);

    const { result } = renderHook(() => useLocalCamera({ autoStart: false }));

    await act(async () => {
      await result.current.startCamera('cam-1');
      result.current.stopCamera();
    });

    expect(stop).toHaveBeenCalledTimes(1);
    expect(result.current.stream).toBeNull();
  });

  it('shares a pending permission request across StrictMode effect replay', async () => {
    let resolve!: (stream: MediaStream) => void;
    getUserMedia.mockReturnValue(new Promise<MediaStream>((done) => { resolve = done; }));
    const stream = { getTracks: () => [{ stop }], getVideoTracks: () => [{ getSettings: () => ({ deviceId: 'cam-2' }) }] } as unknown as MediaStream;
    const { result, unmount } = renderHook(() => useLocalCamera(), { wrapper: ({ children }) => createElement(StrictMode, null, children) });
    await act(async () => { resolve(stream); });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(result.current.stream).toBe(stream);
    expect(result.current.selectedDeviceId).toBe('cam-2');
    expect(stop).not.toHaveBeenCalled();
    unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('closes a permission result that arrives after leaving the page', async () => {
    let resolve!: (stream: MediaStream) => void;
    getUserMedia.mockReturnValue(new Promise<MediaStream>((done) => { resolve = done; }));
    const { unmount } = renderHook(() => useLocalCamera());
    unmount();
    await act(async () => { resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream); });
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('discards an older device response when switching cameras', async () => {
    let first!: (stream: MediaStream) => void;
    getUserMedia.mockReturnValueOnce(new Promise<MediaStream>(resolve => { first = resolve; }));
    const secondStop = vi.fn();
    const second = { getTracks: () => [{ stop: secondStop }] } as unknown as MediaStream;
    getUserMedia.mockResolvedValueOnce(second);
    const { result, unmount } = renderHook(() => useLocalCamera({ autoStart: false }));
    await act(async () => { void result.current.startCamera('cam-1'); await result.current.startCamera('cam-2'); });
    await act(async () => { first({ getTracks: () => [{ stop }] } as unknown as MediaStream); });
    expect(result.current.stream).toBe(second);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(secondStop).not.toHaveBeenCalled();
    unmount();
  });

  it('shows denied permission and lets a later retry succeed even if enumeration fails', async () => {
    enumerateDevices.mockRejectedValue(new Error('Enumeration unavailable'));
    getUserMedia.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'));
    const { result, unmount } = renderHook(() => useLocalCamera({ autoStart: false }));
    await act(async () => { await result.current.startCamera(); });
    expect(result.current.error).toContain('permission was denied');
    expect(result.current.isLoading).toBe(false);
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    getUserMedia.mockResolvedValueOnce(stream);
    await act(async () => { await result.current.startCamera(); });
    expect(result.current.stream).toBe(stream);
    expect(result.current.error).toBeNull();
    unmount();
  });
});
