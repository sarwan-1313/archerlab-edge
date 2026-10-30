import { syntheticPoseAt } from '../../src/video-analysis/testing/syntheticArcher';
import { synthesizeRangeAudio } from '../../src/video-analysis/testing/syntheticAudio';
import { E2E_AUDIO_EVENTS, E2E_AUDIO_SAMPLE_RATE, E2E_CLIP_FPS, E2E_CLIP_SIZE, E2E_SCENARIO } from '../support/scenario';
import { muxWebm, type WebmPacket } from './webm';

/**
 * Renders the scripted synthetic session to a WebM clip (VP8 video + Opus
 * audio) with the browser's WebCodecs encoders. scripts/make-e2e-clip.mjs runs
 * this in headless Chromium and writes the result to e2e/fixtures.
 */

const BONES: Array<[number, number]> = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28], [27, 31], [28, 32],
];
const OPUS_PRE_SKIP = 312;

function drawFrame(context: CanvasRenderingContext2D, t: number) {
  const { width, height } = E2E_CLIP_SIZE;
  context.fillStyle = '#cfe3f5';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#6fa35b';
  context.fillRect(0, height * 0.86, width, height * 0.14);
  context.fillStyle = '#7a5b3a';
  context.fillRect(width * 0.9, height * 0.45, 10, height * 0.41);
  context.fillStyle = '#e8c547';
  context.beginPath();
  context.arc(width * 0.9 + 5, height * 0.45, 34, 0, Math.PI * 2);
  context.fill();

  const pose = syntheticPoseAt(E2E_SCENARIO, t);
  if (pose.image) {
    const px = (index: number): [number, number] => [pose.image![index * 4] * width, pose.image![index * 4 + 1] * height];
    const bowSide = E2E_SCENARIO.drawSide === 'right' ? 15 : 16;
    const drawSide = E2E_SCENARIO.drawSide === 'right' ? 16 : 15;
    context.lineCap = 'round';
    context.strokeStyle = '#243447';
    context.lineWidth = 7;
    for (const [from, to] of BONES) {
      const [x1, y1] = px(from);
      const [x2, y2] = px(to);
      context.beginPath();
      context.moveTo(x1, y1);
      context.lineTo(x2, y2);
      context.stroke();
    }
    const [nx, ny] = px(0);
    context.fillStyle = '#243447';
    context.beginPath();
    context.arc(nx - 6, ny, 17, 0, Math.PI * 2);
    context.fill();

    // The bow is held at the bow hand; the string runs to the drawing hand.
    const [bx, by] = px(bowSide);
    const [dx, dy] = px(drawSide);
    const limb = height * 0.22;
    const drawn = by < height * 0.45 && Math.abs(dx - bx) > 40;
    context.strokeStyle = '#7a3f1d';
    context.lineWidth = 5;
    context.beginPath();
    context.ellipse(bx - 4, by, 12, limb, 0, -Math.PI / 2, Math.PI / 2, true);
    context.stroke();
    context.strokeStyle = '#555';
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(bx - 4, by - limb);
    context.lineTo(drawn ? dx : bx - 4, drawn ? dy : by);
    context.lineTo(bx - 4, by + limb);
    context.stroke();
    if (drawn) {
      context.strokeStyle = '#b22';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(dx, dy);
      context.lineTo(bx + 30, by);
      context.stroke();
    }
  }
  context.fillStyle = '#243447';
  context.font = '14px sans-serif';
  context.fillText(`${t.toFixed(1)} s`, 10, 20);
}

async function encodeVideo(packets: WebmPacket[]) {
  const { width, height } = E2E_CLIP_SIZE;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  const encoder = new VideoEncoder({
    output: (chunk) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      packets.push({ track: 'video', timeMs: chunk.timestamp / 1000, keyframe: chunk.type === 'key', data });
    },
    error: (error) => { throw error; },
  });
  encoder.configure({ codec: 'vp8', width, height, bitrate: 250_000, framerate: E2E_CLIP_FPS });
  const frames = Math.round(E2E_SCENARIO.durationS * E2E_CLIP_FPS);
  for (let index = 0; index < frames; index += 1) {
    drawFrame(context, index / E2E_CLIP_FPS);
    const frame = new VideoFrame(canvas, { timestamp: Math.round((index * 1e6) / E2E_CLIP_FPS), duration: Math.round(1e6 / E2E_CLIP_FPS) });
    encoder.encode(frame, { keyFrame: index % E2E_CLIP_FPS === 0 });
    frame.close();
    if (encoder.encodeQueueSize > 8) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await encoder.flush();
  encoder.close();
}

async function encodeAudio(packets: WebmPacket[]) {
  const samples = synthesizeRangeAudio(E2E_SCENARIO.durationS, E2E_AUDIO_EVENTS, E2E_AUDIO_SAMPLE_RATE);
  const encoder = new AudioEncoder({
    output: (chunk) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      packets.push({ track: 'audio', timeMs: chunk.timestamp / 1000, keyframe: true, data });
    },
    error: (error) => { throw error; },
  });
  encoder.configure({ codec: 'opus', sampleRate: E2E_AUDIO_SAMPLE_RATE, numberOfChannels: 1, bitrate: 32_000 });
  const step = E2E_AUDIO_SAMPLE_RATE / 50; // 20 ms
  for (let start = 0; start + step <= samples.length; start += step) {
    const chunk = samples.slice(start, start + step);
    const data = new AudioData({ format: 'f32-planar', sampleRate: E2E_AUDIO_SAMPLE_RATE, numberOfFrames: step, numberOfChannels: 1, timestamp: Math.round((start * 1e6) / E2E_AUDIO_SAMPLE_RATE), data: chunk });
    encoder.encode(data);
    data.close();
  }
  await encoder.flush();
  encoder.close();
}

export async function renderClip(): Promise<number[]> {
  const packets: WebmPacket[] = [];
  await encodeVideo(packets);
  await encodeAudio(packets);
  const file = muxWebm({
    width: E2E_CLIP_SIZE.width, height: E2E_CLIP_SIZE.height, durationMs: E2E_SCENARIO.durationS * 1000,
    audioSampleRate: E2E_AUDIO_SAMPLE_RATE, opusPreSkip: OPUS_PRE_SKIP, packets,
  });
  return Array.from(file);
}

(globalThis as unknown as { renderClip: typeof renderClip }).renderClip = renderClip;
