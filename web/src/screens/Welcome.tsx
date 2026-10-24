import { useState, type FormEvent } from 'react';
import { errorKey, useAuth } from '../auth';
import { useI18n, type TKey } from '../i18n';
import { LanguageSwitch } from './LanguageSwitch';

type Mode = 'signin' | 'register' | 'reset';

const MIN_PASSWORD = 8;

const FEATURES: Array<{ title: TKey; desc: TKey }> = [
  { title: 'feat1Title', desc: 'feat1Desc' },
  { title: 'feat2Title', desc: 'feat2Desc' },
  { title: 'feat3Title', desc: 'feat3Desc' },
  { title: 'feat4Title', desc: 'feat4Desc' },
  { title: 'feat5Title', desc: 'feat5Desc' },
];

export function Welcome() {
  const { t } = useI18n();
  const { configured, register, signIn, signInWithGoogle, resetPassword } = useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setNotice(null);
  };

  // Runs an action with a busy flag and a translated error message.
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (err) {
      setError(t(errorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'register') {
      if (!name.trim()) {
        setError(t('errNameRequired'));
        return;
      }
      if (password.length < MIN_PASSWORD) {
        setError(t('errWeakPassword'));
        return;
      }
      void run(() => register(name.trim(), email.trim(), password));
    } else if (mode === 'signin') {
      void run(() => signIn(email.trim(), password));
    } else {
      void run(async () => {
        await resetPassword(email.trim());
        setNotice(t('resetSent'));
      });
    }
  };

  return (
    <main className="page auth-page">
      <div className="topbar">
        <span className="brand">
          <span className="brand-bn" lang="bn">
            {t('bnName')}
          </span>
          <span className="brand-en">{t('appName')}</span>
        </span>
        <LanguageSwitch />
      </div>

      <section className="card auth-card">
        <h1>{t('welcomeTitle')}</h1>
        <p className="muted">{t('welcomeBody')}</p>

        <ul className="features">
          {FEATURES.map((f) => (
            <li key={f.title}>
              <strong>{t(f.title)}</strong>
              <span>{t(f.desc)}</span>
            </li>
          ))}
        </ul>
        <p className="muted small">{t('featNote')}</p>

        {!configured ? (
          <div className="banner warn" role="alert">
            <strong>{t('setupMissingTitle')}</strong>
            <p>{t('setupMissingBody')}</p>
          </div>
        ) : mode === 'reset' ? (
          <form onSubmit={onSubmit} noValidate>
            <h2>{t('resetTitle')}</h2>
            <label className="field">
              <span>{t('email')}</span>
              <input
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            {error && (
              <p className="msg error" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="msg ok" role="status">
                {notice}
              </p>
            )}
            <button className="btn primary" type="submit" disabled={busy || !email.trim()}>
              {busy ? t('loading') : t('resetButton')}
            </button>
            <button type="button" className="link" onClick={() => switchMode('signin')}>
              {t('backToSignIn')}
            </button>
          </form>
        ) : (
          <>
            <div className="tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'signin'}
                className={mode === 'signin' ? 'active' : ''}
                onClick={() => switchMode('signin')}
              >
                {t('tabSignIn')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'register'}
                className={mode === 'register' ? 'active' : ''}
                onClick={() => switchMode('register')}
              >
                {t('tabRegister')}
              </button>
            </div>

            {/* 1. Passkey: not available yet, so it is shown but cannot be pressed. */}
            <button type="button" className="btn method" disabled>
              <span>{t('methodPasskey')}</span>
              <span className="badge">{t('comingSoon')}</span>
            </button>

            {/* 2. Email and password */}
            <form onSubmit={onSubmit} noValidate>
              {mode === 'register' && (
                <label className="field">
                  <span>{t('displayName')}</span>
                  <small>{t('displayNameHint')}</small>
                  <input
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={100}
                    required
                  />
                </label>
              )}
              <label className="field">
                <span>{t('email')}</span>
                <input
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>{t('password')}</span>
                {mode === 'register' && <small>{t('passwordHint')}</small>}
                <input
                  type="password"
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </label>

              {error && (
                <p className="msg error" role="alert">
                  {error}
                </p>
              )}

              <button
                className="btn primary"
                type="submit"
                disabled={busy || !email.trim() || !password}
              >
                {busy ? t('loading') : mode === 'register' ? t('registerButton') : t('signInButton')}
              </button>

              {mode === 'register' ? (
                <p className="muted small">{t('registerNote')}</p>
              ) : (
                <button type="button" className="link" onClick={() => switchMode('reset')}>
                  {t('forgotPassword')}
                </button>
              )}
            </form>

            <div className="divider">
              <span>{t('or')}</span>
            </div>

            {/* 3. Google */}
            <button
              type="button"
              className="btn method"
              disabled={busy}
              onClick={() => void run(signInWithGoogle)}
            >
              <span>{t('methodGoogle')}</span>
            </button>

            {/* 4. Facebook: not available yet. */}
            <button type="button" className="btn method" disabled>
              <span>{t('methodFacebook')}</span>
              <span className="badge">{t('comingSoon')}</span>
            </button>
          </>
        )}
      </section>
    </main>
  );
}
