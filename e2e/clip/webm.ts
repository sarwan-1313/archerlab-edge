/**
 * A minimal WebM (Matroska) muxer: one VP8 video track and one Opus audio
 * track, in memory. It writes the cue index before the clusters so browsers can
 * seek without scanning the file. Used only to build the end-to-end test clip.
 */

export interface WebmPacket {
  track: 'video' | 'audio';
  /** Presentation time in milliseconds. */
  timeMs: number;
  keyframe: boolean;
  data: Uint8Array;
}

export interface WebmOptions {
  width: number;
  height: number;
  durationMs: number;
  audioSampleRate: number;
  /** Samples of encoder delay at the start of the Opus stream. */
  opusPreSkip: number;
  packets: WebmPacket[];
  clusterMs?: number;
}

const VIDEO_TRACK = 1;
const AUDIO_TRACK = 2;

const concat = (parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
};

const idBytes = (id: number): Uint8Array => {
  const bytes: number[] = [];
  for (let value = id; value > 0; value = Math.floor(value / 256)) bytes.unshift(value % 256);
  return Uint8Array.from(bytes);
};

/** EBML data size, always eight bytes so the length of an element never depends on its content. */
const sizeBytes = (size: number): Uint8Array => {
  const out = new Uint8Array(8);
  out[0] = 0x01;
  for (let index = 7; index >= 1; index -= 1) { out[index] = size % 256; size = Math.floor(size / 256); }
  return out;
};

const element = (id: number, ...body: Uint8Array[]): Uint8Array => {
  const payload = concat(body);
  return concat([idBytes(id), sizeBytes(payload.length), payload]);
};

const uint = (id: number, value: number, width = 0): Uint8Array => {
  const bytes: number[] = [];
  for (let rest = value; rest > 0; rest = Math.floor(rest / 256)) bytes.unshift(rest % 256);
  while (bytes.length < Math.max(1, width)) bytes.unshift(0);
  return element(id, Uint8Array.from(bytes));
};

const float = (id: number, value: number): Uint8Array => {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  return element(id, new Uint8Array(view.buffer));
};

const text = (id: number, value: string): Uint8Array => element(id, new TextEncoder().encode(value));

function opusHead(sampleRate: number, preSkip: number): Uint8Array {
  const head = new DataView(new ArrayBuffer(19));
  new TextEncoder().encodeInto('OpusHead', new Uint8Array(head.buffer));
  head.setUint8(8, 1);
  head.setUint8(9, 1);
  head.setUint16(10, preSkip, true);
  head.setUint32(12, sampleRate, true);
  head.setInt16(16, 0, true);
  head.setUint8(18, 0);
  return new Uint8Array(head.buffer);
}

function simpleBlock(packet: WebmPacket, clusterStartMs: number): Uint8Array {
  const header = new Uint8Array(4);
  header[0] = 0x80 | (packet.track === 'video' ? VIDEO_TRACK : AUDIO_TRACK);
  new DataView(header.buffer).setInt16(1, Math.round(packet.timeMs - clusterStartMs));
  header[3] = packet.keyframe ? 0x80 : 0;
  return element(0xa3, header, packet.data);
}

export function muxWebm(options: WebmOptions): Uint8Array {
  const clusterMs = options.clusterMs ?? 1000;
  const packets = [...options.packets].sort((a, b) => a.timeMs - b.timeMs || (a.track === 'video' ? -1 : 1));

  // Group packets into clusters; every cluster starts on a video keyframe.
  const groups: WebmPacket[][] = [];
  let clusterStart = -Infinity;
  for (const packet of packets) {
    if (!groups.length || (packet.track === 'video' && packet.keyframe && packet.timeMs - clusterStart >= clusterMs)) {
      groups.push([]);
      clusterStart = packet.timeMs;
    }
    groups[groups.length - 1].push(packet);
  }
  const clusterStarts = groups.map((group) => Math.floor(group[0].timeMs));
  const clusters = groups.map((group, index) => element(0x1f43b675, uint(0xe7, clusterStarts[index]), ...group.map((packet) => simpleBlock(packet, clusterStarts[index]))));

  const header = element(0x1a45dfa3, uint(0x4286, 1), uint(0x42f7, 1), uint(0x42f2, 4), uint(0x42f3, 8), text(0x4282, 'webm'), uint(0x4287, 4), uint(0x4285, 2));
  const info = element(0x1549a966, uint(0x2ad7b1, 1_000_000), float(0x4489, options.durationMs), text(0x4d80, 'archerlab-e2e'), text(0x5741, 'archerlab-e2e'));
  const tracks = element(0x1654ae6b,
    element(0xae, uint(0xd7, VIDEO_TRACK), uint(0x73c5, VIDEO_TRACK), uint(0x83, 1), uint(0x9c, 0), text(0x86, 'V_VP8'),
      element(0xe0, uint(0xb0, options.width), uint(0xba, options.height))),
    element(0xae, uint(0xd7, AUDIO_TRACK), uint(0x73c5, AUDIO_TRACK), uint(0x83, 2), uint(0x9c, 0), text(0x86, 'A_OPUS'),
      element(0x63a2, opusHead(options.audioSampleRate, options.opusPreSkip)),
      uint(0x56aa, Math.round((options.opusPreSkip / 48000) * 1e9)), uint(0x56bb, 80_000_000),
      element(0xe1, float(0xb5, options.audioSampleRate), uint(0x9f, 1))));

  // Cue positions are relative to the start of the segment payload; the cues sit between the tracks and the clusters.
  const cuesFor = (firstClusterOffset: number): Uint8Array => {
    let offset = firstClusterOffset;
    const points = groups.map((_, index) => {
      const point = element(0xbb, uint(0xb3, clusterStarts[index]), element(0xb7, uint(0xf7, VIDEO_TRACK), uint(0xf1, offset, 8)));
      offset += clusters[index].length;
      return point;
    });
    return element(0x1c53bb6b, ...points);
  };
  const cuesSize = cuesFor(0).length;
  const cues = cuesFor(info.length + tracks.length + cuesSize);

  const segment = element(0x18538067, info, tracks, cues, ...clusters);
  return concat([header, segment]);
}
