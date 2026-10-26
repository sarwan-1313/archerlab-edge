#!/usr/bin/env node
/**
 * Downloads the larger MediaPipe pose models for the video engine into
 * public/models and lists them in public/models/models.json.
 *
 *   npm run models:pose            # Full model
 *   npm run models:pose -- heavy   # Heavy model
 *   npm run models:pose -- full heavy
 */
import { createWriteStream } from 'node:fs';
import { readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../public/models/', import.meta.url));
const SOURCES = {
  full: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task',
  heavy: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task',
};

const requested = process.argv.slice(2).filter((arg) => arg in SOURCES);
const variants = requested.length ? requested : ['full'];

async function readManifest() {
  try {
    const manifest = JSON.parse(await readFile(`${root}models.json`, 'utf8'));
    return Array.isArray(manifest.available) ? manifest : { available: ['lite'] };
  } catch {
    return { available: ['lite'] };
  }
}

const manifest = await readManifest();
for (const variant of variants) {
  const target = `${root}pose_landmarker_${variant}.task`;
  const partial = `${target}.download`;
  process.stdout.write(`Downloading ${variant} model… `);
  const response = await fetch(SOURCES[variant]);
  if (!response.ok || !response.body) {
    console.error(`failed (${response.status}). Check your connection and try again.`);
    process.exitCode = 1;
    continue;
  }
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(partial));
    await rename(partial, target);
  } catch (error) {
    await unlink(partial).catch(() => undefined);
    throw error;
  }
  const { size } = await stat(target);
  console.log(`${(size / 1024 / 1024).toFixed(1)} MB → public/models/pose_landmarker_${variant}.task`);
  if (!manifest.available.includes(variant)) manifest.available.push(variant);
}
manifest.available = ['lite', ...['full', 'heavy'].filter((variant) => manifest.available.includes(variant))];
await writeFile(`${root}models.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Models available to Video Analysis: ${manifest.available.join(', ')}`);
