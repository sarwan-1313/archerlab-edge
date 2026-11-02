import type { PoseModelVariant } from './types';

const VARIANTS: readonly PoseModelVariant[] = ['lite', 'full', 'heavy'];

export function isPoseModelVariant(value: unknown): value is PoseModelVariant {
  return typeof value === 'string' && (VARIANTS as readonly string[]).includes(value);
}

/**
 * The pose model to preselect: the athlete's own earlier pick while it is
 * still deployed, otherwise Full when deployed (a better accuracy/speed
 * balance than Lite), otherwise the built-in Lite model.
 */
export function chooseDefaultModel(available: readonly PoseModelVariant[], saved?: PoseModelVariant | null): PoseModelVariant {
  if (saved && available.includes(saved)) return saved;
  return available.includes('full') ? 'full' : 'lite';
}
