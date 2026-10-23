import { useCallback, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { I18nProvider, useI18n } from './i18n';
import { AuthProvider, useAuth } from './auth';
import { Splash } from './screens/Splash';
import { Welcome } from './screens/Welcome';
import { Home } from './screens/Home';

function Loading() {
  const { t } = useI18n();
  return (
    <div className="center-screen" role="status">
      {t('loading')}
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/welcome" replace />;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (user) return <Navigate to="/home" replace />;
  return <>{children}</>;
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
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <BrowserRouter>
          <Shell />
        </BrowserRouter>
      </AuthProvider>
    </I18nProvider>
  );
}
