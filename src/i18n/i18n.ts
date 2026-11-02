import { useEffect, useState } from 'react';

/**
 * Languages: English, Punjabi (Gurmukhi) and Hindi. Text is written in
 * English in the code and looked up here by key; anything without a
 * translation shows in English. The choice is kept on this device.
 */

export type Language = 'en' | 'pa' | 'hi';
export const LANGUAGE_KEY = 'archerlab-edge:language';
export const LANGUAGES: ReadonlyArray<{ code: Language; name: string; english: string }> = [
  { code: 'en', name: 'English', english: 'English' },
  { code: 'pa', name: 'ਪੰਜਾਬੀ', english: 'Punjabi' },
  { code: 'hi', name: 'हिन्दी', english: 'Hindi' },
];

type Entry = { pa: string; hi: string };

export const DICTIONARY: Record<string, Entry> = {
  // Navigation
  'nav.home': { pa: 'ਘਰ', hi: 'होम' },
  'nav.live-analysis': { pa: 'ਲਾਈਵ ਵਿਸ਼ਲੇਸ਼ਣ', hi: 'लाइव विश्लेषण' },
  'nav.video-analysis': { pa: 'ਵੀਡੀਓ ਵਿਸ਼ਲੇਸ਼ਣ', hi: 'वीडियो विश्लेषण' },
  'nav.saved-recordings': { pa: 'ਸੈਸ਼ਨ', hi: 'सत्र' },
  'nav.training': { pa: 'ਅਭਿਆਸ', hi: 'अभ्यास' },
  'nav.scoring': { pa: 'ਸਕੋਰਿੰਗ', hi: 'स्कोरिंग' },
  'nav.ranges': { pa: 'ਰੇਂਜ ਲੱਭੋ', hi: 'रेंज खोजें' },
  'nav.community': { pa: 'ਭਾਈਚਾਰਾ', hi: 'समुदाय' },
  'nav.dashboard': { pa: 'ਅੰਕੜੇ', hi: 'आँकड़े' },
  'nav.user-guide': { pa: 'ਗਾਈਡ', hi: 'गाइड' },
  'nav.video': { pa: 'ਵੀਡੀਓ', hi: 'वीडियो' },
  'nav.live': { pa: 'ਲਾਈਵ', hi: 'लाइव' },
  'nav.drills': { pa: 'ਡਰਿੱਲ', hi: 'ड्रिल' },
  'nav.equipment': { pa: 'ਸਾਮਾਨ', hi: 'उपकरण' },
  'nav.profile': { pa: 'ਪ੍ਰੋਫਾਈਲ', hi: 'प्रोफ़ाइल' },
  // Scoring
  'scoring.title': { pa: 'ਸਕੋਰਿੰਗ', hi: 'स्कोरिंग' },
  'scoring.subtitle': { pa: 'ਮੁਕਾਬਲੇ ਵਾਲੇ ਟਾਈਮਰ ਨਾਲ ਐਂਡ-ਦਰ-ਐਂਡ ਰਾਊਂਡ ਸਕੋਰ ਕਰੋ, ਅਤੇ ਹਰ ਤੀਰ ਜਿੱਥੇ ਲੱਗਿਆ ਉੱਥੇ ਟੈਪ ਕਰਕੇ ਆਪਣੇ ਗਰੁੱਪ ਵੇਖੋ।', hi: 'प्रतियोगिता टाइमर के साथ हर एंड का स्कोर दर्ज करें, और हर तीर जहाँ लगा वहाँ टैप करके अपने ग्रुप देखें।' },
  'scoring.choose': { pa: 'ਰਾਊਂਡ ਚੁਣੋ', hi: 'राउंड चुनें' },
  'scoring.start': { pa: 'ਰਾਊਂਡ ਸ਼ੁਰੂ ਕਰੋ', hi: 'राउंड शुरू करें' },
  'scoring.face': { pa: 'ਨਿਸ਼ਾਨਾ', hi: 'टारगेट' },
  'scoring.distance': { pa: 'ਦੂਰੀ (ਮੀ.)', hi: 'दूरी (मी.)' },
  'scoring.ends': { pa: 'ਐਂਡ', hi: 'एंड' },
  'scoring.perEnd': { pa: 'ਹਰ ਐਂਡ ਵਿੱਚ ਤੀਰ', hi: 'हर एंड में तीर' },
  'scoring.bow': { pa: 'ਕਮਾਨ', hi: 'धनुष' },
  'scoring.end': { pa: 'ਐਂਡ', hi: 'एंड' },
  'scoring.average': { pa: 'ਔਸਤ', hi: 'औसत' },
  'scoring.sheet': { pa: 'ਸਕੋਰ ਸ਼ੀਟ', hi: 'स्कोर शीट' },
  'scoring.undo': { pa: 'ਆਖਰੀ ਤੀਰ ਹਟਾਓ', hi: 'आखिरी तीर हटाएँ' },
  'scoring.save': { pa: 'ਰਾਊਂਡ ਸੇਵ ਕਰੋ', hi: 'राउंड सेव करें' },
  'scoring.finishEarly': { pa: 'ਹੁਣੇ ਖ਼ਤਮ ਕਰਕੇ ਸੇਵ ਕਰੋ', hi: 'अभी खत्म करके सेव करें' },
  'scoring.discard': { pa: 'ਰੱਦ ਕਰੋ', hi: 'रद्द करें' },
  'scoring.notes': { pa: 'ਨੋਟ (ਵਿਕਲਪਿਕ)', hi: 'नोट (वैकल्पिक)' },
  'scoring.tap': { pa: 'ਜਿੱਥੇ ਤੀਰ ਲੱਗਿਆ ਉੱਥੇ ਟੈਪ ਕਰੋ।', hi: 'जहाँ तीर लगा वहाँ टैप करें।' },
  'scoring.yourRounds': { pa: 'ਤੁਹਾਡੇ ਰਾਊਂਡ', hi: 'आपके राउंड' },
  'scoring.groupSize': { pa: 'ਗਰੁੱਪ ਦਾ ਆਕਾਰ', hi: 'ग्रुप का आकार' },
  'scoring.groupSits': { pa: 'ਗਰੁੱਪ ਕਿੱਥੇ ਹੈ', hi: 'ग्रुप कहाँ है' },
  // Timer
  'timer.walk-up': { pa: 'ਲਾਈਨ ਵੱਲ ਜਾਓ', hi: 'लाइन की ओर जाएँ' },
  'timer.shoot': { pa: 'ਤੀਰ ਚਲਾਓ', hi: 'तीर चलाएँ' },
  'timer.warning': { pa: '30 ਸਕਿੰਟ ਬਾਕੀ', hi: '30 सेकंड बाकी' },
  'timer.stop': { pa: 'ਰੁਕੋ', hi: 'रुकें' },
  'timer.start': { pa: 'ਟਾਈਮਰ ਸ਼ੁਰੂ ਕਰੋ', hi: 'टाइमर शुरू करें' },
  'timer.signals': { pa: 'ਆਵਾਜ਼', hi: 'आवाज़' },
  // Drills
  'drills.title': { pa: 'ਡਰਿੱਲ', hi: 'ड्रिल' },
  'drills.subtitle': { pa: 'ਤੁਹਾਡੇ ਸ਼ਾਟ ਦੇ ਹਰ ਹਿੱਸੇ ਲਈ ਸਮੇਂ ਵਾਲੀਆਂ ਡਰਿੱਲਾਂ। ਇੱਕ ਚੁਣੋ, ਤਿਆਰ ਹੋਵੋ, ਅਤੇ ਟਾਈਮਰ ਦੀ ਪਾਲਣਾ ਕਰੋ।', hi: 'आपके शॉट के हर हिस्से के लिए समय वाली ड्रिल। एक चुनें, तैयार हों, और टाइमर का पालन करें।' },
  'drills.start': { pa: 'ਸ਼ੁਰੂ ਕਰੋ', hi: 'शुरू करें' },
  'drills.pause': { pa: 'ਰੋਕੋ', hi: 'रोकें' },
  'drills.resume': { pa: 'ਜਾਰੀ ਰੱਖੋ', hi: 'जारी रखें' },
  'drills.rest': { pa: 'ਆਰਾਮ', hi: 'आराम' },
  'drills.ready': { pa: 'ਤਿਆਰ ਹੋ ਜਾਓ', hi: 'तैयार हो जाएँ' },
  'drills.done': { pa: 'ਪੂਰਾ', hi: 'पूरा' },
  // Find a range
  'ranges.title': { pa: 'ਰੇਂਜ ਲੱਭੋ', hi: 'रेंज खोजें' },
  'ranges.subtitle': { pa: 'ਤੁਹਾਡੇ ਨੇੜੇ ਤੀਰਅੰਦਾਜ਼ੀ ਰੇਂਜ, ਕਲੱਬ ਅਤੇ ਦੁਕਾਨਾਂ, OpenStreetMap ਤੋਂ। ਤੁਹਾਡੀ ਲੋਕੇਸ਼ਨ ਸਿਰਫ਼ ਤੁਹਾਡੇ ਕਹਿਣ ਤੇ ਵਰਤੀ ਜਾਂਦੀ ਹੈ, ਲਗਭਗ 1 ਕਿ.ਮੀ. ਤੱਕ ਗੋਲ ਕਰਕੇ।', hi: 'आपके पास तीरंदाज़ी रेंज, क्लब और दुकानें, OpenStreetMap से। आपकी लोकेशन सिर्फ़ आपके कहने पर इस्तेमाल होती है, लगभग 1 कि.मी. तक गोल करके।' },
  'ranges.where': { pa: 'ਤੁਸੀਂ ਕਿੱਥੇ ਹੋ?', hi: 'आप कहाँ हैं?' },
  'ranges.useLocation': { pa: 'ਮੇਰੀ ਲੋਕੇਸ਼ਨ ਵਰਤੋ', hi: 'मेरी लोकेशन इस्तेमाल करें' },
  'ranges.search': { pa: 'ਖੋਜੋ', hi: 'खोजें' },
  'ranges.directions': { pa: 'ਰਸਤਾ', hi: 'रास्ता' },
  // Settings
  'settings.language': { pa: 'ਭਾਸ਼ਾ', hi: 'भाषा' },
  'settings.languageNote': { pa: 'ਮੁੱਖ ਮੀਨੂ, ਸਕੋਰਿੰਗ, ਡਰਿੱਲ ਅਤੇ ਰੇਂਜ ਲੱਭੋ ਪੰਨੇ ਹੁਣ ਪੰਜਾਬੀ ਵਿੱਚ ਹਨ। ਬਾਕੀ ਐਪ ਹਾਲੇ ਅੰਗਰੇਜ਼ੀ ਵਿੱਚ ਹੈ।', hi: 'मुख्य मेन्यू, स्कोरिंग, ड्रिल और रेंज खोजें पेज अब हिन्दी में हैं। बाकी ऐप अभी अंग्रेज़ी में है।' },
  // Progress card
  'card.share': { pa: 'ਤਰੱਕੀ ਸਾਂਝੀ ਕਰੋ', hi: 'प्रगति साझा करें' },
  'card.thisWeek': { pa: 'ਇਸ ਹਫ਼ਤੇ', hi: 'इस हफ़्ते' },
  'card.arrows': { pa: 'ਤੀਰ', hi: 'तीर' },
  'card.sessions': { pa: 'ਸੈਸ਼ਨ', hi: 'सत्र' },
  'card.streak': { pa: 'ਲਗਾਤਾਰ ਦਿਨ', hi: 'लगातार दिन' },
  'card.form': { pa: 'ਫਾਰਮ ਸਕੋਰ', hi: 'फ़ॉर्म स्कोर' },
  'card.bestRound': { pa: 'ਸਭ ਤੋਂ ਵਧੀਆ ਰਾਊਂਡ', hi: 'सबसे अच्छा राउंड' },
};

let current: Language = readLanguage();
const listeners = new Set<(language: Language) => void>();

function readLanguage(): Language {
  try {
    const stored = typeof localStorage === 'undefined' ? null : localStorage.getItem(LANGUAGE_KEY);
    return stored === 'pa' || stored === 'hi' ? stored : 'en';
  } catch { return 'en'; }
}

export function getLanguage(): Language { return current; }

export function setLanguage(language: Language): void {
  current = language;
  try {
    if (language === 'en') localStorage.removeItem(LANGUAGE_KEY);
    else localStorage.setItem(LANGUAGE_KEY, language);
  } catch { /* lasts for this page only */ }
  if (typeof document !== 'undefined') document.documentElement.lang = language;
  listeners.forEach((listener) => listener(language));
}

/** The text for `key` in a language, or the English given. */
export function translate(key: string, english: string, language: Language = current): string {
  if (language === 'en') return english;
  return DICTIONARY[key]?.[language] ?? english;
}

/** The current language and a `t(key, english)` function; re-renders when the language changes. */
export function useLanguage() {
  const [language, setState] = useState<Language>(current);
  useEffect(() => {
    listeners.add(setState);
    setState(current);
    return () => { listeners.delete(setState); };
  }, []);
  return { language, setLanguage, t: (key: string, english: string) => translate(key, english, language) };
}

if (typeof document !== 'undefined' && current !== 'en') document.documentElement.lang = current;
