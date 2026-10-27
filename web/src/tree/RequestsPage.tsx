import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { personName } from '../data/format';
import { approveJoin, approveReplacement, rejectJoin } from '../data/mutations';
import type { JoinRequest } from '../data/types';
import { useTree } from './TreeContext';

const HAS_BANGLA = /[ঀ-৿]/;

function PersonPicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  const { t, lang } = useI18n();
  const { people } = useTree();
  const [q, setQ] = useState('');
  const unknown = t('unknownName');
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = [...people].sort((a, b) => personName(a, lang, unknown).localeCompare(personName(b, lang, unknown)));
    return needle
      ? list.filter((p) => [p.nameBn, p.nameEn, p.nickname].some((n) => n?.toLowerCase().includes(needle)))
      : list;
  }, [people, q, lang, unknown]);
  return (
    <div className="field">
      <span>{label}</span>
      <input type="search" value={q} placeholder={t('reqSearch')} onChange={(e) => setQ(e.target.value)} />
      <select value={value} onChange={(e) => onChange(e.target.value)} size={Math.min(6, Math.max(2, shown.length + 1))}>
        <option value="">{t('reqPickPerson')}</option>
        {shown.map((p) => (
          <option key={p.id} value={p.id}>
            {personName(p, lang, unknown)}
          </option>
        ))}
      </select>
    </div>
  );
}

function RequestCard({ req }: { req: JoinRequest }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { current, people } = useTree();
  const [open, setOpen] = useState(false);
  const [how, setHow] = useState<'link' | 'new'>(people.length > 0 ? 'link' : 'new');
  const [linkId, setLinkId] = useState('');
  const [newName, setNewName] = useState(req.displayName);
  const [relAs, setRelAs] = useState<'child' | 'parent' | 'spouse'>('child');
  const [ofId, setOfId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const treeId = current?.id;
  const [replacedName, setReplacedName] = useState('');
  useEffect(() => {
    if (!db || !treeId || !req.replaces) return;
    let live = true;
    getDoc(doc(db, 'trees', treeId, 'members', req.replaces))
      .then((s) => live && setReplacedName(s.exists() ? String(s.data().displayName ?? '') : ''))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [treeId, req.replaces]);

  const approve = async () => {
    if (!user || !treeId) return;
    setError(null);
    if (req.replaces) {
      setBusy(true);
      try {
        await approveReplacement(treeId, user.uid, req);
      } catch {
        setError(t('errReq'));
        setBusy(false);
      }
      return;
    }
    let plan: Parameters<typeof approveJoin>[3];
    if (how === 'link') {
      if (!linkId) return setError(t('errReqPick'));
      plan = { kind: 'link', personId: linkId };
    } else {
      if (!newName.trim()) return setError(t('errReqName'));
      if (people.length > 0 && !ofId) return setError(t('errReqPick'));
      plan = {
        kind: 'new',
        ...(HAS_BANGLA.test(newName) ? { nameBn: newName } : { nameEn: newName }),
        relation: ofId ? { existingId: ofId, as: relAs } : undefined,
      };
    }
    setBusy(true);
    try {
      await approveJoin(treeId, user.uid, req, plan);
    } catch {
      setError(t('errReq'));
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!user || !treeId) return;
    setBusy(true);
    try {
      await rejectJoin(treeId, user.uid, req.uid);
    } catch {
      setError(t('errReq'));
      setBusy(false);
    }
  };

  const contactOf = req.contactOf
    ? { self: t('contactSelf'), father: t('contactFather'), mother: t('contactMother'), other: t('contactOther') }[req.contactOf]
    : '';

  return (
    <li className="tree-item">
      <div className="tree-item-head">
        <strong>{req.displayName}</strong>
        <span className="badge role">{req.role === 'reviewer' ? t('roleReviewer') : t('roleContributor')}</span>
        {req.replaces && <span className="badge">{t('reqRecovery')}</span>}
      </div>
      {req.replaces && (
        <p className="muted small">
          {t('reqReplaces')}: {replacedName || '—'}. {t('reqReplaceHint')}
        </p>
      )}
      <dl className="details">
        {req.fatherName && (
          <div>
            <dt>{t('reqFather')}</dt>
            <dd>{req.fatherName}</dd>
          </div>
        )}
        {req.motherName && (
          <div>
            <dt>{t('reqMother')}</dt>
            <dd>{req.motherName}</dd>
          </div>
        )}
        <div>
          <dt>
            {t('reqContact')} ({contactOf})
          </dt>
          <dd>
            {[req.contact?.phone, req.contact?.facebook, req.contact?.email].filter(Boolean).join(' · ')}
          </dd>
        </div>
      </dl>

      {req.replaces ? (
        <div className="tree-item-actions">
          {error && <p className="msg error">{error}</p>}
          <button type="button" className="btn primary small" disabled={busy} onClick={() => void approve()}>
            {t('reqReplaceConfirm')}
          </button>
          <button type="button" className="btn danger small" disabled={busy} onClick={() => void reject()}>
            {t('reqReject')}
          </button>
        </div>
      ) : !open ? (
        <div className="tree-item-actions">
          <button type="button" className="btn primary small" onClick={() => setOpen(true)}>
            {t('reqApprove')}
          </button>
          <button type="button" className="btn danger small" disabled={busy} onClick={() => void reject()}>
            {t('reqReject')}
          </button>
        </div>
      ) : (
        <div className="danger-box approve-box">
          <h3>{t('reqHow')}</h3>
          {people.length > 0 && (
            <label className="radio">
              <input type="radio" checked={how === 'link'} onChange={() => setHow('link')} /> {t('reqLink')}
            </label>
          )}
          <label className="radio">
            <input type="radio" checked={how === 'new'} onChange={() => setHow('new')} /> {t('reqNew')}
          </label>

          {how === 'link' ? (
            <PersonPicker value={linkId} onChange={setLinkId} label={t('reqPickPerson')} />
          ) : (
            <>
              <label className="field">
                <span>{t('reqNewName')}</span>
                <input type="text" value={newName} maxLength={200} onChange={(e) => setNewName(e.target.value)} />
              </label>
              {people.length > 0 && (
                <>
                  <p className="muted small">{t('reqHintNew')}</p>
                  <PersonPicker value={ofId} onChange={setOfId} label={t('reqRelOf')} />
                  <label className="field">
                    <span>{t('reqRelation')}</span>
                    <select value={relAs} onChange={(e) => setRelAs(e.target.value as typeof relAs)}>
                      <option value="child">{t('reqAsChild')}</option>
                      <option value="parent">{t('reqAsParent')}</option>
                      <option value="spouse">{t('reqAsSpouse')}</option>
                    </select>
                  </label>
                </>
              )}
            </>
          )}

          {error && <p className="msg error">{error}</p>}
          <button type="button" className="btn primary small" disabled={busy} onClick={() => void approve()}>
            {t('reqConfirm')}
          </button>
          <button type="button" className="btn small" disabled={busy} onClick={() => setOpen(false)}>
            {t('mCancel')}
          </button>
        </div>
      )}
    </li>
  );
}

/** For the manager and admins: people who used an invitation and wait to be checked and let in. */
export function RequestsPage() {
  const { t } = useI18n();
  const { current, canEdit, ready, joinRequests } = useTree();
  if (!ready || !current) return <p className="muted">{t('treeLoading')}</p>;
  if (!canEdit) return <p className="msg error">{t('reqOnlyAdmins')}</p>;
  return (
    <div className="requests-page">
      <h2>{t('reqTitle')}</h2>
      <p className="muted small">{current.name}</p>
      {joinRequests.length === 0 ? (
        <p className="muted">{t('reqNone')}</p>
      ) : (
        <ul className="tree-list">
          {joinRequests.map((r) => (
            <RequestCard key={r.uid} req={r} />
          ))}
        </ul>
      )}
    </div>
  );
}
