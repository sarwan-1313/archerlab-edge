import { VIDEO_CONFIG } from '../config';

export type DecodedAudio =
  | { status: 'decoded'; samples: Float32Array; sampleRate: number; durationS: number }
  | { status: 'unavailable'; reason: string };

/**
 * Decodes a video file's audio track to mono at a low sample rate (enough for
 * transient detection, and far less memory than the original).
 */
export async function decodeAudioTrack(file: Blob, sampleRate: number = VIDEO_CONFIG.audio.sampleRate, maxBytes: number = VIDEO_CONFIG.maxAudioDecodeBytes): Promise<DecodedAudio> {
  if (file.size > maxBytes) {
    return { status: 'unavailable', reason: 'The file is too large to decode its audio in the browser, so release timing comes from video only.' };
  }
  const OfflineContext = globalThis.OfflineAudioContext ?? (globalThis as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!OfflineContext) return { status: 'unavailable', reason: 'This browser cannot decode audio for analysis.' };
  try {
    // decodeAudioData needs the whole container in memory; drop the reference before mixing down so
    // the copy can be collected while the mono track is built.
    let buffer: ArrayBuffer | null = await file.arrayBuffer();
    const context = new OfflineContext(1, 1, sampleRate);
    const decoded = await new Promise<AudioBuffer>((resolve, reject) => {
      const result = context.decodeAudioData(buffer as ArrayBuffer, resolve, reject);
      if (result && typeof (result as Promise<AudioBuffer>).then === 'function') (result as Promise<AudioBuffer>).then(resolve, reject);
    });
    buffer = null;
    const channels = decoded.numberOfChannels;
    const mono = new Float32Array(decoded.length);
    for (let channel = 0; channel < channels; channel += 1) {
      const data = decoded.getChannelData(channel);
      for (let i = 0; i < data.length; i += 1) mono[i] += data[i] / channels;
    }
    return { status: 'decoded', samples: mono, sampleRate: decoded.sampleRate, durationS: decoded.duration };
  } catch {
    return { status: 'unavailable', reason: 'No audio track could be read from this video, so release timing comes from video only.' };
  }
}
