import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Lang = 'bn' | 'en';

const bn = {
  appName: 'Purbosuri',
  bnName: 'পূর্বসূরি',
  tagline: 'প্রজন্মের স্মৃতি',
  splashSkip: 'এগিয়ে যেতে ছুঁয়ে দিন',
  loading: 'অপেক্ষা করুন…',
  comingSoon: 'শীঘ্রই আসছে',
  language: 'ভাষা',
  langBn: 'বাংলা',
  langEn: 'English',

  welcomeTitle: 'পরিবারের গল্প, আপনার নিয়ন্ত্রণে',
  welcomeBody: 'বংশবৃক্ষ, ছবি আর স্মৃতি এক জায়গায় সাজিয়ে রাখুন। সম্পূর্ণ বিনামূল্যে, কোনো বিজ্ঞাপন ছাড়া।',
  feat1Title: 'বংশবৃক্ষ ও তালিকা',
  feat1Desc: 'কয়েক প্রজন্মের সম্পর্ক এক নজরে, দত্তক, সৎ ও পালক সম্পর্কসহ।',
  feat2Title: 'ছবি ও স্মৃতিচারণ',
  feat2Desc: 'ছবিতে আত্মীয়দের চিহ্নিত করুন, দাদা-দাদির গল্প লিখে রাখুন।',
  feat3Title: 'জন্মদিন ও স্মরণ দিবস',
  feat3Desc: 'গুরুত্বপূর্ণ তারিখের অনুস্মারক, আপনি যেগুলো চান শুধু সেগুলো।',
  feat4Title: 'সবার সম্মতিতে সংশোধন',
  feat4Desc: 'ভুল হলে সদস্যরা সংশোধনের প্রস্তাব দেন, আলোচনা হয়, পর্যালোচক সিদ্ধান্ত নেন।',
  feat5Title: 'ডিফল্টভাবে ব্যক্তিগত',
  feat5Desc: 'আমন্ত্রণ ছাড়া কেউ আপনার বংশবৃক্ষ দেখতে পায় না। অ্যাপ শেয়ার করলে কারও তথ্য শেয়ার হয় না।',
  featNote: 'সুবিধাগুলো ধাপে ধাপে যুক্ত হচ্ছে।',
  setupMissingTitle: 'সেটআপ এখনো সম্পূর্ণ হয়নি',
  setupMissingBody:
    'এই সংস্করণে Firebase-এর সংযোগ তথ্য বসানো হয়নি, তাই অ্যাকাউন্ট তৈরি বা লগইন করা যাচ্ছে না।',

  tabSignIn: 'লগইন',
  tabRegister: 'নতুন অ্যাকাউন্ট',
  methodPasskey: 'পাসকি দিয়ে চালিয়ে যান',
  methodGoogle: 'Google দিয়ে চালিয়ে যান',
  methodFacebook: 'Facebook দিয়ে চালিয়ে যান',
  or: 'অথবা',
  displayName: 'আপনার নাম',
  displayNameHint: 'পরিবারের সদস্যরা আপনাকে যে নামে চেনে',
  email: 'ইমেইল',
  password: 'পাসওয়ার্ড',
  passwordHint: 'কমপক্ষে ৮ অক্ষর',
  signInButton: 'লগইন করুন',
  registerButton: 'অ্যাকাউন্ট তৈরি করুন',
  forgotPassword: 'পাসওয়ার্ড ভুলে গেছেন?',
  resetTitle: 'পাসওয়ার্ড পুনরুদ্ধার',
  resetButton: 'রিসেট লিংক পাঠান',
  resetSent: 'ইমেইল ঠিকানাটি নিবন্ধিত থাকলে একটি রিসেট লিংক পাঠানো হয়েছে।',
  backToSignIn: 'লগইনে ফিরে যান',
  registerNote:
    'শুরুতে শুধু নাম, ইমেইল ও পাসওয়ার্ড লাগবে। স্বামী/স্ত্রী, সন্তান বা জন্মতারিখ দিতে হবে না।',

  errInvalidCredential: 'ইমেইল বা পাসওয়ার্ড ঠিক নয়।',
  errEmailInUse: 'এই ইমেইল দিয়ে আগেই অ্যাকাউন্ট খোলা হয়েছে।',
  errWeakPassword: 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।',
  errInvalidEmail: 'ইমেইল ঠিকানাটি সঠিক নয়।',
  errNetwork: 'ইন্টারনেট সংযোগে সমস্যা হচ্ছে। আবার চেষ্টা করুন।',
  errTooMany: 'অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।',
  errNameRequired: 'নাম লিখুন।',
  errPopupClosed: 'লগইন উইন্ডো বন্ধ করা হয়েছে।',
  errProviderOff:
    'এই লগইন পদ্ধতি এখনো চালু করা হয়নি। অন্য পদ্ধতি ব্যবহার করুন।',
  errGeneric: 'কিছু একটা ভুল হয়েছে। আবার চেষ্টা করুন।',

  navTree: 'বংশবৃক্ষ',
  navList: 'তালিকা',
  navMemories: 'স্মৃতি',
  navCalendar: 'ক্যালেন্ডার',
  logout: 'লগআউট',
  hello: 'স্বাগতম',
  homeEmptyTitle: 'আপনার প্রথম বংশবৃক্ষ',
  homeEmptyBody:
    'আপনার অ্যাকাউন্ট তৈরি হয়েছে। বংশবৃক্ষ তৈরি, সদস্য যোগ এবং স্মৃতি সংরক্ষণের সুবিধা পরের ধাপে যুক্ত হবে।',
  homeStatusTitle: 'এই সংস্করণে কী আছে',
  homeStatusDone: 'অ্যাকাউন্ট তৈরি ও লগইন, বাংলা ও ইংরেজি ভাষা',
  homeStatusTodo: 'এখনো তৈরি হয়নি: বংশবৃক্ষ, তালিকা, স্মৃতি, ক্যালেন্ডার, আমন্ত্রণ',
  sectionTree: 'বংশবৃক্ষ (চার্ট)',
  sectionList: 'তালিকা',
  sectionMemories: 'স্মৃতিচারণ ও টাইমলাইন',
  sectionCalendar: 'জন্মদিন ও গুরুত্বপূর্ণ তারিখ',
  notBuilt: 'এই অংশটি এখনো তৈরি হয়নি।',
};

const en: typeof bn = {
  appName: 'Purbosuri',
  bnName: 'পূর্বসূরি',
  tagline: 'প্রজন্মের স্মৃতি',
  splashSkip: 'Tap to continue',
  loading: 'Please wait…',
  comingSoon: 'Coming soon',
  language: 'Language',
  langBn: 'বাংলা',
  langEn: 'English',

  welcomeTitle: 'Your family story, in your control',
  welcomeBody: 'Keep your family tree, photos and memories in one place. Completely free, with no ads.',
  feat1Title: 'Family tree and list',
  feat1Desc: 'Generations at a glance, including adoptive, step and foster relationships.',
  feat2Title: 'Photos and stories',
  feat2Desc: 'Tag relatives in photos and write down your grandparents’ stories.',
  feat3Title: 'Birthdays and remembrance days',
  feat3Desc: 'Reminders for important dates, only the ones you choose.',
  feat4Title: 'Corrections with family consent',
  feat4Desc: 'Members propose fixes, discuss them, and a reviewer makes the final call.',
  feat5Title: 'Private by default',
  feat5Desc: 'Nobody sees your tree without an invitation. Sharing the app never shares anyone’s information.',
  featNote: 'Features are being added step by step.',
  setupMissingTitle: 'Setup is not finished yet',
  setupMissingBody:
    'This version has no Firebase connection details, so sign-up and sign-in are unavailable.',

  tabSignIn: 'Sign in',
  tabRegister: 'Create account',
  methodPasskey: 'Continue with a passkey',
  methodGoogle: 'Continue with Google',
  methodFacebook: 'Continue with Facebook',
  or: 'or',
  displayName: 'Your name',
  displayNameHint: 'The name your family knows you by',
  email: 'Email',
  password: 'Password',
  passwordHint: 'At least 8 characters',
  signInButton: 'Sign in',
  registerButton: 'Create account',
  forgotPassword: 'Forgot your password?',
  resetTitle: 'Reset password',
  resetButton: 'Send reset link',
  resetSent: 'If that email is registered, a reset link has been sent.',
  backToSignIn: 'Back to sign in',
  registerNote:
    'You only need a name, email and password. No spouse, children or birth date required.',

  errInvalidCredential: 'The email or password is not correct.',
  errEmailInUse: 'An account with this email already exists.',
  errWeakPassword: 'The password must be at least 8 characters.',
  errInvalidEmail: 'That email address is not valid.',
  errNetwork: 'There is a connection problem. Please try again.',
  errTooMany: 'Too many attempts. Please try again in a while.',
  errNameRequired: 'Please enter your name.',
  errPopupClosed: 'The sign-in window was closed.',
  errProviderOff: 'This sign-in method is not turned on yet. Please use another one.',
  errGeneric: 'Something went wrong. Please try again.',

  navTree: 'Family tree',
  navList: 'List',
  navMemories: 'Memories',
  navCalendar: 'Calendar',
  logout: 'Sign out',
  hello: 'Welcome',
  homeEmptyTitle: 'Your first family tree',
  homeEmptyBody:
    'Your account is ready. Creating a tree, adding relatives and saving memories will arrive in the next steps.',
  homeStatusTitle: 'What this version has',
  homeStatusDone: 'Account sign-up and sign-in, Bangla and English',
  homeStatusTodo: 'Not built yet: family tree, list, memories, calendar, invitations',
  sectionTree: 'Family tree (chart)',
  sectionList: 'List',
  sectionMemories: 'Stories and timeline',
  sectionCalendar: 'Birthdays and important dates',
  notBuilt: 'This part is not built yet.',
};

export type TKey = keyof typeof bn;

const dictionaries: Record<Lang, typeof bn> = { bn, en };

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TKey) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function readStoredLang(): Lang {
  try {
    const v = localStorage.getItem('purbosuri.lang');
    if (v === 'bn' || v === 'en') return v;
  } catch {
    // Storage can be blocked (private mode). Fall back to Bangla.
  }
  return 'bn';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem('purbosuri.lang', l);
    } catch {
      // Ignore: the choice just will not be remembered.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<I18nValue>(
    () => ({ lang, setLang, t: (key) => dictionaries[lang][key] }),
    [lang, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
