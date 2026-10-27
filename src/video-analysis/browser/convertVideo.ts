import type { FFmpeg } from '@ffmpeg/ffmpeg';
import {
  ConvertCancelledError, ConvertError, PROBE_ARGS, buildConvertArgs, chooseCore, convertedFileName,
  describeConvertFailure, describeNoVideo, parseCoreManifest, parseProbe, type CoreFiles, type CoreKind, type MediaInfo,
} from '../convert';

const appBase = import.meta.env.BASE_URL.replace(/\/$/, '');
const CORE_DIR = `${appBase}/ffmpeg`;

const INPUT_DIR = '/input';
const INPUT_NAME = 'source';
const OUTPUT_PATH = '/converted.mp4';
const PROBE_PATH = '/probe.json';

export interface DownloadProgress {
  loadedBytes: number;
  totalBytes: number;
}

export interface ConvertProgress {
  /** 0–1 of the clip converted, or null when the clip's length could not be read. */
  fraction: number | null;
}

export interface OpenConverterOptions {
  signal: AbortSignal;
  onDownload: (progress: DownloadProgress) => void;
}

export interface Converter {
  core: CoreKind;
  info: MediaInfo;
  /** Converts the clip. The converter cannot be reused afterwards. */
  convert: (onProgress: (progress: ConvertProgress) => void) => Promise<File>;
  /** Stops any work and frees the worker, the clip and the downloaded core. Safe to call twice. */
  close: () => void;
}

const throwIfAborted = (signal: AbortSignal) => { if (signal.aborted) throw new ConvertCancelledError(); };

async function fetchCoreFile(url: string, type: string, expectedBytes: number, signal: AbortSignal, onBytes: (bytes: number) => void): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    throwIfAborted(signal);
    throw error;
  }
  if (!response.ok) throw new ConvertError(`The converter could not be downloaded: ${url} answered HTTP ${response.status}.`);
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  const reader = response.body?.getReader();
  try {
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.byteLength;
        onBytes(Math.min(loaded, expectedBytes));
      }
    } else {
      chunks.push(new Uint8Array(await response.arrayBuffer()));
    }
  } catch (error) {
    throwIfAborted(signal);
    throw error;
  }
  return URL.createObjectURL(new Blob(chunks as BlobPart[], { type }));
}

async function downloadCore(files: CoreFiles, signal: AbortSignal, onDownload: (progress: DownloadProgress) => void) {
  const parts = [
    { key: 'js', path: files.js, type: 'text/javascript', bytes: files.bytes.js },
    { key: 'wasm', path: files.wasm, type: 'application/wasm', bytes: files.bytes.wasm },
    ...(files.worker ? [{ key: 'worker', path: files.worker, type: 'text/javascript', bytes: files.bytes.worker ?? 0 }] : []),
  ];
  const totalBytes = parts.reduce((sum, part) => sum + part.bytes, 0);
  const done: Record<string, string> = {};
  let finishedBytes = 0;
  try {
    for (const part of parts) {
      done[part.key] = await fetchCoreFile(`${CORE_DIR}/${part.path}`, part.type, part.bytes, signal, (bytes) => onDownload({ loadedBytes: finishedBytes + bytes, totalBytes }));
      finishedBytes += part.bytes;
    }
  } catch (error) {
    Object.values(done).forEach((url) => URL.revokeObjectURL(url));
    throw error;
  }
  onDownload({ loadedBytes: totalBytes, totalBytes });
  return { coreURL: done.js, wasmURL: done.wasm, workerURL: done.worker, urls: Object.values(done) };
}

async function readManifest(signal: AbortSignal) {
  let response: Response;
  try {
    response = await fetch(`${CORE_DIR}/manifest.json`, { cache: 'no-cache', signal });
  } catch (error) {
    throwIfAborted(signal);
    throw error;
  }
  const manifest = response.ok ? parseCoreManifest(await response.json().catch(() => null)) : null;
  if (!manifest) throw new ConvertError(`The converter is not part of this deployment: ${CORE_DIR}/manifest.json is ${response.ok ? 'not a converter manifest' : `missing (HTTP ${response.status})`}.`);
  return manifest;
}

/**
 * Downloads the self-hosted ffmpeg core (the first time this runs in a session; the browser cache serves it
 * after that) and reads the clip's length, size and codecs. Both @ffmpeg/ffmpeg and the core are only
 * loaded here, so athletes who never convert never download them.
 */
export async function openConverter(file: File, { signal, onDownload }: OpenConverterOptions): Promise<Converter> {
  const log: string[] = [];
  let ffmpeg: FFmpeg | null = null;
  let urls: string[] = [];
  let closed = false;
  const releaseUrls = () => {
    urls.forEach((url) => URL.revokeObjectURL(url));
    urls = [];
  };
  const close = () => {
    if (closed) return;
    closed = true;
    ffmpeg?.terminate();
    releaseUrls();
  };
  signal.addEventListener('abort', close, { once: true });

  try {
    const manifest = await readManifest(signal);
    const { kind, files } = chooseCore(manifest, globalThis.crossOriginIsolated === true, typeof SharedArrayBuffer !== 'undefined');
    // The wrapper is loaded first so that a failure to load it (a stale chunk after an update) cannot leave a
    // 31 MB download running with nobody to take its blob URLs.
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const core = await downloadCore(files, signal, onDownload);
    urls = core.urls;
    // A cancel that landed while the last file arrived has already run close(), when there was nothing to free.
    if (closed) releaseUrls();
    throwIfAborted(signal);

    const instance = new FFmpeg();
    ffmpeg = instance;
    instance.on('log', ({ message }) => { log.push(message); if (log.length > 200) log.splice(0, log.length - 100); });
    await instance.load({ coreURL: core.coreURL, wasmURL: core.wasmURL, ...(core.workerURL ? { workerURL: core.workerURL } : {}) }, { signal });
    throwIfAborted(signal);

    // The clip is mounted instead of copied, so a large iPhone file is not held in memory twice.
    let inputPath = `${INPUT_DIR}/${INPUT_NAME}`;
    await instance.createDir(INPUT_DIR);
    const mounted = await instance.mount('WORKERFS' as Parameters<FFmpeg['mount']>[0], { blobs: [{ name: INPUT_NAME, data: file }] }, INPUT_DIR);
    if (!mounted) {
      inputPath = `/${INPUT_NAME}`;
      await instance.writeFile(inputPath, new Uint8Array(await file.arrayBuffer()), { signal });
    }

    // This core's ffprobe reports exit code -1 even when it worked, so success is judged by what it wrote.
    await instance.ffprobe([...PROBE_ARGS, '-o', PROBE_PATH, inputPath], -1, { signal });
    throwIfAborted(signal);
    const probeText = await instance.readFile(PROBE_PATH, 'utf8', { signal }).catch(() => '');
    if (typeof probeText !== 'string' || !probeText.trim()) {
      throw describeConvertFailure(new Error('ffprobe could not read this file'), log);
    }
    const info = parseProbe(probeText);
    if (!info.videoCodec) throw describeNoVideo(log);

    const convert: Converter['convert'] = async (onProgress) => {
      throwIfAborted(signal);
      const durationS = info.durationS;
      instance.on('progress', ({ time }) => {
        // `time` is the converted time in microseconds; early events can be negative.
        if (durationS === null) onProgress({ fraction: null });
        else onProgress({ fraction: Math.min(1, Math.max(0, time / 1e6 / durationS)) });
      });
      log.length = 0;
      let code: number;
      try {
        code = await instance.exec(buildConvertArgs(inputPath, OUTPUT_PATH), -1, { signal });
      } catch (error) {
        throw signal.aborted ? new ConvertCancelledError() : describeConvertFailure(error, log);
      }
      throwIfAborted(signal);
      if (code !== 0) throw describeConvertFailure(new Error(`ffmpeg exited with code ${code}`), log);
      const data = await instance.readFile(OUTPUT_PATH, 'binary', { signal });
      if (typeof data === 'string' || data.byteLength === 0) throw new ConvertError('The converter finished but produced an empty file.', log.slice(-25));
      onProgress({ fraction: 1 });
      return new File([data as Uint8Array<ArrayBuffer>], convertedFileName(file.name), { type: 'video/mp4', lastModified: file.lastModified });
    };

    return { core: kind, info, convert, close };
  } catch (error) {
    close();
    if (signal.aborted) throw new ConvertCancelledError();
    throw describeConvertFailure(error, log);
  }
}
