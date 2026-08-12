// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
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
});
