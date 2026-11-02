import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The e2e build (see playwright.config.ts). */
export const DIST_DIR = fileURLToPath(new URL('../../dist-e2e', import.meta.url));

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
};

export interface StaticSite {
  origin: string;
  /** Publishes "a new version": sw.js changes by a comment, which is all a browser needs to see a new worker. */
  deployNewVersion(): void;
  /** Serves a file that was not in the build, like the Full pose model on a deployment that has it. */
  addFile(path: string, body: Buffer): void;
  /** How many times a path was requested from the server (a cache hit never gets here). */
  requestCount(path: string): number;
  close(): Promise<void>;
}

/**
 * Serves the e2e build the way the production host does: extension-less paths get the app shell, and
 * sw.js is never cached by the browser. It exists so a test can change what is deployed.
 */
export async function serveDist(dir = DIST_DIR): Promise<StaticSite> {
  if (!(await readFile(join(dir, 'sw.js')).then(() => true, () => false))) {
    throw new Error(`No e2e build with a service worker in ${dir}. \`npm run test:e2e\` builds it first; if you start Playwright another way, run \`VITE_E2E=1 npx vite build --outDir dist-e2e\`.`);
  }
  const extra = new Map<string, Buffer>();
  const counts = new Map<string, number>();
  let version = 0;

  const server = createServer(async (request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    counts.set(path, (counts.get(path) ?? 0) + 1);
    try {
      const safe = normalize(path).replace(/^(\.\.[/\\])+/, '');
      const hasExtension = extname(safe) !== '';
      let body = extra.get(path) ?? await readFile(join(dir, hasExtension ? safe : 'index.html')).catch(() => null);
      if (!body) {
        response.writeHead(404).end('Not found');
        return;
      }
      if (path === '/sw.js' && version > 0) body = Buffer.concat([body, Buffer.from(`\n// deployed version ${version}\n`)]);
      response.writeHead(200, {
        'content-type': TYPES[hasExtension ? extname(safe) : '.html'] ?? 'application/octet-stream',
        'content-length': body.length,
        'cache-control': 'public, max-age=0, must-revalidate',
      });
      response.end(body);
    } catch {
      response.writeHead(500).end('Error');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    origin: `http://127.0.0.1:${port}`,
    deployNewVersion: () => { version += 1; },
    addFile: (path, body) => { extra.set(path, body); },
    requestCount: (path) => counts.get(path) ?? 0,
    close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}
