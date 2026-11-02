import type { CloudProviderId } from './providers';

/**
 * API keys stay in this browser only. By default they are kept for this tab
 * session; "remember" moves them to this device's local storage.
 */
const prefix = 'archerlab-edge:ai:';

export interface StoredProviderSetting {
  apiKey: string;
  model: string;
  enabled: boolean;
}

function read(storage: Storage | undefined, key: string): string | null {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}

export function loadProviderSetting(provider: CloudProviderId): StoredProviderSetting | null {
  const key = `${prefix}${provider}`;
  const raw = read(globalThis.sessionStorage, key) ?? read(globalThis.localStorage, key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredProviderSetting>;
    return { apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '', model: typeof parsed.model === 'string' ? parsed.model : '', enabled: parsed.enabled === true };
  } catch {
    return null;
  }
}

export function isRemembered(provider: CloudProviderId): boolean {
  return read(globalThis.localStorage, `${prefix}${provider}`) !== null;
}

export function saveProviderSetting(provider: CloudProviderId, setting: StoredProviderSetting, remember: boolean): void {
  const key = `${prefix}${provider}`;
  const value = JSON.stringify(setting);
  try {
    if (remember) {
      globalThis.localStorage?.setItem(key, value);
      globalThis.sessionStorage?.removeItem(key);
    } else {
      globalThis.sessionStorage?.setItem(key, value);
      globalThis.localStorage?.removeItem(key);
    }
  } catch { /* Storage can be unavailable; the key then lives only in memory. */ }
}

export function forgetProviderSetting(provider: CloudProviderId): void {
  try {
    globalThis.sessionStorage?.removeItem(`${prefix}${provider}`);
    globalThis.localStorage?.removeItem(`${prefix}${provider}`);
  } catch { /* nothing stored */ }
}
