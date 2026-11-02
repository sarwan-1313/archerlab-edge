import { describe, expect, it } from 'vitest';
import { DICTIONARY, LANGUAGES, translate } from './i18n';
import { desktopNavItems, mobileNavItems } from '../data/navigation';

describe('languages', () => {
  it('falls back to English', () => {
    expect(translate('nav.home', 'Home', 'en')).toBe('Home');
    expect(translate('nav.home', 'Home', 'pa')).toBe('ਘਰ');
    expect(translate('nav.home', 'Home', 'hi')).toBe('होम');
    expect(translate('missing.key', 'Fallback', 'hi')).toBe('Fallback');
    expect(LANGUAGES.map((language) => language.code)).toEqual(['en', 'pa', 'hi']);
  });

  it('translates every navigation item in both languages', () => {
    for (const item of [...desktopNavItems, ...mobileNavItems]) {
      const key = `nav.${item.key}`;
      expect(DICTIONARY[key], key).toBeDefined();
    }
  });

  it('has both languages for every entry, in the right script', () => {
    for (const [key, entry] of Object.entries(DICTIONARY)) {
      expect(entry.pa.trim(), key).not.toBe('');
      expect(entry.hi.trim(), key).not.toBe('');
      expect(/[਀-੿]/.test(entry.pa), `${key} pa uses Gurmukhi`).toBe(true);
      expect(/[ऀ-ॿ]/.test(entry.hi), `${key} hi uses Devanagari`).toBe(true);
    }
  });
});
