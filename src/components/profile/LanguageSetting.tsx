import { LANGUAGES, useLanguage } from '../../i18n/i18n';

/** Choose English, Punjabi or Hindi. */
export function LanguageSetting() {
  const { language, setLanguage, t } = useLanguage();
  return (
    <section className="profile-card coach-tools-setting" aria-labelledby="language-title">
      <h2 id="language-title">{t('settings.language', 'Language')}</h2>
      <div className="language-choices" role="radiogroup" aria-labelledby="language-title">
        {LANGUAGES.map((option) => (
          <button key={option.code} type="button" role="radio" aria-checked={language === option.code} lang={option.code} className={`scoring-round${language === option.code ? ' is-selected' : ''}`} onClick={() => setLanguage(option.code)}>
            <strong>{option.name}</strong>
            <small lang="en">{option.english}</small>
          </button>
        ))}
      </div>
      <p className="muted">{t('settings.languageNote', 'Choose the language for the main menu, Scoring, Drills and Find a range. Other pages are in English for now.')}</p>
    </section>
  );
}
