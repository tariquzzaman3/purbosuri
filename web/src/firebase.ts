import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

const env = import.meta.env;

const config = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
};

const isPlaceholder = (v: string | undefined) => !v || v.startsWith('REPLACE');

// When the Firebase values have not been filled in yet, the app still opens and
// tells the person that setup is incomplete, instead of crashing.
export const isFirebaseConfigured =
  !isPlaceholder(config.apiKey) && !isPlaceholder(config.appId) && !isPlaceholder(config.projectId);

const app = isFirebaseConfigured ? initializeApp(config) : null;

export const auth = app ? getAuth(app) : null;

// Local cache so data already loaded stays readable without a connection.
export const db = app
  ? initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
  : null;
