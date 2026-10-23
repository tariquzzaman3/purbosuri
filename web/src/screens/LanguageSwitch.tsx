import { useI18n } from '../i18n';

export function LanguageSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="lang-switch" role="group" aria-label={t('language')}>
      <button
        type="button"
        className={lang === 'bn' ? 'active' : ''}
        aria-pressed={lang === 'bn'}
        onClick={() => setLang('bn')}
        lang="bn"
      >
        {t('langBn')}
      </button>
      <button
        type="button"
        className={lang === 'en' ? 'active' : ''}
        aria-pressed={lang === 'en'}
        onClick={() => setLang('en')}
        lang="en"
      >
        {t('langEn')}
      </button>
    </div>
  );
}
