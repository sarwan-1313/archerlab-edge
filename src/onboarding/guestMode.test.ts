import { describe, expect, it } from 'vitest';
import { APP_DATABASES } from '../privacy/localData';
import {
  GUEST_DATABASES, GUEST_MODE_KEY, GUEST_VISIT_KEY, chooseStart, cleanUpGuestVisit, guestCleanupDue, isGuest, leaveGuestMode, shouldWelcome, welcomeChoice,
} from './guestMode';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(key: string) { return this.map.get(key) ?? null; }
  key(index: number) { return [...this.map.keys()][index] ?? null; }
  removeItem(key: string) { this.map.delete(key); }
  setItem(key: string, value: string) { this.map.set(key, value); }
}

function fakeIndexedDb() {
  const deleted: string[] = [];
  const factory = {
    deleteDatabase(name: string) {
      deleted.push(name);
      const request: { onsuccess?: () => void } = {};
      setTimeout(() => request.onsuccess?.(), 0);
      return request;
    },
  } as unknown as IDBFactory;
  return { factory, deleted };
}

describe('guest mode', () => {
  it('cleans the same databases as Delete everything', () => {
    expect([...GUEST_DATABASES].sort()).toEqual([...APP_DATABASES].sort());
  });

  it('shows the welcome only on a first visit without a profile', () => {
    const local = new MemoryStorage();
    expect(shouldWelcome(false, local)).toBe(true);
    expect(shouldWelcome(true, local)).toBe(false);
    local.setItem('archerlab-edge:onboarding-complete', 'true');
    expect(shouldWelcome(false, local)).toBe(false);
  });

  it('keeps the current visit, and deletes it when the app is next opened', async () => {
    const local = new MemoryStorage();
    const session = new MemoryStorage();
    chooseStart('guest', local, session);
    expect(isGuest(local)).toBe(true);
    expect(welcomeChoice(local)).toBe('guest');
    local.setItem('archerlab-edge:voice-notes', '{"x":1}');
    local.setItem('archerlab-edge:language', 'pa');
    local.setItem('other-site', 'keep');
    expect(guestCleanupDue(local, session)).toBe(false);

    const nextVisit = new MemoryStorage();
    const db = fakeIndexedDb();
    expect(await cleanUpGuestVisit(local, nextVisit, db.factory)).toBe(true);
    expect(db.deleted.sort()).toEqual([...GUEST_DATABASES].sort());
    expect(local.getItem('archerlab-edge:voice-notes')).toBeNull();
    expect(local.getItem('archerlab-edge:language')).toBe('pa');
    expect(local.getItem('other-site')).toBe('keep');
    expect(local.getItem(GUEST_MODE_KEY)).toBe('1');
    expect(nextVisit.getItem(GUEST_VISIT_KEY)).toBe('1');
    // Reloading during the same visit does not delete again.
    expect(await cleanUpGuestVisit(local, nextVisit, db.factory)).toBe(false);
  });

  it('stops deleting once the guest makes a profile', async () => {
    const local = new MemoryStorage();
    chooseStart('guest', local, new MemoryStorage());
    leaveGuestMode(local);
    expect(isGuest(local)).toBe(false);
    expect(welcomeChoice(local)).toBe('profile');
    expect(await cleanUpGuestVisit(local, new MemoryStorage(), fakeIndexedDb().factory)).toBe(false);
  });
});
