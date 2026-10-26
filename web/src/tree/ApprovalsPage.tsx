import { useState } from 'react';
import { useAuth } from '../auth';
import { useI18n, type TKey } from '../i18n';
import { formatDate, num } from '../data/format';
import { VERIFICATION_KEYS } from '../data/labels';
import { approveProposal, rejectProposal, type Proposal, type ProposalKind } from '../data/mutations';
import type { FlexDate, Person, Verification } from '../data/types';
import { useTree } from './TreeContext';

const KIND_KEYS: Record<ProposalKind, TKey> = {
  addPerson: 'apKindAdd',
  editPerson: 'apKindEdit',
  deletePerson: 'apKindDelete',
  addRelation: 'apKindAddRel',
  removeRelation: 'apKindRemRel',
};

const FIELD_KEYS: Record<string, TKey> = {
  nameBn: 'fNameBn',
  nameEn: 'fNameEn',
  nickname: 'fNickname',
  birth: 'fBirth',
  birthOrder: 'fBirthOrder',
  death: 'fDeath',
  birthPlace: 'fBirthPlace',
  residence: 'fResidence',
  deathPlace: 'fDeathPlace',
  occupation: 'fOccupation',
  bio: 'fBio',
  living: 'fStatus',
  verification: 'fVerification',
};

const NAME_FIELDS = ['nameBn', 'nameEn'];

function useShow() {
  const { t, lang } = useI18n();
  return (key: string, value: unknown): string => {
    if (value === null || value === undefined || value === '') return '—';
    if (key === 'birth' || key === 'death') return formatDate(value as FlexDate, lang, t('fApprox')) || '—';
    if (key === 'living') return value ? t('personLiving') : t('fStatusDeceased');
    if (key === 'verification') return t(VERIFICATION_KEYS[value as Verification]);
    if (key === 'birthOrder') return num(Number(value), lang);
    return String(value);
  };
}

function StatusBadge({ status }: { status: Proposal['status'] }) {
  const { t } = useI18n();
  const label = status === 'approved' ? t('apApproved') : status === 'rejected' ? t('apRejected') : t('apPending');
  return <span className="badge">{label}</span>;
}

/** One suggestion, for an admin to look at, correct a name if needed, and approve or reject. */
function ReviewCard({ p }: { p: Proposal }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { current, graph, rels } = useTree();
  const show = useShow();
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const treeId = current?.id;

  const payload = p.payload as {
    fields?: Record<string, unknown>;
    relation?: { existingId: string; as: string };
    changes?: Record<string, unknown>;
  };
  const before: Person | undefined = p.targetId ? graph.people.get(p.targetId) : undefined;
  const suggested: Record<string, unknown> = p.kind === 'addPerson' ? payload.fields ?? {} : payload.changes ?? {};

  const finish = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch {
      setError(t('apFailed'));
      setBusy(false);
    }
  };

  const approve = () => {
    if (!user || !treeId) return;
    // Only names the admin actually rewrote replace what was suggested.
    const overrides: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(typed)) {
      if (value.trim() && value.trim() !== suggested[key]) overrides[key] = value.trim();
    }
    void finish(() => approveProposal(treeId, user.uid, p, rels, overrides));
  };

  const reject = () => {
    if (!user || !treeId) return;
    void finish(() => rejectProposal(treeId, user.uid, p.id, note));
  };

  const nameRows = Object.keys(suggested).filter((k) => NAME_FIELDS.includes(k));
  const otherRows = Object.keys(suggested).filter((k) => !NAME_FIELDS.includes(k));
  const relTarget = payload.relation ? graph.people.get(payload.relation.existingId) : undefined;

  return (
    <li className="tree-item">
      <div className="tree-item-head">
        <span className="badge role">{t(KIND_KEYS[p.kind])}</span>
        <strong>{p.targetName || (before ? before.nameBn || before.nameEn : '') || '—'}</strong>
      </div>
      <p className="muted small">
        {t('apBy')}: {p.proposerName || '—'}
      </p>
      {p.reason && (
        <p>
          <span className="muted small">{t('apReason')}: </span>
          {p.reason}
        </p>
      )}

      {(p.kind === 'addPerson' || p.kind === 'editPerson') && (
        <dl className="details">
          {[...nameRows, ...otherRows].map((key) => (
            <div key={key}>
              <dt>{t(FIELD_KEYS[key] ?? 'fBio')}</dt>
              <dd>
                {p.kind === 'editPerson' && (
                  <span className="muted small">
                    {t('apWas')}: {show(key, (before as unknown as Record<string, unknown> | undefined)?.[key])} →{' '}
                  </span>
                )}
                {NAME_FIELDS.includes(key) ? (
                  <input
                    type="text"
                    className="inline-input"
                    value={typed[key] ?? String(suggested[key] ?? '')}
                    onChange={(e) => setTyped((m) => ({ ...m, [key]: e.target.value }))}
                    aria-label={t(FIELD_KEYS[key])}
                  />
                ) : (
                  show(key, suggested[key])
                )}
              </dd>
            </div>
          ))}
          {p.kind === 'addPerson' && relTarget && payload.relation && (
            <div>
              <dt>{t('apRelOf')}</dt>
              <dd>
                {relTarget.nameBn || relTarget.nameEn} — {payload.relation.as}
              </dd>
            </div>
          )}
        </dl>
      )}
      {nameRows.length > 0 && <p className="muted small">{t('apCorrectHint')}</p>}
      {p.kind === 'deletePerson' && <p className="msg error">{t('apDeleteWarn')}</p>}

      <label className="field">
        <span>{t('apRejectNote')}</span>
        <input type="text" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      </label>
      {error && <p className="msg error">{error}</p>}
      <div className="tree-item-actions">
        <button type="button" className="btn primary small" disabled={busy} onClick={approve}>
          {t('apApprove')}
        </button>
        <button type="button" className="btn danger small" disabled={busy} onClick={reject}>
          {t('apReject')}
        </button>
      </div>
    </li>
  );
}

function MineCard({ p }: { p: Proposal }) {
  const { t } = useI18n();
  return (
    <li className="tree-item">
      <div className="tree-item-head">
        <span className="badge role">{t(KIND_KEYS[p.kind])}</span>
        <strong>{p.targetName || '—'}</strong>
        <StatusBadge status={p.status} />
      </div>
      {p.reason && <p className="muted small">{p.reason}</p>}
      {p.decision && (
        <p className="small">
          {t('apAdminTeam')}: {p.decision}
        </p>
      )}
    </li>
  );
}

/** Admins decide suggestions here; a participant follows the progress of their own. */
export function ApprovalsPage() {
  const { t } = useI18n();
  const { current, canEdit, ready, proposals } = useTree();
  if (!ready || !current) return <p className="muted">{t('treeLoading')}</p>;
  return (
    <div className="approvals-page">
      <h2>{canEdit ? t('apTitleAdmin') : t('apTitleMine')}</h2>
      <p className="muted small">{current.name}</p>
      {!canEdit && <p className="muted small">{t('apNote')}</p>}
      {proposals.length === 0 ? (
        <p className="muted">{t('apNone')}</p>
      ) : (
        <ul className="tree-list">
          {proposals.map((p) => (canEdit ? <ReviewCard key={p.id} p={p} /> : <MineCard key={p.id} p={p} />))}
        </ul>
      )}
    </div>
  );
}
