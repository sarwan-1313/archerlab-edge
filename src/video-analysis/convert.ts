/**
 * Pure helpers for "Convert to MP4 on this device" (ffmpeg compiled to WebAssembly, see
 * browser/convertVideo.ts). Nothing here touches the browser, so it is all unit-tested.
 */

export const CONVERT_CONFIG = {
  /** Long edge of the converted video. Pose tracking downsamples to about this anyway. */
  longEdgePx: 720,
  /** x264 quality (lower is better) and speed. veryfast keeps a WebAssembly encode practical. */
  crf: 24,
  preset: 'veryfast',
  audioKbps: 128,
  /** Clips longer than this ask for a confirmation first, because the conversion takes a while. */
  warnDurationS: 5 * 60,
  /**
   * Time estimate, in seconds of work per frame: encodePerFrame + decodePerSourceMegapixel × source megapixels.
   * Measured with the single-thread core in headless Chromium on a 2-vCPU VM: synthetic H.264 sources ran at
   * 0.040 s/frame (1280×720), 0.050 (1920×1080) and 0.053 (1080×1920). Real footage encodes slower than
   * synthetic and HEVC decodes slower than H.264, so these are padded. The live estimate takes over after the first percent
   * or so. See docs/video-conversion.md.
   */
  estimate: { encodePerFrame: 0.045, decodePerSourceMegapixel: 0.02, fallbackFps: 30, fallbackMegapixels: 2.07 },
  /** Used for the offer text before the core is loaded: the uncompressed size of ffmpeg-core.wasm and its loader. */
  approxDownloadBytes: 32_344_223,
} as const;

export type CoreKind = 'single' | 'multi';

export interface CoreFiles {
  /** Paths below the converter folder (public/ffmpeg). */
  js: string;
  wasm: string;
  /** The multi-thread core also needs its worker script. */
  worker?: string;
  /** Uncompressed sizes, so the download bar is right even when the host compresses the response. */
  bytes: { js: number; wasm: number; worker?: number };
}

export interface CoreManifest {
  version: string;
  cores: Partial<Record<CoreKind, CoreFiles>>;
}

/** Reads public/ffmpeg/manifest.json, which `npm run ffmpeg:core` writes. */
export function parseCoreManifest(value: unknown): CoreManifest | null {
  if (typeof value !== 'object' || value === null) return null;
  const { version, cores } = value as { version?: unknown; cores?: unknown };
  if (typeof version !== 'string' || typeof cores !== 'object' || cores === null) return null;
  const parsed: CoreManifest = { version, cores: {} };
  for (const kind of ['single', 'multi'] as const) {
    const core = (cores as Record<string, unknown>)[kind] as Partial<CoreFiles> | undefined;
    if (!core || typeof core.js !== 'string' || typeof core.wasm !== 'string' || !core.bytes) continue;
    if (typeof core.bytes.js !== 'number' || typeof core.bytes.wasm !== 'number') continue;
    if (kind === 'multi' && (typeof core.worker !== 'string' || typeof core.bytes.worker !== 'number')) continue;
    parsed.cores[kind] = core as CoreFiles;
  }
  return parsed.cores.single || parsed.cores.multi ? parsed : null;
}

/**
 * The multi-thread core needs SharedArrayBuffer, which a page only gets when the host sends the
 * Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers (crossOriginIsolated). Without them,
 * and when the deployment does not include the multi-thread files, the single-thread core is used.
 */
export function chooseCore(manifest: CoreManifest, crossOriginIsolated: boolean, hasSharedArrayBuffer: boolean): { kind: CoreKind; files: CoreFiles } {
  if (crossOriginIsolated && hasSharedArrayBuffer && manifest.cores.multi) return { kind: 'multi', files: manifest.cores.multi };
  if (manifest.cores.single) return { kind: 'single', files: manifest.cores.single };
  throw new ConvertError('This deployment has no single-thread converter, and the multi-thread one needs cross-origin isolation, which this site does not have.');
}

export interface MediaInfo {
  durationS: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  videoCodec: string | null;
  hasAudio: boolean;
}

export const PROBE_ARGS = ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate', '-of', 'json'];

const positive = (value: unknown): number | null => {
  const number = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(number) && number > 0 ? number : null;
};

/** Reads `ffprobe -of json` output. Fields a container does not report come back null. */
export function parseProbe(text: string): MediaInfo {
  let json: { format?: { duration?: unknown }; streams?: Array<Record<string, unknown>> };
  try { json = JSON.parse(text); } catch { throw new ConvertError('ffprobe returned output that could not be read, so the file is probably not a video.'); }
  const streams = json.streams ?? [];
  const video = streams.find((stream) => stream.codec_type === 'video');
  const [numerator, denominator] = String(video?.avg_frame_rate ?? '').split('/').map(Number);
  const fps = denominator ? positive(numerator / denominator) : null;
  return {
    durationS: positive(json.format?.duration),
    width: positive(video?.width),
    height: positive(video?.height),
    fps,
    videoCodec: typeof video?.codec_name === 'string' ? video.codec_name : null,
    hasAudio: streams.some((stream) => stream.codec_type === 'audio'),
  };
}

/**
 * Arguments for the conversion. Only the first video and audio streams are kept (iPhone .mov files carry
 * timecode and metadata tracks that MP4 cannot hold). The long edge is capped at 720 px without enlarging
 * and without breaking the 2-pixel alignment H.264 needs; ffmpeg applies the rotation flag first, so a
 * portrait phone clip is measured the way it is shown.
 */
export function buildConvertArgs(input: string, output: string): string[] {
  const edge = CONVERT_CONFIG.longEdgePx;
  const scale = `scale=w='if(gte(iw,ih),trunc(min(${edge},iw)/2)*2,-2)':h='if(gte(iw,ih),-2,trunc(min(${edge},ih)/2)*2)'`;
  return [
    '-i', input,
    '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn',
    '-vf', `${scale},format=yuv420p`,
    '-c:v', 'libx264', '-preset', CONVERT_CONFIG.preset, '-crf', String(CONVERT_CONFIG.crf),
    '-c:a', 'aac', '-b:a', `${CONVERT_CONFIG.audioKbps}k`,
    '-movflags', '+faststart',
    output,
  ];
}

/** "iphone clip.MOV" → "iphone clip.mp4"; a file that is already .mp4 becomes "name-converted.mp4". */
export function convertedFileName(name: string): string {
  const stem = name.replace(/\.[^./\\]+$/, '') || 'video';
  return /\.mp4$/i.test(name) ? `${stem}-converted.mp4` : `${stem}.mp4`;
}

/** Rough seconds of work for the conversion itself (not the converter download), or null when the length is unknown. */
export function estimateConvertSeconds(info: MediaInfo): number | null {
  if (info.durationS === null) return null;
  const { encodePerFrame, decodePerSourceMegapixel, fallbackFps, fallbackMegapixels } = CONVERT_CONFIG.estimate;
  const megapixels = info.width && info.height ? (info.width * info.height) / 1e6 : fallbackMegapixels;
  return info.durationS * (info.fps ?? fallbackFps) * (encodePerFrame + decodePerSourceMegapixel * megapixels);
}

/** Seconds left, from how far along the encode is. Waits for a little progress before trusting the rate. */
export function remainingSeconds(elapsedS: number, fraction: number, estimateS: number | null): number | null {
  if (fraction >= 1) return 0;
  if (fraction < 0.03 || elapsedS < 3) return estimateS === null ? null : Math.max(0, estimateS - elapsedS);
  return (elapsedS / fraction) * (1 - fraction);
}

/** "about 2 min", "about 40 s" */
export function formatDurationRough(seconds: number): string {
  if (seconds < 50) return `${Math.max(5, Math.round(seconds / 5) * 5)} s`;
  const minutes = seconds / 60;
  if (minutes < 10) return `${Math.round(minutes * 2) / 2} min`;
  return `${Math.round(minutes)} min`;
}

/** A failure with a message that is safe to show as it is, and the last lines ffmpeg printed. */
export class ConvertError extends Error {
  readonly log: string[];
  constructor(message: string, log: string[] = []) {
    super(message);
    this.name = 'ConvertError';
    this.log = log;
  }
}

export class ConvertCancelledError extends Error {
  constructor() {
    super('Conversion cancelled.');
    this.name = 'ConvertCancelledError';
  }
}

const PROGRESS_LINE = /^\s*(?:frame|size)=|^\s*Press \[q\]/;
const PROBLEM_LINE = /error|invalid|fail|unsupported|not supported|no such|cannot|can't|could not|unable|unknown|not found|does not|discarded|corrupt|truncated|moov atom/i;
const MEMORY_FAILURE = /out of memory|\bOOM\b|memory access out of bounds|cannot enlarge memory|allocation failed/i;

/** The most telling line of ffmpeg's output: the last one that reads like a problem, else the last line. */
export function pickReasonLine(log: string[]): string | null {
  const lines = log.map((line) => line.trim()).filter((line) => line && !PROGRESS_LINE.test(line));
  return [...lines].reverse().find((line) => PROBLEM_LINE.test(line)) ?? lines.at(-1) ?? null;
}

/** Turns whatever went wrong into the real reason, in words an archer can act on, keeping the original text. */
export function describeConvertFailure(error: unknown, log: string[] = []): ConvertError {
  if (error instanceof ConvertError) return error;
  const raw = error instanceof Error ? error.message : String(error);
  const tail = log.slice(-25);
  const reason = pickReasonLine(tail);
  // The core swallows a wasm abort and reports exit code -1, so running out of memory shows up in ffmpeg's output, not in the error.
  const memoryEvidence = MEMORY_FAILURE.test(raw) ? raw : tail.find((line) => MEMORY_FAILURE.test(line));
  if (error instanceof RangeError || memoryEvidence) {
    return new ConvertError(`This device ran out of memory while converting (${memoryEvidence ?? raw}). Try a shorter clip, or export a lower-resolution MP4 from your phone.`, tail);
  }
  if (error instanceof TypeError && /fetch|network|load failed/i.test(raw)) {
    return new ConvertError(`The converter could not be downloaded (${raw}). Check your connection and try again; it is only fetched when you convert.`, tail);
  }
  if (reason) return new ConvertError(`ffmpeg could not convert this file: ${reason}${raw && !reason.includes(raw) ? ` (${raw})` : ''}`, tail);
  return new ConvertError(`The conversion failed: ${raw || 'unknown error'}`, tail);
}

/** A file whose probe found no video: ffmpeg's own complaint when it printed one (a damaged or non-video file), else that there is simply no picture. */
export function describeNoVideo(log: string[]): ConvertError {
  const tail = log.slice(-25);
  const reason = pickReasonLine(tail);
  return reason
    ? new ConvertError(`ffmpeg could not read this file: ${reason}`, tail)
    : new ConvertError('This file has no video track, so there is nothing to convert.', tail);
}
