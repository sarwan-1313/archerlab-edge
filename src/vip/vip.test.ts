import { describe, expect, it } from 'vitest';
import { LOCKOUT_MS, MAX_ATTEMPTS, enterVip, exitVip, hashCode, isVip, lockedFor, normaliseCode, verifyCode } from './vip';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(key: string) { return this.map.get(key) ?? null; }
  key(index: number) { return [...this.map.keys()][index] ?? null; }
  removeItem(key: string) { this.map.delete(key); }
  setItem(key: string, value: string) { this.map.set(key, value); }
}

describe('VIP code', () => {
  it('normalises and hashes the code like scripts/vip-hash.mjs', async () => {
    expect(normaliseCode(' a7-k2 ')).toBe('A7K2');
    expect(await hashCode('1313')).toBe('53f9236ddc6255537050f3174c5bca8e17bf5589e8d50be95278ab654e81cab0');
  });

  it('accepts the right code and counts wrong ones down to a lockout', async () => {
    const storage = new MemoryStorage();
    const expected = await hashCode('A7K2');
    expect(await verifyCode('a7k2', 0, storage, expected)).toEqual({ ok: true });
    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) {
      expect(await verifyCode('0000', 0, storage, expected)).toEqual({ ok: false, reason: 'wrong', left: MAX_ATTEMPTS - attempt });
    }
    expect(await verifyCode('0000', 0, storage, expected)).toEqual({ ok: false, reason: 'locked', waitMs: LOCKOUT_MS });
    expect(await verifyCode('A7K2', 1000, storage, expected)).toMatchObject({ ok: false, reason: 'locked' });
    expect(lockedFor(LOCKOUT_MS + 1, storage)).toBe(0);
    expect(await verifyCode('A7K2', LOCKOUT_MS + 1, storage, expected)).toEqual({ ok: true });
  });

  it('turns VIP mode on and off', () => {
    const storage = new MemoryStorage();
    expect(isVip(storage)).toBe(false);
    enterVip(storage);
    expect(isVip(storage)).toBe(true);
    exitVip(storage);
    expect(isVip(storage)).toBe(false);
  });
});
