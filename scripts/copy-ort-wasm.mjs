#!/usr/bin/env node
/**
 * Copies the ONNX Runtime Web CPU runtime (MIT) that Transformers.js needs into public/ort, so voice notes
 * never load it from a CDN. Run again, and commit the result, after changing @huggingface/transformers.
 *
 *   npm run ort:wasm
 */
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = `${root}node_modules/onnxruntime-web/`;
const target = `${root}public/ort/`;
// The build that onnxruntime-web/webgpu (imported by Transformers.js) loads; its JS and wasm must match.
const FILES = ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm'];

const { version, license } = JSON.parse(await readFile(`${source}package.json`, 'utf8'));
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const file of FILES) await copyFile(`${source}dist/${file}`, `${target}${file}`);
await copyFile(`${source}LICENSE`, `${target}LICENSE.txt`).catch(() => undefined);
console.log(`onnxruntime-web ${version} (${license}) copied to public/ort: ${FILES.join(', ')}`);
