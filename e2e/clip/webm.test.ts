import { describe, expect, it } from 'vitest';
import { muxWebm, type WebmPacket } from './webm';

const packet = (track: WebmPacket['track'], timeMs: number, keyframe = false): WebmPacket => ({ track, timeMs, keyframe, data: Uint8Array.from([1, 2, 3, 4]) });

function indexOfBytes(haystack: Uint8Array, needle: number[], from = 0): number {
  outer: for (let index = from; index <= haystack.length - needle.length; index += 1) {
    for (let k = 0; k < needle.length; k += 1) if (haystack[index + k] !== needle[k]) continue outer;
    return index;
  }
  return -1;
}

describe('muxWebm', () => {
  const packets = [packet('video', 0, true), packet('audio', 0), packet('video', 33), packet('video', 1000, true), packet('audio', 1000), packet('video', 1033)];
  const file = muxWebm({ width: 640, height: 360, durationMs: 1066, audioSampleRate: 48000, opusPreSkip: 312, packets });

  it('starts with the EBML header for a webm document', () => {
    expect(Array.from(file.slice(0, 4))).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
    expect(indexOfBytes(file, Array.from(new TextEncoder().encode('webm')))).toBeGreaterThan(0);
  });

  it('writes one cluster per keyframe interval and a SimpleBlock per packet', () => {
    const clusters: number[] = [];
    for (let at = indexOfBytes(file, [0x1f, 0x43, 0xb6, 0x75]); at >= 0; at = indexOfBytes(file, [0x1f, 0x43, 0xb6, 0x75], at + 1)) clusters.push(at);
    expect(clusters).toHaveLength(2);
    // A SimpleBlock is 0xa3, an eight-byte size, then a four-byte block header and the four-byte payload.
    const pattern = [0xa3, 0x01, 0, 0, 0, 0, 0, 0, 0x08];
    let blocks = 0;
    for (let at = indexOfBytes(file, pattern); at >= 0; at = indexOfBytes(file, pattern, at + 1)) blocks += 1;
    expect(blocks).toBe(packets.length);
  });

  it('puts the cue index before the first cluster', () => {
    expect(indexOfBytes(file, [0x1c, 0x53, 0xbb, 0x6b])).toBeLessThan(indexOfBytes(file, [0x1f, 0x43, 0xb6, 0x75]));
  });
});
