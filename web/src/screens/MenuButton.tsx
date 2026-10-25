import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { LanguageSwitch } from './LanguageSwitch';

/** The menu at the top right: language, a new tree, and signing out. */
export function MenuButton() {
  const { t } = useI18n();
  const { user, logOut } = useAuth();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // Close on a tap outside, or on Escape.
  useEffect(() => {
    if (!open) return;
    const onOutside = (e: Event) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('touchstart', onOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('touchstart', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={wrap}>
      <button
        type="button"
        className="menu-btn"
        aria-label={t('menuLabel')}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M4 6h16M4 12h16M4 18h16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open && (
        <div className="menu-panel" role="group" aria-label={t('menuLabel')}>
          {user?.displayName && <p className="menu-user">{user.displayName}</p>}
          <div className="menu-row">
            <span>{t('language')}</span>
            <LanguageSwitch />
          </div>
          <Link className="menu-item" to="/home/new-tree" onClick={() => setOpen(false)}>
            {t('treeNewButton')}
          </Link>
          <button type="button" className="menu-item" onClick={() => void logOut()}>
            {t('logout')}
          </button>
        </div>
      )}
    </div>
  );
}
