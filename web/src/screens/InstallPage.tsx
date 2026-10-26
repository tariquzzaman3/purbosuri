import { useEffect, useState } from 'react';
import { useI18n, type TKey } from '../i18n';

/** The browser's own "install" prompt, where it offers one (Chrome, Edge on Android and desktop). */
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

function Steps({ title, keys, note }: { title: TKey; keys: TKey[]; note?: TKey }) {
  const { t } = useI18n();
  return (
    <section className="card">
      <h3>{t(title)}</h3>
      <ol className="install-steps">
        {keys.map((k) => (
          <li key={k}>{t(k)}</li>
        ))}
      </ol>
      {note && <p className="muted small">{t(note)}</p>}
    </section>
  );
}

export function InstallPage() {
  const { t } = useI18n();
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const standalone = isStandalone();

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const install = async () => {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice.catch(() => undefined);
    setPrompt(null);
  };

  return (
    <div className="install">
      <h2>{t('instTitle')}</h2>
      <p>{t('instIntro')}</p>

      {standalone ? (
        <p className="msg ok">{t('instInstalled')}</p>
      ) : prompt ? (
        <button type="button" className="btn primary" onClick={() => void install()}>
          {t('instNow')}
        </button>
      ) : (
        <p className="muted small">{t('instNoButton')}</p>
      )}

      <Steps title="instAndroid" keys={['instA1', 'instA2', 'instA3', 'instA4']} note="instAndroidNote" />
      <Steps title="instIphone" keys={['instI1', 'instI2', 'instI3', 'instI4']} />
      <Steps title="instDesktop" keys={['instD1', 'instD2', 'instD3', 'instD4']} note="instLinuxNote" />
      <p className="muted small">{t('instUpdates')}</p>
    </div>
  );
}
