import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from './firebase';
import { useI18n, type TKey } from './i18n';

interface AuthValue {
  user: User | null;
  loading: boolean;
  configured: boolean;
  register: (name: string, email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/** Maps a Firebase error to the key of a translated message. Never shows raw codes. */
export function errorKey(err: unknown): TKey {
  const code =
    typeof err === 'object' && err !== null && 'code' in err ? String((err as { code: unknown }).code) : '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials':
      return 'errInvalidCredential';
    case 'auth/email-already-in-use':
      return 'errEmailInUse';
    case 'auth/weak-password':
      return 'errWeakPassword';
    case 'auth/invalid-email':
      return 'errInvalidEmail';
    case 'auth/network-request-failed':
      return 'errNetwork';
    case 'auth/too-many-requests':
      return 'errTooMany';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'errPopupClosed';
    case 'auth/operation-not-allowed':
    case 'auth/unauthorized-domain':
      return 'errProviderOff';
    default:
      return 'errGeneric';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { lang } = useI18n();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(isFirebaseConfigured);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  // Creates the private profile document once. It holds only what the person
  // chose to give: a display name and a language.
  const ensureProfile = useCallback(
    async (u: User, name?: string) => {
      if (!db) return;
      const ref = doc(db, 'users', u.uid);
      const snap = await getDoc(ref);
      if (snap.exists()) return;
      const data: Record<string, unknown> = {
        displayName: (name || u.displayName || 'Member').trim().slice(0, 100),
        language: lang,
        createdAt: serverTimestamp(),
      };
      if (u.photoURL && u.photoURL.length <= 500) data.photoUrl = u.photoURL;
      await setDoc(ref, data);
    },
    [lang],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      if (!auth) throw new Error('not-configured');
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      try {
        await ensureProfile(cred.user, name);
      } catch {
        // The account exists; the profile is created again at the next sign-in.
      }
    },
    [ensureProfile],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!auth) throw new Error('not-configured');
      const cred = await signInWithEmailAndPassword(auth, email, password);
      try {
        await ensureProfile(cred.user);
      } catch {
        // Not fatal: signing in still works.
      }
    },
    [ensureProfile],
  );

  const signInWithGoogle = useCallback(async () => {
    if (!auth) throw new Error('not-configured');
    const cred = await signInWithPopup(auth, new GoogleAuthProvider());
    try {
      await ensureProfile(cred.user);
    } catch {
      // Not fatal.
    }
  }, [ensureProfile]);

  const resetPassword = useCallback(async (email: string) => {
    if (!auth) throw new Error('not-configured');
    await sendPasswordResetEmail(auth, email);
  }, []);

  const logOut = useCallback(async () => {
    if (auth) await signOut(auth);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      configured: isFirebaseConfigured,
      register,
      signIn,
      signInWithGoogle,
      resetPassword,
      logOut,
    }),
    [user, loading, register, signIn, signInWithGoogle, resetPassword, logOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
