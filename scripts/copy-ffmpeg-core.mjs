#!/usr/bin/env node
/**
 * Copies the ffmpeg.wasm core from node_modules into public/ffmpeg, where the app serves it itself
 * (nothing is loaded from a CDN) and only fetches it when an athlete converts a video.
 *
 *   npm run ffmpeg:core
 *
 * Always copies the single-thread @ffmpeg/core to public/ffmpeg/single. If @ffmpeg/core-mt is also
 * installed it is copied to public/ffmpeg/multi, and the app uses it only on a page that is
 * cross-origin isolated (see docs/video-conversion.md). public/ffmpeg/manifest.json lists what is there,
 * with uncompressed sizes for the download bar. Run it again, and commit the result, after changing the
 * pinned @ffmpeg/core version.
 */
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = `${root}public/ffmpeg/`;

const exists = (path) => stat(path).then(() => true, () => false);

async function copyCore(packageName, folder, withWorker) {
  const source = `${root}node_modules/${packageName}/`;
  if (!(await exists(`${source}package.json`))) return null;
  const { version, license } = JSON.parse(await readFile(`${source}package.json`, 'utf8'));
  const names = { js: 'ffmpeg-core.js', wasm: 'ffmpeg-core.wasm', ...(withWorker ? { worker: 'ffmpeg-core.worker.js' } : {}) };
  await rm(`${target}${folder}`, { recursive: true, force: true });
  await mkdir(`${target}${folder}`, { recursive: true });
  const files = { bytes: {} };
  for (const [key, name] of Object.entries(names)) {
    await copyFile(`${source}dist/esm/${name}`, `${target}${folder}/${name}`);
    files[key] = `${folder}/${name}`;
    files.bytes[key] = (await stat(`${target}${folder}/${name}`)).size;
  }
  return { version, license, files };
}

const single = await copyCore('@ffmpeg/core', 'single', false);
if (!single) throw new Error('@ffmpeg/core is not installed. Run npm install first.');
const multi = await copyCore('@ffmpeg/core-mt', 'multi', true);
if (!multi) await rm(`${target}multi`, { recursive: true, force: true });

const manifest = {
  version: single.version,
  license: single.license,
  cores: { single: single.files, ...(multi ? { multi: multi.files } : {}) },
};
await writeFile(`${target}manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`ffmpeg core ${single.version} (${single.license}) copied to public/ffmpeg: ${Object.keys(manifest.cores).join(', ')}`);
