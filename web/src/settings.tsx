import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Theme = 'system' | 'light' | 'dark';
export type TextSize = 'small' | 'normal' | 'large' | 'xlarge';

export const TEXT_SCALE: Record<TextSize, number> = { small: 0.9, normal: 1, large: 1.15, xlarge: 1.3 };

/** Fonts the person can pick. The first Bangla and English font are the defaults. */
export const BN_FONTS = [
  { id: 'noto-sans', label: 'Noto Sans Bengali', css: '"Noto Sans Bengali"' },
  { id: 'hind-siliguri', label: 'Hind Siliguri', css: '"Hind Siliguri"' },
  { id: 'anek-bangla', label: 'Anek Bangla', css: '"Anek Bangla"' },
  { id: 'noto-serif', label: 'Noto Serif Bengali', css: '"Noto Serif Bengali"' },
] as const;

export const EN_FONTS = [
  { id: 'system', label: '', css: 'system-ui, -apple-system, "Segoe UI", Roboto' },
  { id: 'inter', label: 'Inter', css: '"Inter"' },
  { id: 'lora', label: 'Lora', css: '"Lora"' },
] as const;

export interface SettingsState {
  theme: Theme;
  size: TextSize;
  bnFont: (typeof BN_FONTS)[number]['id'];
  enFont: (typeof EN_FONTS)[number]['id'];
  /** The person's own main colour, as #rrggbb. Empty means the standard green. */
  color: string;
}

/** Ready-made colours to pick from; the person can also choose any colour. */
export const COLOR_CHOICES = ['#1d5a45', '#1f5f99', '#6b3fa0', '#a3365f', '#b5532f', '#2a7a86'] as const;

const DEFAULTS: SettingsState = { theme: 'system', size: 'normal', bnFont: 'noto-sans', enFont: 'system', color: '' };
const KEY = 'purbosuri.settings';

function read(): SettingsState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const v = JSON.parse(raw) as Partial<SettingsState>;
    return {
      theme: v.theme === 'light' || v.theme === 'dark' || v.theme === 'system' ? v.theme : DEFAULTS.theme,
      size: v.size && v.size in TEXT_SCALE ? v.size : DEFAULTS.size,
      bnFont: BN_FONTS.some((f) => f.id === v.bnFont) ? (v.bnFont as SettingsState['bnFont']) : DEFAULTS.bnFont,
      enFont: EN_FONTS.some((f) => f.id === v.enFont) ? (v.enFont as SettingsState['enFont']) : DEFAULTS.enFont,
      color: typeof v.color === 'string' && /^#[0-9a-f]{6}$/i.test(v.color) ? v.color : '',
    };
  } catch {
    return DEFAULTS;
  }
}

/** The CSS font stack: English font first for Latin letters, then the Bangla font. */
export function fontStack(s: SettingsState): string {
  const bn = BN_FONTS.find((f) => f.id === s.bnFont) ?? BN_FONTS[0];
  const en = EN_FONTS.find((f) => f.id === s.enFont) ?? EN_FONTS[0];
  return `${en.css}, ${bn.css}, "Noto Sans Bengali", system-ui, sans-serif`;
}

interface SettingsValue extends SettingsState {
  set: (patch: Partial<SettingsState>) => void;
  /** Changes whenever the fonts or size change, so text measuring can be redone. */
  fontSignature: string;
}

const Ctx = createContext<SettingsValue | null>(null);

const toRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const luminance = ([r, g, b]: [number, number, number]): number => {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

const toHex = (rgb: number[]): string => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** On a dark page the chosen colour is lightened so it stays readable; text on it is black or white. */
export function colorVariables(hex: string, dark: boolean): { primary: string; ink: string } {
  let rgb = toRgb(hex);
  if (dark) rgb = rgb.map((v) => v + (255 - v) * 0.45) as [number, number, number];
  return { primary: toHex(rgb), ink: luminance(rgb) > 0.4 ? '#101410' : '#ffffff' };
}

const prefersDark = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

function applyToPage(s: SettingsState) {
  const root = document.documentElement;
  if (s.color) {
    const dark = s.theme === 'dark' || (s.theme === 'system' && prefersDark());
    const v = colorVariables(s.color, dark);
    root.style.setProperty('--primary', v.primary);
    root.style.setProperty('--primary-ink', v.ink);
  } else {
    root.style.removeProperty('--primary');
    root.style.removeProperty('--primary-ink');
  }
  root.style.setProperty('--font', fontStack(s));
  root.style.fontSize = `${17 * TEXT_SCALE[s.size]}px`;
  if (s.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', s.theme);
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SettingsState>(read);

  useEffect(() => {
    applyToPage(state);
    if (state.theme !== 'system' || !state.color || !window.matchMedia) return;
    // The system may switch between light and dark while the page is open.
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const again = () => applyToPage(state);
    mq.addEventListener('change', again);
    return () => mq.removeEventListener('change', again);
  }, [state]);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // Ignore: the choices just will not be remembered.
    }
  }, [state]);

  const set = useCallback((patch: Partial<SettingsState>) => setState((s) => ({ ...s, ...patch })), []);

  const value = useMemo<SettingsValue>(
    () => ({ ...state, set, fontSignature: `${state.bnFont}|${state.enFont}|${state.size}` }),
    [state, set],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): SettingsValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
