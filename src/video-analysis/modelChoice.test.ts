import { describe, expect, it } from 'vitest';
import { chooseDefaultModel, isPoseModelVariant } from './modelChoice';

describe('chooseDefaultModel', () => {
  it('defaults to Full when it is deployed, otherwise Lite', () => {
    expect(chooseDefaultModel(['lite', 'full', 'heavy'])).toBe('full');
    expect(chooseDefaultModel(['lite', 'full'])).toBe('full');
    expect(chooseDefaultModel(['lite', 'heavy'])).toBe('lite');
    expect(chooseDefaultModel(['lite'])).toBe('lite');
  });

  it('keeps the saved choice while it is still deployed', () => {
    expect(chooseDefaultModel(['lite', 'full', 'heavy'], 'heavy')).toBe('heavy');
    expect(chooseDefaultModel(['lite', 'full', 'heavy'], 'lite')).toBe('lite');
    expect(chooseDefaultModel(['lite', 'full'], 'heavy')).toBe('full');
    expect(chooseDefaultModel(['lite'], 'full')).toBe('lite');
  });

  it('recognises model names', () => {
    expect(isPoseModelVariant('heavy')).toBe(true);
    expect(isPoseModelVariant('huge')).toBe(false);
    expect(isPoseModelVariant(null)).toBe(false);
  });
});
