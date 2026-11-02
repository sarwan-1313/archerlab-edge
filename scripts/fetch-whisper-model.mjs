#!/usr/bin/env node
/**
 * Downloads the Whisper speech model used for voice notes into public/models/whisper-tiny, where the app
 * serves it itself (no model hub or CDN at runtime). The files are not committed; Vercel builds fetch them.
 *
 *   npm run models:whisper
 *
 * Flags:
 *   --if-missing  skip the download when every file is already there
 *   --optional    on a download error, warn and exit 0 (Vercel builds then deploy without voice notes)
 *
 * Model: onnx-community/whisper-tiny (Apache-2.0, converted from openai/whisper-tiny), the 8-bit quantised
 * encoder and merged decoder. Pinned to a commit, so a deploy never picks up an unreviewed model.
 */
import { createWriteStream } from 'node:fs';
import { access, mkdir, rename, stat, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const REPO = 'onnx-community/whisper-tiny';
const REVISION = 'ff4177021cc41f7db950912b73ea4fdf7d01d8e7';
const FILES = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx',
];
const root = fileURLToPath(new URL('../public/models/whisper-tiny/', import.meta.url));
const DOWNLOAD_TIMEOUT_MS = 300_000;

const args = process.argv.slice(2);
const ifMissing = args.includes('--if-missing');
const optional = args.includes('--optional');
const exists = (path) => access(path).then(() => true, () => false);

async function download(file) {
  const target = `${root}${file}`;
  const partial = `${target}.download`;
  await mkdir(dirname(target), { recursive: true });
  const response = await fetch(`https://huggingface.co/${REPO}/resolve/${REVISION}/${file}`, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok || !response.body) throw new Error(`${file}: HTTP ${response.status}`);
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
    await rename(partial, target);
  } catch (error) {
    await unlink(partial).catch(() => undefined);
    throw error;
  }
  return (await stat(target)).size;
}

const present = await Promise.all(FILES.map((file) => exists(`${root}${file}`)));
if (ifMissing && present.every(Boolean)) {
  console.log('Whisper model already downloaded, skipping.');
} else {
  let total = 0;
  try {
    for (const file of FILES) total += await download(file);
    console.log(`Whisper model: ${(total / 1024 / 1024).toFixed(1)} MB → public/models/whisper-tiny`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (optional) console.warn(`Warning: could not download the Whisper model (${message}). Voice notes will say the model is not deployed.`);
    else {
      console.error(`Could not download the Whisper model: ${message}`);
      process.exitCode = 1;
    }
  }
}
