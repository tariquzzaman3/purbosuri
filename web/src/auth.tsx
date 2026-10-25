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
  EmailAuthProvider,
  FacebookAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from './firebase';
import { useI18n, type TKey } from './i18n';

interface AuthValue {
  user: User | null;
  loading: boolean;
  configured: boolean;
  register: (name: string, email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithFacebook: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logOut: () => Promise<void>;
  /** True when the person signed up with email and password and has not verified the email yet. */
  needsVerification: boolean;
  sendVerification: () => Promise<void>;
  /** Re-reads the account; returns true once the email is verified. */
  checkVerified: () => Promise<boolean>;
  /** True if the account uses a password (so deleting it needs the password). */
  hasPassword: boolean;
  deleteAccount: (password?: string) => Promise<void>;
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
    case 'auth/account-exists-with-different-credential':
      return 'errAccountExists';
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
  // Bumped after the account is re-read, so screens that depend on it redraw.
  const [tick, setTick] = useState(0);

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
        await sendEmailVerification(cred.user);
      } catch {
        // The verify screen has a "send again" button.
      }
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

  const signInWithFacebook = useCallback(async () => {
    if (!auth) throw new Error('not-configured');
    const cred = await signInWithPopup(auth, new FacebookAuthProvider());
    try {
      await ensureProfile(cred.user);
    } catch {
      // Not fatal.
    }
  }, [ensureProfile]);

  const sendVerification = useCallback(async () => {
    if (!auth?.currentUser) throw new Error('not-signed-in');
    await sendEmailVerification(auth.currentUser);
  }, []);

  const checkVerified = useCallback(async () => {
    const u = auth?.currentUser;
    if (!u) return false;
    await u.reload();
    if (u.emailVerified) {
      // Refresh the sign-in token so it carries the verified flag, then create the profile.
      await u.getIdToken(true);
      try {
        await ensureProfile(u);
      } catch {
        // Created again at the next sign-in.
      }
    }
    setTick((n) => n + 1);
    return u.emailVerified;
  }, [ensureProfile]);

  const deleteAccount = useCallback(async (password?: string) => {
    const u = auth?.currentUser;
    if (!auth || !db || !u) throw new Error('not-signed-in');
    // Deleting an account needs a recent sign-in, so confirm identity first.
    if (u.providerData.some((p) => p.providerId === 'password') && u.email) {
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, password ?? ''));
    } else {
      const id = u.providerData[0]?.providerId;
      await reauthenticateWithPopup(u, id === 'facebook.com' ? new FacebookAuthProvider() : new GoogleAuthProvider());
    }
    // Remove only the person's private profile and list of trees. Whatever they added
    // to a family tree stays for the family.
    const mine = await getDocs(collection(db, 'users', u.uid, 'trees'));
    await Promise.all(mine.docs.map((d) => deleteDoc(d.ref)));
    await deleteDoc(doc(db, 'users', u.uid));
    await deleteUser(u);
  }, []);

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
      signInWithFacebook,
      resetPassword,
      logOut,
      needsVerification:
        !!user && !user.emailVerified && user.providerData.some((p) => p.providerId === 'password'),
      sendVerification,
      checkVerified,
      hasPassword: !!user && user.providerData.some((p) => p.providerId === 'password'),
      deleteAccount,
    }),
    [
      user,
      loading,
      register,
      signIn,
      signInWithGoogle,
      signInWithFacebook,
      resetPassword,
      logOut,
      sendVerification,
      checkVerified,
      deleteAccount,
      tick,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
