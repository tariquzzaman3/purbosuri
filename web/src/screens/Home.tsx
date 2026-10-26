import { Link, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useI18n, type TKey } from '../i18n';
import { Logo } from './Logo';
import { MenuButton } from './MenuButton';
import { TreeProvider } from '../tree/TreeContext';
import { ChartPage } from '../tree/ChartView';
import { ListPage } from '../tree/ListView';
import { PersonPage } from '../tree/PersonPage';
import { AddPersonPage, EditPersonPage } from '../tree/PersonForm';
import { CreateTree } from '../tree/CreateTree';
import { TreesPage } from '../tree/TreesPage';
import { MembersPage } from '../tree/MembersPage';
import { InstallPage } from './InstallPage';
import { InvitePage } from '../tree/InvitePage';
import { RequestsPage } from '../tree/RequestsPage';
import { JoinPage } from '../tree/JoinPage';
import { ApprovalsPage } from '../tree/ApprovalsPage';
import { RulesPage } from '../tree/RulesPage';
import { SettingsPage } from './Settings';
import { AboutPage, PrivacyPage } from './InfoPages';

function NotBuilt({ title }: { title: TKey }) {
  const { t } = useI18n();
  return (
    <section className="card">
      <h2>{t(title)}</h2>
      <p className="muted">{t('notBuilt')}</p>
    </section>
  );
}

function NewTreePage() {
  const navigate = useNavigate();
  return <CreateTree onCreated={() => navigate('/home')} />;
}

const NAV: Array<{ to: string; label: TKey; end?: boolean }> = [
  { to: '/home', label: 'viewChart', end: true },
  { to: '/home/list', label: 'viewList' },
  { to: '/home/memories', label: 'navMemories' },
  { to: '/home/calendar', label: 'navCalendar' },
];

export function Home() {
  const { t } = useI18n();

  return (
    <TreeProvider>
      <div className="page">
        <header className="topbar">
          <Link to="/home" className="brand">
            <Logo size={38} />
            <span className="brand-names">
              <span className="brand-bn" lang="bn">
                {t('bnName')}
              </span>
              <span className="brand-en">{t('appName')}</span>
            </span>
          </Link>
          <MenuButton />
        </header>

        <main>
          <Routes>
            <Route index element={<ChartPage />} />
            <Route path="list" element={<ListPage />} />
            <Route path="add" element={<AddPersonPage />} />
            <Route path="new-tree" element={<NewTreePage />} />
            <Route path="trees" element={<TreesPage />} />
            <Route path="members" element={<MembersPage />} />
            <Route path="install" element={<InstallPage />} />
            <Route path="invite" element={<InvitePage />} />
            <Route path="requests" element={<RequestsPage />} />
            <Route path="approvals" element={<ApprovalsPage />} />
            <Route path="rules" element={<RulesPage />} />
            <Route path="join/:treeId/:code" element={<JoinPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="about" element={<AboutPage />} />
            <Route path="privacy" element={<PrivacyPage />} />
            <Route path="person/:id" element={<PersonPage />} />
            <Route path="person/:id/edit" element={<EditPersonPage />} />
            <Route path="memories" element={<NotBuilt title="sectionMemories" />} />
            <Route path="calendar" element={<NotBuilt title="sectionCalendar" />} />
            <Route path="*" element={<ChartPage />} />
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
    </TreeProvider>
  );
}
