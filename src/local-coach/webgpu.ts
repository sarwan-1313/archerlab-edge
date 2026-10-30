import { LOCAL_MODEL_RECORD } from './model';

export type GpuSupport = { ok: true } | { ok: false; reason: string };

/** The parts of the WebGPU API this check uses, so tests can supply a fake. */
export interface GpuLike {
  requestAdapter(): Promise<{ features: { has(name: string): boolean } } | null>;
}

/**
 * Whether this browser and device can run the private coach. Explains why when
 * not, so the athlete knows whether another browser or device would help. Running
 * out of graphics memory can only be found out while loading, and is reported then.
 */
export async function checkLocalCoachSupport(gpu: GpuLike | undefined = (globalThis.navigator as { gpu?: GpuLike } | undefined)?.gpu): Promise<GpuSupport> {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return { ok: false, reason: 'The private coach needs a secure (https) connection, which this page does not have.' };
  }
  if (!gpu) {
    return { ok: false, reason: 'This browser does not offer WebGPU, which the private coach needs. Recent Chrome or Edge on a computer, Chrome on recent Android phones, and recent Safari usually do.' };
  }
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return { ok: false, reason: 'The browser cannot use this device’s graphics chip for WebGPU, so the private coach cannot run here.' };
    const missing = (LOCAL_MODEL_RECORD.required_features ?? []).filter((feature) => !adapter.features.has(feature));
    if (missing.length) return { ok: false, reason: 'This device’s graphics chip lacks a feature the private coach needs (16-bit shader maths).' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'The browser refused to start WebGPU, so the private coach cannot run here.' };
  }
}
