import { Link } from 'react-router-dom';
import { useI18n, type TKey } from '../i18n';
import { useTree } from './TreeContext';

interface Item {
  to: string;
  title: TKey;
  help: TKey;
  count?: number;
  show: boolean;
}

/** Everything a manager or admin looks after, in one place. */
export function ManagePage() {
  const { t } = useI18n();
  const { current, ready, canEdit, canInvite, joinRequests, proposals } = useTree();
  if (!ready || !current) return <p className="muted">{t('treeLoading')}</p>;
  if (!canEdit) return <p className="msg error">{t('manOnlyAdmins')}</p>;

  const items: Item[] = [
    { to: '/home/approvals', title: 'menuApprovals', help: 'manApprovalsHelp', count: proposals.length, show: true },
    { to: '/home/requests', title: 'menuRequests', help: 'manRequestsHelp', count: joinRequests.length, show: true },
    { to: '/home/members', title: 'menuMembers', help: 'manMembersHelp', show: true },
    { to: '/home/invite', title: 'menuInvite', help: 'manInviteHelp', show: canInvite },
    { to: '/home/rules', title: 'menuRules', help: 'manRulesHelp', show: true },
    { to: '/home/report', title: 'menuReport', help: 'manReportsHelp', show: true },
  ];

  return (
    <div className="manage-page">
      <h2>{t('manTitle')}</h2>
      <p className="muted small">{current.name}</p>
      <ul className="manage-list">
        {items
          .filter((i) => i.show)
          .map((i) => (
            <li key={i.to}>
              <Link className="manage-item" to={i.to}>
                <span className="manage-text">
                  <strong>{t(i.title)}</strong>
                  <span className="muted small">{t(i.help)}</span>
                </span>
                {i.count !== undefined && i.count > 0 && <span className="count-badge">{i.count}</span>}
                <span aria-hidden="true" className="manage-arrow">
                  ›
                </span>
              </Link>
            </li>
          ))}
      </ul>
    </div>
  );
}
