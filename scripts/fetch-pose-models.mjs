#!/usr/bin/env node
/**
 * Downloads the larger MediaPipe pose models for the video engine into
 * public/models and lists them in public/models/models.json.
 *
 *   npm run models:pose            # Full model
 *   npm run models:pose -- heavy   # Heavy model
 *   npm run models:pose -- full heavy
 *
 * Flags:
 *   --if-missing  skip models that are already downloaded
 *   --optional    on a download error, warn and exit 0 (used by Vercel builds,
 *                 which then deploy with the models that did download)
 */
import { createWriteStream } from 'node:fs';
import { access, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../public/models/', import.meta.url));
// Pinned model versions, so a deploy never picks up an unreviewed model.
const SOURCES = {
  full: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
  heavy: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task',
};
const DOWNLOAD_TIMEOUT_MS = 180_000;

const args = process.argv.slice(2);
const ifMissing = args.includes('--if-missing');
const optional = args.includes('--optional');
const requested = args.filter((arg) => arg in SOURCES);
const variants = requested.length ? requested : ['full'];

const modelPath = (variant) => `${root}pose_landmarker_${variant}.task`;
const exists = (path) => access(path).then(() => true, () => false);

async function readManifest() {
  try {
    const manifest = JSON.parse(await readFile(`${root}models.json`, 'utf8'));
    return Array.isArray(manifest.available) ? manifest : { available: ['lite'] };
  } catch {
    return { available: ['lite'] };
  }
}

async function download(variant) {
  const target = modelPath(variant);
  const partial = `${target}.download`;
  const response = await fetch(SOURCES[variant], { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
    await rename(partial, target);
  } catch (error) {
    await unlink(partial).catch(() => undefined);
    throw error;
  }
  return (await stat(target)).size;
}

const failures = [];
for (const variant of variants) {
  if (ifMissing && await exists(modelPath(variant))) {
    console.log(`${variant} model already downloaded, skipping.`);
    continue;
  }
  process.stdout.write(`Downloading ${variant} model… `);
  try {
    const size = await download(variant);
    console.log(`${(size / 1024 / 1024).toFixed(1)} MB → public/models/pose_landmarker_${variant}.task`);
  } catch (error) {
    console.log('failed.');
    failures.push(`${variant}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// List exactly the models present on disk, so the app never offers a missing file.
const manifest = await readManifest();
const present = [];
for (const variant of ['full', 'heavy']) if (await exists(modelPath(variant))) present.push(variant);
manifest.available = ['lite', ...present];
await writeFile(`${root}models.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Models available to Video Analysis: ${manifest.available.join(', ')}`);

if (failures.length) {
  if (optional) {
    console.warn(`Warning: could not download ${failures.join('; ')}. Continuing without ${failures.length === 1 ? 'it' : 'them'}.`);
  } else {
    console.error(`Could not download ${failures.join('; ')}. Check your connection and try again.`);
    process.exitCode = 1;
  }
}
