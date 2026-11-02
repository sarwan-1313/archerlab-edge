import { describe, expect, it } from 'vitest';
import { checkLocalCoachSupport, type GpuLike } from './webgpu';

const gpuWith = (features: string[]): GpuLike => ({ requestAdapter: async () => ({ features: new Set(features) }) });

describe('checkLocalCoachSupport', () => {
  it('explains when the browser has no WebGPU', async () => {
    const result = await checkLocalCoachSupport(undefined);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(/does not offer WebGPU/);
  });

  it('explains when there is no usable graphics adapter', async () => {
    const result = await checkLocalCoachSupport({ requestAdapter: async () => null });
    expect(!result.ok && result.reason).toMatch(/graphics chip/);
  });

  it('requires 16-bit shader support, which the model is built for', async () => {
    const result = await checkLocalCoachSupport(gpuWith([]));
    expect(!result.ok && result.reason).toMatch(/16-bit/);
  });

  it('survives the browser refusing to start WebGPU', async () => {
    const result = await checkLocalCoachSupport({ requestAdapter: async () => { throw new Error('blocked'); } });
    expect(!result.ok && result.reason).toMatch(/refused/);
  });

  it('accepts a device with everything the model needs', async () => {
    expect(await checkLocalCoachSupport(gpuWith(['shader-f16']))).toEqual({ ok: true });
  });
});
