import { NavLink, Route, Routes } from 'react-router-dom';
import { useAuth } from '../auth';
import { useI18n, type TKey } from '../i18n';
import { LanguageSwitch } from './LanguageSwitch';

function Overview() {
  const { t } = useI18n();
  return (
    <>
      <section className="card">
        <h2>{t('homeEmptyTitle')}</h2>
        <p>{t('homeEmptyBody')}</p>
      </section>
      <section className="card">
        <h2>{t('homeStatusTitle')}</h2>
        <p>{t('homeStatusDone')}</p>
        <p className="muted">{t('homeStatusTodo')}</p>
      </section>
    </>
  );
}

function NotBuilt({ title }: { title: TKey }) {
  const { t } = useI18n();
  return (
    <section className="card">
      <h2>{t(title)}</h2>
      <p className="muted">{t('notBuilt')}</p>
    </section>
  );
}

const NAV: Array<{ to: string; label: TKey; end?: boolean }> = [
  { to: '/home', label: 'navTree', end: true },
  { to: '/home/list', label: 'navList' },
  { to: '/home/memories', label: 'navMemories' },
  { to: '/home/calendar', label: 'navCalendar' },
];

export function Home() {
  const { t } = useI18n();
  const { user, logOut } = useAuth();

  return (
    <div className="page">
      <header className="topbar">
        <span className="brand">
          <span className="brand-bn" lang="bn">
            {t('bnName')}
          </span>
          <span className="brand-en">{t('appName')}</span>
        </span>
        <div className="topbar-actions">
          <LanguageSwitch />
          <button type="button" className="btn small" onClick={() => void logOut()}>
            {t('logout')}
          </button>
        </div>
      </header>

      <main>
        <h1 className="greeting">
          {t('hello')}
          {user?.displayName ? `, ${user.displayName}` : ''}
        </h1>
        <Routes>
          <Route index element={<Overview />} />
          <Route path="list" element={<NotBuilt title="sectionList" />} />
          <Route path="memories" element={<NotBuilt title="sectionMemories" />} />
          <Route path="calendar" element={<NotBuilt title="sectionCalendar" />} />
          <Route path="*" element={<NotBuilt title="sectionTree" />} />
        </Routes>
      </main>

      <nav className="bottom-nav" aria-label="main">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end}>
            {t(item.label)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
