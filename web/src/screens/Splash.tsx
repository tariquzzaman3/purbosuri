import { useEffect } from 'react';
import { useI18n } from '../i18n';

const SPLASH_MS = 2200;

/** Bangla name and tagline, shown briefly when the app opens. Tap or press a key to skip. */
export function Splash({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();

  useEffect(() => {
    const timer = window.setTimeout(onDone, SPLASH_MS);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  return (
    <button type="button" className="splash" onClick={onDone} aria-label={t('splashSkip')}>
      <svg className="splash-mark" viewBox="0 0 64 64" aria-hidden="true">
        <path
          d="M32 50V30m0 0c0-9 6-15 15-15 0 9-6 15-15 15zm0 6c0-7-5-12-12-12 0 7 5 12 12 12z"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <h1 className="splash-name">{t('bnName')}</h1>
      <p className="splash-tagline">{t('tagline')}</p>
    </button>
  );
}
