/** Voice notes: on-device speech to text with Whisper (Transformers.js). See docs/voice-notes.md. */

export type VoiceLanguage = 'en' | 'hi' | 'pa';

export const VOICE_CONFIG = {
  /** Folder under public/models, filled by `npm run models:whisper`. */
  modelFolder: 'whisper-tiny',
  /** Download size of the 8-bit model files plus tokenizer (onnx-community/whisper-tiny), shown before the download. */
  modelBytes: 43_620_000,
  /** The ONNX Runtime the model runs on, self-hosted in public/ort and fetched together with the model. */
  runtimeBytes: 26_914_834,
  /** Longest note recorded by the button; the athlete can stop sooner. */
  maxNoteS: 20,
  /** How long "listen after each shot" records. */
  autoListenS: 4,
} as const;

/**
 * whisper-tiny is multilingual and has Hindi and Punjabi tokens, but it is much weaker on them than on
 * English, so they are offered as experimental. Scores are parsed from English words and from digits.
 */
export const VOICE_LANGUAGES: Record<VoiceLanguage, { label: string; whisper: string; experimental: boolean }> = {
  en: { label: 'English', whisper: 'english', experimental: false },
  hi: { label: 'हिन्दी (Hindi)', whisper: 'hindi', experimental: true },
  pa: { label: 'ਪੰਜਾਬੀ (Punjabi)', whisper: 'punjabi', experimental: true },
};

export const VOICE_SETTINGS_KEY = 'archerlab-edge:voice-notes';

export interface VoiceSettings {
  language: VoiceLanguage;
  /** Record a few seconds after each captured shot in Live Analysis. */
  autoListen: boolean;
  /** The athlete agreed to the one-time model download. */
  downloadAccepted: boolean;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = { language: 'en', autoListen: false, downloadAccepted: false };

export function readVoiceSettings(): VoiceSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(VOICE_SETTINGS_KEY) ?? 'null') as Partial<VoiceSettings> | null;
    if (!stored || typeof stored !== 'object') return DEFAULT_VOICE_SETTINGS;
    return {
      language: stored.language && stored.language in VOICE_LANGUAGES ? stored.language : 'en',
      autoListen: stored.autoListen === true,
      downloadAccepted: stored.downloadAccepted === true,
    };
  } catch {
    return DEFAULT_VOICE_SETTINGS;
  }
}

export function writeVoiceSettings(settings: VoiceSettings): void {
  try { localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(settings)); } catch { /* Lasts for this page only. */ }
}
