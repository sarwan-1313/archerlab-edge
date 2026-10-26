// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
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
    expect([...APP_DATABASES].sort()).toEqual(['archerlab-edge-profiles', 'archerlab-edge-recordings', 'archerlab-edge-video']);
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

  it('explains when another tab blocks the deletion, and keeps the settings', async () => {
    localStorage.setItem('archerlab-edge:video-options', '{}');
    const { factory } = fakeFactory((name) => (name === 'archerlab-edge-video' ? 'blocked' : 'success'));
    const error = await deleteEverythingOnDevice(factory).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LocalDataError);
    expect((error as Error).message).toMatch(/another tab/);
    expect(localStorage.getItem('archerlab-edge:video-options')).toBe('{}');
  });

  it('reports a failed deletion', async () => {
    const { factory } = fakeFactory(() => 'error');
    await expect(deleteDatabase('archerlab-edge-video', factory)).rejects.toThrow(/could not delete/);
  });
});
