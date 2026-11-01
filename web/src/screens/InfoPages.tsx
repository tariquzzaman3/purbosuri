import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';

const REPO = 'https://github.com/tariquzzaman3/purbosuri';

function Back({ publicPage = false }: { publicPage?: boolean }) {
  const { t } = useI18n();
  return publicPage ? (
    <Link className="link" to="/">
      ← {t('ddHome')}
    </Link>
  ) : (
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

export function PrivacyPage({ publicPage = false }: { publicPage?: boolean }) {
  const { t } = useI18n();
  return (
    <section className="card">
      <Back publicPage={publicPage} />
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

/** Public (no sign-in needed): the terms of service. */
export function TermsPage() {
  const { t } = useI18n();
  return (
    <section className="card">
      <Back publicPage />
      <h2>{t('termsTitle')}</h2>
      <p className="muted small">{t('termsUpdated')}</p>
      <p>{t('termsP1')}</p>
      <p>{t('termsP2')}</p>
      <p>{t('termsP3')}</p>
      <p>{t('termsP4')}</p>
      <p>{t('termsP5')}</p>
      <p>{t('termsP6')}</p>
      <p>
        {t('termsP7')}{' '}
        <a href={`${REPO}/issues`} target="_blank" rel="noreferrer">
          GitHub
        </a>
      </p>
    </section>
  );
}

/** Public (no sign-in needed): where Facebook and users find how to delete their data. */
export function DataDeletionPage() {
  const { t } = useI18n();
  return (
    <section className="card">
      <Back publicPage />
      <h2>{t('ddTitle')}</h2>
      <p>{t('ddIntro')}</p>
      <h3>{t('ddStepsTitle')}</h3>
      <ol>
        <li>{t('ddStep1')}</li>
        <li>{t('ddStep2')}</li>
        <li>{t('ddStep3')}</li>
      </ol>
      <h3>{t('ddWhatTitle')}</h3>
      <ul>
        <li>{t('ddWhat1')}</li>
        <li>{t('ddWhat2')}</li>
      </ul>
      <p>{t('ddFacebook')}</p>
      <p>
        {t('ddHelp')}{' '}
        <a href={`${REPO}/issues`} target="_blank" rel="noreferrer">
          GitHub
        </a>
      </p>
    </section>
  );
}
