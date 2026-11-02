import { describe, expect, it } from 'vitest';
import { LOCAL_APP_CONFIG, LOCAL_MODEL, LOCAL_MODEL_RECORD, LOCAL_MODEL_SIZE_LABEL } from './model';

describe('the private coach model', () => {
  it('is pinned to exact revisions, never a moving branch', () => {
    expect(LOCAL_MODEL_RECORD.model).toMatch(/\/resolve\/[0-9a-f]{40}$/);
    expect(LOCAL_MODEL_RECORD.model_lib).toMatch(/binary-mlc-llm-libs\/[0-9a-f]{40}\/.+\.wasm$/);
  });

  it('checks the files it can verify, and fails closed', () => {
    const { integrity } = LOCAL_MODEL_RECORD;
    for (const hash of [integrity?.config, integrity?.model_lib, integrity?.tokenizer?.['tokenizer.json']]) {
      expect(hash).toMatch(/^sha384-[A-Za-z0-9+/]{64}$/);
    }
    expect(integrity?.onFailure).toBe('error');
  });

  it('offers only this model, so a library update cannot swap it', () => {
    expect(LOCAL_APP_CONFIG.model_list).toEqual([LOCAL_MODEL_RECORD]);
    expect(LOCAL_MODEL_RECORD.model_id).toBe(LOCAL_MODEL.id);
  });

  it('has a licence that allows this use, and states the real size', () => {
    expect(LOCAL_MODEL.licence).toBe('Apache License 2.0');
    expect(LOCAL_MODEL_SIZE_LABEL).toBe('886 MB');
  });
});
