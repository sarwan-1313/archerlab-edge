import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@mediapipe/tasks-vision', () => ({ FilesetResolver: {}, PoseLandmarker: {} }));

const { availableModels } = await import('./poseModel');

function stubManifest(available: string[] | 'unreachable') {
  vi.stubGlobal('fetch', vi.fn(async () => {
    if (available === 'unreachable') throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify({ available }));
  }));
}

function stubConnection(online: boolean, cached: string[] | 'unsupported' = []) {
  vi.stubGlobal('navigator', { onLine: online });
  if (cached === 'unsupported') vi.stubGlobal('caches', undefined);
  else vi.stubGlobal('caches', { match: vi.fn(async (url: string) => (cached.some((name) => url.endsWith(name)) ? new Response('model') : undefined)) });
}

afterEach(() => vi.unstubAllGlobals());

describe('availableModels', () => {
  it('lists the deployed models while online, cached or not', async () => {
    stubManifest(['lite', 'full', 'heavy']);
    stubConnection(true);
    expect(await availableModels()).toEqual(['lite', 'full', 'heavy']);
  });

  it('always has Lite, which ships with the app', async () => {
    stubManifest(['full']);
    stubConnection(true);
    expect(await availableModels()).toEqual(['lite', 'full']);
  });

  it('offers only the models already on this device while offline', async () => {
    stubManifest(['lite', 'full', 'heavy']);
    stubConnection(false, ['pose_landmarker_full.task']);
    expect(await availableModels()).toEqual(['lite', 'full']);
  });

  it('falls back to Lite offline when no larger model has been used yet', async () => {
    stubManifest(['lite', 'full', 'heavy']);
    stubConnection(false, []);
    expect(await availableModels()).toEqual(['lite']);
  });

  it('falls back to Lite offline when the browser has no Cache API', async () => {
    stubManifest(['lite', 'full']);
    stubConnection(false, 'unsupported');
    expect(await availableModels()).toEqual(['lite']);
  });

  it('is Lite alone when the manifest cannot be read', async () => {
    stubManifest('unreachable');
    stubConnection(true);
    expect(await availableModels()).toEqual(['lite']);
  });
});
