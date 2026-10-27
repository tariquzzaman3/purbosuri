import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { useTree } from '../tree/TreeContext';

const APP_URL = 'https://purbosuri.web.app';

/** The menu at the top right. The three bars turn into an X while it is open. */
export function MenuButton() {
  const { t } = useI18n();
  const { user, logOut } = useAuth();
  const { current, canEdit, canInvite, joinRequests, proposals, role } = useTree();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
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

  const shareApp = async () => {
    // Only the app's address is shared, never anything from a family tree.
    try {
      if (navigator.share) {
        await navigator.share({ title: t('shareTitle'), text: t('shareText'), url: APP_URL });
        setOpen(false);
        return;
      }
      await navigator.clipboard.writeText(APP_URL);
      setNote(t('shareCopied'));
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return; // person closed the share sheet
      setNote(t('shareFailed'));
    }
  };

  const close = () => setOpen(false);

  return (
    <div className="menu" ref={wrap}>
      <button
        type="button"
        className="menu-btn"
        aria-label={open ? t('menuClose') : t('menuLabel')}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => {
          setNote(null);
          setOpen((o) => !o);
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d={open ? 'M5 5l14 14M19 5L5 19' : 'M4 6h16M4 12h16M4 18h16'}
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
          {current && <p className="menu-tree muted small">{current.name}</p>}
          <button type="button" className="menu-item" onClick={() => void shareApp()}>
            {t('menuShare')}
          </button>
          {note && (
            <p className="muted small" role="status">
              {note}
            </p>
          )}
          <Link className="menu-item" to="/home/trees" onClick={close}>
            {t('menuTrees')}
          </Link>
          {canInvite && (
            <Link className="menu-item" to="/home/invite" onClick={close}>
              {t('menuInvite')}
            </Link>
          )}
          {canEdit && (
            <Link className="menu-item" to="/home/requests" onClick={close}>
              {t('menuRequests')}
              {joinRequests.length > 0 && <span className="count-badge">{joinRequests.length}</span>}
            </Link>
          )}
          {role && (
            <Link className="menu-item" to="/home/approvals" onClick={close}>
              {canEdit ? t('menuApprovals') : t('menuMySuggestions')}
              {canEdit && proposals.length > 0 && <span className="count-badge">{proposals.length}</span>}
            </Link>
          )}
          {canEdit && (
            <Link className="menu-item" to="/home/rules" onClick={close}>
              {t('menuRules')}
            </Link>
          )}
          {canEdit && (
            <Link className="menu-item" to="/home/members" onClick={close}>
              {t('menuMembers')}
            </Link>
          )}
          {role && (
            <Link className="menu-item" to="/home/report" onClick={close}>
              {t('menuReport')}
            </Link>
          )}
          <Link className="menu-item" to="/home/install" onClick={close}>
            {t('menuInstall')}
          </Link>
          <Link className="menu-item" to="/home/settings" onClick={close}>
            {t('menuSettings')}
          </Link>
          <button type="button" className="menu-item" onClick={() => void logOut()}>
            {t('logout')}
          </button>
        </div>
      )}
    </div>
  );
}
