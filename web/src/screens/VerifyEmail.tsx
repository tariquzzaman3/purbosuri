import { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { Logo } from './Logo';

/** Shown to people who signed up with email and password until they confirm the address. */
export function VerifyEmail() {
  const { t } = useI18n();
  const { user, sendVerification, checkVerified, logOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Notice the confirmation without the person having to press anything.
  useEffect(() => {
    const id = window.setInterval(() => void checkVerified().catch(() => undefined), 5000);
    return () => window.clearInterval(id);
  }, [checkVerified]);

  const resend = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await sendVerification();
      setMessage(t('verSent'));
    } catch {
      setError(t('errTooMany'));
    } finally {
      setBusy(false);
    }
  };

  const check = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (!(await checkVerified())) setError(t('verNot'));
    } catch {
      setError(t('errNetwork'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page auth-page">
      <section className="card auth-card">
        <div className="verify-logo">
          <Logo size={56} />
        </div>
        <h1>{t('verTitle')}</h1>
        <p>{t('verBody')}</p>
        <p className="verify-email">{user?.email}</p>
        <p className="muted">{t('verSteps')}</p>
        <p className="muted small">{t('verSpam')}</p>
        {message && (
          <p className="msg ok" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="msg error" role="alert">
            {error}
          </p>
        )}
        <button className="btn primary" type="button" disabled={busy} onClick={() => void check()}>
          {t('verCheck')}
        </button>
        <button className="btn" type="button" disabled={busy} onClick={() => void resend()}>
          {t('verResend')}
        </button>
        <p className="muted small">{t('verWrong')}</p>
        <button type="button" className="link" onClick={() => void logOut()}>
          {t('logout')}
        </button>
      </section>
    </main>
  );
}
