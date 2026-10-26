import { useCallback, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { I18nProvider, useI18n } from './i18n';
import { AuthProvider, useAuth } from './auth';
import { Splash } from './screens/Splash';
import { Welcome } from './screens/Welcome';
import { Home } from './screens/Home';
import { VerifyEmail } from './screens/VerifyEmail';
import { SettingsProvider } from './settings';

function Loading() {
  const { t } = useI18n();
  return (
    <div className="center-screen" role="status">
      {t('loading')}
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, needsVerification } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/welcome" replace />;
  if (needsVerification) return <VerifyEmail />;
  return <>{children}</>;
}

// Where to go after signing in, when someone opened an invitation link before having an account.
const NEXT_KEY = 'purbosuri.next';

function takeNext(): string | null {
  try {
    const next = localStorage.getItem(NEXT_KEY);
    localStorage.removeItem(NEXT_KEY);
    return next && next.startsWith('/home/join/') ? next : null;
  } catch {
    return null;
  }
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (user) return <Navigate to={takeNext() ?? '/home'} replace />;
  return <>{children}</>;
}

/** An invitation link: remember it, so it still works after signing up or signing in. */
function JoinLink() {
  const { treeId = '', code = '' } = useParams();
  const target = `/home/join/${encodeURIComponent(treeId)}/${encodeURIComponent(code)}`;
  try {
    localStorage.setItem(NEXT_KEY, target);
  } catch {
    // Without storage the person just opens the link again after signing in.
  }
  return <Navigate to={target} replace />;
}

function splashAlreadyShown(): boolean {
  try {
    return sessionStorage.getItem('purbosuri.splash') === '1';
  } catch {
    return false;
  }
}

function Shell() {
  const [showSplash, setShowSplash] = useState<boolean>(() => !splashAlreadyShown());

  const finishSplash = useCallback(() => {
    try {
      sessionStorage.setItem('purbosuri.splash', '1');
    } catch {
      // Ignore: the splash may simply show again on the next visit.
    }
    setShowSplash(false);
  }, []);

  if (showSplash) return <Splash onDone={finishSplash} />;

  return (
    <Routes>
      <Route
        path="/welcome"
        element={
          <PublicOnly>
            <Welcome />
          </PublicOnly>
        }
      />
      <Route
        path="/home/*"
        element={
          <RequireAuth>
            <Home />
          </RequireAuth>
        }
      />
      <Route path="/join/:treeId/:code" element={<JoinLink />} />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <I18nProvider>
      <SettingsProvider>
        <AuthProvider>
          <BrowserRouter>
            <Shell />
          </BrowserRouter>
        </AuthProvider>
      </SettingsProvider>
    </I18nProvider>
  );
}
