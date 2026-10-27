import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, type Query } from 'firebase/firestore';
import { useAuth } from '../auth';
import { useI18n, type TKey } from '../i18n';
import { db } from '../firebase';
import { answerReport, submitReport, type Report } from '../data/mutations';
import { useTree } from './TreeContext';

const STATUS_KEYS: Record<Report['status'], TKey> = {
  open: 'rpOpen',
  seen: 'rpSeen',
  solved: 'rpSolved',
};

function useReports(treeId: string | undefined, uid: string | undefined, all: boolean): Report[] {
  const [items, setItems] = useState<Report[]>([]);
  useEffect(() => {
    setItems([]);
    if (!db || !treeId || !uid) return;
    const col = collection(db, 'trees', treeId, 'reports');
    const q: Query = all ? col : query(col, where('reporterUid', '==', uid));
    return onSnapshot(
      q,
      (snap) =>
        setItems(
          snap.docs
            .map((d) => ({
              ...(d.data() as Omit<Report, 'id' | 'createdAt'>),
              id: d.id,
              createdAt: d.data().createdAt?.toDate?.() as Date | undefined,
            }))
            .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)),
        ),
      () => setItems([]),
    );
  }, [treeId, uid, all]);
  return items;
}

function InboxCard({ r, treeId }: { r: Report; treeId: string }) {
  const { t } = useI18n();
  const [reply, setReply] = useState(r.reply ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const act = async (status: Report['status']) => {
    setBusy(true);
    setError(false);
    try {
      await answerReport(treeId, r.id, status, reply);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="tree-item">
      <div className="tree-item-head">
        <span className="badge role">{t(r.category === 'problem' ? 'rpProblem' : 'rpContact')}</span>
        <span className="badge">{t(STATUS_KEYS[r.status])}</span>
      </div>
      <p className="muted small">
        {t('rpFrom')}: {r.reporterName || '—'}
      </p>
      <p>{r.text}</p>
      <label className="field">
        <span>{t('rpReply')}</span>
        <input type="text" value={reply} maxLength={2000} onChange={(e) => setReply(e.target.value)} />
      </label>
      {error && <p className="msg error">{t('rpFailed')}</p>}
      <div className="tree-item-actions">
        <button type="button" className="btn small" disabled={busy} onClick={() => void act('seen')}>
          {t('rpMarkSeen')}
        </button>
        <button type="button" className="btn primary small" disabled={busy} onClick={() => void act('solved')}>
          {t('rpMarkSolved')}
        </button>
      </div>
    </li>
  );
}

/** Any member writes to the admin team here; admins also see and answer what came in. */
export function ReportsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { current, canEdit, ready, role } = useTree();
  const treeId = current?.id;
  const mine = useReports(treeId, user?.uid, false);
  const inbox = useReports(treeId, user?.uid, true);
  const [category, setCategory] = useState<Report['category']>('problem');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (!ready || !treeId || !user) return <p className="muted">{t('treeLoading')}</p>;
  if (!role) return <p className="msg error">{t('errPermission')}</p>;

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setNote(null);
    try {
      await submitReport(treeId, user.uid, user.displayName || user.email || '', category, text);
      setText('');
      setNote(t('rpSent'));
    } catch {
      setNote(t('rpFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="reports-page">
      <h2>{t('rpTitle')}</h2>
      <p className="muted small">{current?.name}</p>
      <p>{t('rpIntro')}</p>
      <section className="card">
        <label className="field">
          <span>{t('rpCategory')}</span>
          <select value={category} onChange={(e) => setCategory(e.target.value as Report['category'])}>
            <option value="problem">{t('rpProblem')}</option>
            <option value="contact">{t('rpContact')}</option>
          </select>
        </label>
        <label className="field">
          <span>{t('rpText')}</span>
          <textarea rows={4} maxLength={5000} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        {note && (
          <p className="msg ok" role="status">
            {note}
          </p>
        )}
        <button type="button" className="btn primary" disabled={busy || !text.trim()} onClick={() => void send()}>
          {t('rpSend')}
        </button>
      </section>

      <h3>{t('rpMine')}</h3>
      {mine.length === 0 ? (
        <p className="muted">{t('rpNone')}</p>
      ) : (
        <ul className="tree-list">
          {mine.map((r) => (
            <li key={r.id} className="tree-item">
              <div className="tree-item-head">
                <span className="badge role">{t(r.category === 'problem' ? 'rpProblem' : 'rpContact')}</span>
                <span className="badge">{t(STATUS_KEYS[r.status])}</span>
              </div>
              <p>{r.text}</p>
              {r.reply && (
                <p className="small">
                  {t('rpTeamReply')}: {r.reply}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <>
          <h3>{t('rpInbox')}</h3>
          {inbox.length === 0 ? (
            <p className="muted">{t('rpNone')}</p>
          ) : (
            <ul className="tree-list">
              {inbox.map((r) => (
                <InboxCard key={r.id + (r.reply ?? '') + r.status} r={r} treeId={treeId} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
