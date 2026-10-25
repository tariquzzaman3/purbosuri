import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { errorKey, useAuth } from '../auth';
import { useI18n, type Lang, type TKey } from '../i18n';
import {
  BN_FONTS,
  EN_FONTS,
  useSettings,
  type TextSize,
  type Theme,
} from '../settings';

const THEMES: Array<{ id: Theme; label: TKey }> = [
  { id: 'system', label: 'themeSystem' },
  { id: 'light', label: 'themeLight' },
  { id: 'dark', label: 'themeDark' },
];

const SIZES: Array<{ id: TextSize; label: TKey }> = [
  { id: 'small', label: 'sizeSmall' },
  { id: 'normal', label: 'sizeNormal' },
  { id: 'large', label: 'sizeLarge' },
  { id: 'xlarge', label: 'sizeXLarge' },
];

function Choice<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: Array<{ id: T; text: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="choice" role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          className={value === o.id ? 'choice-btn active' : 'choice-btn'}
          onClick={() => onChange(o.id)}
        >
          {o.text}
        </button>
      ))}
    </div>
  );
}

function DeleteAccount() {
  const { t } = useI18n();
  const { hasPassword, deleteAccount } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(hasPassword ? password : undefined);
    } catch (err) {
      const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : '';
      setError(code.startsWith('auth/') ? t(errorKey(err)) : t('delFailed'));
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className="btn danger" onClick={() => setOpen(true)}>
        {t('setDelete')}
      </button>
    );
  }

  return (
    <form className="danger-box" onSubmit={(e) => void submit(e)} noValidate>
      <h3>{t('delTitle')}</h3>
      <p>{t('delWarn')}</p>
      <p className="muted small">{t('delTrees')}</p>
      {hasPassword ? (
        <label className="field">
          <span>{t('delPassword')}</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
      ) : (
        <p className="muted small">{t('delGoogle')}</p>
      )}
      {error && (
        <p className="msg error" role="alert">
          {error}
        </p>
      )}
      <button className="btn danger" type="submit" disabled={busy || (hasPassword && !password)}>
        {t('delConfirm')}
      </button>
      <button className="btn" type="button" disabled={busy} onClick={() => setOpen(false)}>
        {t('mCancel')}
      </button>
    </form>
  );
}

export function SettingsPage() {
  const { t, lang, setLang } = useI18n();
  const s = useSettings();

  return (
    <div className="settings">
      <h2>{t('setTitle')}</h2>

      <section className="card">
        <h3>{t('setLook')}</h3>

        <div className="set-row">
          <span className="set-label">{t('language')}</span>
          <Choice<Lang>
            name={t('language')}
            value={lang}
            options={[
              { id: 'bn', text: 'বাংলা' },
              { id: 'en', text: 'English' },
            ]}
            onChange={setLang}
          />
        </div>

        <div className="set-row">
          <span className="set-label">{t('setTheme')}</span>
          <Choice<Theme>
            name={t('setTheme')}
            value={s.theme}
            options={THEMES.map((o) => ({ id: o.id, text: t(o.label) }))}
            onChange={(theme) => s.set({ theme })}
          />
        </div>

        <div className="set-row">
          <span className="set-label">{t('setFontSize')}</span>
          <Choice<TextSize>
            name={t('setFontSize')}
            value={s.size}
            options={SIZES.map((o) => ({ id: o.id, text: t(o.label) }))}
            onChange={(size) => s.set({ size })}
          />
        </div>

        <div className="set-row">
          <span className="set-label">{t('setBnFont')}</span>
          <Choice
            name={t('setBnFont')}
            value={s.bnFont}
            options={BN_FONTS.map((f) => ({ id: f.id, text: f.label }))}
            onChange={(bnFont) => s.set({ bnFont })}
          />
        </div>

        <div className="set-row">
          <span className="set-label">{t('setEnFont')}</span>
          <Choice
            name={t('setEnFont')}
            value={s.enFont}
            options={EN_FONTS.map((f) => ({ id: f.id, text: f.label || t('fontSystem') }))}
            onChange={(enFont) => s.set({ enFont })}
          />
        </div>

        <p className="font-sample">{t('fontSample')}</p>
      </section>

      <section className="card">
        <Link className="set-link" to="/home/about">
          {t('setAbout')}
        </Link>
        <Link className="set-link" to="/home/privacy">
          {t('setPrivacy')}
        </Link>
      </section>

      <section className="card">
        <h3>{t('setAccount')}</h3>
        <DeleteAccount />
      </section>
    </div>
  );
}
