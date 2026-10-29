// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as engine from '../local-coach/engine';
import { LOCAL_MODEL_FLAG } from '../local-coach/model';
import { APP_DATABASES, LocalDataError, clearAppKeys, deleteDatabase, deleteEverythingOnDevice } from './localData';

type Outcome = 'success' | 'error' | 'blocked';

function fakeFactory(outcome: (name: string) => Outcome = () => 'success') {
  const deleted: string[] = [];
  const factory = {
    deleteDatabase(name: string) {
      const request = {} as IDBOpenDBRequest;
      queueMicrotask(() => {
        const result = outcome(name);
        if (result === 'success') { deleted.push(name); request.onsuccess?.(new Event('success')); }
        else if (result === 'blocked') request.onblocked?.(new Event('blocked') as IDBVersionChangeEvent);
        else request.onerror?.(new Event('error'));
      });
      return request;
    },
  } as unknown as IDBFactory;
  return { factory, deleted };
}

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('local data controls', () => {
  it('knows every database the app uses', () => {
    expect([...APP_DATABASES].sort()).toEqual(['archerlab-edge-practice-log', 'archerlab-edge-profiles', 'archerlab-edge-recordings', 'archerlab-edge-video']);
  });

  it('removes only the app’s own storage keys', () => {
    localStorage.setItem('archerlab-edge:video-options', '{}');
    localStorage.setItem('archerlab-edge:ai:openai', '{"apiKey":"k"}');
    localStorage.setItem('archerlab-edge:cloud-session', '{}');
    localStorage.setItem('other-app:setting', 'keep');
    expect(clearAppKeys(localStorage)).toBe(3);
    expect(localStorage.length).toBe(1);
    expect(localStorage.getItem('other-app:setting')).toBe('keep');
    expect(clearAppKeys(undefined)).toBe(0);
  });

  it('deletes every database and both storage areas', async () => {
    localStorage.setItem('archerlab-edge:onboarding-complete', 'true');
    sessionStorage.setItem('archerlab-edge:session-shots', '[]');
    sessionStorage.setItem('archerlab-edge:ai:gemini', '{}');
    const { factory, deleted } = fakeFactory();
    await deleteEverythingOnDevice(factory);
    expect(deleted).toEqual([...APP_DATABASES]);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('removes the private coach’s downloaded model, but only when there is one', async () => {
    const remove = vi.spyOn(engine, 'removeLocalModel').mockResolvedValue();
    const { factory } = fakeFactory();
    await deleteEverythingOnDevice(factory);
    expect(remove).not.toHaveBeenCalled();
    localStorage.setItem(LOCAL_MODEL_FLAG, '1');
    await deleteEverythingOnDevice(factory);
    expect(remove).toHaveBeenCalledOnce();
    expect(localStorage.length).toBe(0);
    remove.mockRestore();
  });

  it('names the model when it could not be removed, after deleting everything else', async () => {
    const remove = vi.spyOn(engine, 'removeLocalModel').mockRejectedValue(new Error('cache busy'));
    localStorage.setItem(LOCAL_MODEL_FLAG, '1');
    const { factory, deleted } = fakeFactory();
    const error = await deleteEverythingOnDevice(factory).catch((caught: unknown) => caught) as LocalDataError;
    expect(error.message).toMatch(/but the private coach’s downloaded model could not be/);
    expect(deleted).toEqual([...APP_DATABASES]);
    expect(localStorage.length).toBe(0);
    remove.mockRestore();
  });

  it('still deletes everything else when another tab blocks one store, and says what is left', async () => {
    localStorage.setItem('archerlab-edge:video-options', '{}');
    const { factory, deleted } = fakeFactory((name) => (name === 'archerlab-edge-profiles' ? 'blocked' : 'success'));
    const error = await deleteEverythingOnDevice(factory).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LocalDataError);
    expect((error as LocalDataError).reason).toBe('blocked');
    expect((error as Error).message).toBe('Everything else was deleted. Your profile will be deleted as soon as you close ArcherLab in your other tabs.');
    expect(deleted).toEqual(['archerlab-edge-recordings', 'archerlab-edge-video', 'archerlab-edge-practice-log']);
    expect(localStorage.length).toBe(0);
  });

  it('names every store that could not be deleted', async () => {
    const { factory } = fakeFactory((name) => (name === 'archerlab-edge-video' ? 'error' : name === 'archerlab-edge-recordings' ? 'blocked' : 'success'));
    const error = await deleteEverythingOnDevice(factory).catch((caught: unknown) => caught) as LocalDataError;
    expect(error.reason).toBe('failed');
    expect(error.message).toMatch(/but video analyses and live session recordings could not be/);
  });

  it('reports a failed deletion', async () => {
    const { factory } = fakeFactory(() => 'error');
    await expect(deleteDatabase('archerlab-edge-video', factory)).rejects.toThrow(/could not delete/);
  });
});
