import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../auth';
import { db } from '../firebase';
import { useI18n } from '../i18n';
import { createInvite, revokeInvite } from '../data/mutations';
import { useTree } from './TreeContext';

interface Active {
  code: string;
  role: 'reviewer' | 'contributor';
  expires?: Date;
}

const linkFor = (treeId: string, code: string) => `${window.location.origin}/join/${treeId}/${code}`;

/** Create an invitation link for the current tree. */
export function InvitePage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { current, role, canInvite, ready } = useTree();
  const [asRole, setAsRole] = useState<'reviewer' | 'contributor'>('contributor');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [active, setActive] = useState<Active[]>([]);
  const treeId = current?.id;
  const isAdmin = role === 'owner' || role === 'reviewer';

  // Admins see the open invitations; a participant who may invite only sees the one they just made.
  useEffect(() => {
    setActive([]);
    if (!db || !treeId || !isAdmin) return;
    return onSnapshot(
      collection(db, 'trees', treeId, 'invites'),
      (snap) =>
        setActive(
          snap.docs
            .filter((d) => d.data().usedBy === undefined)
            .map((d) => ({
              code: d.id,
              role: d.data().role as Active['role'],
              expires: d.data().expiresAt?.toDate?.(),
            }))
            .filter((a) => !a.expires || a.expires.getTime() > Date.now()),
        ),
      () => setActive([]),
    );
  }, [treeId, isAdmin]);

  if (!ready || !treeId || !current) return <p className="muted">{t('treeLoading')}</p>;
  if (!canInvite) return <p className="msg error">{t('invNotAllowed')}</p>;

  const create = async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const code = await createInvite(treeId, user.uid, current.name, isAdmin ? asRole : 'contributor');
      setFresh(code);
    } catch {
      setError(t('errInvite'));
    } finally {
      setBusy(false);
    }
  };

  const share = async (code: string) => {
    const url = linkFor(treeId, code);
    try {
      if (navigator.share) {
        await navigator.share({ title: t('shareTitle'), text: t('invShareText'), url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setNote(t('invCopied'));
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setNote(t('shareFailed'));
    }
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(linkFor(treeId, code));
      setNote(t('invCopied'));
    } catch {
      setNote(t('shareFailed'));
    }
  };

  return (
    <div className="invite-page">
      <h2>{t('invTitle')}</h2>
      <p className="muted small">{current.name}</p>
      <p>{t('invIntro')}</p>

      {isAdmin && (
        <label className="field">
          <span>{t('invRole')}</span>
          <select value={asRole} onChange={(e) => setAsRole(e.target.value as 'reviewer' | 'contributor')}>
            <option value="contributor">{t('roleContributor')}</option>
            <option value="reviewer">{t('roleReviewer')}</option>
          </select>
        </label>
      )}

      <button type="button" className="btn primary" disabled={busy} onClick={() => void create()}>
        {t('invCreate')}
      </button>
      {error && <p className="msg error">{error}</p>}

      {fresh && (
        <section className="card">
          <p className="invite-link">{linkFor(treeId, fresh)}</p>
          <div className="panel-actions">
            <button type="button" className="btn primary small" onClick={() => void share(fresh)}>
              {t('invShare')}
            </button>
            <button type="button" className="btn small" onClick={() => void copy(fresh)}>
              {t('invCopy')}
            </button>
          </div>
          {note && (
            <p className="muted small" role="status">
              {note}
            </p>
          )}
        </section>
      )}

      {isAdmin && (
        <section>
          <h3>{t('invActive')}</h3>
          {active.length === 0 ? (
            <p className="muted">{t('invNone')}</p>
          ) : (
            <ul className="tree-list">
              {active.map((a) => (
                <li key={a.code} className="tree-item">
                  <div className="tree-item-head">
                    <span className="badge role">{a.role === 'reviewer' ? t('roleReviewer') : t('roleContributor')}</span>
                    {a.expires && (
                      <span className="muted small">
                        {t('invExpires')}: {a.expires.toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB')}
                      </span>
                    )}
                  </div>
                  <div className="tree-item-actions">
                    <button type="button" className="btn small" onClick={() => void share(a.code)}>
                      {t('invShare')}
                    </button>
                    <button type="button" className="btn small" onClick={() => void copy(a.code)}>
                      {t('invCopy')}
                    </button>
                    <button type="button" className="btn danger small" onClick={() => void revokeInvite(treeId, a.code)}>
                      {t('invRevoke')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
