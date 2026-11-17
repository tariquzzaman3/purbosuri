import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useI18n, type TKey } from '../i18n';
import { num } from '../data/format';
import type { Notif, NotifCode } from '../data/notifications';
import { useNotifications } from './Notifications';

const TEXT: Record<NotifCode, TKey> = {
  memory: 'nMemory',
  person: 'nPerson',
  approved: 'nApproved',
  rejected: 'nRejected',
  comment: 'nComment',
  reaction: 'nReaction',
  remind: 'nRemind',
  adminProposals: 'nAdminProposals',
  adminJoin: 'nAdminJoin',
  adminMemories: 'nAdminMemories',
  adminReports: 'nAdminReports',
};

export function NotificationsPage() {
  const { t, lang } = useI18n();
  const { items, isUnread, markAllSeen } = useNotifications();
  // What was new when the page opened stays highlighted while it is open.
  const fresh = useRef<Set<string> | null>(null);
  if (fresh.current === null) fresh.current = new Set(items.filter((n) => isUnread(n.id)).map((n) => n.id));

  useEffect(() => {
    markAllSeen();
  }, [markAllSeen, items.length]);

  const text = (n: Notif) =>
    t(TEXT[n.code])
      .replace('{name}', n.name?.trim() || t('nSomeone'))
      .replace('{n}', n.n !== undefined ? num(n.n, lang) : '');

  const fmt = new Intl.DateTimeFormat(lang === 'bn' ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'short' });

  return (
    <div>
      <h2>{t('notifTitle')}</h2>
      <p className="muted small">
        {t('notifIntro')} <Link to="/home/settings">{t('notifSettingsLink')}</Link>
      </p>
      {items.length === 0 ? (
        <p className="muted">{t('notifEmpty')}</p>
      ) : (
        <ul className="notif-list">
          {items.map((n) => (
            <li key={n.id}>
              <Link className={fresh.current?.has(n.id) ? 'notif-item new' : 'notif-item'} to={n.to}>
                <span>{text(n)}</span>
                <span className="muted small">{fmt.format(n.at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
