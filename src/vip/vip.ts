import { useSyncExternalStore } from 'react';

/**
 * VIP mode: a fun, secret corner of the app unlocked with a code that the
 * owner hands out. The app runs entirely in the browser, so this is a
 * playful lock, not security: only a salted SHA-256 hash of the code ships in
 * the app (set VITE_VIP_CODE_HASH to change it; see scripts/vip-hash.mjs).
 */

export const VIP_KEY = 'archerlab-edge:vip';
const ATTEMPTS_KEY = 'archerlab-edge:vip-attempts';
export const CODE_LENGTH = 4;
const SALT = 'archerlab-vip:';
/** The default code's hash. The owner replaces it with their own through VITE_VIP_CODE_HASH. */
const DEFAULT_HASH = '53f9236ddc6255537050f3174c5bca8e17bf5589e8d50be95278ab654e81cab0';
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MS = 60_000;

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
export const VIP_CODE_HASH = (env.VITE_VIP_CODE_HASH?.trim().toLowerCase() || DEFAULT_HASH);

/** Codes are letters and digits, compared without case. */
export function normaliseCode(code: string): string {
  return code.replace(/[^0-9a-z]/gi, '').toUpperCase();
}

export async function hashCode(code: string): Promise<string> {
  const bytes = new TextEncoder().encode(SALT + normaliseCode(code));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

interface Attempts { count: number; lockedUntil: number }

function readAttempts(storage: Storage | undefined): Attempts {
  try {
    const parsed = JSON.parse(storage?.getItem(ATTEMPTS_KEY) ?? 'null') as Attempts | null;
    return parsed && typeof parsed.count === 'number' ? parsed : { count: 0, lockedUntil: 0 };
  } catch { return { count: 0, lockedUntil: 0 }; }
}

function writeAttempts(storage: Storage | undefined, attempts: Attempts | null) {
  try {
    if (attempts) storage?.setItem(ATTEMPTS_KEY, JSON.stringify(attempts));
    else storage?.removeItem(ATTEMPTS_KEY);
  } catch { /* ignore */ }
}

/** Milliseconds until another try is allowed after too many wrong codes; 0 when allowed now. */
export function lockedFor(now = Date.now(), storage: Storage | undefined = globalThis.localStorage): number {
  return Math.max(0, readAttempts(storage).lockedUntil - now);
}

export type VerifyResult = { ok: true } | { ok: false; reason: 'wrong'; left: number } | { ok: false; reason: 'locked'; waitMs: number };

/** Checks a code; after MAX_ATTEMPTS wrong codes, further tries wait LOCKOUT_MS. */
export async function verifyCode(code: string, now = Date.now(), storage: Storage | undefined = globalThis.localStorage, expected = VIP_CODE_HASH): Promise<VerifyResult> {
  const wait = lockedFor(now, storage);
  if (wait > 0) return { ok: false, reason: 'locked', waitMs: wait };
  if ((await hashCode(code)) === expected) {
    writeAttempts(storage, null);
    return { ok: true };
  }
  const attempts = readAttempts(storage);
  const count = attempts.count + 1;
  if (count >= MAX_ATTEMPTS) {
    writeAttempts(storage, { count: 0, lockedUntil: now + LOCKOUT_MS });
    return { ok: false, reason: 'locked', waitMs: LOCKOUT_MS };
  }
  writeAttempts(storage, { count, lockedUntil: 0 });
  return { ok: false, reason: 'wrong', left: MAX_ATTEMPTS - count };
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export function isVip(storage: Storage | undefined = globalThis.localStorage): boolean {
  try { return storage?.getItem(VIP_KEY) === '1'; } catch { return false; }
}

function applyTheme(on: boolean) {
  if (typeof document === 'undefined') return;
  if (on) document.documentElement.dataset.vip = 'on';
  else delete document.documentElement.dataset.vip;
}

export function enterVip(storage: Storage | undefined = globalThis.localStorage): void {
  try { storage?.setItem(VIP_KEY, '1'); } catch { /* lasts for this page */ }
  applyTheme(true);
  notify();
}

export function exitVip(storage: Storage | undefined = globalThis.localStorage): void {
  try { storage?.removeItem(VIP_KEY); } catch { /* ignore */ }
  applyTheme(false);
  notify();
}

export function subscribeVip(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useVip(): boolean {
  return useSyncExternalStore(subscribeVip, () => isVip(), () => false);
}

if (typeof window !== 'undefined') applyTheme(isVip());
