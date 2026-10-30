import { describe, expect, it } from 'vitest';
import manifestJson from '../../public/ffmpeg/manifest.json?raw';
import {
  CONVERT_CONFIG, ConvertError, buildConvertArgs, chooseCore, convertedFileName, describeConvertFailure, describeNoVideo, estimateConvertSeconds,
  formatDurationRough, parseCoreManifest, parseProbe, pickReasonLine, remainingSeconds,
} from './convert';

const single = { js: 'single/ffmpeg-core.js', wasm: 'single/ffmpeg-core.wasm', bytes: { js: 100, wasm: 900 } };
const multi = { js: 'multi/ffmpeg-core.js', wasm: 'multi/ffmpeg-core.wasm', worker: 'multi/ffmpeg-core.worker.js', bytes: { js: 100, wasm: 900, worker: 10 } };

describe('core manifest and choice', () => {
  it('reads what npm run ffmpeg:core writes', () => {
    const manifest = parseCoreManifest({ version: '0.12.10', cores: { single } });
    expect(manifest?.cores.single?.wasm).toBe('single/ffmpeg-core.wasm');
    expect(manifest?.cores.multi).toBeUndefined();
  });

  it('rejects a manifest without a usable core, and a multi core without its worker', () => {
    expect(parseCoreManifest(null)).toBeNull();
    expect(parseCoreManifest({ version: '1', cores: {} })).toBeNull();
    expect(parseCoreManifest({ version: '1', cores: { single: { js: 'a' } } })).toBeNull();
    expect(parseCoreManifest({ version: '1', cores: { multi: { ...multi, worker: undefined } } })).toBeNull();
  });

  it('uses the single-thread core unless the page is cross-origin isolated and the multi-thread files are deployed', () => {
    const both = parseCoreManifest({ version: '1', cores: { single, multi } })!;
    expect(chooseCore(both, false, true).kind).toBe('single');
    expect(chooseCore(both, true, false).kind).toBe('single');
    expect(chooseCore(both, true, true).kind).toBe('multi');
    const onlySingle = parseCoreManifest({ version: '1', cores: { single } })!;
    expect(chooseCore(onlySingle, true, true).kind).toBe('single');
  });

  it('explains when only the multi-thread core is deployed but the page is not isolated', () => {
    const onlyMulti = parseCoreManifest({ version: '1', cores: { multi } })!;
    expect(() => chooseCore(onlyMulti, false, false)).toThrow(/cross-origin isolation/);
  });
});

describe('the deployed converter manifest', () => {
  it('lists the single-thread core, and the download size shown up front matches it', () => {
    const manifest = parseCoreManifest(JSON.parse(manifestJson));
    const single = manifest?.cores.single;
    expect(single).toBeDefined();
    expect(single!.bytes.js + single!.bytes.wasm).toBe(CONVERT_CONFIG.approxDownloadBytes);
  });
});

describe('parseProbe', () => {
  const probe = JSON.stringify({
    streams: [
      { codec_name: 'hevc', codec_type: 'video', width: 1920, height: 1080, avg_frame_rate: '30000/1001' },
      { codec_name: 'aac', codec_type: 'audio' },
      { codec_type: 'data' },
    ],
    format: { duration: '83.250000' },
  });

  it('reads length, size, frame rate, codec and audio', () => {
    const info = parseProbe(probe);
    expect(info).toMatchObject({ durationS: 83.25, width: 1920, height: 1080, videoCodec: 'hevc', hasAudio: true });
    expect(info.fps).toBeCloseTo(29.97, 2);
  });

  it('reports what a container leaves out as null', () => {
    const info = parseProbe(JSON.stringify({ streams: [{ codec_type: 'video', codec_name: 'h264', avg_frame_rate: '0/0' }], format: { duration: 'N/A' } }));
    expect(info).toMatchObject({ durationS: null, fps: null, width: null, hasAudio: false });
  });

  it('refuses output that is not JSON', () => {
    expect(() => parseProbe('not json')).toThrow(ConvertError);
  });
});

describe('buildConvertArgs', () => {
  const args = buildConvertArgs('/input/source', '/converted.mp4');

  it('makes H.264 + AAC in an MP4 that can be read while it loads', () => {
    expect(args).toEqual(expect.arrayContaining(['-c:v', 'libx264', '-c:a', 'aac', '-movflags', '+faststart']));
    expect(args.at(-1)).toBe('/converted.mp4');
  });

  it('leaves the encoder\'s thread count alone with the single-thread core, and sets it for the multi-thread core', () => {
    expect(args).not.toContain('-threads');
    const multi = buildConvertArgs('/input/source', '/converted.mp4', { multiThread: true });
    expect(multi[multi.indexOf('-threads') + 1]).toBe('2');
    expect(multi.indexOf('-threads')).toBeGreaterThan(multi.indexOf('libx264'));
    expect(multi.at(-1)).toBe('/converted.mp4');
  });

  it('keeps only the first video and audio streams, and survives a missing audio track', () => {
    expect(args.join(' ')).toContain('-map 0:v:0 -map 0:a:0?');
  });

  it('caps the long edge at 720 px for landscape and portrait without enlarging', () => {
    const scale = args[args.indexOf('-vf') + 1];
    expect(scale).toContain(`min(${CONVERT_CONFIG.longEdgePx},iw)`);
    expect(scale).toContain(`min(${CONVERT_CONFIG.longEdgePx},ih)`);
    expect(scale).toContain('format=yuv420p');
  });
});

describe('convertedFileName', () => {
  it('swaps the extension for .mp4', () => {
    expect(convertedFileName('IMG_0042.MOV')).toBe('IMG_0042.mp4');
    expect(convertedFileName('my.range.session.mov')).toBe('my.range.session.mp4');
    expect(convertedFileName('noextension')).toBe('noextension.mp4');
  });

  it('does not collide with an .mp4 that is being converted', () => {
    expect(convertedFileName('clip.mp4')).toBe('clip-converted.mp4');
  });
});

describe('time estimate', () => {
  const info = { durationS: 60, width: 1920, height: 1080, fps: 30, videoCodec: 'hevc', hasAudio: true };

  it('grows with length and with source size', () => {
    const base = estimateConvertSeconds(info)!;
    expect(estimateConvertSeconds({ ...info, durationS: 120 })).toBeCloseTo(base * 2, 5);
    expect(estimateConvertSeconds({ ...info, width: 3840, height: 2160 })!).toBeGreaterThan(base);
  });

  it('has no estimate when the length is unknown', () => {
    expect(estimateConvertSeconds({ ...info, durationS: null })).toBeNull();
  });

  it('counts down from the estimate, then follows the real rate', () => {
    expect(remainingSeconds(1, 0, 100)).toBe(99);
    expect(remainingSeconds(1, 0, null)).toBeNull();
    expect(remainingSeconds(30, 0.25, 100)).toBeCloseTo(90);
    expect(remainingSeconds(30, 1, 100)).toBe(0);
  });

  it('rounds to something an archer can read', () => {
    expect(formatDurationRough(12)).toBe('10 s');
    expect(formatDurationRough(2)).toBe('5 s');
    expect(formatDurationRough(110)).toBe('2 min');
    expect(formatDurationRough(95)).toBe('1.5 min');
    expect(formatDurationRough(3000)).toBe('50 min');
  });
});

describe('failure reasons', () => {
  const log = [
    'Input #0, mov,mp4,m4a,3gp,3g2,mj2, from \'/input/source\':',
    '[mov,mp4,m4a,3gp,3g2,mj2 @ 0x1] moov atom not found',
    '/input/source: Invalid data found when processing input',
    'frame=    1 fps=0.0 q=0.0 size=       0kB time=00:00:00.00 bitrate=N/A speed=   0x',
  ];

  it('picks the line that says what went wrong, not a progress line', () => {
    expect(pickReasonLine(log)).toBe('/input/source: Invalid data found when processing input');
    expect(pickReasonLine([])).toBeNull();
  });

  it('shows ffmpeg\'s own reason with the log tail', () => {
    const error = describeConvertFailure(new Error('ffmpeg exited with code 1'), log);
    expect(error.message).toContain('Invalid data found when processing input');
    expect(error.log).toEqual(log);
  });

  it('says so when the device runs out of memory', () => {
    expect(describeConvertFailure(new Error('memory access out of bounds')).message).toMatch(/ran out of memory/);
    expect(describeConvertFailure(new RangeError('Array buffer allocation failed')).message).toMatch(/ran out of memory/);
  });

  it('finds an out-of-memory abort in ffmpeg\'s output, where this core leaves it, with only an exit code as the error', () => {
    const error = describeConvertFailure(new Error('ffmpeg exited with code -1'), ['frame=  310 fps=9.1 q=24.0 size=  2048kB time=00:00:10.31', 'Aborted(OOM). Build with -sASSERTIONS for more info.']);
    expect(error.message).toMatch(/ran out of memory while converting \(Aborted\(OOM\)/);
    expect(error.log).toHaveLength(2);
  });

  it('says so when the converter itself could not be downloaded', () => {
    expect(describeConvertFailure(new TypeError('Failed to fetch')).message).toMatch(/converter could not be downloaded/);
  });

  it('keeps an error that already has a clear message', () => {
    const own = new ConvertError('The converter is not part of this deployment.');
    expect(describeConvertFailure(own)).toBe(own);
  });

  it('blames the file, in ffmpeg\'s words, when the probe found no video in a damaged file', () => {
    const error = describeNoVideo(['/input/source: Invalid data found when processing input']);
    expect(error.message).toBe('ffmpeg could not read this file: /input/source: Invalid data found when processing input');
    expect(error.log).toHaveLength(1);
  });

  it('only says there is no video when ffmpeg printed no complaint', () => {
    expect(describeNoVideo([]).message).toMatch(/no video track/);
  });

  it('falls back to the raw message', () => {
    expect(describeConvertFailure(new Error('boom')).message).toBe('The conversion failed: boom');
  });
});
