import { describe, expect, it, vi } from 'vitest';
import { captureInstallPrompt, platformOf, promptInstall } from './install';

describe('installing the app', () => {
  it('recognises the platform', () => {
    expect(platformOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('ios');
    expect(platformOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('ios');
    expect(platformOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe('desktop');
    expect(platformOf('Mozilla/5.0 (Linux; Android 15; Pixel 9)')).toBe('android');
    expect(platformOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('desktop');
    expect(platformOf('curl/8')).toBe('other');
  });

  it('keeps the browser offer and shows it once', async () => {
    expect(await promptInstall()).toBe('unavailable');
    const target = new EventTarget() as unknown as Window;
    captureInstallPrompt(target);
    const offer = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt: vi.fn(async () => undefined), userChoice: Promise.resolve({ outcome: 'accepted' as const }) });
    target.dispatchEvent(offer);
    expect(offer.defaultPrevented).toBe(true);
    expect(await promptInstall()).toBe('accepted');
    expect(offer.prompt).toHaveBeenCalledTimes(1);
    expect(await promptInstall()).toBe('unavailable');
  });
});
