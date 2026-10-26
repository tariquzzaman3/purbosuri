import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../auth';
import { db } from '../firebase';
import { useI18n } from '../i18n';
import { ROLE_KEYS } from '../data/labels';
import { removeMember, saveTreeSettings, setMemberRole, stepDown, transferManager } from '../data/mutations';
import type { Role } from '../data/types';
import { useTree } from './TreeContext';

interface Member {
  uid: string;
  role: Role;
  displayName: string;
}

const ORDER: Record<Role, number> = { owner: 0, reviewer: 1, contributor: 2, viewer: 3 };

function MemberRow({ member, treeId }: { member: Member; treeId: string }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { role: myRole } = useTree();
  const [mode, setMode] = useState<'view' | 'remove' | 'transfer'>('view');
  const [myNewRole, setMyNewRole] = useState<'reviewer' | 'contributor'>('reviewer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMe = member.uid === user?.uid;
  const isManager = member.role === 'owner';
  const iAmManager = myRole === 'owner';

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setMode('view');
    } catch {
      setError(t('errMember'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="member-item">
      <div className="tree-item-head">
        <strong>{member.displayName || '—'}</strong>
        {isMe && <span className="badge">{t('memberYou')}</span>}
        <span className="badge role">{t(ROLE_KEYS[member.role])}</span>
      </div>

      {mode === 'view' && !isManager && (
        <div className="tree-item-actions">
          {!isMe && (
            <label className="inline-select">
              <span className="sr-only">{t('memberRoleLabel')}</span>
              <select
                value={member.role === 'viewer' ? 'contributor' : member.role}
                disabled={busy}
                onChange={(e) =>
                  void run(() => setMemberRole(treeId, member.uid, e.target.value as 'reviewer' | 'contributor'))
                }
              >
                <option value="reviewer">{t('roleReviewer')}</option>
                <option value="contributor">{t('roleContributor')}</option>
              </select>
            </label>
          )}
          {!isMe && iAmManager && (
            <button type="button" className="btn small" onClick={() => setMode('transfer')}>
              {t('memberMakeManager')}
            </button>
          )}
          {!isMe && (
            <button type="button" className="btn danger small" onClick={() => setMode('remove')}>
              {t('memberRemove')}
            </button>
          )}
          {isMe && member.role === 'reviewer' && (
            <button type="button" className="btn small" disabled={busy} onClick={() => void run(() => stepDown(treeId, member.uid))}>
              {t('memberStepDown')}
            </button>
          )}
        </div>
      )}

      {mode === 'remove' && (
        <div className="danger-box">
          <p>{t('memberRemoveConfirm')}</p>
          <button className="btn danger small" type="button" disabled={busy} onClick={() => void run(() => removeMember(treeId, member.uid))}>
            {t('memberRemove')}
          </button>
          <button className="btn small" type="button" onClick={() => setMode('view')}>
            {t('mCancel')}
          </button>
        </div>
      )}

      {mode === 'transfer' && user && (
        <div className="danger-box">
          <h3>{t('transferTitle')}</h3>
          <p>{t('transferWarn')}</p>
          <label className="inline-select">
            <span>{t('transferAs')}</span>
            <select value={myNewRole} onChange={(e) => setMyNewRole(e.target.value as 'reviewer' | 'contributor')}>
              <option value="reviewer">{t('roleReviewer')}</option>
              <option value="contributor">{t('roleContributor')}</option>
            </select>
          </label>
          <button
            className="btn primary small"
            type="button"
            disabled={busy}
            onClick={() => void run(() => transferManager(treeId, user.uid, member.uid, myNewRole))}
          >
            {t('transferConfirm')}
          </button>
          <button className="btn small" type="button" onClick={() => setMode('view')}>
            {t('mCancel')}
          </button>
        </div>
      )}

      {error && <p className="msg error">{error}</p>}
    </li>
  );
}

/** For the manager and admins: everyone in this tree, and their roles. */
export function MembersPage() {
  const { t } = useI18n();
  const { current, canEdit, ready, role, settings } = useTree();
  const [members, setMembers] = useState<Member[] | null>(null);
  const treeId = current?.id;

  useEffect(() => {
    setMembers(null);
    if (!db || !treeId || !canEdit) return;
    return onSnapshot(
      collection(db, 'trees', treeId, 'members'),
      (snap) =>
        setMembers(
          snap.docs.map((d) => ({
            uid: d.id,
            role: d.data().role as Role,
            displayName: String(d.data().displayName ?? ''),
          })),
        ),
      () => setMembers([]),
    );
  }, [treeId, canEdit]);

  const sorted = useMemo(
    () => [...(members ?? [])].sort((a, b) => ORDER[a.role] - ORDER[b.role] || a.displayName.localeCompare(b.displayName)),
    [members],
  );

  if (!ready || !treeId) return <p className="muted">{t('treeLoading')}</p>;
  if (!canEdit) return <p className="msg error">{t('membersOnlyAdmins')}</p>;

  return (
    <div className="members-page">
      <h2>{t('membersTitle')}</h2>
      <p className="muted small">{current?.name}</p>
      <p className="muted small">{t('membersNote')}</p>
      <section className="card">
        <h3>{t('setSwitches')}</h3>
        <label className="radio">
          <input
            type="checkbox"
            checked={settings.adminsCanInvite !== false}
            disabled={role !== 'owner'}
            onChange={(e) => void saveTreeSettings(treeId, { ...settings, adminsCanInvite: e.target.checked }).catch(() => undefined)}
          />{' '}
          {t('setAdminsInvite')}
        </label>
        <label className="radio">
          <input
            type="checkbox"
            checked={settings.participantsCanInvite === true}
            onChange={(e) => void saveTreeSettings(treeId, { ...settings, participantsCanInvite: e.target.checked }).catch(() => undefined)}
          />{' '}
          {t('setPartsInvite')}
        </label>
        <p className="muted small">{role === 'owner' ? t('setSwitchNoteManager') : t('setSwitchNoteAdmin')}</p>
      </section>
      <ul className="role-hints muted small">
        <li>{t('roleHintManager')}</li>
        <li>{t('roleHintAdmin')}</li>
        <li>{t('roleHintParticipant')}</li>
      </ul>
      {members === null ? (
        <p className="muted">{t('membersLoading')}</p>
      ) : sorted.length === 0 ? (
        <p className="muted">{t('membersEmpty')}</p>
      ) : (
        <ul className="tree-list">
          {sorted.map((m) => (
            <MemberRow key={m.uid} member={m} treeId={treeId} />
          ))}
        </ul>
      )}
    </div>
  );
}
