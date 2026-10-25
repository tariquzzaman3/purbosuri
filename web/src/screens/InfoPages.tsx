import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';

const REPO = 'https://github.com/tariquzzaman3/purbosuri';

function Back() {
  const { t } = useI18n();
  return (
    <Link className="link" to="/home/settings">
      ← {t('menuSettings')}
    </Link>
  );
}

export function AboutPage() {
  const { t } = useI18n();
  return (
    <section className="card">
      <Back />
      <h2>{t('aboutTitle')}</h2>
      <p>{t('aboutBody1')}</p>
      <p>{t('aboutBody2')}</p>
      <p>{t('aboutBody3')}</p>
      <p className="muted small">
        {t('aboutVersion')}: 0.2 ·{' '}
        <a href={REPO} target="_blank" rel="noreferrer">
          {t('aboutCode')}
        </a>
      </p>
    </section>
  );
}

export function PrivacyPage() {
  const { t } = useI18n();
  return (
    <section className="card">
      <Back />
      <h2>{t('privTitle')}</h2>
      <p className="muted small">{t('privUpdated')}</p>
      <p>{t('privP1')}</p>
      <p>{t('privP2')}</p>
      <p>{t('privP3')}</p>
      <p>{t('privP4')}</p>
      <p>{t('privP5')}</p>
      <p>
        {t('privP6')}{' '}
        <a href={`${REPO}/issues`} target="_blank" rel="noreferrer">
          GitHub
        </a>
      </p>
    </section>
  );
}
